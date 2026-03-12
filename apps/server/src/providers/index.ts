import type { ProviderName } from "@blog-review/shared";
import { googleProvider } from "./google";
import { ollamaProvider } from "./ollama";
import { openAiProvider } from "./openai";

export const providers = {
  google: googleProvider,
  openai: openAiProvider,
  ollama: ollamaProvider,
};

export const getProvider = (name: ProviderName) => providers[name];
