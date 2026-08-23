import type { StoryStateData, StoryStateDataV2 } from "../../types/models";
import { normalizePlayerCharacterKnownTies } from "../playerCharacterPrompt";
import { findSpeakerColonIndex } from "./clockTimeInProse";

const SUBJECT_PRONOUN_PSEUDO_SPEAKERS = new Set([
	"he",
	"she",
	"they",
	"him",
	"her",
	"them",
	"his",
	"their",
	"it",
	"its",
]);

const RESERVED_SPEAKER_LABELS = new Set(["narrator", "director", "time", "system", "assistant"]);

const YOUNG_CHARACTER_TIE_HINT =
	/\b(?:younger|little|child|children|daughter|son|sister|brother|toddler|baby|kid|\d+[\s-]year)/i;

const ADULT_CHARACTER_TIE_HINT =
	/\b(?:father|mother|parent|mom|dad|uncle|aunt|grandpa|grandma|grandfather|grandmother|husband|wife|partner)\b/i;

const AGE_DESCRIPTOR_PATTERN =
	/\b(?:the\s+)?(?:(?:four|4))[\s-]year[\s-]old(?:\s+(?:girl|boy|child|daughter|son|sister|brother))?\b/gi;

const MISSING_CHILD_NAME_PATTERN =
	/\b(?:where(?:'s| is)|no|find|missing)\s+([A-Z][a-zA-Z''-]{1,24})\b/g;

function looksLikeVerbToken(token: string) {
	const lower = token.toLowerCase();
	const auxiliaryVerbs = new Set([
		"is",
		"was",
		"are",
		"were",
		"has",
		"had",
		"will",
		"would",
		"can",
		"could",
		"should",
		"might",
		"must",
	]);
	const irregularVerbs = new Set([
		"am",
		"be",
		"been",
		"being",
		"do",
		"did",
		"done",
		"go",
		"went",
		"gone",
		"come",
		"came",
		"run",
		"ran",
		"sit",
		"sat",
		"stand",
		"stood",
		"say",
		"said",
		"see",
		"saw",
		"hear",
		"heard",
		"take",
		"took",
		"taken",
		"give",
		"gave",
		"given",
		"make",
		"made",
		"get",
		"got",
		"gotten",
		"feel",
		"felt",
		"nod",
		"nods",
		"shake",
		"shook",
		"smile",
		"smiled",
		"glance",
		"glanced",
		"sprint",
		"sprints",
		"check",
		"checks",
	]);

	return (
		auxiliaryVerbs.has(lower) ||
		irregularVerbs.has(lower) ||
		lower.endsWith("ed") ||
		lower.endsWith("ing") ||
		lower.endsWith("s")
	);
}

export function sanitizeNarratorInnerContent(content: string) {
	let result = content.trim();
	if (!result) {
		return result;
	}

	result = result.replace(/^(?:He|She|They)\s+narrator:\s*/i, "");

	const leadingPronoun = result.match(/^(He|She|They)\s+(\S+)/i);
	if (!leadingPronoun?.[1] || !leadingPronoun[2]) {
		return result;
	}

	if (looksLikeVerbToken(leadingPronoun[2])) {
		return result;
	}

	result = result.slice(leadingPronoun[1].length).trimStart();
	if (result.length > 0) {
		result = result.charAt(0).toUpperCase() + result.slice(1);
	}

	return result;
}

function repairNarratorLineInnerContent(line: string) {
	const trimmed = line.trim();
	if (!trimmed) {
		return line;
	}

	const pronounNarratorOnly = trimmed.match(/^(He|She|They)\s+narrator\s*(?::|\s[-—])\s*(.*)$/i);
	if (pronounNarratorOnly) {
		const remainder = sanitizeNarratorInnerContent(pronounNarratorOnly[2]?.trim() ?? "");
		return remainder ? `Narrator: *${remainder}*` : "Narrator:";
	}

	const narratorMatch = trimmed.match(/^(Narrator\s*(?::|\s[-—])\s*)(.*)$/i);
	if (narratorMatch) {
		const prefix = narratorMatch[1] ?? "Narrator: ";
		const remainder = narratorMatch[2]?.trim() ?? "";
		const wrapped = remainder.match(/^\*([\s\S]+)\*$/);
		if (wrapped?.[1]) {
			const fixed = sanitizeNarratorInnerContent(wrapped[1]);
			if (fixed !== wrapped[1].trim()) {
				return `${prefix}*${fixed}*`;
			}
			return line;
		}

		const fixed = sanitizeNarratorInnerContent(remainder);
		if (fixed !== remainder) {
			return `${prefix}*${fixed}*`;
		}
		return line;
	}

	const bareWrapped = trimmed.match(/^\*([\s\S]+)\*$/);
	if (bareWrapped?.[1]) {
		const fixed = sanitizeNarratorInnerContent(bareWrapped[1]);
		if (fixed !== bareWrapped[1].trim()) {
			return `Narrator: *${fixed}*`;
		}
	}

	return line;
}

export function repairNarratorWrappedInnerContent(text: string) {
	const lines = text.replace(/\r\n/g, "\n").split("\n");
	return lines.map((line) => repairNarratorLineInnerContent(line)).join("\n");
}

function escapeRegex(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function firstNameToken(value: string) {
	return value.trim().split(/\s+/)[0] ?? "";
}

export function isSubjectPronounPseudoSpeaker(label: string) {
	return SUBJECT_PRONOUN_PSEUDO_SPEAKERS.has(label.trim().toLowerCase());
}

function extractKnownTieName(tie: string) {
	const trimmed = tie.trim();
	if (!trimmed) {
		return "";
	}

	const match = trimmed.match(/^([^—–-]+?)(?:\s*[—–-]\s*|$)/);
	return firstNameToken(match?.[1]?.trim() ?? trimmed);
}

function classifyKnownTieCharacter(tie: string) {
	const name = extractKnownTieName(tie);
	if (!name) {
		return null;
	}

	const lower = tie.toLowerCase();
	const isYoung =
		YOUNG_CHARACTER_TIE_HINT.test(lower) && !ADULT_CHARACTER_TIE_HINT.test(lower);

	return { name, isYoung };
}

function collectStoryStateCharacterNames(
	storyStateData?: StoryStateData | StoryStateDataV2 | null,
) {
	const names = new Set<string>();

	for (const [canonicalKey, entry] of Object.entries(storyStateData?.characters ?? {})) {
		for (const candidate of [
			canonicalKey,
			entry?.canonicalName,
			entry?.displayName,
			entry?.narrativeName,
			...(entry?.aliases ?? []),
		]) {
			const first = firstNameToken(candidate ?? "");
			if (first.length >= 2) {
				names.add(first);
			}
		}
	}

	for (const entry of Object.values(storyStateData?.indexes?.characters ?? {})) {
		for (const candidate of [entry?.name, entry?.narrativeName, ...(entry?.aliases ?? [])]) {
			const first = firstNameToken(candidate ?? "");
			if (first.length >= 2) {
				names.add(first);
			}
		}
	}

	return names;
}

function collectSpeakerLabelsFromTranscript(text: string) {
	const names = new Set<string>();
	const lines = text.replace(/\r\n/g, "\n").split("\n");

	for (const line of lines) {
		const colonIndex = findSpeakerColonIndex(line.trim());
		if (colonIndex === null) {
			continue;
		}

		const label = line.slice(0, colonIndex).trim();
		if (!label || RESERVED_SPEAKER_LABELS.has(label.toLowerCase())) {
			continue;
		}

		if (isSubjectPronounPseudoSpeaker(label)) {
			continue;
		}

		const first = firstNameToken(label);
		if (first.length >= 2) {
			names.add(first);
		}
	}

	return [...names];
}

function collectMissingChildNamesFromTranscript(text: string) {
	const names = new Set<string>();

	for (const match of text.matchAll(MISSING_CHILD_NAME_PATTERN)) {
		const name = match[1]?.trim() ?? "";
		if (name.length >= 2 && !RESERVED_SPEAKER_LABELS.has(name.toLowerCase())) {
			names.add(firstNameToken(name));
		}
	}

	return names;
}

export function collectEstablishedCharacterNames(args: {
	storyStateData?: StoryStateData | StoryStateDataV2 | null;
	knownTies?: string[] | null;
	transcriptText?: string | null;
}) {
	const names = new Set<string>();

	for (const name of collectStoryStateCharacterNames(args.storyStateData)) {
		names.add(name);
	}

	for (const tie of normalizePlayerCharacterKnownTies(args.knownTies)) {
		const classified = classifyKnownTieCharacter(tie);
		if (classified?.name) {
			names.add(classified.name);
		}
	}

	for (const name of collectSpeakerLabelsFromTranscript(args.transcriptText ?? "")) {
		names.add(name);
	}

	for (const name of collectMissingChildNamesFromTranscript(args.transcriptText ?? "")) {
		names.add(name);
	}

	return [...names].sort((left, right) => right.length - left.length);
}

function collectYoungCharacterNameCandidates(args: {
	knownTies?: string[] | null;
	transcriptText?: string | null;
}) {
	const candidates = new Set<string>();

	for (const tie of normalizePlayerCharacterKnownTies(args.knownTies)) {
		const classified = classifyKnownTieCharacter(tie);
		if (classified?.isYoung && classified.name) {
			candidates.add(classified.name);
		}
	}

	for (const name of collectMissingChildNamesFromTranscript(args.transcriptText ?? "")) {
		candidates.add(name);
	}

	return [...candidates];
}

function resolveAgeDescriptorReplacementName(args: {
	line: string;
	fullTranscript: string;
	knownTies?: string[] | null;
}) {
	const youngCandidates = collectYoungCharacterNameCandidates({
		knownTies: args.knownTies,
		transcriptText: args.fullTranscript,
	});

	if (youngCandidates.length === 1) {
		return youngCandidates[0] ?? null;
	}

	const speakerNames = collectSpeakerLabelsFromTranscript(args.fullTranscript);
	const mentionedInLine = speakerNames.filter((name) =>
		new RegExp(`\\b${escapeRegex(name)}\\b`, "i").test(args.line),
	);
	if (mentionedInLine.length > 0) {
		return null;
	}

	const transcriptMentioned = speakerNames.filter((name) =>
		new RegExp(`\\b${escapeRegex(name)}\\b`, "i").test(args.fullTranscript),
	);
	if (transcriptMentioned.length === 1) {
		return transcriptMentioned[0] ?? null;
	}

	return null;
}

export function repairNarratorPronounPseudoLabels(text: string) {
	const lines = text.replace(/\r\n/g, "\n").split("\n");

	return lines
		.map((line) => {
			const trimmed = line.trim();
			if (!trimmed) {
				return line;
			}

			const pronounNarratorMatch = trimmed.match(
				/^(He|She|They)\s+narrator\s*(?::|\s[-—])\s*(.*)$/i,
			);
			if (pronounNarratorMatch) {
				const remainder = pronounNarratorMatch[2]?.trim() ?? "";
				return remainder ? `Narrator: ${remainder}` : "Narrator:";
			}

			const narratorPronounMatch = trimmed.match(
				/^Narrator\s*(?::|\s[-—])\s*(He|She|They|Her|His|Him|Their|Them|It|Its)\s*:\s*(.*)$/i,
			);
			if (narratorPronounMatch?.[2] !== undefined) {
				const remainder = narratorPronounMatch[2].trim();
				return remainder ? `Narrator: ${remainder}` : "Narrator:";
			}

			const narratorDoublePronounMatch = trimmed.match(
				/^Narrator\s*(?::|\s[-—])\s*\*?\s*(He|She|They)\s+\1\b\s*(.*)$/i,
			);
			if (narratorDoublePronounMatch?.[2] !== undefined) {
				const remainder = narratorDoublePronounMatch[2].trim();
				return remainder ? `Narrator: *${remainder}*` : "Narrator:";
			}

			return line;
		})
		.join("\n");
}

export function repairGenericAgeDescriptorsInNarratorBlocks(
	text: string,
	args?: {
		knownTies?: string[] | null;
		transcriptText?: string | null;
	},
) {
	const fullTranscript = [args?.transcriptText, text].filter(Boolean).join("\n");
	const lines = text.replace(/\r\n/g, "\n").split("\n");

	return lines
		.map((line) => {
			const trimmed = line.trim();
			if (!/^Narrator\s*(?::|\s[-—])/i.test(trimmed)) {
				return line;
			}

			if (!AGE_DESCRIPTOR_PATTERN.test(trimmed)) {
				AGE_DESCRIPTOR_PATTERN.lastIndex = 0;
				return line;
			}
			AGE_DESCRIPTOR_PATTERN.lastIndex = 0;

			const replacement = resolveAgeDescriptorReplacementName({
				line: trimmed,
				fullTranscript,
				knownTies: args?.knownTies,
			});
			if (!replacement) {
				return line;
			}

			if (new RegExp(`\\b${escapeRegex(replacement)}\\b`, "i").test(trimmed)) {
				return line;
			}

			return line.replace(AGE_DESCRIPTOR_PATTERN, replacement);
		})
		.join("\n");
}

export function repairNarratorBlocks(
	text: string,
	args?: {
		knownTies?: string[] | null;
		transcriptText?: string | null;
	},
) {
	let next = repairNarratorPronounPseudoLabels(text);
	next = repairNarratorWrappedInnerContent(next);
	next = repairGenericAgeDescriptorsInNarratorBlocks(next, args);
	return next;
}
