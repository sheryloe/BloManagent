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

class OllamaProvider implements AIProvider {
  name = "ollama" as const;

  estimateCost() {
    return 0;
  }

  async validateConfig(settings: ProviderSettingsRow) {
    const baseUrl = settings.ollamaBaseUrl ?? (await secretStore.get("ollamaBaseUrl"));
    return baseUrl ? { valid: true } : { valid: false, message: "Ollama base URL is missing." };
  }

  async listModels(settings: ProviderSettingsRow) {
    const baseUrl = settings.ollamaBaseUrl ?? (await secretStore.get("ollamaBaseUrl"));
    if (!baseUrl) return ["qwen3:8b", "llama3.1:8b", "mistral:7b"];

    try {
      const response = await fetch(`${baseUrl}/api/tags`);
      if (!response.ok) return [];
      const json = (await response.json()) as { models?: Array<{ name: string }> };
      return (json.models ?? []).map((item) => item.name);
    } catch {
      return ["qwen3:8b", "llama3.1:8b", "mistral:7b"];
    }
  }

  async analyzePost(input: AnalyzePostInput, settings: ProviderSettingsRow) {
    return this.requestJson({
      settings,
      prompt: buildAnalyzePostPrompt(input),
      schema: zodToJsonSchema(postNarrativeSchema),
      fallback: () => ({
        data: buildNarrativeFromAnalysis(heuristicPostAnalysis(input).data),
        usage: { inputTokens: 0, outputTokens: 0, estimatedCost: 0 },
      }),
    });
  }

  async summarizeWeek(input: SummarizeWeekInput, settings: ProviderSettingsRow) {
    return this.requestJson({
      settings,
      prompt: buildWeeklySummaryPrompt(input),
      schema: zodToJsonSchema(weeklySummarySchema),
      fallback: () => heuristicAnalysisSummary(input),
    });
  }

  async generateRecommendations(input: RecommendationInput, settings: ProviderSettingsRow) {
    return this.requestJson({
      settings,
      prompt: buildRecommendationsPrompt(input, input.weeklySummary),
      schema: {
        type: "array",
        items: zodToJsonSchema(recommendationSchema),
      },
      fallback: () => heuristicRecommendations(input, input.weeklySummary),
    });
  }

  private async requestJson<T>(options: {
    settings: ProviderSettingsRow;
    prompt: string;
    schema: unknown;
    fallback: () => ProviderResult<T>;
  }): Promise<ProviderResult<T>> {
    const baseUrl = options.settings.ollamaBaseUrl ?? (await secretStore.get("ollamaBaseUrl"));
    if (!baseUrl) return options.fallback();

    try {
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: options.settings.model,
          prompt: options.prompt,
          stream: false,
          format: options.schema,
          options: {
            temperature: 0.2,
            num_predict: options.settings.maxOutputTokens,
          },
        }),
      });

      if (!response.ok) return options.fallback();
      const json = (await response.json()) as { response?: string; prompt_eval_count?: number; eval_count?: number };
      if (!json.response) return options.fallback();

      return {
        data: JSON.parse(json.response) as T,
        usage: {
          inputTokens: json.prompt_eval_count ?? 0,
          outputTokens: json.eval_count ?? 0,
          estimatedCost: 0,
        },
      };
    } catch {
      return options.fallback();
    }
  }
}

export const ollamaProvider = new OllamaProvider();
