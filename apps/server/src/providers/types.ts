import type {
  AnalysisMode,
  AnalysisEngine,
  AnalysisSummary,
  ContentMetrics,
  PlatformName,
  PostAnalysis,
  PostNarrative,
  Recommendation,
} from "@blog-review/shared";

export interface PostSiblingContext {
  duplicateTitleCount: number;
  siblingTopicOverlapRatio: number;
  siblingOverlapKeywords: string[];
  relatedTitleSamples: string[];
}

export interface AnalyzePostInput {
  blogName: string;
  blogPlatform: PlatformName;
  postTitle: string;
  postUrl: string;
  publishedAt?: string | null;
  contentText: string;
  contentHtml?: string | null;
  analysisMode: AnalysisMode;
  maxOutputTokens: number;
  engagement?: {
    commentsCount?: number | null;
    likesCount?: number | null;
    sympathyCount?: number | null;
    viewsCount?: number | null;
  };
  contentMetrics?: ContentMetrics;
  siblingContext?: PostSiblingContext;
}

export interface SummarizeWeekInput {
  blogName: string;
  analysisMode: AnalysisMode;
  maxOutputTokens: number;
  postAnalyses: Array<{
    title: string;
    url: string;
    analysis: PostAnalysis;
  }>;
}

export interface RecommendationInput {
  blogName: string;
  analysisMode: AnalysisMode;
  maxOutputTokens: number;
  weeklySummary: AnalysisSummary;
  postAnalyses: Array<{
    title: string;
    url: string;
    analysis: PostAnalysis;
  }>;
}

export interface ProviderUsage {
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
}

export interface ProviderResult<T> {
  data: T;
  usage: ProviderUsage;
}

export interface ProviderSettingsRow {
  provider: AnalysisEngine;
  model: string;
  analysisMode: AnalysisMode;
  maxPostsPerRun: number;
  maxCharsPerPost: number;
  maxOutputTokens: number;
  timeoutMs: number;
  retryCount: number;
  fallbackProvider?: AnalysisEngine | null;
  ollamaBaseUrl?: string | null;
}

export interface AIProvider {
  name: AnalysisEngine;
  analyzePost(input: AnalyzePostInput, settings: ProviderSettingsRow): Promise<ProviderResult<PostNarrative>>;
  summarizeWeek(input: SummarizeWeekInput, settings: ProviderSettingsRow): Promise<ProviderResult<AnalysisSummary>>;
  generateRecommendations(
    input: RecommendationInput,
    settings: ProviderSettingsRow,
  ): Promise<ProviderResult<Recommendation[]>>;
  listModels(settings: ProviderSettingsRow): Promise<string[]>;
  validateConfig(settings: ProviderSettingsRow): Promise<{ valid: boolean; message?: string }>;
  estimateCost(inputTokens: number, outputTokens: number, model: string): number;
}
