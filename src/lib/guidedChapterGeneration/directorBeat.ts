import type { AIProvider } from "../ai/types";
import { extractFirstJsonObject, safeParseJsonObject } from "../ai/json";

export async function generateDirectorBeat(params: {
	provider: AIProvider;
	apiKey: string;
	model: string;
	chapterLabel: string;
	chapterOverview: string;
	sceneIndex: number;
	sceneCount: number;
	overallDirection?: string;
	playerName: string;
}): Promise<string> {
	const system = [
		"You write ONE Director staging note for Story Engine guided chapter generation.",
		"Return STRICT JSON: { \"directorBeat\": string }",
		"Rules:",
		"- Output a single Director note as *actions/staging* in asterisks, no 'Director:' prefix.",
		"- Stage what happens in THIS scene beat only.",
		"- The AI narrator will realize the scene; include cast participation and player character actions when needed.",
		"- Do not repeat prior scenes; advance the chapter overview.",
		"- Keep under 120 words.",
	].join("\n");

	const user = [
		`Player character: ${params.playerName}`,
		`Chapter: ${params.chapterLabel}`,
		`Scene ${params.sceneIndex} of ${params.sceneCount}`,
		"",
		"Chapter overview:",
		params.chapterOverview.trim(),
		params.overallDirection?.trim()
			? `\n\nOverall direction:\n${params.overallDirection.trim()}`
			: "",
	].join("\n");

	const result = await params.provider.generateResponse({
		apiKey: params.apiKey,
		model: params.model,
		messages: [
			{ role: "system", content: system },
			{ role: "user", content: user },
		],
		maxTokens: 500,
		temperature: 0.6,
		jsonMode: true,
	});

	const jsonText = extractFirstJsonObject(result.content) ?? result.content.trim();
	const parsed = safeParseJsonObject<{ directorBeat?: string }>(jsonText);
	const beat = parsed?.directorBeat?.trim();
	if (beat) {
		return beat.startsWith("*") ? beat : `*${beat.replace(/^\*+|\*+$/g, "")}*`;
	}

	const fallback = result.content.trim();
	return fallback.startsWith("*") ? fallback : `*${fallback.replace(/^\*+|\*+$/g, "")}*`;
}
