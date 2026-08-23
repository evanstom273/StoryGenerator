export type GeminiHarmBlockThreshold =
	| "OFF"
	| "BLOCK_NONE"
	| "BLOCK_ONLY_HIGH"
	| "BLOCK_MEDIUM_AND_ABOVE"
	| "BLOCK_LOW_AND_ABOVE";

export type GeminiSafetySetting = {
	category:
		| "HARM_CATEGORY_SEXUALLY_EXPLICIT"
		| "HARM_CATEGORY_HARASSMENT"
		| "HARM_CATEGORY_HATE_SPEECH"
		| "HARM_CATEGORY_DANGEROUS_CONTENT";
	threshold: GeminiHarmBlockThreshold;
};

/**
 * Relaxed sexually-explicit filtering for consensual adult fiction when Mature
 * Fiction mode is enabled. Gemini 3.x models accept OFF; older models use
 * BLOCK_NONE.
 */
export function resolveGeminiMatureFictionSafetySettings(model: string): GeminiSafetySetting[] {
	const normalized = model.trim().toLowerCase();
	const sexualThreshold: GeminiHarmBlockThreshold = normalized.startsWith("gemini-3.")
		? "OFF"
		: "BLOCK_NONE";

	return [{ category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: sexualThreshold }];
}
