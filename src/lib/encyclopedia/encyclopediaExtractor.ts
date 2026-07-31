import type { StoryMessage } from "../../types/models";
import type { StoryEncyclopedia } from "../../types/models";
import type { AIChatMessage } from "../ai/types";
import { extractFirstJsonObject, safeParseJsonObject } from "../ai/json";
import { formatTranscriptForEncyclopedia } from "./encyclopediaTranscript";
import { normalizeEncyclopediaDelta } from "./encyclopediaMerge";

function normalizeWhitespace(value: string) {
	return value
		.replace(/\r\n/g, "\n")
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

export function buildEncyclopediaExtractionPrompt(params: {
	playerName: string;
	transcriptChunk: StoryMessage[];
	messageNumberStart: number;
	messageNumberTotal: number;
	accumulatedEncyclopediaJson?: string;
}): AIChatMessage[] {
	const transcript = formatTranscriptForEncyclopedia(
		params.transcriptChunk,
		params.playerName,
		params.messageNumberStart,
		params.messageNumberTotal,
	);

	const system = normalizeWhitespace(
		[
			"You build a World Encyclopedia for a long-form roleplay story by reading transcript text only.",
			"CRITICAL: Use ONLY the transcript chunk below. Do NOT use summaries, metadata, character sheets, or any outside knowledge.",
			"If the transcript does not support a fact, omit it rather than guessing.",
			"Extract structured encyclopedia pages for: characters, locations, events, objects, organizations, rules, and technology.",
			"Characters: include aliases, description, status, relationships, family, occupation, appearances, history, major events, location, optional quotes.",
			"Locations: description, first appearance, current state, associated characters, events, chapter appearances.",
			"Events: major plot beats with title, description, chapter label if known, messageNumber, participants, location.",
			"Objects: description, purpose, owner, history, related events.",
			"Organizations: schools, companies, clubs, governments, criminal groups, precincts, orders, etc.",
			"Rules: magic laws, patrol protocols, school rules, AU changes to canon rules — track how rules evolve.",
			"Technology: devices, suits, inventions, AI — capabilities, upgrades, current state.",
			"Cross-link related entries using related: [{ type, id, label }] where id is a slug id and type is characters|locations|events|objects|organizations|rules|technology.",
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
			"Keep each chunk bounded: max 25 characters, 20 locations, 15 events, 15 objects, 12 organizations, 12 rules, 12 technology entries.",
		].join("\n"),
	);

	const userParts = [
		`Player character name: ${params.playerName}`,
		"",
		"Transcript chunk (sole source of truth):",
		transcript,
	];

	if (params.accumulatedEncyclopediaJson?.trim()) {
		userParts.push(
			"",
			"Accumulated encyclopedia from prior transcript chunks (merge/update — do not discard unless transcript retcons):",
			params.accumulatedEncyclopediaJson.trim(),
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
