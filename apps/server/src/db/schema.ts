import {
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const blogs = sqliteTable("blogs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  mainUrl: text("main_url").notNull(),
  platform: text("platform").notNull(),
  rssUrl: text("rss_url"),
  sitemapUrl: text("sitemap_url"),
  description: text("description"),
  isActive: integer("is_active").default(1).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const blogCategories = sqliteTable("blog_categories", {
  id: text("id").primaryKey(),
  blogId: text("blog_id").notNull(),
  name: text("name").notNull(),
  slug: text("slug"),
  mappedTopicGroup: text("mapped_topic_group"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const posts = sqliteTable("posts", {
  id: text("id").primaryKey(),
  blogId: text("blog_id").notNull(),
  url: text("url").notNull().unique(),
  title: text("title"),
  publishedAt: text("published_at"),
  categoryName: text("category_name"),
  tagsJson: text("tags_json"),
  contentRaw: text("content_raw"),
  contentClean: text("content_clean"),
  contentHash: text("content_hash"),
  crawlStatus: text("crawl_status").default("verified").notNull(),
  discoverySource: text("discovery_source"),
  exclusionReason: text("exclusion_reason"),
  lastVerifiedAt: text("last_verified_at"),
  excludedAt: text("excluded_at"),
  discoveredAt: text("discovered_at").notNull(),
  lastCrawledAt: text("last_crawled_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const postEngagementSnapshots = sqliteTable("post_engagement_snapshots", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull(),
  commentsCount: integer("comments_count"),
  likesCount: integer("likes_count"),
  sympathyCount: integer("sympathy_count"),
  viewsCount: integer("views_count"),
  capturedAt: text("captured_at").notNull(),
  rawJson: text("raw_json"),
});

export const analysisRuns = sqliteTable("analysis_runs", {
  id: text("id").primaryKey(),
  runScope: text("run_scope").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  analysisMode: text("analysis_mode").notNull(),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at"),
  status: text("status").notNull(),
  blogCount: integer("blog_count").default(0).notNull(),
  postCount: integer("post_count").default(0).notNull(),
  estimatedInputTokens: integer("estimated_input_tokens").default(0).notNull(),
  estimatedOutputTokens: integer("estimated_output_tokens").default(0).notNull(),
  estimatedCost: real("estimated_cost").default(0).notNull(),
  actualCost: real("actual_cost").default(0).notNull(),
  errorMessage: text("error_message"),
});

export const analysisRunTargets = sqliteTable("analysis_run_targets", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  blogId: text("blog_id").notNull(),
  createdAt: text("created_at").notNull(),
});

export const runEvents = sqliteTable("run_events", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  level: text("level").notNull(),
  message: text("message").notNull(),
  createdAt: text("created_at").notNull(),
});

export const postAnalyses = sqliteTable("post_analyses", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  postId: text("post_id").notNull(),
  summary: text("summary"),
  targetAudienceGuess: text("target_audience_guess"),
  intentGuess: text("intent_guess"),
  topicLabelsJson: text("topic_labels_json"),
  strengthsJson: text("strengths_json"),
  weaknessesJson: text("weaknesses_json"),
  improvementsJson: text("improvements_json"),
  seoNotesJson: text("seo_notes_json"),
  titleStrength: integer("title_strength"),
  hookStrength: integer("hook_strength"),
  structureScore: integer("structure_score"),
  informationDensityScore: integer("information_density_score"),
  practicalityScore: integer("practicality_score"),
  differentiationScore: integer("differentiation_score"),
  seoPotentialScore: integer("seo_potential_score"),
  audienceFitScore: integer("audience_fit_score"),
  engagementAdjustmentNote: text("engagement_adjustment_note"),
  createdAt: text("created_at").notNull(),
});

export const weeklyReports = sqliteTable("weekly_reports", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  weekStart: text("week_start").notNull(),
  weekEnd: text("week_end").notNull(),
  overallSummary: text("overall_summary"),
  topicOverlapJson: text("topic_overlap_json"),
  topicGapsJson: text("topic_gaps_json"),
  blogComparisonsJson: text("blog_comparisons_json"),
  priorityActionsJson: text("priority_actions_json"),
  nextWeekTopicsJson: text("next_week_topics_json"),
  markdownReport: text("markdown_report"),
  createdAt: text("created_at").notNull(),
});

export const blogWeeklyScores = sqliteTable("blog_weekly_scores", {
  id: text("id").primaryKey(),
  weeklyReportId: text("weekly_report_id").notNull(),
  blogId: text("blog_id").notNull(),
  postCount: integer("post_count").default(0).notNull(),
  avgTitleStrength: real("avg_title_strength").default(0).notNull(),
  avgHookStrength: real("avg_hook_strength").default(0).notNull(),
  avgStructureScore: real("avg_structure_score").default(0).notNull(),
  avgInformationDensityScore: real("avg_information_density_score").default(0).notNull(),
  avgPracticalityScore: real("avg_practicality_score").default(0).notNull(),
  avgDifferentiationScore: real("avg_differentiation_score").default(0).notNull(),
  avgSeoPotentialScore: real("avg_seo_potential_score").default(0).notNull(),
  avgAudienceFitScore: real("avg_audience_fit_score").default(0).notNull(),
  topicDiversityScore: real("topic_diversity_score").default(0).notNull(),
  publishingConsistencyScore: real("publishing_consistency_score").default(0).notNull(),
  freshnessScore: real("freshness_score").default(0).notNull(),
  engagementScore: real("engagement_score").default(0).notNull(),
  ebiScore: real("ebi_score").default(0).notNull(),
  ebiStatus: text("ebi_status"),
  ebiReasonJson: text("ebi_reason_json"),
  createdAt: text("created_at").notNull(),
});

export const topicSummaries = sqliteTable("topic_summaries", {
  id: text("id").primaryKey(),
  weeklyReportId: text("weekly_report_id").notNull(),
  topicName: text("topic_name").notNull(),
  postCount: integer("post_count").default(0).notNull(),
  avgScore: real("avg_score").default(0).notNull(),
  overlapScore: real("overlap_score").default(0).notNull(),
  gapScore: real("gap_score").default(0).notNull(),
  recommendationPriority: real("recommendation_priority").default(0).notNull(),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

export const recommendations = sqliteTable("recommendations", {
  id: text("id").primaryKey(),
  weeklyReportId: text("weekly_report_id").notNull(),
  blogId: text("blog_id"),
  recommendationType: text("recommendation_type").notNull(),
  priority: integer("priority").default(0).notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  actionItemsJson: text("action_items_json"),
  createdAt: text("created_at").notNull(),
});

export const providerSettings = sqliteTable("provider_settings", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  isDefault: integer("is_default").default(0).notNull(),
  analysisMode: text("analysis_mode").default("balanced").notNull(),
  maxPostsPerRun: integer("max_posts_per_run").default(10).notNull(),
  maxCharsPerPost: integer("max_chars_per_post").default(3000).notNull(),
  maxOutputTokens: integer("max_output_tokens").default(1200).notNull(),
  timeoutMs: integer("timeout_ms").default(30000).notNull(),
  retryCount: integer("retry_count").default(2).notNull(),
  fallbackProvider: text("fallback_provider"),
  ollamaBaseUrl: text("ollama_base_url"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const costLogs = sqliteTable("cost_logs", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  estimatedInputTokens: integer("estimated_input_tokens").default(0).notNull(),
  estimatedOutputTokens: integer("estimated_output_tokens").default(0).notNull(),
  estimatedCost: real("estimated_cost").default(0).notNull(),
  actualCost: real("actual_cost").default(0).notNull(),
  createdAt: text("created_at").notNull(),
});
