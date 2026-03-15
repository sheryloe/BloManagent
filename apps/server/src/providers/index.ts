import type { AnalysisEngine } from "@blog-review/shared";
import { algorithmProvider } from "./algorithm";
import { googleProvider } from "./google";
import { ollamaProvider } from "./ollama";
import { openAiProvider } from "./openai";

export const providers = {
  algorithm: algorithmProvider,
  google: googleProvider,
  openai: openAiProvider,
  ollama: ollamaProvider,
};

export const getProvider = (name: AnalysisEngine) => providers[name];
