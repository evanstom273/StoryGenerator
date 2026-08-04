import type { AIProvider } from "../ai/types";
import { extractFirstJsonObject, safeParseJsonObject } from "../ai/json";

function formatDirectorBeatText(value: string): string | null {
	const trimmed = value.trim();
	if (!trimmed) {
		return null;
	}

	if (
		trimmed.includes('"directorBeat"') ||
		trimmed.startsWith("{") ||
		trimmed.startsWith("*{")
	) {
		return null;
	}

	const withoutQuotes = trimmed.replace(/^\*+|\*+$/g, "").trim();
	if (!withoutQuotes) {
		return null;
	}

	return `*${withoutQuotes}*`;
}

export async function generateDirectorBeat(params: {
	provider: AIProvider;
	apiKey: string;
	model: string;
	chapterLabel: string;
	chapterOverview: string;
	sceneOverview?: string;
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
		"- Use exact names from the overall direction and scene plan. Never substitute canon characters when the plan names someone else (e.g. use Kelly Grayson, not Alara Kitan).",
		"- If the scene plan names who appears, those are the required cast for this beat.",
	].join("\n");

	const scenePlan = params.sceneOverview?.trim() || params.chapterOverview.trim();
	const user = [
		`Player character: ${params.playerName}`,
		`Chapter: ${params.chapterLabel}`,
		`Scene ${params.sceneIndex} of ${params.sceneCount}`,
		"",
		"This scene plan (mandatory):",
		scenePlan.trim(),
		params.chapterOverview.trim() && scenePlan.trim() !== params.chapterOverview.trim()
			? `\n\nFull chapter overview:\n${params.chapterOverview.trim()}`
			: "",
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
	const parsedBeat = parsed?.directorBeat ? formatDirectorBeatText(parsed.directorBeat) : null;
	if (parsedBeat) {
		return parsedBeat;
	}

	const fallback = formatDirectorBeatText(result.content);
	if (fallback) {
		return fallback;
	}

	throw new Error("Director beat generation returned invalid staging text.");
}
