import type { AIModelRole, AIProviderType, AISettings } from "../../types/models";

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
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
    { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
    { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (Preview)" },
  ],
  anthropic: [
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
    { id: "claude-opus-4-8", label: "Claude Opus 4.8" },
  ],
  openrouter: [
    { id: "openai/gpt-oss-20b:free", label: "openai/gpt-oss-20b:free" },
    { id: "qwen/qwen3-32b:free", label: "qwen/qwen3-32b:free" },
    { id: "deepseek/deepseek-r1-0528:free", label: "deepseek/deepseek-r1-0528:free" },
    { id: "google/gemma-3-27b-it:free", label: "google/gemma-3-27b-it:free" },
    {
      id: "cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
      label: "Venice / Dolphin-Mistral 24B (Free)",
    },
    {
      id: "nothingiisreal/mn-celeste-12b",
      label: "Mistral Nemo 12B Celeste",
    },
    {
      id: "thedrummer/cydonia-24b-v4.1",
      label: "Cydonia 24B v4.1",
    },
    {
      id: "sao10k/l3.1-euryale-70b",
      label: "Euryale 70B",
    },
  ],
};

const DEFAULT_MODEL: Record<AIProviderType, string> = {
  openai: "gpt-4o",
  gemini: "gemini-2.5-flash",
  openrouter: "openai/gpt-oss-20b:free",
  anthropic: "claude-sonnet-4-6",
};

export function getProviderModels(providerType: AIProviderType) {
  return PROVIDER_MODELS[providerType];
}

export function getProviderDefaultModel(providerType: AIProviderType) {
  return DEFAULT_MODEL[providerType];
}

export function getValidModel(providerType: AIProviderType, savedModel: string | undefined): string {
  if (savedModel && PROVIDER_MODELS[providerType].some((m) => m.id === savedModel)) {
    return savedModel;
  }
  return DEFAULT_MODEL[providerType];
}

export function getAIModelForRole(
	settings: AISettings,
	providerType: AIProviderType,
	role: AIModelRole = "story",
): string | undefined {
	const storyModel = settings.defaultModels?.[providerType];

	switch (role) {
		case "story":
			return storyModel;
		case "metachat":
			return settings.metachatModels?.[providerType] ?? storyModel;
		case "indexing":
			return settings.indexingModels?.[providerType] ?? storyModel;
		case "creation":
			return settings.creationModels?.[providerType] ?? storyModel;
	}
}

export interface ModelStreamConfig {
  idleTimeoutMs: number;
  totalTimeoutMs: number;
  /** Retry ceiling for transient failures; terminal refusals stop immediately. */
  maxAttempts: number;
}

const MODEL_STREAM_CONFIG: Partial<Record<string, ModelStreamConfig>> = {
  "gemini-3.1-pro-preview": { idleTimeoutMs: 60_000, totalTimeoutMs: 300_000, maxAttempts: 5 },
  "gemini-3.6-flash":       { idleTimeoutMs: 60_000, totalTimeoutMs: 300_000, maxAttempts: 5 },
  "gemini-2.5-pro":         { idleTimeoutMs: 60_000, totalTimeoutMs: 300_000, maxAttempts: 5 },
  "gemini-2.5-flash":       { idleTimeoutMs: 30_000, totalTimeoutMs: 120_000, maxAttempts: 3 },
  "gemini-3.5-flash":       { idleTimeoutMs: 30_000, totalTimeoutMs: 120_000, maxAttempts: 3 },
};

const DEFAULT_STREAM_CONFIG: ModelStreamConfig = {
  idleTimeoutMs: 30_000,
  totalTimeoutMs: 120_000,
  maxAttempts: 3,
};

/** Minimum idle gap between stream chunks for story generation and validation rewrites. */
export const STORY_STREAM_IDLE_TIMEOUT_MS = 180_000;

export function getStoryStreamIdleTimeoutMs(model: string): number {
	return Math.max(getModelStreamConfig(model).idleTimeoutMs, STORY_STREAM_IDLE_TIMEOUT_MS);
}

export function getModelStreamConfig(model: string): ModelStreamConfig {
  return MODEL_STREAM_CONFIG[model] ?? DEFAULT_STREAM_CONFIG;
}

export interface IndexingRequestConfig {
  timeoutMs: number;
  /** Retry ceiling for transient failures; terminal refusals stop immediately. */
  maxAttempts: number;
  maxTokens: number;
}

const INDEXING_REQUEST_CONFIG: Partial<Record<string, IndexingRequestConfig>> = {
  "gemini-3.1-pro-preview": { timeoutMs: 300_000, maxAttempts: 5, maxTokens: 16_384 },
  "gemini-3.6-flash": { timeoutMs: 300_000, maxAttempts: 5, maxTokens: 16_384 },
  "gemini-3.5-flash": { timeoutMs: 120_000, maxAttempts: 5, maxTokens: 8_192 },
  "gemini-2.5-pro": { timeoutMs: 300_000, maxAttempts: 5, maxTokens: 16_384 },
  "gemini-2.5-flash": { timeoutMs: 120_000, maxAttempts: 5, maxTokens: 8_192 },
};

const DEFAULT_INDEXING_CONFIG: IndexingRequestConfig = {
  timeoutMs: 180_000,
  maxAttempts: 3,
  maxTokens: 16_384,
};

export function getIndexingRequestConfig(model: string): IndexingRequestConfig {
  return INDEXING_REQUEST_CONFIG[model] ?? DEFAULT_INDEXING_CONFIG;
}

const CHARACTER_CONCEPT_MAX_TOKENS = 2048;

export function getCharacterConceptRequestConfig(model: string): IndexingRequestConfig {
	const base = getIndexingRequestConfig(model);
	return {
		...base,
		maxTokens: Math.min(base.maxTokens, CHARACTER_CONCEPT_MAX_TOKENS),
	};
}
