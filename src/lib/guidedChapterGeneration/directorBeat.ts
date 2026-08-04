import type { AIProvider } from "../ai/types";
import { extractFirstJsonObject, safeParseJsonObject, tryRepairTruncatedJson } from "../ai/json";
import { polishDirectorBeatStaging } from "./directorBeatPolish";

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

	return polishDirectorBeatStaging(trimmed);
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
	const snippet = scenePlan.replace(/\s+/g, " ").trim().slice(0, 120);
	const staging = snippet || `Scene ${params.sceneIndex} continues.`;
	const cleaned = staging.replace(/^\*+|\*+$/g, "").trim();
	const polished = polishDirectorBeatStaging(cleaned);
	if (polished) {
		return polished;
	}
	const withPeriod = cleaned.endsWith(".") ? cleaned : `${cleaned}.`;
	return `*${withPeriod}*`;
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
	previousChapterContext?: string;
}): Promise<string> {
	const system = [
		"You write ONE Director staging note for Story Engine guided chapter generation.",
		"Return STRICT JSON: { \"directorBeat\": string }",
		"Example: {\"directorBeat\":\"*Kelly, Alara, and Ed review Jamie's file in the briefing room.*\"}",
		"Rules:",
		"- Output ONE complete sentence inside asterisks in directorBeat. No 'Director:' prefix.",
		"- Max 25 words. Must end with a single period. No trailing commas.",
		"- FIRST NAMES ONLY: Kelly, Alara, Ed, Gordon, Claire, Bortus. Never write Lt., Dr., Commander, Captain, or full names like Alara Kitan.",
		"- Stage what happens in THIS scene beat only — who gathers and what they discuss, not a script.",
		"- Do not repeat prior scenes; advance the chapter overview.",
		"- Use exact cast from the scene plan. Never substitute canon characters when the plan names someone else.",
		"- Honor the continuity ledger for locations and shuttles.",
		"- When prior chapter context is provided, stage the immediate next beat only.",
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
		params.previousChapterContext?.trim()
			? `\n\nPrior chapter context (mandatory):\n${params.previousChapterContext.trim()}`
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
			maxTokens: 320,
			temperature: 0.4,
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
