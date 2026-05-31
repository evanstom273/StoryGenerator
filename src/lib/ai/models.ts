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
  openrouter: [
    { id: "openai/gpt-oss-20b:free", label: "openai/gpt-oss-20b:free" },
    { id: "qwen/qwen3-32b:free", label: "qwen/qwen3-32b:free" },
    { id: "deepseek/deepseek-r1-0528:free", label: "deepseek/deepseek-r1-0528:free" },
    { id: "google/gemma-3-27b-it:free", label: "google/gemma-3-27b-it:free" },
  ],
};

const DEFAULT_MODEL: Record<AIProviderType, string> = {
  openai: "gpt-4o",
  gemini: "gemini-2.5-flash",
  openrouter: "openai/gpt-oss-20b:free",
};

export function getProviderModels(providerType: AIProviderType) {
  return PROVIDER_MODELS[providerType];
}

export function getProviderDefaultModel(providerType: AIProviderType) {
  return DEFAULT_MODEL[providerType];
}
