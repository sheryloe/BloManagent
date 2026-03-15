import { postAnalysisSchema, recommendationSchema, weeklySummarySchema } from "@blog-review/shared";
import { zodToJsonSchema } from "zod-to-json-schema";
import { secretStore } from "../security/secret-store";
import { heuristicAnalysisSummary, heuristicPostAnalysis, heuristicRecommendations } from "../services/heuristics";
import { buildAnalyzePostPrompt, buildRecommendationsPrompt, buildWeeklySummaryPrompt } from "../templates/prompts";
import type {
  AIProvider,
  AnalyzePostInput,
  ProviderResult,
  ProviderSettingsRow,
  RecommendationInput,
  SummarizeWeekInput,
} from "./types";

const endpoint = "https://api.openai.com/v1";

const pricing: Record<string, { input: number; output: number }> = {
  "gpt-5": { input: 1.25, output: 10 },
  "gpt-5 mini": { input: 0.25, output: 2 },
};

class OpenAiProvider implements AIProvider {
  name = "openai" as const;

  estimateCost(inputTokens: number, outputTokens: number, model: string) {
    const rate = pricing[model];
    if (!rate) return 0;
    return (inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output;
  }

  async validateConfig() {
    const key = await secretStore.get("openaiApiKey");
    return key ? { valid: true } : { valid: false, message: "OpenAI API key is missing." };
  }

  async listModels() {
    const key = await secretStore.get("openaiApiKey");
    if (!key) return Object.keys(pricing);

    try {
      const response = await fetch(`${endpoint}/models`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!response.ok) return Object.keys(pricing);
      const json = (await response.json()) as { data?: Array<{ id: string }> };
      return (json.data ?? []).map((item) => item.id).filter((id) => id.includes("gpt"));
    } catch {
      return Object.keys(pricing);
    }
  }

  async analyzePost(input: AnalyzePostInput, settings: ProviderSettingsRow) {
    return this.requestJson({
      model: settings.model,
      schemaName: "post_analysis",
      prompt: buildAnalyzePostPrompt(input),
      schema: zodToJsonSchema(postAnalysisSchema),
      fallback: () => heuristicPostAnalysis(input),
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
    const key = await secretStore.get("openaiApiKey");
    if (!key) return options.fallback();

    try {
      const response = await fetch(`${endpoint}/responses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: options.model,
          input: options.prompt,
          max_output_tokens: options.maxOutputTokens,
          text: {
            format: {
              type: "json_schema",
              name: options.schemaName,
              schema: options.schema,
            },
          },
        }),
      });

      if (!response.ok) return options.fallback();

      const json = (await response.json()) as {
        output_text?: string;
        output?: Array<{ content?: Array<{ text?: string }> }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const text = json.output_text ?? json.output?.[0]?.content?.[0]?.text;
      if (!text) return options.fallback();

      const inputTokens = json.usage?.input_tokens ?? 0;
      const outputTokens = json.usage?.output_tokens ?? 0;
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

export const openAiProvider = new OpenAiProvider();
