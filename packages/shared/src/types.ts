import type { z } from "zod";
import type {
  analysisEngineSchema,
  analysisSummarySchema,
  analyzeRequestSchema,
  appSettingsSchema,
  blogCreateSchema,
  blogDiscoveryResultSchema,
  blogSchema,
  blogWithStatsSchema,
  dashboardResponseSchema,
  discoverySourceCountsSchema,
  engineSettingsSchema,
  contentMetricsSchema,
  postAnalysisSchema,
  postNarrativeSchema,
  postDiagnosticSchema,
  improvementItemSchema,
  recommendationSchema,
  reportSchema,
  runDetailsSchema,
  runSchema,
  signalFindingSchema,
  signalBreakdownSchema,
  settingsPayloadSchema,
} from "./schemas";

export type Blog = z.infer<typeof blogSchema>;
export type BlogCreateInput = z.infer<typeof blogCreateSchema>;
export type BlogWithStats = z.infer<typeof blogWithStatsSchema>;
export type DiscoverySourceCounts = z.infer<typeof discoverySourceCountsSchema>;
export type BlogDiscoveryResult = z.infer<typeof blogDiscoveryResultSchema>;
export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;
export type PostAnalysis = z.infer<typeof postAnalysisSchema>;
export type PostNarrative = z.infer<typeof postNarrativeSchema>;
export type SignalBreakdown = z.infer<typeof signalBreakdownSchema>;
export type ContentMetrics = z.infer<typeof contentMetricsSchema>;
export type SignalFinding = z.infer<typeof signalFindingSchema>;
export type ImprovementItem = z.infer<typeof improvementItemSchema>;
export type AnalysisSummary = z.infer<typeof analysisSummarySchema>;
export type WeeklySummary = AnalysisSummary;
export type Recommendation = z.infer<typeof recommendationSchema>;
export type Run = z.infer<typeof runSchema>;
export type RunDetails = z.infer<typeof runDetailsSchema>;
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
export type PostDiagnostic = z.infer<typeof postDiagnosticSchema>;
export type EngineSettings = z.infer<typeof engineSettingsSchema>;
export type ProviderSettings = EngineSettings;
export type AppSettings = z.infer<typeof appSettingsSchema>;
export type SettingsPayload = z.infer<typeof settingsPayloadSchema>;
export type Report = z.infer<typeof reportSchema>;
export type AnalysisEngine = z.infer<typeof analysisEngineSchema>;
export type ProviderName = AnalysisEngine;

export type PlatformName = "blogger" | "tistory" | "naver" | "wordpress" | "generic";
export type AnalysisMode = "fast" | "balanced" | "deep" | "budget";
export type RunScope = "latest7" | "latest30" | "newOnly" | "selected" | "full";
