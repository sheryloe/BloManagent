import { and, desc, eq } from "drizzle-orm";
import {
  calculateQualityComponents,
  postAnalysisSchema,
  recommendationSchema,
  runDetailsSchema,
  runSchema,
  type AnalyzeRequest,
  type DashboardResponse,
  type PostAnalysis,
  type Recommendation,
  type Run,
} from "@blog-review/shared";
import { db, sqlite } from "../db/client";
import {
  analysisRunTargets,
  analysisRuns,
  blogWeeklyScores,
  costLogs,
  postAnalyses,
  posts,
  recommendations,
  runEvents,
  weeklyReports,
  topicSummaries,
} from "../db/schema";
import { average, createId, daysAgo, limitText, nowIso, safeJsonParse } from "../lib/utils";
import { getProvider } from "../providers";
import type { AnalyzePostInput, ProviderSettingsRow } from "../providers/types";
import { weeklySummaryMarkdown } from "../templates/prompts";
import { VERIFIED_CRAWL_STATUS, assertBlogCrawlAllowed, discoverBlogPosts, getBlog, listBlogs } from "./blog-service";
import { heuristicAnalysisSummary, heuristicPostAnalysis, heuristicRecommendations } from "./heuristics";
import { getProviderSettingRow, resolveProviderSetting } from "./settings-service";

type SelectedPost = typeof posts.$inferSelect;

const mergeNarrative = (base: PostAnalysis, enriched: PostAnalysis): PostAnalysis => ({
  ...base,
  summary: enriched.summary || base.summary,
  targetAudienceGuess: enriched.targetAudienceGuess || base.targetAudienceGuess,
  intentGuess: enriched.intentGuess || base.intentGuess,
  topicLabels: enriched.topicLabels.length ? enriched.topicLabels : base.topicLabels,
  strengths: enriched.strengths.length ? enriched.strengths : base.strengths,
  weaknesses: enriched.weaknesses.length ? enriched.weaknesses : base.weaknesses,
  improvements: enriched.improvements.length ? enriched.improvements : base.improvements,
  seoNotes: enriched.seoNotes.length ? enriched.seoNotes : base.seoNotes,
  engagementAdjustmentNote: enriched.engagementAdjustmentNote || base.engagementAdjustmentNote,
});

class AnalysisCoordinator {
  private activeRunId: string | null = null;

  async start(blogId: string, input: AnalyzeRequest) {
    if (this.activeRunId) {
      throw new Error("Another analysis run is already in progress.");
    }

    const blog = await getBlog(blogId);
    if (!blog) {
      throw new Error("Blog not found.");
    }
    await assertBlogCrawlAllowed(blog);

    let providerSettings = await resolveProviderSetting(input.engine);
    if (input.model) providerSettings = { ...providerSettings, model: input.model };
    if (input.analysisMode) providerSettings = { ...providerSettings, analysisMode: input.analysisMode };

    const provider = getProvider(providerSettings.provider);
    const validation = await provider.validateConfig(providerSettings);
    if (!validation.valid) {
      const fallback =
        (providerSettings.fallbackProvider ? await getProviderSettingRow(providerSettings.fallbackProvider) : null) ??
        (providerSettings.provider !== "algorithm" ? await getProviderSettingRow("algorithm") : null);
      if (fallback) providerSettings = fallback;
    }

    const now = nowIso();
    const runId = createId("run");
    await db.insert(analysisRuns).values({
      id: runId,
      runScope: input.runScope,
      provider: providerSettings.provider,
      model: providerSettings.model,
      analysisMode: providerSettings.analysisMode,
      startedAt: now,
      endedAt: null,
      status: "queued",
      blogCount: 1,
      postCount: 0,
      estimatedInputTokens: 0,
      estimatedOutputTokens: 0,
      estimatedCost: 0,
      actualCost: 0,
      errorMessage: null,
    });
    await db.insert(analysisRunTargets).values({
      id: createId("target"),
      runId,
      blogId,
      createdAt: now,
    });

    this.activeRunId = runId;
    void this.execute(runId, blogId, input, providerSettings).finally(() => {
      this.activeRunId = null;
    });

    return { runId };
  }

  private async execute(runId: string, blogId: string, input: AnalyzeRequest, providerSettings: ProviderSettingsRow) {
    const log = async (level: "info" | "warning" | "error", message: string) => {
      await db.insert(runEvents).values({
        id: createId("event"),
        runId,
        level,
        message,
        createdAt: nowIso(),
      });
    };

    try {
      await db.update(analysisRuns).set({ status: "in_progress" }).where(eq(analysisRuns.id, runId));
      await log("info", "Analysis run started.");

      const provider = getProvider(providerSettings.provider);
      const validation = await provider.validateConfig(providerSettings);
      if (!validation.valid) {
        await log("warning", validation.message ?? "Selected engine is unavailable, so deterministic analysis is used.");
      }

      const discovery = await discoverBlogPosts(blogId);
      await log(
        "info",
        `Discovery finished: ${discovery.discoveredCount} found / ${discovery.insertedCount} new / ${discovery.updatedCount} updated.`,
      );

      const selectedPosts = await this.selectPosts(blogId, input, providerSettings, discovery.insertedPostIds, discovery.updatedPostIds);
      if (!selectedPosts.length) {
        throw new Error("No posts matched the selected analysis range.");
      }

      await log("info", `Selected ${selectedPosts.length} posts for analysis.`);

      const usages = {
        inputTokens: 0,
        outputTokens: 0,
        estimatedCost: 0,
      };
      const analyzedPosts: Array<{ post: SelectedPost; analysis: PostAnalysis }> = [];

      for (const post of selectedPosts) {
        const engagement = sqlite
          .prepare(
            `
            SELECT comments_count, likes_count, sympathy_count, views_count
            FROM post_engagement_snapshots
            WHERE post_id = ?
            ORDER BY captured_at DESC
            LIMIT 1
            `,
          )
          .get(post.id) as Record<string, number | null> | undefined;

        const analysisInput: AnalyzePostInput = {
          blogName: discovery.blog.name,
          blogPlatform: discovery.blog.platform,
          postTitle: post.title ?? "Untitled",
          postUrl: post.url,
          publishedAt: post.publishedAt,
          content: limitText(post.contentClean ?? post.contentRaw ?? "", providerSettings.maxCharsPerPost),
          analysisMode: providerSettings.analysisMode,
          maxOutputTokens: providerSettings.maxOutputTokens,
          engagement: {
            commentsCount: engagement?.comments_count ?? null,
            likesCount: engagement?.likes_count ?? null,
            sympathyCount: engagement?.sympathy_count ?? null,
            viewsCount: engagement?.views_count ?? null,
          },
        };

        const baseAnalysis = postAnalysisSchema.parse(heuristicPostAnalysis(analysisInput).data);
        let finalAnalysis = baseAnalysis;

        if (providerSettings.provider !== "algorithm") {
          const enriched = await provider.analyzePost(analysisInput, providerSettings);
          usages.inputTokens += enriched.usage.inputTokens;
          usages.outputTokens += enriched.usage.outputTokens;
          usages.estimatedCost += enriched.usage.estimatedCost;
          finalAnalysis = mergeNarrative(baseAnalysis, postAnalysisSchema.parse(enriched.data));
        }

        analyzedPosts.push({ post, analysis: finalAnalysis });

        await db.insert(postAnalyses).values({
          id: createId("pa"),
          runId,
          postId: post.id,
          summary: finalAnalysis.summary,
          targetAudienceGuess: finalAnalysis.targetAudienceGuess,
          intentGuess: finalAnalysis.intentGuess,
          topicLabelsJson: JSON.stringify(finalAnalysis.topicLabels),
          strengthsJson: JSON.stringify(finalAnalysis.strengths),
          weaknessesJson: JSON.stringify(finalAnalysis.weaknesses),
          improvementsJson: JSON.stringify(finalAnalysis.improvements),
          seoNotesJson: JSON.stringify(finalAnalysis.seoNotes),
          titleStrength: finalAnalysis.titleStrength,
          hookStrength: finalAnalysis.hookStrength,
          structureScore: finalAnalysis.structureScore,
          informationDensityScore: finalAnalysis.informationDensityScore,
          practicalityScore: finalAnalysis.practicalityScore,
          differentiationScore: finalAnalysis.differentiationScore,
          seoPotentialScore: finalAnalysis.seoPotentialScore,
          audienceFitScore: finalAnalysis.audienceFitScore,
          engagementAdjustmentNote: finalAnalysis.engagementAdjustmentNote,
          createdAt: nowIso(),
        });
      }

      const analysisSummaryResult = heuristicAnalysisSummary({
        blogName: discovery.blog.name,
        analysisMode: providerSettings.analysisMode,
        maxOutputTokens: providerSettings.maxOutputTokens,
        postAnalyses: analyzedPosts.map((item) => ({
          title: item.post.title ?? "Untitled",
          url: item.post.url,
          analysis: item.analysis,
        })),
      });
      const analysisSummary = analysisSummaryResult.data;

      const recommendationResult = heuristicRecommendations(
        {
          blogName: discovery.blog.name,
          analysisMode: providerSettings.analysisMode,
          maxOutputTokens: providerSettings.maxOutputTokens,
          weeklySummary: analysisSummary,
          postAnalyses: analyzedPosts.map((item) => ({
            title: item.post.title ?? "Untitled",
            url: item.post.url,
            analysis: item.analysis,
          })),
        },
        analysisSummary,
      );
      const nextRecommendations = recommendationResult.data.map((item) => recommendationSchema.parse(item));

      const reportId = createId("report");
      const createdAt = nowIso();
      const weekStart = input.runScope === "latest7" ? daysAgo(7).toISOString() : daysAgo(30).toISOString();
      const weekEnd = createdAt;
      const score = analysisSummary.blogScores[0] ?? {
        blogId,
        blogName: discovery.blog.name,
        postCount: analyzedPosts.length,
        avgTitleStrength: average(analyzedPosts.map((item) => item.analysis.titleStrength)),
        avgHookStrength: average(analyzedPosts.map((item) => item.analysis.hookStrength)),
        avgStructureScore: average(analyzedPosts.map((item) => item.analysis.structureScore)),
        avgInformationDensityScore: average(analyzedPosts.map((item) => item.analysis.informationDensityScore)),
        avgPracticalityScore: average(analyzedPosts.map((item) => item.analysis.practicalityScore)),
        avgDifferentiationScore: average(analyzedPosts.map((item) => item.analysis.differentiationScore)),
        avgSeoPotentialScore: average(analyzedPosts.map((item) => item.analysis.seoPotentialScore)),
        avgAudienceFitScore: average(analyzedPosts.map((item) => item.analysis.audienceFitScore)),
        topicDiversityScore: 60,
        publishingConsistencyScore: 60,
        freshnessScore: 75,
        engagementScore: 50,
        qualityScore: 60,
        status: "watch" as const,
        reasons: [],
      };
      score.blogId = blogId;
      score.blogName = discovery.blog.name;

      await db.insert(weeklyReports).values({
        id: reportId,
        runId,
        weekStart,
        weekEnd,
        overallSummary: analysisSummary.overallSummary,
        topicOverlapJson: JSON.stringify(analysisSummary.topicOverlap),
        topicGapsJson: JSON.stringify(analysisSummary.topicGaps),
        blogComparisonsJson: JSON.stringify(analysisSummary.blogComparisons),
        priorityActionsJson: JSON.stringify(analysisSummary.priorityActions),
        nextWeekTopicsJson: JSON.stringify(analysisSummary.nextWeekTopics),
        markdownReport: weeklySummaryMarkdown(discovery.blog.name, analysisSummary, nextRecommendations),
        createdAt,
      });

      await db.insert(blogWeeklyScores).values({
        id: createId("bws"),
        weeklyReportId: reportId,
        blogId,
        postCount: score.postCount,
        avgTitleStrength: score.avgTitleStrength,
        avgHookStrength: score.avgHookStrength,
        avgStructureScore: score.avgStructureScore,
        avgInformationDensityScore: score.avgInformationDensityScore,
        avgPracticalityScore: score.avgPracticalityScore,
        avgDifferentiationScore: score.avgDifferentiationScore,
        avgSeoPotentialScore: score.avgSeoPotentialScore,
        avgAudienceFitScore: score.avgAudienceFitScore,
        topicDiversityScore: score.topicDiversityScore,
        publishingConsistencyScore: score.publishingConsistencyScore,
        freshnessScore: score.freshnessScore,
        engagementScore: score.engagementScore,
        ebiScore: score.qualityScore,
        ebiStatus: score.status,
        ebiReasonJson: JSON.stringify(score.reasons),
        createdAt,
      });

      const topicCounts = new Map<string, { count: number; scores: number[] }>();
      for (const item of analyzedPosts) {
        for (const topic of item.analysis.topicLabels) {
          const current = topicCounts.get(topic) ?? { count: 0, scores: [] };
          current.count += 1;
          current.scores.push(item.analysis.qualityScore);
          topicCounts.set(topic, current);
        }
      }

      for (const [topic, meta] of topicCounts.entries()) {
        await db.insert(topicSummaries).values({
          id: createId("topic"),
          weeklyReportId: reportId,
          topicName: topic,
          postCount: meta.count,
          avgScore: average(meta.scores),
          overlapScore: meta.count > 1 ? 70 : 30,
          gapScore: analysisSummary.topicGaps.includes(topic) ? 100 : 20,
          recommendationPriority: analysisSummary.nextWeekTopics.includes(topic) ? 90 : 55,
          notes: meta.count > 1 ? "반복 노출 주제" : "확장 가능한 주제",
          createdAt,
        });
      }

      for (const item of nextRecommendations) {
        await db.insert(recommendations).values({
          id: createId("rec"),
          weeklyReportId: reportId,
          blogId: item.blogId ?? blogId,
          recommendationType: item.recommendationType,
          priority: item.priority,
          title: item.title,
          description: item.description,
          actionItemsJson: JSON.stringify(item.actionItems),
          createdAt,
        });
      }

      await db.insert(costLogs).values({
        id: createId("cost"),
        runId,
        provider: providerSettings.provider,
        model: providerSettings.model,
        estimatedInputTokens: usages.inputTokens,
        estimatedOutputTokens: usages.outputTokens,
        estimatedCost: usages.estimatedCost,
        actualCost: usages.estimatedCost,
        createdAt,
      });

      await db
        .update(analysisRuns)
        .set({
          status: "completed",
          endedAt: createdAt,
          postCount: analyzedPosts.length,
          estimatedInputTokens: usages.inputTokens,
          estimatedOutputTokens: usages.outputTokens,
          estimatedCost: usages.estimatedCost,
          actualCost: usages.estimatedCost,
        })
        .where(eq(analysisRuns.id, runId));
      await log("info", "Analysis run completed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown analysis error";
      await db
        .update(analysisRuns)
        .set({
          status: "failed",
          endedAt: nowIso(),
          errorMessage: message,
        })
        .where(eq(analysisRuns.id, runId));
      await db.insert(runEvents).values({
        id: createId("event"),
        runId,
        level: "error",
        message,
        createdAt: nowIso(),
      });
    }
  }

  private async selectPosts(
    blogId: string,
    input: AnalyzeRequest,
    providerSettings: ProviderSettingsRow,
    insertedPostIds: string[],
    updatedPostIds: string[],
  ) {
    let rows = await db
      .select()
      .from(posts)
      .where(and(eq(posts.blogId, blogId), eq(posts.crawlStatus, VERIFIED_CRAWL_STATUS)))
      .orderBy(desc(posts.publishedAt), desc(posts.createdAt));

    if (input.runScope === "selected" && input.selectedPostIds?.length) {
      rows = rows.filter((row) => input.selectedPostIds?.includes(row.id));
    }
    if (input.runScope === "newOnly") {
      const ids = new Set([...insertedPostIds, ...updatedPostIds]);
      rows = rows.filter((row) => ids.has(row.id));
    }
    if (input.runScope === "latest7") {
      const floor = daysAgo(7).toISOString();
      rows = rows.filter((row) => (row.publishedAt ?? row.createdAt) >= floor);
    }
    if (input.runScope === "latest30") {
      const floor = daysAgo(30).toISOString();
      rows = rows.filter((row) => (row.publishedAt ?? row.createdAt) >= floor);
    }

    if (providerSettings.provider === "algorithm") {
      return rows;
    }

    return rows.slice(0, providerSettings.maxPostsPerRun);
  }
}

export const analysisCoordinator = new AnalysisCoordinator();

const mapRun = (row: typeof analysisRuns.$inferSelect): Run =>
  runSchema.parse({
    id: row.id,
    runScope: row.runScope,
    engine: row.provider,
    model: row.model,
    analysisMode: row.analysisMode,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    status: row.status,
    blogCount: row.blogCount,
    postCount: row.postCount,
    estimatedInputTokens: row.estimatedInputTokens,
    estimatedOutputTokens: row.estimatedOutputTokens,
    estimatedCost: row.estimatedCost,
    actualCost: row.actualCost,
    errorMessage: row.errorMessage,
  });

export const listRuns = async () => {
  const rows = await db.select().from(analysisRuns).orderBy(desc(analysisRuns.startedAt)).limit(30);
  return rows.map(mapRun);
};

export const getRunDetails = async (runId: string) => {
  const run = await db.select().from(analysisRuns).where(eq(analysisRuns.id, runId)).get();
  if (!run) return null;
  const events = await db.select().from(runEvents).where(eq(runEvents.runId, runId)).orderBy(desc(runEvents.createdAt));
  return runDetailsSchema.parse({
    run: mapRun(run),
    events: events.map((event) => ({
      id: event.id,
      runId: event.runId,
      level: event.level,
      message: event.message,
      createdAt: event.createdAt,
    })),
  });
};

export const getDashboard = async (): Promise<DashboardResponse> => {
  const blogs = await listBlogs();
  const latestRuns = await listRuns();
  const latestRecommendations = sqlite
    .prepare(
      `
      SELECT r.*
      FROM recommendations r
      JOIN weekly_reports wr ON wr.id = r.weekly_report_id
      JOIN analysis_runs ar ON ar.id = wr.run_id
      WHERE EXISTS (
        SELECT 1
        FROM post_analyses pa
        JOIN posts p ON p.id = pa.post_id
        WHERE pa.run_id = ar.id
          AND COALESCE(p.crawl_status, 'verified') = 'verified'
      )
      ORDER BY r.created_at DESC
      LIMIT 10
      `,
    )
    .all() as Array<Record<string, unknown>>;
  const latestPostRows = sqlite
    .prepare(
      `
      SELECT
        pa.post_id,
        pa.summary,
        pa.improvements_json,
        pa.title_strength,
        pa.hook_strength,
        pa.structure_score,
        pa.information_density_score,
        pa.practicality_score,
        pa.differentiation_score,
        pa.seo_potential_score,
        pa.audience_fit_score,
        p.blog_id,
        p.title,
        p.url,
        p.published_at,
        b.name as blog_name
      FROM post_analyses pa
      JOIN analysis_runs ar ON ar.id = pa.run_id
      JOIN posts p ON p.id = pa.post_id AND COALESCE(p.crawl_status, 'verified') = 'verified'
      JOIN blogs b ON b.id = p.blog_id
      WHERE ar.status = 'completed'
      ORDER BY pa.created_at DESC
      LIMIT 30
      `,
    )
    .all() as Array<Record<string, unknown>>;

  const latestPostDiagnostics = latestPostRows
    .map((row) => {
      const quality = calculateQualityComponents({
        titleStrength: Number(row.title_strength ?? 0),
        hookStrength: Number(row.hook_strength ?? 0),
        structureScore: Number(row.structure_score ?? 0),
        informationDensityScore: Number(row.information_density_score ?? 0),
        practicalityScore: Number(row.practicality_score ?? 0),
        differentiationScore: Number(row.differentiation_score ?? 0),
        seoPotentialScore: Number(row.seo_potential_score ?? 0),
        audienceFitScore: Number(row.audience_fit_score ?? 0),
      });
      return {
        postId: row.post_id as string,
        blogId: row.blog_id as string,
        blogName: row.blog_name as string,
        title: (row.title as string | null) ?? (row.url as string),
        url: row.url as string,
        publishedAt: (row.published_at as string | null) ?? null,
        qualityScore: quality.qualityScore,
        qualityStatus: quality.qualityStatus,
        topImprovements: safeJsonParse(row.improvements_json as string | null, [] as string[]).slice(0, 2),
        summary: (row.summary as string | null) ?? null,
      };
    })
    .sort((left, right) => left.qualityScore - right.qualityScore)
    .slice(0, 8);

  return {
    blogs,
    latestRuns,
    latestRecommendations: latestRecommendations.map((row) => ({
      id: row.id as string,
      recommendationType: row.recommendation_type as string,
      priority: Number(row.priority ?? 0),
      title: row.title as string,
      description: row.description as string,
      actionItems: safeJsonParse(row.action_items_json as string | null, [] as string[]),
      blogId: (row.blog_id as string | null) ?? null,
      createdAt: row.created_at as string,
    })),
    latestPostDiagnostics,
  };
};
