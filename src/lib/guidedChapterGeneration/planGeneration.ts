import type { AIProvider } from "../ai/types";
import { extractFirstJsonObject, safeParseJsonObject } from "../ai/json";
import type { GuidedChapterPlan, GuidedChapterPlanChapter } from "./types";
import { GUIDED_CHAPTER_MAX_COUNT, GUIDED_CHAPTER_MAX_SCENES, GUIDED_CHAPTER_MIN_SCENES } from "./types";

function clampScenes(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return 3;
	}
	return Math.min(
		GUIDED_CHAPTER_MAX_SCENES,
		Math.max(GUIDED_CHAPTER_MIN_SCENES, Math.trunc(value)),
	);
}

export function normalizeGuidedChapterPlan(
	raw: unknown,
	fallbackLabels: string[],
): GuidedChapterPlan | null {
	const parsed = raw as {
		overallDirection?: string;
		chapters?: Array<{ label?: string; overview?: string; scenesPerChapter?: number }>;
	};
	if (!parsed || !Array.isArray(parsed.chapters) || !parsed.chapters.length) {
		return null;
	}

	const chapters: GuidedChapterPlanChapter[] = parsed.chapters
		.slice(0, GUIDED_CHAPTER_MAX_COUNT)
		.map((entry, index) => ({
			label: entry.label?.trim() || fallbackLabels[index] || `Chapter ${index + 1}`,
			overview: typeof entry.overview === "string" ? entry.overview.trim() : "",
			scenesPerChapter: clampScenes(entry.scenesPerChapter),
		}));

	return {
		overallDirection:
			typeof parsed.overallDirection === "string" ? parsed.overallDirection.trim() : undefined,
		chapters,
	};
}

export function buildChapterPlanPrompt(params: {
	overallDirection: string;
	chapterLabels: string[];
	chapters?: Array<{
		label: string;
		overview: string;
		scenesPerChapter: number;
	}>;
	universeName: string;
	playerName: string;
	currentSituation?: string;
	priorChapterContext?: string;
}): { role: "system" | "user"; content: string }[] {
	const system = [
		"You plan chapter overviews for a roleplay story transcript generator.",
		"Return STRICT JSON only:",
		"{",
		'  "overallDirection"?: string,',
		'  "chapters": Array<{ "label": string, "overview": string, "scenesPerChapter": number }>',
		"}",
		"Rules:",
		"- Each overview covers ONE chapter only.",
		"- When a chapter has multiple scenes, format overview as Scene I:, Scene II:, etc.",
		"- scenesPerChapter is the number of Director-staged scene beats (1-10).",
		"- Do not write prose scenes; only planning bullets.",
		"- Honor the overall direction and current story state when provided.",
		"- When the user already filled chapter scenes, preserve and refine them instead of replacing them.",
		"- When prior chapter context is provided, plan chapters that continue realistically from where the story left off — do not restart or skip unrelated events.",
		"- Use exact character names, aliases, and spellings from the provided direction. Do not swap in canon names.",
	].join("\n");

	const userParts = [
		`Universe: ${params.universeName}`,
		`Player character: ${params.playerName}`,
		`Chapters to plan: ${params.chapterLabels.join(", ")}`,
	];

	const trimmedDirection = params.overallDirection.trim();
	if (trimmedDirection) {
		userParts.push("", "Overall direction:", trimmedDirection);
	} else {
		userParts.push("", "Overall direction: (not specified — plan from chapter scene notes below and current story state)");
	}

	const filledChapters = (params.chapters ?? []).filter((chapter) => chapter.overview.trim());
	if (filledChapters.length) {
		userParts.push(
			"",
			"Existing chapter scene notes from the user:",
			...filledChapters.map(
				(chapter) =>
					`- ${chapter.label} (${chapter.scenesPerChapter} scenes): ${chapter.overview.trim()}`,
			),
		);
	}

	if (params.currentSituation?.trim()) {
		userParts.push("", "Current situation:", params.currentSituation.trim());
	}
	if (params.priorChapterContext?.trim()) {
		userParts.push("", params.priorChapterContext.trim());
	}

	return [
		{ role: "system", content: system },
		{ role: "user", content: userParts.join("\n") },
	];
}

export async function generateChapterPlanWithAi(params: {
	provider: AIProvider;
	apiKey: string;
	model: string;
	messages: { role: "system" | "user"; content: string }[];
	fallbackLabels: string[];
}): Promise<GuidedChapterPlan | null> {
	const result = await params.provider.generateResponse({
		apiKey: params.apiKey,
		model: params.model,
		messages: params.messages,
		maxTokens: 4000,
		temperature: 0.4,
		jsonMode: true,
	});
	const jsonText = extractFirstJsonObject(result.content) ?? result.content.trim();
	const parsed = safeParseJsonObject(jsonText);
	return normalizeGuidedChapterPlan(parsed, params.fallbackLabels);
}
