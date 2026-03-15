import { z } from "zod";

export const providerNameSchema = z.enum(["google", "openai", "ollama"]);
export const platformNameSchema = z.enum(["blogger", "tistory", "naver", "wordpress", "generic"]);
export const analysisModeSchema = z.enum(["fast", "balanced", "deep", "budget"]);
export const runScopeSchema = z.enum(["latest7", "latest30", "newOnly", "selected", "full"]);

export const blogSchema = z.object({
  id: z.string(),
  name: z.string(),
  mainUrl: z.string().url(),
  platform: platformNameSchema,
  rssUrl: z.string().url().nullable().optional(),
  sitemapUrl: z.string().url().nullable().optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const blogCreateSchema = z.object({
  name: z.string().trim().optional().or(z.literal("")),
  mainUrl: z.string().url(),
  platformOverride: platformNameSchema.optional(),
  rssUrl: z.string().url().optional().or(z.literal("")),
  description: z.string().optional(),
});

export const blogWithStatsSchema = blogSchema.extend({
  postCount: z.number().int().nonnegative(),
  latestRunId: z.string().nullable(),
  latestRunAt: z.string().nullable(),
  latestEbiScore: z.number().nullable(),
  previousEbiScore: z.number().nullable(),
  lastCrawlAt: z.string().nullable(),
});

export const postAnalysisSchema = z.object({
  summary: z.string(),
  targetAudienceGuess: z.string(),
  intentGuess: z.string(),
  topicLabels: z.array(z.string()).max(10),
  strengths: z.array(z.string()).max(10),
  weaknesses: z.array(z.string()).max(10),
  improvements: z.array(z.string()).max(10),
  seoNotes: z.array(z.string()).max(10),
  titleStrength: z.number().int().min(0).max(100),
  hookStrength: z.number().int().min(0).max(100),
  structureScore: z.number().int().min(0).max(100),
  informationDensityScore: z.number().int().min(0).max(100),
  practicalityScore: z.number().int().min(0).max(100),
  differentiationScore: z.number().int().min(0).max(100),
  seoPotentialScore: z.number().int().min(0).max(100),
  audienceFitScore: z.number().int().min(0).max(100),
  engagementAdjustmentNote: z.string(),
});

export const blogScoreSchema = z.object({
  blogId: z.string(),
  blogName: z.string(),
  postCount: z.number().int().nonnegative(),
  avgTitleStrength: z.number(),
  avgHookStrength: z.number(),
  avgStructureScore: z.number(),
  avgInformationDensityScore: z.number(),
  avgPracticalityScore: z.number(),
  avgDifferentiationScore: z.number(),
  avgSeoPotentialScore: z.number(),
  avgAudienceFitScore: z.number(),
  topicDiversityScore: z.number(),
  publishingConsistencyScore: z.number(),
  freshnessScore: z.number(),
  engagementScore: z.number(),
  ebiScore: z.number(),
  ebiStatus: z.string(),
  ebiReason: z.array(z.string()),
});

export const weeklySummarySchema = z.object({
  overallSummary: z.string(),
  topicOverlap: z.array(z.string()),
  topicGaps: z.array(z.string()),
  blogComparisons: z.array(z.string()),
  priorityActions: z.array(z.string()),
  nextWeekTopics: z.array(z.string()),
  blogScores: z.array(blogScoreSchema),
});

export const recommendationSchema = z.object({
  recommendationType: z.string(),
  priority: z.number().int().min(0).max(100),
  title: z.string(),
  description: z.string(),
  actionItems: z.array(z.string()).max(10),
  blogId: z.string().nullable().optional(),
});

export const runSchema = z.object({
  id: z.string(),
  runScope: runScopeSchema,
  provider: providerNameSchema,
  model: z.string(),
  analysisMode: analysisModeSchema,
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  status: z.string(),
  blogCount: z.number().int(),
  postCount: z.number().int(),
  estimatedInputTokens: z.number().int(),
  estimatedOutputTokens: z.number().int(),
  estimatedCost: z.number(),
  actualCost: z.number(),
  errorMessage: z.string().nullable(),
});

export const runEventSchema = z.object({
  id: z.string(),
  runId: z.string(),
  level: z.enum(["info", "warning", "error"]),
  message: z.string(),
  createdAt: z.string(),
});

export const runDetailsSchema = z.object({
  run: runSchema,
  events: z.array(runEventSchema),
});

export const providerSettingsSchema = z.object({
  provider: providerNameSchema,
  model: z.string(),
  isDefault: z.boolean(),
  analysisMode: analysisModeSchema,
  maxPostsPerRun: z.number().int().positive(),
  maxCharsPerPost: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive(),
  timeoutMs: z.number().int().positive(),
  retryCount: z.number().int().min(0),
  fallbackProvider: providerNameSchema.nullable().optional(),
  ollamaBaseUrl: z.string().url().nullable().optional(),
  hasCredential: z.boolean().optional(),
});

export const appSettingsSchema = z.object({
  discoveryDepth: z.number().int().min(1).max(5),
  rssPriority: z.boolean(),
  sitemapPriority: z.boolean(),
  recrawlPolicy: z.enum(["changedOnly", "always", "newOnly"]),
  collectEngagementSnapshots: z.boolean(),
  analysisRangeDefault: runScopeSchema,
  monthlyBudgetLimit: z.number().nonnegative(),
  maxEstimatedCostPerRun: z.number().nonnegative(),
  fallbackOnOverBudget: z.boolean(),
});

export const settingsPayloadSchema = z.object({
  providers: z.array(providerSettingsSchema),
  app: appSettingsSchema,
  secrets: z
    .object({
      googleApiKey: z.string().optional(),
      openaiApiKey: z.string().optional(),
      ollamaBaseUrl: z.string().url().optional(),
    })
    .optional(),
});

export const dashboardResponseSchema = z.object({
  blogs: z.array(blogWithStatsSchema),
  latestRuns: z.array(runSchema),
  latestRecommendations: z.array(recommendationSchema.extend({ id: z.string(), createdAt: z.string() })),
});

export const discoverySourceCountsSchema = z.object({
  rss: z.number().int().nonnegative(),
  sitemap: z.number().int().nonnegative(),
  main: z.number().int().nonnegative(),
  wpJson: z.number().int().nonnegative(),
});

export const blogDiscoveryResultSchema = z.object({
  blog: blogSchema,
  discoveredCount: z.number().int().nonnegative(),
  insertedCount: z.number().int().nonnegative(),
  updatedCount: z.number().int().nonnegative(),
  insertedPostIds: z.array(z.string()),
  updatedPostIds: z.array(z.string()),
  sourceCounts: discoverySourceCountsSchema,
});

export const reportSchema = z.object({
  id: z.string(),
  runId: z.string(),
  weekStart: z.string(),
  weekEnd: z.string(),
  overallSummary: z.string(),
  topicOverlap: z.array(z.string()),
  topicGaps: z.array(z.string()),
  blogComparisons: z.array(z.string()),
  priorityActions: z.array(z.string()),
  nextWeekTopics: z.array(z.string()),
  markdownReport: z.string(),
  createdAt: z.string(),
});

export const analyzeRequestSchema = z.object({
  runScope: runScopeSchema.default("latest30"),
  selectedPostIds: z.array(z.string()).optional(),
  provider: providerNameSchema.optional(),
  model: z.string().optional(),
  analysisMode: analysisModeSchema.optional(),
});
