import { heuristicAnalysisSummary, heuristicPostAnalysis, heuristicRecommendations } from "../services/heuristics";
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
    return heuristicPostAnalysis(input);
  }

  async summarizeWeek(input: SummarizeWeekInput) {
    return heuristicAnalysisSummary(input);
  }

  async generateRecommendations(input: RecommendationInput) {
    return heuristicRecommendations(input, input.weeklySummary);
  }
}

export const algorithmProvider = new AlgorithmProvider();
