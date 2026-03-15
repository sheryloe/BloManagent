import {
  buildNarrativeFromAnalysis,
  heuristicAnalysisSummary,
  heuristicPostAnalysis,
  heuristicRecommendations,
} from "../services/heuristics";
import type {
  AIProvider,
  AnalyzePostInput,
  ProviderSettingsRow,
  RecommendationInput,
  SummarizeWeekInput,
} from "./types";

class AlgorithmProvider implements AIProvider {
  name = "algorithm" as const;

  estimateCost() {
    return 0;
  }

  async validateConfig() {
    return { valid: true };
  }

  async listModels() {
    return ["deterministic-rules"];
  }

  async analyzePost(input: AnalyzePostInput) {
    const result = heuristicPostAnalysis(input);
    return {
      data: buildNarrativeFromAnalysis(result.data),
      usage: result.usage,
    };
  }

  async summarizeWeek(input: SummarizeWeekInput) {
    return heuristicAnalysisSummary(input);
  }

  async generateRecommendations(input: RecommendationInput) {
    return heuristicRecommendations(input, input.weeklySummary);
  }
}

export const algorithmProvider = new AlgorithmProvider();
