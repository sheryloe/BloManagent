import { postNarrativeSchema, recommendationSchema, weeklySummarySchema } from "@blog-review/shared";
import { zodToJsonSchema } from "zod-to-json-schema";
import { secretStore } from "../security/secret-store";
import { buildNarrativeFromAnalysis, heuristicAnalysisSummary, heuristicPostAnalysis, heuristicRecommendations } from "../services/heuristics";
import { buildAnalyzePostPrompt, buildRecommendationsPrompt, buildWeeklySummaryPrompt } from "../templates/prompts";
import type {
  AIProvider,
  AnalyzePostInput,
  ProviderResult,
  ProviderSettingsRow,
  RecommendationInput,
  SummarizeWeekInput,
} from "./types";

const endpoint = "https://generativelanguage.googleapis.com/v1beta";

const pricing: Record<string, { input: number; output: number }> = {
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
};

class GoogleProvider implements AIProvider {
  name = "google" as const;

  estimateCost(inputTokens: number, outputTokens: number, model: string) {
    const rate = pricing[model];
    if (!rate) return 0;
    return (inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output;
  }

  async validateConfig() {
    const key = await secretStore.get("googleApiKey");
    return key ? { valid: true } : { valid: false, message: "Google API key is missing." };
  }

  async listModels() {
    const key = await secretStore.get("googleApiKey");
    if (!key) return Object.keys(pricing);

    try {
      const response = await fetch(`${endpoint}/models?key=${key}`);
      if (!response.ok) return Object.keys(pricing);
      const json = (await response.json()) as { models?: Array<{ name: string }> };
      return (json.models ?? [])
        .map((model) => model.name.replace("models/", ""))
        .filter((name) => name.includes("gemini"));
    } catch {
      return Object.keys(pricing);
    }
  }

  async analyzePost(input: AnalyzePostInput, settings: ProviderSettingsRow) {
    return this.requestJson({
      model: settings.model,
      schemaName: "post_analysis",
      prompt: buildAnalyzePostPrompt(input),
      schema: zodToJsonSchema(postNarrativeSchema),
      fallback: () => ({
        data: buildNarrativeFromAnalysis(heuristicPostAnalysis(input).data),
        usage: { inputTokens: 0, outputTokens: 0, estimatedCost: 0 },
      }),
      maxOutputTokens: settings.maxOutputTokens,
    });
  }

  async summarizeWeek(input: SummarizeWeekInput, settings: ProviderSettingsRow) {
    return this.requestJson({
      model: settings.model,
      schemaName: "weekly_summary",
      prompt: buildWeeklySummaryPrompt(input),
      schema: zodToJsonSchema(weeklySummarySchema),
      fallback: () => heuristicAnalysisSummary(input),
      maxOutputTokens: settings.maxOutputTokens,
    });
  }

  async generateRecommendations(input: RecommendationInput, settings: ProviderSettingsRow) {
    return this.requestJson({
      model: settings.model,
      schemaName: "recommendations",
      prompt: buildRecommendationsPrompt(input, input.weeklySummary),
      schema: {
        type: "array",
        items: zodToJsonSchema(recommendationSchema),
      },
      fallback: () => heuristicRecommendations(input, input.weeklySummary),
      maxOutputTokens: settings.maxOutputTokens,
    });
  }

  private async requestJson<T>(options: {
    model: string;
    schemaName: string;
    schema: unknown;
    prompt: string;
    fallback: () => ProviderResult<T>;
    maxOutputTokens: number;
  }): Promise<ProviderResult<T>> {
    const key = await secretStore.get("googleApiKey");
    if (!key) return options.fallback();

    try {
      const response = await fetch(`${endpoint}/models/${encodeURIComponent(options.model)}:generateContent?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: options.prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: options.maxOutputTokens,
            responseMimeType: "application/json",
            responseJsonSchema: options.schema,
          },
        }),
      });

      if (!response.ok) return options.fallback();

      const json = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      };
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) return options.fallback();

      const inputTokens = json.usageMetadata?.promptTokenCount ?? 0;
      const outputTokens = json.usageMetadata?.candidatesTokenCount ?? 0;
      return {
        data: JSON.parse(text) as T,
        usage: {
          inputTokens,
          outputTokens,
          estimatedCost: this.estimateCost(inputTokens, outputTokens, options.model),
        },
      };
    } catch {
      return options.fallback();
    }
  }
}

export const googleProvider = new GoogleProvider();
