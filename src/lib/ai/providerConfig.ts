import type { AIProviderType } from "../../types/models";

/** Every provider the engine supports — kept for saved configs and future reactivation. */
export const ALL_AI_PROVIDERS: AIProviderType[] = [
	"openai",
	"gemini",
	"openrouter",
	"anthropic",
];

/**
 * Providers shown in UI pickers. Restore `ALL_AI_PROVIDERS` here to re-enable the full list.
 */
export const VISIBLE_AI_PROVIDERS: AIProviderType[] = ["gemini"];

export const DEFAULT_VISIBLE_AI_PROVIDER: AIProviderType =
	VISIBLE_AI_PROVIDERS[0] ?? "gemini";

const PROVIDER_LABELS: Record<AIProviderType, string> = {
	openai: "OpenAI",
	gemini: "Gemini",
	openrouter: "OpenRouter",
	anthropic: "Anthropic",
};

export function getProviderLabel(provider: AIProviderType): string {
	return PROVIDER_LABELS[provider];
}

export function isProviderVisible(provider: AIProviderType): boolean {
	return VISIBLE_AI_PROVIDERS.includes(provider);
}

export function resolveVisibleProvider(
	provider: AIProviderType | undefined | null,
): AIProviderType {
	if (provider && isProviderVisible(provider)) {
		return provider;
	}
	return DEFAULT_VISIBLE_AI_PROVIDER;
}

export function shouldShowProviderPicker(): boolean {
	return VISIBLE_AI_PROVIDERS.length > 1;
}
