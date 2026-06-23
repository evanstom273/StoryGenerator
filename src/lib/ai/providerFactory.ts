import type { AIProviderType } from "../../types/models";
import type { AIProvider } from "./types";
import { createOpenAIProvider } from "./openaiProvider";
import { createGeminiProvider } from "./geminiProvider";
import { createOpenRouterProvider } from "./openrouterProvider";
import { createAnthropicProvider } from "./anthropicProvider";

export function createAIProvider(providerType: AIProviderType): AIProvider {
  switch (providerType) {
    case "openai":
      return createOpenAIProvider();
    case "gemini":
      return createGeminiProvider();
    case "openrouter":
      return createOpenRouterProvider();
    case "anthropic":
      return createAnthropicProvider();
  }
}
