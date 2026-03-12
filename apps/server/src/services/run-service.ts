import { and, desc, eq, inArray } from "drizzle-orm";
import {
  postAnalysisSchema,
  recommendationSchema,
  runDetailsSchema,
  runSchema,
  weeklySummarySchema,
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
import { getBlog, listBlogs, discoverBlogPosts } from "./blog-service";
import { getProviderSettingRow, resolveProviderSetting } from "./settings-service";

type SelectedPost = typeof posts.$inferSelect;

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

    let providerSettings = await resolveProviderSetting(input.provider);
    if (input.model) providerSettings = { ...providerSettings, model: input.model };
    if (input.analysisMode) providerSettings = { ...providerSettings, analysisMode: input.analysisMode };

    const provider = getProvider(providerSettings.provider);
    const validation = await provider.validateConfig(providerSettings);
    if (!validation.valid && providerSettings.fallbackProvider) {
      const fallback = await getProviderSettingRow(providerSettings.fallbackProvider);
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
      await log("info", "분석 런을 시작했습니다.");

      const provider = getProvider(providerSettings.provider);
      const validation = await provider.validateConfig(providerSettings);
      if (!validation.valid) {
        await log("warning", validation.message ?? "선택한 제공자 인증이 없어 휴리스틱 폴백이 사용될 수 있습니다.");
      }

      const discovery = await discoverBlogPosts(blogId);
      await log(
        "info",
        `포스트 발견 ${discovery.discoveredCount}건, 신규 ${discovery.insertedCount}건, 갱신 ${discovery.updatedCount}건`,
      );

      const selectedPosts = await this.selectPosts(blogId, input, providerSettings, discovery.insertedPostIds, discovery.updatedPostIds);
      if (!selectedPosts.length) {
        throw new Error("분석 대상 포스트가 없습니다.");
      }

      await log("info", `분석 대상 포스트 ${selectedPosts.length}건을 선택했습니다.`);

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

        const analysisResponse = await provider.analyzePost(analysisInput, providerSettings);
        const result = postAnalysisSchema.parse(analysisResponse.data);
        usages.inputTokens += analysisResponse.usage.inputTokens;
        usages.outputTokens += analysisResponse.usage.outputTokens;
        usages.estimatedCost += analysisResponse.usage.estimatedCost;

        analyzedPosts.push({ post, analysis: result });

        await db.insert(postAnalyses).values({
          id: createId("pa"),
          runId,
          postId: post.id,
          summary: result.summary,
          targetAudienceGuess: result.targetAudienceGuess,
          intentGuess: result.intentGuess,
          topicLabelsJson: JSON.stringify(result.topicLabels),
          strengthsJson: JSON.stringify(result.strengths),
          weaknessesJson: JSON.stringify(result.weaknesses),
          improvementsJson: JSON.stringify(result.improvements),
          seoNotesJson: JSON.stringify(result.seoNotes),
          titleStrength: result.titleStrength,
          hookStrength: result.hookStrength,
          structureScore: result.structureScore,
          informationDensityScore: result.informationDensityScore,
          practicalityScore: result.practicalityScore,
          differentiationScore: result.differentiationScore,
          seoPotentialScore: result.seoPotentialScore,
          audienceFitScore: result.audienceFitScore,
          engagementAdjustmentNote: result.engagementAdjustmentNote,
          createdAt: nowIso(),
        });
      }

      const summaryInput = {
        blogName: discovery.blog.name,
        analysisMode: providerSettings.analysisMode,
        maxOutputTokens: providerSettings.maxOutputTokens,
        postAnalyses: analyzedPosts.map((item) => ({
          title: item.post.title ?? "Untitled",
          url: item.post.url,
          analysis: item.analysis,
        })),
      } as const;

      const weeklySummaryResult = await provider.summarizeWeek(summaryInput, providerSettings);
      const weeklySummary = weeklySummarySchema.parse(weeklySummaryResult.data);
      usages.inputTokens += weeklySummaryResult.usage.inputTokens;
      usages.outputTokens += weeklySummaryResult.usage.outputTokens;
      usages.estimatedCost += weeklySummaryResult.usage.estimatedCost;

      const recommendationResult = await provider.generateRecommendations(
        {
          blogName: discovery.blog.name,
          analysisMode: providerSettings.analysisMode,
          maxOutputTokens: providerSettings.maxOutputTokens,
          weeklySummary,
          postAnalyses: analyzedPosts.map((item) => ({
            title: item.post.title ?? "Untitled",
            url: item.post.url,
            analysis: item.analysis,
          })),
        },
        providerSettings,
      );
      const nextRecommendations = recommendationResult.data.map((item) => recommendationSchema.parse(item));
      usages.inputTokens += recommendationResult.usage.inputTokens;
      usages.outputTokens += recommendationResult.usage.outputTokens;
      usages.estimatedCost += recommendationResult.usage.estimatedCost;

      const reportId = createId("report");
      const createdAt = nowIso();
      const weekStart = input.runScope === "latest7" ? daysAgo(7).toISOString() : daysAgo(30).toISOString();
      const weekEnd = createdAt;
      const score = weeklySummary.blogScores[0] ?? {
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
        ebiScore: 60,
        ebiStatus: "watch",
        ebiReason: [],
      };
      score.blogId = blogId;
      score.blogName = discovery.blog.name;

      await db.insert(weeklyReports).values({
        id: reportId,
        runId,
        weekStart,
        weekEnd,
        overallSummary: weeklySummary.overallSummary,
        topicOverlapJson: JSON.stringify(weeklySummary.topicOverlap),
        topicGapsJson: JSON.stringify(weeklySummary.topicGaps),
        blogComparisonsJson: JSON.stringify(weeklySummary.blogComparisons),
        priorityActionsJson: JSON.stringify(weeklySummary.priorityActions),
        nextWeekTopicsJson: JSON.stringify(weeklySummary.nextWeekTopics),
        markdownReport: weeklySummaryMarkdown(discovery.blog.name, weeklySummary, nextRecommendations),
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
        ebiScore: score.ebiScore,
        ebiStatus: score.ebiStatus,
        ebiReasonJson: JSON.stringify(score.ebiReason),
        createdAt,
      });

      const topicCounts = new Map<string, { count: number; scores: number[] }>();
      for (const item of analyzedPosts) {
        for (const topic of item.analysis.topicLabels) {
          const current = topicCounts.get(topic) ?? { count: 0, scores: [] };
          current.count += 1;
          current.scores.push(
            average([
              item.analysis.structureScore,
              item.analysis.practicalityScore,
              item.analysis.seoPotentialScore,
              item.analysis.audienceFitScore,
            ]),
          );
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
          gapScore: weeklySummary.topicGaps.includes(topic) ? 100 : 20,
          recommendationPriority: weeklySummary.nextWeekTopics.includes(topic) ? 90 : 55,
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
      await log("info", "분석 런이 완료되었습니다.");
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
    let rows = await db.select().from(posts).where(eq(posts.blogId, blogId)).orderBy(desc(posts.publishedAt), desc(posts.createdAt));

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

    return rows.slice(0, providerSettings.maxPostsPerRun);
  }
}

export const analysisCoordinator = new AnalysisCoordinator();

const mapRun = (row: typeof analysisRuns.$inferSelect): Run =>
  runSchema.parse({
    id: row.id,
    runScope: row.runScope,
    provider: row.provider,
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
    .prepare("SELECT * FROM recommendations ORDER BY created_at DESC LIMIT 10")
    .all() as Array<Record<string, unknown>>;

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
  };
};
