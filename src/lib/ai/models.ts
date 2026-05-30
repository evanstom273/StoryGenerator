import type { AIProviderType } from "../../types/models";

export interface ProviderModelOption {
  id: string;
  label: string;
}

const PROVIDER_MODELS: Record<AIProviderType, ProviderModelOption[]> = {
  openai: [
    { id: "gpt-5", label: "GPT-5" },
    { id: "gpt-5-mini", label: "GPT-5 Mini" },
    { id: "gpt-4.1", label: "GPT-4.1" },
    { id: "gpt-4o", label: "GPT-4o" },
  ],
  gemini: [
    { id: "gemini-2.5-flash", label: "gemini-2.5-flash" },
    { id: "gemini-2.5-pro", label: "gemini-2.5-pro" },
  ],
};

const DEFAULT_MODEL: Record<AIProviderType, string> = {
  openai: "gpt-4o",
  gemini: "gemini-2.5-flash",
};

export function getProviderModels(providerType: AIProviderType) {
  return PROVIDER_MODELS[providerType];
}

export function getProviderDefaultModel(providerType: AIProviderType) {
  return DEFAULT_MODEL[providerType];
}

