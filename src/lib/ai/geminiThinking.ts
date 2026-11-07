import type { ThinkingLevelPreference } from "../../types/models";

export type GeminiThinkingLevel = "minimal" | "low" | "medium" | "high";

export interface GeminiThinkingSettings {
	thinkingBudget?: number;
	thinkingLevel?: GeminiThinkingLevel;
}

const GEMINI_THINKING_LEVELS: GeminiThinkingLevel[] = ["minimal", "low", "medium", "high"];

/** Known per-model gaps; anything else the API rejects is learned at runtime. */
const KNOWN_UNSUPPORTED_LEVELS: Record<string, GeminiThinkingLevel[]> = {
	"gemini-3.8-flash": ["minimal"],
};

const learnedUnsupportedLevels = new Map<string, Set<GeminiThinkingLevel>>();

function isLevelUnsupported(model: string, level: GeminiThinkingLevel) {
	const normalized = model.trim().toLowerCase();
	return (
		(KNOWN_UNSUPPORTED_LEVELS[normalized]?.includes(level) ?? false) ||
		(learnedUnsupportedLevels.get(normalized)?.has(level) ?? false)
	);
}

/** Steps up to the nearest level the model accepts, or undefined if none remain. */
function clampGeminiThinkingLevel(model: string, level: GeminiThinkingLevel): GeminiThinkingLevel | undefined {
	return GEMINI_THINKING_LEVELS.slice(GEMINI_THINKING_LEVELS.indexOf(level)).find(
		(candidate) => !isLevelUnsupported(model, candidate),
	);
}

function levelSettings(model: string, level: GeminiThinkingLevel): GeminiThinkingSettings | undefined {
	const clamped = clampGeminiThinkingLevel(model, level);
	return clamped ? { thinkingLevel: clamped } : undefined;
}

/**
 * Minimal thinking settings for short creative outputs (e.g. Character Concept).
 * Gemini 2.5 Pro cannot disable thinking (minimum budget 128).
 * Gemini 3.x models use thinkingLevel; budget 0 is invalid on Pro.
 */
export function resolveGeminiStoryThinkingSettings(model: string): GeminiThinkingSettings | undefined {
	const normalized = model.trim().toLowerCase();

	if (normalized.startsWith("gemini-3.")) {
		// Story beats need visible output; minimal can yield zero non-thought tokens.
		return levelSettings(model, "low");
	}

	return resolveGeminiMinimalThinkingSettings(model);
}

export function resolveGeminiMinimalThinkingSettings(model: string): GeminiThinkingSettings | undefined {
	const normalized = model.trim().toLowerCase();

	if (normalized.startsWith("gemini-3.")) {
		if (normalized.includes("flash") && !normalized.includes("pro")) {
			return levelSettings(model, "minimal");
		}

		return levelSettings(model, "low");
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

const GEMINI_25_BUDGETS: Record<Exclude<GeminiThinkingLevel, "minimal">, number> = {
	low: 1024,
	medium: 8192,
	high: 24576,
};

/**
 * Applies the user's thinking level preference. "auto" (or unset) returns
 * the task default: story-tuned settings for prose, or undefined (model default).
 */
export function resolveGeminiThinkingForPreference(
	model: string,
	preference: ThinkingLevelPreference | undefined,
	purpose: "story" | "default",
): GeminiThinkingSettings | undefined {
	if (!preference || preference === "auto") {
		return purpose === "story" ? resolveGeminiStoryThinkingSettings(model) : undefined;
	}

	const normalized = model.trim().toLowerCase();

	if (normalized.startsWith("gemini-3.")) {
		if (preference === "minimal" && normalized.includes("pro")) {
			return levelSettings(model, "low");
		}
		return levelSettings(model, preference);
	}

	if (normalized.startsWith("gemini-2.5")) {
		if (preference === "minimal") {
			return resolveGeminiMinimalThinkingSettings(model);
		}
		return { thinkingBudget: GEMINI_25_BUDGETS[preference] };
	}

	return undefined;
}

const UNSUPPORTED_THINKING_LEVEL_PATTERN = /thinking level\s+\w+\s+is not supported/i;

/**
 * When Gemini rejects a thinking level for a model, remembers it and returns the
 * next settings to try (a higher level, or no thinking config at all). Returns
 * null when the error is unrelated or there is nothing left to fall back to.
 */
export function resolveGeminiThinkingFallback(
	model: string,
	thinking: GeminiThinkingSettings | undefined,
	error: unknown,
): { thinking: GeminiThinkingSettings | undefined } | null {
	const level = thinking?.thinkingLevel;
	const message = error instanceof Error ? error.message : String(error ?? "");
	if (!level || !UNSUPPORTED_THINKING_LEVEL_PATTERN.test(message)) {
		return null;
	}

	const normalized = model.trim().toLowerCase();
	const learned = learnedUnsupportedLevels.get(normalized) ?? new Set<GeminiThinkingLevel>();
	learned.add(level);
	learnedUnsupportedLevels.set(normalized, learned);

	return { thinking: levelSettings(model, level) };
}

/** Test helper: forget levels learned from API rejections. */
export function resetLearnedGeminiThinkingSupport() {
	learnedUnsupportedLevels.clear();
}

/** Providers whose thinking depth StoryEngine controls (the Thinking Level setting). */
export function providerSupportsThinkingLevel(providerType: string): boolean {
	return providerType === "gemini" || providerType === "anthropic";
}

/**
 * Provider-neutral thinking settings for a request. `purpose` matches the task:
 * "story" for streamed prose, "minimal" for short tasks (titles, concepts,
 * indexing JSON), "default" where the model's own default is fine (MetaChat).
 * Short tasks always use the tuned default; the user's preference applies to
 * story and default requests. Claude receives the same levels as Gemini 3 Flash,
 * which the Anthropic provider maps to thinking/effort.
 */
export function resolveProviderThinkingSettings(
	providerType: string,
	model: string,
	purpose: "story" | "minimal" | "default",
	preference?: ThinkingLevelPreference,
): GeminiThinkingSettings | undefined {
	if (providerType === "gemini") {
		if (purpose === "minimal") return resolveGeminiMinimalThinkingSettings(model);
		return resolveGeminiThinkingForPreference(model, preference, purpose);
	}
	if (providerType === "anthropic") {
		if (purpose !== "minimal" && preference && preference !== "auto") {
			return { thinkingLevel: preference };
		}
		if (purpose === "story") return { thinkingLevel: "low" };
		if (purpose === "minimal") return { thinkingLevel: "minimal" };
		return undefined;
	}
	return undefined;
}
