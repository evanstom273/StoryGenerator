import type { StoryMessage } from "../../types/models";
import type { StoryEncyclopedia } from "../../types/models";
import type { AIChatMessage } from "../ai/types";
import { extractFirstJsonObject, safeParseJsonObject } from "../ai/json";
import { formatSingleMessageForEncyclopedia } from "./encyclopediaTranscript";
import { normalizeEncyclopediaDelta } from "./encyclopediaMerge";

function normalizeWhitespace(value: string) {
	return value
		.replace(/\r\n/g, "\n")
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

export function buildEncyclopediaEntityIndex(encyclopedia: StoryEncyclopedia): string | undefined {
	const lines: string[] = [];

	const characterNames = Object.values(encyclopedia.characters ?? {})
		.map((entry) => entry.name.trim())
		.filter(Boolean)
		.slice(0, 60);
	if (characterNames.length) {
		lines.push(`characters (names only): ${characterNames.join(", ")}`);
	}

	const locationNames = Object.values(encyclopedia.locations ?? {})
		.map((entry) => entry.name.trim())
		.filter(Boolean)
		.slice(0, 40);
	if (locationNames.length) {
		lines.push(`locations (names only): ${locationNames.join(", ")}`);
	}

	const objectNames = Object.values(encyclopedia.objects ?? {})
		.map((entry) => entry.name.trim())
		.filter(Boolean)
		.slice(0, 40);
	if (objectNames.length) {
		lines.push(`objects (names only): ${objectNames.join(", ")}`);
	}

	const organizationNames = Object.values(encyclopedia.organizations ?? {})
		.map((entry) => entry.name.trim())
		.filter(Boolean)
		.slice(0, 30);
	if (organizationNames.length) {
		lines.push(`organizations (names only): ${organizationNames.join(", ")}`);
	}

	const technologyNames = Object.values(encyclopedia.technology ?? {})
		.map((entry) => entry.name.trim())
		.filter(Boolean)
		.slice(0, 30);
	if (technologyNames.length) {
		lines.push(`technology (names only): ${technologyNames.join(", ")}`);
	}

	const eventTitles = (encyclopedia.events ?? [])
		.map((entry) => entry.title.trim())
		.filter(Boolean)
		.slice(0, 30);
	if (eventTitles.length) {
		lines.push(`events (titles only): ${eventTitles.join(", ")}`);
	}

	const ruleTitles = (encyclopedia.rules ?? [])
		.map((entry) => entry.title.trim())
		.filter(Boolean)
		.slice(0, 30);
	if (ruleTitles.length) {
		lines.push(`rules (titles only): ${ruleTitles.join(", ")}`);
	}

	return lines.length ? lines.join("\n") : undefined;
}

export function buildSingleMessageEncyclopediaPrompt(params: {
	playerName: string;
	message: StoryMessage;
	messageNumber: number;
	messageNumberTotal: number;
	chapterLabel?: string;
	entityIndex?: string;
}): AIChatMessage[] {
	const transcript = formatSingleMessageForEncyclopedia(
		params.message,
		params.playerName,
		params.messageNumber,
		params.messageNumberTotal,
		params.chapterLabel,
	);

	const system = normalizeWhitespace(
		[
			"You build a World Encyclopedia for a long-form roleplay story.",
			"You are processing ONE transcript message at a time. Read only that message's MESSAGE TEXT.",
			"CRITICAL RULES:",
			"1. Extract facts ONLY from the MESSAGE TEXT in this request. Do NOT use summaries, outside knowledge, or guesswork.",
			"2. If a fact is not explicitly stated in this message, omit it — even if you think it is obvious.",
			"3. Do NOT copy descriptions or status from the entity index; use it only to reuse consistent names/ids when the same entity appears in this message.",
			"4. Narrator and canon dialogue are in-world facts. User/player messages describe player actions and speech.",
			"5. If this message adds nothing encyclopedia-worthy, return {}.",
			"6. Tie facts to this message number (" + params.messageNumber + "): set messageNumber on events; set firstAppearance/latestAppearance on characters/locations; prefix history strings with \"(msg " + params.messageNumber + ")\".",
			"7. Prefer short, literal phrasing close to the source text. No speculation.",
			"Extract only what this message supports: characters, locations, events, objects, organizations, rules, technology.",
			"Events: only major beats clearly happening in this message (not every line of dialogue).",
			"Cross-link with related: [{ type, id, label }] when another indexed entity is named in this message.",
			"Return STRICT JSON only. Schema:",
			"{",
			'  "characters"?: Record<string, { "id": string, "name": string, "aliases"?: string[], "description"?: string, "status"?: string, "relationships"?: string[], "family"?: string[], "occupation"?: string, "firstAppearance"?: { "messageNumber": number, "chapterLabel"?: string }, "latestAppearance"?: { "messageNumber": number, "chapterLabel"?: string }, "history"?: string[], "majorEvents"?: string[], "currentLocation"?: string, "quotes"?: string[], "related"?: Array<{ "type": string, "id": string, "label"?: string }> }>,',
			'  "locations"?: Record<string, { "id": string, "name": string, "description"?: string, "firstAppearance"?: { "messageNumber": number, "chapterLabel"?: string }, "currentState"?: string, "associatedCharacters"?: string[], "events"?: string[], "chapterLabels"?: string[], "related"?: Array<{ "type": string, "id": string, "label"?: string }> }>,',
			'  "events"?: Array<{ "id": string, "title": string, "description"?: string, "chapterLabel"?: string, "messageNumber"?: number, "participants"?: string[], "location"?: string, "related"?: Array<{ "type": string, "id": string, "label"?: string }> }>,',
			'  "objects"?: Record<string, { "id": string, "name": string, "description"?: string, "purpose"?: string, "currentOwner"?: string, "history"?: string[], "relatedEvents"?: string[], "related"?: Array<{ "type": string, "id": string, "label"?: string }> }>,',
			'  "organizations"?: Record<string, { "id": string, "name": string, "description"?: string, "type"?: string, "members"?: string[], "roleInStory"?: string, "related"?: Array<{ "type": string, "id": string, "label"?: string }> }>,',
			'  "rules"?: Array<{ "id": string, "title": string, "description"?: string, "scope"?: string, "currentState"?: string, "history"?: string[], "related"?: Array<{ "type": string, "id": string, "label"?: string }> }>,',
			'  "technology"?: Record<string, { "id": string, "name": string, "description"?: string, "capabilities"?: string[], "upgrades"?: string[], "currentState"?: string, "related"?: Array<{ "type": string, "id": string, "label"?: string }> }>',
			"}",
			"Keep this response small: only entries and fields justified by this single message.",
		].join("\n"),
	);

	const userParts = [
		`Player character name: ${params.playerName}`,
		`Current message number: ${params.messageNumber}`,
		"",
		"Transcript message (sole source of truth for this step):",
		transcript,
	];

	if (params.entityIndex?.trim()) {
		userParts.push(
			"",
			"Entity index from prior messages (names/titles only — NOT verified facts for this message):",
			params.entityIndex.trim(),
		);
	}

	return [
		{ role: "system", content: system },
		{ role: "user", content: userParts.join("\n") },
	];
}

export function parseEncyclopediaDelta(raw: string): StoryEncyclopedia | null {
	const jsonText = extractFirstJsonObject(raw);
	if (!jsonText) return null;
	const parsed = safeParseJsonObject<Partial<StoryEncyclopedia>>(jsonText);
	if (!parsed) return null;
	return normalizeEncyclopediaDelta(parsed);
}
