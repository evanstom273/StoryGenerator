import type { AIProvider } from "../ai/types";
import { extractFirstJsonObject, safeParseJsonObject, tryRepairTruncatedJson } from "../ai/json";

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

function extractDirectorBeatField(content: string): string | null {
	const trimmed = content.trim();
	const jsonCandidates = [
		extractFirstJsonObject(trimmed),
		tryRepairTruncatedJson(trimmed),
		trimmed,
	].filter((candidate): candidate is string => Boolean(candidate));

	for (const jsonText of jsonCandidates) {
		const parsed = safeParseJsonObject<{ directorBeat?: string }>(jsonText);
		if (parsed?.directorBeat) {
			const formatted = formatDirectorBeatText(String(parsed.directorBeat));
			if (formatted) {
				return formatted;
			}
		}
	}

	const quotedMatch = trimmed.match(/"directorBeat"\s*:\s*"((?:\\.|[^"\\])*)"/s);
	if (quotedMatch?.[1]) {
		const unescaped = quotedMatch[1]
			.replace(/\\"/g, '"')
			.replace(/\\n/g, "\n")
			.replace(/\\\\/g, "\\");
		const formatted = formatDirectorBeatText(unescaped);
		if (formatted) {
			return formatted;
		}
	}

	const stripped = trimmed
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/\s*```$/i, "")
		.trim();

	if (!stripped.startsWith("{")) {
		return formatDirectorBeatText(stripped);
	}

	return null;
}

function buildFallbackDirectorBeat(params: {
	sceneOverview?: string;
	chapterOverview: string;
	sceneIndex: number;
}): string {
	const scenePlan = params.sceneOverview?.trim() || params.chapterOverview.trim();
	const snippet = scenePlan.replace(/\s+/g, " ").trim().slice(0, 200);
	const staging = snippet || `Scene ${params.sceneIndex} continues.`;
	return `*${staging.replace(/^\*+|\*+$/g, "")}*`;
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
	continuityNotes?: string;
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
		"- Honor the continuity ledger. Do not stage a different docking bay, shuttle, or meeting location than already established this chapter.",
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
		params.continuityNotes?.trim()
			? `\n\nContinuity ledger (mandatory):\n${params.continuityNotes.trim()}`
			: "",
	].join("\n");

	const requestBeat = async () => {
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
		return extractDirectorBeatField(result.content);
	};

	const firstAttempt = await requestBeat();
	if (firstAttempt) {
		return firstAttempt;
	}

	const retryAttempt = await requestBeat();
	if (retryAttempt) {
		return retryAttempt;
	}

	return buildFallbackDirectorBeat({
		sceneOverview: params.sceneOverview,
		chapterOverview: params.chapterOverview,
		sceneIndex: params.sceneIndex,
	});
}
