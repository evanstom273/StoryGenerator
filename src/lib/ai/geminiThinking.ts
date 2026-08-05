export type GeminiThinkingLevel = "minimal" | "low" | "medium" | "high";

export interface GeminiThinkingSettings {
	thinkingBudget?: number;
	thinkingLevel?: GeminiThinkingLevel;
}

/**
 * Minimal thinking settings for short creative outputs (e.g. Character Concept).
 * Gemini 2.5 Pro cannot disable thinking (minimum budget 128).
 * Gemini 3.x models use thinkingLevel; budget 0 is invalid on Pro.
 */
export function resolveGeminiMinimalThinkingSettings(model: string): GeminiThinkingSettings | undefined {
	const normalized = model.trim().toLowerCase();

	if (normalized.startsWith("gemini-3.")) {
		if (normalized.includes("pro")) {
			return { thinkingLevel: "low" };
		}

		if (normalized.includes("flash")) {
			return { thinkingLevel: "minimal" };
		}

		return { thinkingLevel: "low" };
	}

	if (normalized.includes("2.5-pro")) {
		return { thinkingBudget: 128 };
	}

	if (normalized.includes("flash-lite")) {
		return { thinkingBudget: 0 };
	}

	if (normalized.includes("flash")) {
		return { thinkingBudget: 0 };
	}

	return undefined;
}
