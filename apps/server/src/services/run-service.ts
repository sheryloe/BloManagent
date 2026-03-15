import { and, desc, eq } from "drizzle-orm";
import {
  postNarrativeSchema,
  qualityGrade,
  recommendationSchema,
  runDetailsSchema,
  runSchema,
  type AnalyzeRequest,
  type ContentMetrics,
  type DashboardResponse,
  type PostAnalysis,
  type PostNarrative,
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
import type { AnalyzePostInput, PostSiblingContext, ProviderSettingsRow } from "../providers/types";
import { weeklySummaryMarkdown } from "../templates/prompts";
import { VERIFIED_CRAWL_STATUS, assertBlogCrawlAllowed, discoverBlogPosts, getBlog, listBlogs } from "./blog-service";
import { heuristicAnalysisSummary, heuristicPostAnalysis, heuristicRecommendations } from "./heuristics";
import { getProviderSettingRow, resolveProviderSetting } from "./settings-service";

type SelectedPost = typeof posts.$inferSelect;

const mergeNarrative = (base: PostAnalysis, enriched: PostNarrative): PostAnalysis => ({
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

const tokenizeForSibling = (value: string) =>
  value
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu)
    ?.filter((token) => token.length >= 2) ?? [];

const normalizeTitleForSibling = (title: string) => tokenizeForSibling(title).join(" ");

const topSiblingKeywords = (title: string, text: string) => {
  const counts = new Map<string, number>();
  for (const token of [...tokenizeForSibling(title), ...tokenizeForSibling(text)]) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 8)
    .map(([token]) => token);
};

const buildContentMetricsFromPost = (post: SelectedPost, siblingContext: PostSiblingContext): ContentMetrics => {
  const contentText = post.contentClean ?? "";
  const contentHtml = post.contentRaw ?? "";
  const paragraphs = contentHtml.match(/<p[\s>]/gi)?.length
    ? contentHtml.replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, " ")
    : contentText;
  const paragraphCount = paragraphs
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean).length;
  const sentenceCount = contentText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean).length;
  const avgParagraphLength = paragraphCount ? Math.round(contentText.length / paragraphCount) : 0;
  const titleTokens = tokenizeForSibling(post.title ?? "");
  const contentTokenSet = new Set(tokenizeForSibling(contentText));
  const overlapCount = titleTokens.filter((token) => contentTokenSet.has(token)).length;
  const titleBodyOverlapRatio = titleTokens.length ? overlapCount / titleTokens.length : 0;

  return {
    contentLength: contentText.length,
    paragraphCount,
    avgParagraphLength,
    sentenceCount,
    headingCount: contentHtml.match(/<h[1-6][\s>]/gi)?.length ?? 0,
    listCount: contentHtml.match(/<li[\s>]/gi)?.length ?? 0,
    questionCount: (contentText.match(/\?/g)?.length ?? 0) + (contentText.match(/\b(what|why|how|which)\b/gi)?.length ?? 0),
    faqCount: contentText.match(/(faq|q\.)/gi)?.length ?? 0,
    numericTokenCount: contentText.match(/(\d{1,4}[./-]\d{1,2}([./-]\d{1,4})?|\d+%|\d+)/g)?.length ?? 0,
    stepMarkerCount: contentText.match(/(\bstep\s*\d+\b|\d+\.\s|\[\s?[x ]?\s?\]|checklist|step|todo)/gi)?.length ?? 0,
    referenceCount:
      (contentHtml.match(/<a\s+[^>]*href="https?:\/\//gi)?.length ?? 0) +
      (contentText.match(/https?:\/\/\S+/g)?.length ?? 0) +
      (contentText.match(/\b(source|reference|link)\b/gi)?.length ?? 0),
    uniqueTokenRatio: (() => {
      const tokens = tokenizeForSibling(contentText);
      return tokens.length ? Math.max(0, Math.min(1, new Set(tokens).size / tokens.length)) : 0;
    })(),
    titleBodyOverlapRatio: Math.max(0, Math.min(1, titleBodyOverlapRatio)),
    duplicateTitleCount: siblingContext.duplicateTitleCount,
    siblingTopicOverlapRatio: Math.max(0, Math.min(1, siblingContext.siblingTopicOverlapRatio)),
  };
};

const buildSiblingContexts = (selectedPosts: SelectedPost[]) => {
  const titleCounts = new Map<string, number>();
  const keywordsByPost = new Map<string, string[]>();

  for (const post of selectedPosts) {
    const normalized = normalizeTitleForSibling(post.title ?? post.url);
    titleCounts.set(normalized, (titleCounts.get(normalized) ?? 0) + 1);
    keywordsByPost.set(post.id, topSiblingKeywords(post.title ?? "", post.contentClean ?? ""));
  }

  const contexts = new Map<string, PostSiblingContext>();
  for (const post of selectedPosts) {
    const normalized = normalizeTitleForSibling(post.title ?? post.url);
    const ownKeywords = keywordsByPost.get(post.id) ?? [];
    let bestOverlapRatio = 0;
    let bestOverlapKeywords: string[] = [];
    const relatedTitleSamples: string[] = [];

    for (const sibling of selectedPosts) {
      if (sibling.id === post.id) continue;
      const siblingKeywords = keywordsByPost.get(sibling.id) ?? [];
      const overlap = ownKeywords.filter((token) => siblingKeywords.includes(token));
      const base = Math.max(Math.min(ownKeywords.length, siblingKeywords.length), 1);
      const overlapRatio = overlap.length / base;
      if (overlapRatio > bestOverlapRatio) {
        bestOverlapRatio = overlapRatio;
        bestOverlapKeywords = overlap.slice(0, 3);
      }
      if (overlapRatio >= 0.35 && relatedTitleSamples.length < 3) {
        relatedTitleSamples.push(sibling.title ?? sibling.url);
      }
    }

    contexts.set(post.id, {
      duplicateTitleCount: Math.max(0, (titleCounts.get(normalized) ?? 1) - 1),
      siblingTopicOverlapRatio: bestOverlapRatio,
      siblingOverlapKeywords: bestOverlapKeywords,
      relatedTitleSamples,
    });
  }

  return contexts;
};

const pruneHistoricalArtifacts = (blogId: string, currentRunId: string) => {
  const previousRunIds = sqlite
    .prepare("SELECT run_id FROM analysis_run_targets WHERE blog_id = ? AND run_id != ?")
    .all(blogId, currentRunId)
    .map((row) => (row as { run_id: string }).run_id);
  if (!previousRunIds.length) return;

  const placeholders = previousRunIds.map(() => "?").join(", ");
  const reportIds = sqlite
    .prepare(`SELECT id FROM weekly_reports WHERE run_id IN (${placeholders})`)
    .all(...previousRunIds)
    .map((row) => (row as { id: string }).id);

  if (reportIds.length) {
    const reportPlaceholders = reportIds.map(() => "?").join(", ");
    sqlite.prepare(`DELETE FROM recommendations WHERE weekly_report_id IN (${reportPlaceholders})`).run(...reportIds);
    sqlite.prepare(`DELETE FROM topic_summaries WHERE weekly_report_id IN (${reportPlaceholders})`).run(...reportIds);
    sqlite.prepare(`DELETE FROM blog_weekly_scores WHERE weekly_report_id IN (${reportPlaceholders})`).run(...reportIds);
    sqlite.prepare(`DELETE FROM weekly_reports WHERE id IN (${reportPlaceholders})`).run(...reportIds);
  }

  sqlite.prepare(`DELETE FROM post_analyses WHERE run_id IN (${placeholders})`).run(...previousRunIds);
  sqlite.prepare(`DELETE FROM cost_logs WHERE run_id IN (${placeholders})`).run(...previousRunIds);
  sqlite.prepare(`DELETE FROM run_events WHERE run_id IN (${placeholders})`).run(...previousRunIds);
  sqlite.prepare(`DELETE FROM analysis_run_targets WHERE run_id IN (${placeholders})`).run(...previousRunIds);
  sqlite.prepare(`DELETE FROM analysis_runs WHERE id IN (${placeholders})`).run(...previousRunIds);
};

class AnalysisCoordinator {
  private activeRunId: string | null = null;

  isBusy() {
    return Boolean(this.activeRunId);
  }

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
      const siblingContexts = buildSiblingContexts(selectedPosts);

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
        const siblingContext = siblingContexts.get(post.id) ?? {
          duplicateTitleCount: 0,
          siblingTopicOverlapRatio: 0,
          siblingOverlapKeywords: [],
          relatedTitleSamples: [],
        };
        const contentMetrics = buildContentMetricsFromPost(post, siblingContext);

        const analysisInput: AnalyzePostInput = {
          blogName: discovery.blog.name,
          blogPlatform: discovery.blog.platform,
          postTitle: post.title ?? "Untitled",
          postUrl: post.url,
          publishedAt: post.publishedAt,
          contentText: limitText(post.contentClean ?? "", providerSettings.maxCharsPerPost),
          contentHtml: post.contentRaw ?? null,
          analysisMode: providerSettings.analysisMode,
          maxOutputTokens: providerSettings.maxOutputTokens,
          engagement: {
            commentsCount: engagement?.comments_count ?? null,
            likesCount: engagement?.likes_count ?? null,
            sympathyCount: engagement?.sympathy_count ?? null,
            viewsCount: engagement?.views_count ?? null,
          },
          contentMetrics,
          siblingContext,
        };

        const baseAnalysis = heuristicPostAnalysis(analysisInput).data;
        let finalAnalysis = baseAnalysis;

        if (providerSettings.provider !== "algorithm") {
          const enriched = await provider.analyzePost(analysisInput, providerSettings);
          usages.inputTokens += enriched.usage.inputTokens;
          usages.outputTokens += enriched.usage.outputTokens;
          usages.estimatedCost += enriched.usage.estimatedCost;
          finalAnalysis = mergeNarrative(baseAnalysis, postNarrativeSchema.parse(enriched.data));
        }

        analyzedPosts.push({ post, analysis: finalAnalysis });
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
        qualityGrade: qualityGrade(60),
        reasons: [],
      };
      score.blogId = blogId;
      score.blogName = discovery.blog.name;

      const topicCounts = new Map<string, { count: number; scores: number[] }>();
      for (const item of analyzedPosts) {
        for (const topic of item.analysis.topicLabels) {
          const current = topicCounts.get(topic) ?? { count: 0, scores: [] };
          current.count += 1;
          current.scores.push(item.analysis.qualityScore);
          topicCounts.set(topic, current);
        }
      }

      sqlite.transaction(() => {
        pruneHistoricalArtifacts(blogId, runId);

        for (const item of analyzedPosts) {
          sqlite
            .prepare(
              `
              INSERT INTO post_analyses (
                id, run_id, post_id, summary, target_audience_guess, intent_guess, topic_labels_json,
                strengths_json, weaknesses_json, improvements_json, seo_notes_json,
                title_strength, hook_strength, structure_score, information_density_score, practicality_score,
                differentiation_score, seo_potential_score, audience_fit_score,
                headline_score, readability_score, value_score, originality_score, search_fit_score,
                quality_score, quality_status, signal_breakdown_json, content_metrics_json,
                score_drivers_json, score_risks_json, engagement_adjustment_note, created_at
              ) VALUES (
                @id, @runId, @postId, @summary, @targetAudienceGuess, @intentGuess, @topicLabelsJson,
                @strengthsJson, @weaknessesJson, @improvementsJson, @seoNotesJson,
                @titleStrength, @hookStrength, @structureScore, @informationDensityScore, @practicalityScore,
                @differentiationScore, @seoPotentialScore, @audienceFitScore,
                @headlineScore, @readabilityScore, @valueScore, @originalityScore, @searchFitScore,
                @qualityScore, @qualityStatus, @signalBreakdownJson, @contentMetricsJson,
                @scoreDriversJson, @scoreRisksJson, @engagementAdjustmentNote, @createdAt
              )
              `,
            )
            .run({
              id: createId("pa"),
              runId,
              postId: item.post.id,
              summary: item.analysis.summary,
              targetAudienceGuess: item.analysis.targetAudienceGuess,
              intentGuess: item.analysis.intentGuess,
              topicLabelsJson: JSON.stringify(item.analysis.topicLabels),
              strengthsJson: JSON.stringify(item.analysis.strengths),
              weaknessesJson: JSON.stringify(item.analysis.weaknesses),
              improvementsJson: JSON.stringify(item.analysis.improvements),
              seoNotesJson: JSON.stringify(item.analysis.seoNotes),
              titleStrength: item.analysis.titleStrength,
              hookStrength: item.analysis.hookStrength,
              structureScore: item.analysis.structureScore,
              informationDensityScore: item.analysis.informationDensityScore,
              practicalityScore: item.analysis.practicalityScore,
              differentiationScore: item.analysis.differentiationScore,
              seoPotentialScore: item.analysis.seoPotentialScore,
              audienceFitScore: item.analysis.audienceFitScore,
              headlineScore: item.analysis.headlineScore,
              readabilityScore: item.analysis.readabilityScore,
              valueScore: item.analysis.valueScore,
              originalityScore: item.analysis.originalityScore,
              searchFitScore: item.analysis.searchFitScore,
              qualityScore: item.analysis.qualityScore,
              qualityStatus: item.analysis.qualityStatus,
              signalBreakdownJson: JSON.stringify(item.analysis.signalBreakdown),
              contentMetricsJson: JSON.stringify(item.analysis.contentMetrics),
              scoreDriversJson: JSON.stringify(item.analysis.topScoreDrivers),
              scoreRisksJson: JSON.stringify(item.analysis.topScoreRisks),
              engagementAdjustmentNote: item.analysis.engagementAdjustmentNote,
              createdAt,
            });
        }

        sqlite
          .prepare(
            `
            INSERT INTO weekly_reports (
              id, run_id, week_start, week_end, overall_summary, topic_overlap_json, topic_gaps_json,
              blog_comparisons_json, priority_actions_json, next_week_topics_json, markdown_report, created_at
            ) VALUES (
              @id, @runId, @weekStart, @weekEnd, @overallSummary, @topicOverlapJson, @topicGapsJson,
              @blogComparisonsJson, @priorityActionsJson, @nextWeekTopicsJson, @markdownReport, @createdAt
            )
            `,
          )
          .run({
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

        sqlite
          .prepare(
            `
            INSERT INTO blog_weekly_scores (
              id, weekly_report_id, blog_id, post_count, avg_title_strength, avg_hook_strength, avg_structure_score,
              avg_information_density_score, avg_practicality_score, avg_differentiation_score,
              avg_seo_potential_score, avg_audience_fit_score, topic_diversity_score, publishing_consistency_score,
              freshness_score, engagement_score, ebi_score, ebi_status, ebi_reason_json, created_at
            ) VALUES (
              @id, @weeklyReportId, @blogId, @postCount, @avgTitleStrength, @avgHookStrength, @avgStructureScore,
              @avgInformationDensityScore, @avgPracticalityScore, @avgDifferentiationScore,
              @avgSeoPotentialScore, @avgAudienceFitScore, @topicDiversityScore, @publishingConsistencyScore,
              @freshnessScore, @engagementScore, @ebiScore, @ebiStatus, @ebiReasonJson, @createdAt
            )
            `,
          )
          .run({
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

        for (const [topic, meta] of topicCounts.entries()) {
          sqlite
            .prepare(
              `
              INSERT INTO topic_summaries (
                id, weekly_report_id, topic_name, post_count, avg_score, overlap_score,
                gap_score, recommendation_priority, notes, created_at
              ) VALUES (
                @id, @weeklyReportId, @topicName, @postCount, @avgScore, @overlapScore,
                @gapScore, @recommendationPriority, @notes, @createdAt
              )
              `,
            )
            .run({
              id: createId("topic"),
              weeklyReportId: reportId,
              topicName: topic,
              postCount: meta.count,
              avgScore: average(meta.scores),
              overlapScore: meta.count > 1 ? 70 : 30,
              gapScore: analysisSummary.topicGaps.includes(topic) ? 100 : 20,
              recommendationPriority: analysisSummary.nextWeekTopics.includes(topic) ? 90 : 55,
              notes: meta.count > 1 ? "반복 출현 주제" : "확장 가능한 주제",
              createdAt,
            });
        }

        for (const item of nextRecommendations) {
          sqlite
            .prepare(
              `
              INSERT INTO recommendations (
                id, weekly_report_id, blog_id, recommendation_type, priority,
                title, description, action_items_json, created_at
              ) VALUES (
                @id, @weeklyReportId, @blogId, @recommendationType, @priority,
                @title, @description, @actionItemsJson, @createdAt
              )
              `,
            )
            .run({
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

        sqlite
          .prepare(
            `
            INSERT INTO cost_logs (
              id, run_id, provider, model, estimated_input_tokens, estimated_output_tokens,
              estimated_cost, actual_cost, created_at
            ) VALUES (
              @id, @runId, @provider, @model, @estimatedInputTokens, @estimatedOutputTokens,
              @estimatedCost, @actualCost, @createdAt
            )
            `,
          )
          .run({
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

        sqlite
          .prepare(
            `
            UPDATE analysis_runs
            SET status = @status,
                ended_at = @endedAt,
                post_count = @postCount,
                estimated_input_tokens = @estimatedInputTokens,
                estimated_output_tokens = @estimatedOutputTokens,
                estimated_cost = @estimatedCost,
                actual_cost = @actualCost
            WHERE id = @id
            `,
          )
          .run({
            id: runId,
            status: "completed",
            endedAt: createdAt,
            postCount: analyzedPosts.length,
            estimatedInputTokens: usages.inputTokens,
            estimatedOutputTokens: usages.outputTokens,
            estimatedCost: usages.estimatedCost,
            actualCost: usages.estimatedCost,
          });
      })();
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
        pa.score_risks_json,
        pa.content_metrics_json,
        pa.quality_score,
        pa.quality_status,
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
      return {
        postId: row.post_id as string,
        blogId: row.blog_id as string,
        blogName: row.blog_name as string,
        title: (row.title as string | null) ?? (row.url as string),
        url: row.url as string,
        publishedAt: (row.published_at as string | null) ?? null,
        qualityScore: Number(row.quality_score ?? 0),
        qualityStatus: String(row.quality_status ?? "watch"),
        qualityGrade: qualityGrade(Number(row.quality_score ?? 0)),
        topImprovements: safeJsonParse(row.improvements_json as string | null, [] as string[]).slice(0, 2),
        weakSignals: safeJsonParse(row.score_risks_json as string | null, [] as string[]).slice(0, 3),
        contentMetrics: safeJsonParse(row.content_metrics_json as string | null, {
          contentLength: 0,
          paragraphCount: 0,
          avgParagraphLength: 0,
          sentenceCount: 0,
          headingCount: 0,
          listCount: 0,
          questionCount: 0,
          faqCount: 0,
          numericTokenCount: 0,
          stepMarkerCount: 0,
          referenceCount: 0,
          uniqueTokenRatio: 0,
          titleBodyOverlapRatio: 0,
          duplicateTitleCount: 0,
          siblingTopicOverlapRatio: 0,
        }),
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

