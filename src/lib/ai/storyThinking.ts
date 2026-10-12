import type { AIProviderType, AISettings, StoryAIConfig, ThinkingLevelPreference } from "../../types/models";
import { resolveGeminiThinkingForPreference } from "./geminiThinking";
import type { AIProvider } from "./types";

/**
 * Applies a story's thinking level to its streamed prose calls. Non-streaming
 * utility calls (JSON, summaries, short rewrites) keep their tuned defaults.
 */
export function withStoryThinkingLevel(
  provider: AIProvider,
  providerType: AIProviderType,
  preference: ThinkingLevelPreference | undefined,
): AIProvider {
  if (providerType !== "gemini" || !preference || preference === "auto") {
    return provider;
  }
  return {
    ...provider,
    generateResponse: (request) =>
      provider.generateResponse(
        request.onChunk
          ? { ...request, thinking: resolveGeminiThinkingForPreference(request.model, preference, "story") }
          : request,
      ),
  };
}

export function resolveStoryThinkingLevel(
  storyConfig: Pick<StoryAIConfig, "thinkingLevel"> | null | undefined,
  settings: Pick<AISettings, "thinkingLevel"> | null | undefined,
): ThinkingLevelPreference {
  return storyConfig?.thinkingLevel ?? settings?.thinkingLevel ?? "auto";
}

export const THINKING_LEVEL_OPTIONS: { value: ThinkingLevelPreference; label: string }[] = [
  { value: "auto", label: "Auto (recommended)" },
  { value: "minimal", label: "Minimal (fastest)" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High (slowest, most deliberate)" },
];

export function isThinkingLevelPreference(value: string): value is ThinkingLevelPreference {
  return THINKING_LEVEL_OPTIONS.some((option) => option.value === value);
}

export function getInheritedThinkingLevelLabel(globalLevel: ThinkingLevelPreference | undefined) {
  const label = THINKING_LEVEL_OPTIONS.find((option) => option.value === (globalLevel ?? "auto"))?.label;
  return `Use Settings default (${label ?? "Auto"})`;
}
