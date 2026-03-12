import type { z } from "zod";
import type {
  analyzeRequestSchema,
  appSettingsSchema,
  blogCreateSchema,
  blogSchema,
  blogWithStatsSchema,
  dashboardResponseSchema,
  postAnalysisSchema,
  providerSettingsSchema,
  recommendationSchema,
  reportSchema,
  runDetailsSchema,
  runSchema,
  settingsPayloadSchema,
  weeklySummarySchema,
} from "./schemas";

export type Blog = z.infer<typeof blogSchema>;
export type BlogCreateInput = z.infer<typeof blogCreateSchema>;
export type BlogWithStats = z.infer<typeof blogWithStatsSchema>;
export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;
export type PostAnalysis = z.infer<typeof postAnalysisSchema>;
export type WeeklySummary = z.infer<typeof weeklySummarySchema>;
export type Recommendation = z.infer<typeof recommendationSchema>;
export type Run = z.infer<typeof runSchema>;
export type RunDetails = z.infer<typeof runDetailsSchema>;
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
export type ProviderSettings = z.infer<typeof providerSettingsSchema>;
export type AppSettings = z.infer<typeof appSettingsSchema>;
export type SettingsPayload = z.infer<typeof settingsPayloadSchema>;
export type Report = z.infer<typeof reportSchema>;

export type ProviderName = "google" | "openai" | "ollama";
export type PlatformName = "blogger" | "tistory" | "naver" | "generic";
export type AnalysisMode = "fast" | "balanced" | "deep" | "budget";
export type RunScope = "latest7" | "latest30" | "newOnly" | "selected" | "full";
