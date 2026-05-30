import type { AIProviderType } from "../../types/models";
import type { AIProvider } from "./types";
import { createOpenAIProvider } from "./openaiProvider";
import { createGeminiProvider } from "./geminiProvider";

export function createAIProvider(providerType: AIProviderType): AIProvider {
  switch (providerType) {
    case "openai":
      return createOpenAIProvider();
    case "gemini":
      return createGeminiProvider();
  }
}
