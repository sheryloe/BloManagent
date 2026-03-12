import type {
  AnalysisMode,
  PlatformName,
  PostAnalysis,
  ProviderName,
  Recommendation,
  WeeklySummary,
} from "@blog-review/shared";

export interface AnalyzePostInput {
  blogName: string;
  blogPlatform: PlatformName;
  postTitle: string;
  postUrl: string;
  publishedAt?: string | null;
  content: string;
  analysisMode: AnalysisMode;
  maxOutputTokens: number;
  engagement?: {
    commentsCount?: number | null;
    likesCount?: number | null;
    sympathyCount?: number | null;
    viewsCount?: number | null;
  };
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
  weeklySummary: WeeklySummary;
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
  provider: ProviderName;
  model: string;
  analysisMode: AnalysisMode;
  maxPostsPerRun: number;
  maxCharsPerPost: number;
  maxOutputTokens: number;
  timeoutMs: number;
  retryCount: number;
  fallbackProvider?: ProviderName | null;
  ollamaBaseUrl?: string | null;
}

export interface AIProvider {
  name: ProviderName;
  analyzePost(input: AnalyzePostInput, settings: ProviderSettingsRow): Promise<ProviderResult<PostAnalysis>>;
  summarizeWeek(input: SummarizeWeekInput, settings: ProviderSettingsRow): Promise<ProviderResult<WeeklySummary>>;
  generateRecommendations(
    input: RecommendationInput,
    settings: ProviderSettingsRow,
  ): Promise<ProviderResult<Recommendation[]>>;
  listModels(settings: ProviderSettingsRow): Promise<string[]>;
  validateConfig(settings: ProviderSettingsRow): Promise<{ valid: boolean; message?: string }>;
  estimateCost(inputTokens: number, outputTokens: number, model: string): number;
}
