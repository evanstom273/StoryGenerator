import type { StoryMessage, StoryStateCharacterState, StoryStateData, StoryStateDataV2 } from "../../types/models";
import { isDirectorMessage } from "./directorMode";
import {
	type CharacterTtsGenderMap,
	inferGenderFromPronounsInText,
	normalizeCharacterTtsKey,
} from "../ai/characterTtsVoices";
import { isDeniedSpeakerLabel } from "../relationshipIndex";
import { extractSpeakerPrefix } from "./extractSpeakerPrefix";
import { splitDialogueQuoteRegions } from "./dialogueQuoteRegions";
import { findSpeakerColonIndex, looksLikeClockTimeFragment } from "./clockTimeInProse";
import { normalizeSceneSpeakerLabel } from "./speakerLabels";

const RESERVED_SPEAKER_LABELS = new Set(["narrator", "director", "time", "system", "assistant"]);

function escapeRegex(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nameTokens(value: string) {
	return value.trim().split(/\s+/).filter(Boolean);
}

export function isLegalNameReference(label: string, legalName: string) {
	const labelLower = label.trim().toLowerCase();
	const legalLower = legalName.trim().toLowerCase();
	if (!labelLower || !legalLower) {
		return false;
	}

	if (labelLower === legalLower) {
		return true;
	}

	const legalTokens = nameTokens(legalName);
	const labelTokens = nameTokens(label);

	if (labelTokens.length === 1 && legalTokens.length > 1) {
		return labelTokens[0]?.toLowerCase() === legalTokens[0]?.toLowerCase();
	}

	return legalTokens.every((token, index) => labelTokens[index]?.toLowerCase() === token.toLowerCase());
}

export function findPlayerStoryStateEntry(
	storyState: StoryStateData | StoryStateDataV2 | null | undefined,
	legalName: string,
): StoryStateCharacterState | null {
	if (!storyState?.characters) {
		return null;
	}

	const legalLower = legalName.trim().toLowerCase();
	if (!legalLower) {
		return null;
	}

	const trimmedLegal = legalName.trim();
	if (storyState.characters[trimmedLegal]) {
		return storyState.characters[trimmedLegal] ?? null;
	}

	for (const [key, entry] of Object.entries(storyState.characters)) {
		if (key.trim().toLowerCase() === legalLower) {
			return entry ?? null;
		}
	}

	for (const entry of Object.values(storyState.characters)) {
		if (entry?.canonicalName?.trim().toLowerCase() === legalLower) {
			return entry;
		}
	}

	return null;
}

const DIRECTOR_NOTE_NAME_STOPWORDS = new Set([
	"director",
	"narrator",
	"continue",
	"chapter",
	"system",
	"assistant",
	"morning",
	"afternoon",
	"evening",
	"before",
	"after",
	"while",
	"when",
	"then",
	"they",
	"their",
]);

const DIRECTOR_PROTAGONIST_VERBS =
	"(?:pulls|steps|turns|walks|sprints|stumbles|runs|rushes|enters|moves|looks|glances|sits|stands|reaches|leans|nods|shakes|smiles|wipes|bursts|collapses|gasps|freezes|spins|waves|hugs|cries|laughs|speaks|whispers|shouts|yells|screams|continues|stops|waits|pauses|breathes|sighs|sobs)";

function directorNoteUsesNameAsProtagonist(content: string, name: string) {
	const escaped = escapeRegex(name);
	return new RegExp(
		`\\b${escaped}\\b(?:\\s+\\w+){0,5}\\s+${DIRECTOR_PROTAGONIST_VERBS}\\b`,
		"i",
	).test(content);
}

function directorNoteReferencesKnownPlayerName(content: string, names: string[]) {
	for (const name of names) {
		const trimmed = name.trim();
		if (!trimmed) {
			continue;
		}
		if (new RegExp(`\\b${escapeRegex(trimmed)}\\b`, "i").test(content)) {
			return true;
		}
	}
	return false;
}

function extractChosenNameCandidate(
	content: string,
	legalName: string,
	sheetPreferredName: string,
): string | null {
	const patterns = [
		/"([A-Z][a-z]+)\.{0,3}\s*that['']?s my\.{0,3}\s*name/i,
		/\bmy name is\s+"?([A-Z][a-z]+)"?/i,
		/\bcall me\s+"?([A-Z][a-z]+)"?/i,
		/\bIt suits you so perfectly,\s+([A-Z][a-z]+)\b/i,
		/\bIt'?s beautiful\.?\s*It suits you so perfectly,\s+([A-Z][a-z]+)\b/i,
	];

	for (const pattern of patterns) {
		const match = content.match(pattern);
		const candidate = match?.[1]?.trim();
		if (!candidate) {
			continue;
		}
		if (isLegalNameReference(candidate, legalName)) {
			continue;
		}
		if (candidate.toLowerCase() === sheetPreferredName.trim().toLowerCase()) {
			continue;
		}
		if (isDeniedSpeakerLabel(candidate)) {
			continue;
		}
		return candidate;
	}

	return null;
}

export function inferPlayerSceneNameFromDirectorNotes(
	messages: StoryMessage[],
	legalName: string,
	sheetPreferredName?: string,
): string | null {
	const legalLower = legalName.trim().toLowerCase();
	const preferredLower = sheetPreferredName?.trim().toLowerCase() ?? "";
	if (!legalLower) {
		return null;
	}

	const legalTokens = new Set(nameTokens(legalName).map((token) => token.toLowerCase()));
	const knownPlayerNames = new Set<string>();
	if (preferredLower) {
		knownPlayerNames.add(preferredLower);
	}
	for (const token of legalTokens) {
		knownPlayerNames.add(token);
	}

	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (message.role !== "user" || !isDirectorMessage(message)) {
			continue;
		}

		const content = message.content.replace(/\r\n/g, "\n");
		const chosenName = extractChosenNameCandidate(
			content,
			legalName,
			sheetPreferredName ?? "",
		);
		if (chosenName) {
			return chosenName;
		}

		if (directorNoteReferencesKnownPlayerName(content, Array.from(knownPlayerNames))) {
			continue;
		}

		const candidates = content.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g) ?? [];
		for (const candidate of candidates) {
			const trimmed = candidate.trim();
			const lower = trimmed.toLowerCase();
			const firstToken = nameTokens(trimmed)[0] ?? trimmed;
			const firstTokenLower = firstToken.toLowerCase();
			if (
				!trimmed ||
				DIRECTOR_NOTE_NAME_STOPWORDS.has(lower) ||
				DIRECTOR_NOTE_NAME_STOPWORDS.has(firstTokenLower)
			) {
				continue;
			}
			if (isDeniedSpeakerLabel(firstToken)) {
				continue;
			}
			if (legalTokens.has(lower) || legalTokens.has(firstTokenLower)) {
				continue;
			}
			if (preferredLower && (lower === preferredLower || firstTokenLower === preferredLower)) {
				continue;
			}
			if (!directorNoteUsesNameAsProtagonist(content, firstToken)) {
				continue;
			}
			return firstToken;
		}
	}

	return null;
}

export function inferPlayerPronounsFromMessages(
	messages: StoryMessage[],
	legalName: string,
	sceneName: string,
): string | null {
	const sceneLabel = sceneName.trim();
	const legalLabel = legalName.trim();
	if (!sceneLabel) {
		return null;
	}

	let sheScore = 0;
	let heScore = 0;
	let theyScore = 0;
	const scanStart = Math.max(0, messages.length - 20);

	for (let index = messages.length - 1; index >= scanStart; index -= 1) {
		const message = messages[index];
		if (message.role !== "assistant") {
			continue;
		}

		const content = message.content.replace(/\r\n/g, "\n");
		const lines = content.split("\n");
		for (const line of lines) {
			const speakerMatch = line.match(/^([^:\n]{1,64}):\s*\*(She|He|They)\b/i);
			if (speakerMatch?.[1] && speakerMatch[2]) {
				const label = speakerMatch[1].trim();
				if (
					isLegalNameReference(label, legalLabel) ||
					label.toLowerCase() === sceneLabel.toLowerCase()
				) {
					const token = speakerMatch[2].toLowerCase();
					if (token === "she") {
						sheScore += 4;
					} else if (token === "he") {
						heScore += 4;
					} else {
						theyScore += 4;
					}
				}
			}
		}

		const scenePattern = new RegExp(
			`\\b(?:${escapeRegex(sceneLabel)}|${escapeRegex(nameTokens(legalLabel)[0] ?? sceneLabel)})\\b`,
			"i",
		);
		if (!scenePattern.test(content)) {
			continue;
		}

		const feminineMatches = content.match(/\b(she|her|hers|daughter)\b/gi)?.length ?? 0;
		const masculineMatches = content.match(/\b(he|him|his|son)\b/gi)?.length ?? 0;
		const neutralMatches = content.match(/\b(they|them|their|themself|themselves)\b/gi)?.length ?? 0;
		sheScore += feminineMatches;
		heScore += masculineMatches;
		theyScore += neutralMatches;
	}

	if (sheScore >= 2 && sheScore > heScore && sheScore >= theyScore) {
		return "she/her";
	}
	if (heScore >= 2 && heScore > sheScore && heScore >= theyScore) {
		return "he/him";
	}
	if (theyScore >= 2 && theyScore > sheScore && theyScore > heScore) {
		return "they/them";
	}

	return null;
}

export function inferPlayerPronounsFromDirectorNotes(
	messages: StoryMessage[],
): string | null {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (message.role !== "user" || !isDirectorMessage(message)) {
			continue;
		}

		const content = message.content;
		const hasFeminine = /\b(she|her|hers|daughter)\b/i.test(content);
		const hasMasculine = /\b(he|him|his|son)\b/i.test(content);
		const hasNeutral = /\b(they|them|their|themself|themselves)\b/i.test(content);

		if (hasFeminine && !hasMasculine) {
			return "she/her";
		}
		if (hasMasculine && !hasFeminine) {
			return "he/him";
		}
		if (hasNeutral && !hasFeminine && !hasMasculine) {
			return "they/them";
		}
	}

	return null;
}

export interface EstablishedPlayerIdentity {
	sceneName?: string;
	pronouns?: string;
}

export function detectEstablishedPlayerIdentityFromMessages(
	messages: StoryMessage[],
	legalName: string,
	sheetPreferredName: string,
): EstablishedPlayerIdentity | null {
	let pronouns: string | null = null;
	let sceneName: string | null = null;

	for (const message of messages) {
		const content = message.content.replace(/\r\n/g, "\n");

		const explicitPronouns = content.match(/\b(she\/her|he\/him|they\/them)\b/i);
		if (explicitPronouns?.[1]) {
			pronouns = explicitPronouns[1].toLowerCase();
		}

		if (
			/\bI['']?m trans\b/i.test(content) &&
			(/\bdaughter\b/i.test(content) || /\bI['']?m your daughter\b/i.test(content))
		) {
			pronouns = "she/her";
		} else if (/\bI['']?m (?:your )?daughter\b/i.test(content) || /\bI am (?:your )?daughter\b/i.test(content)) {
			pronouns = "she/her";
		}

		if (/\b(?:our|your) (?:daughter|girl)\b/i.test(content) && /\b(she|her|hers)\b/i.test(content)) {
			pronouns = "she/her";
		}

		const chosenName = extractChosenNameCandidate(content, legalName, sheetPreferredName);
		if (chosenName) {
			sceneName = chosenName;
		}
	}

	const latestDirectorSceneName = inferPlayerSceneNameFromDirectorNotes(
		messages,
		legalName,
		sheetPreferredName,
	);
	if (latestDirectorSceneName) {
		sceneName = latestDirectorSceneName;
	}

	const latestDirectorPronouns = inferPlayerPronounsFromDirectorNotes(messages);
	if (latestDirectorPronouns) {
		pronouns = latestDirectorPronouns;
	}

	if (!pronouns && !sceneName) {
		return null;
	}

	return {
		sceneName: sceneName ?? undefined,
		pronouns: pronouns ?? undefined,
	};
}

export function inferPlayerSceneNameFromMessages(
	messages: StoryMessage[],
	legalName: string,
): string | null {
	const legalLower = legalName.trim().toLowerCase();
	if (!legalLower) {
		return null;
	}

	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (message.role !== "user") {
			continue;
		}

		if (
			message.speakerType === "director" ||
			message.speakerType === "continue" ||
			message.speakerType === "author"
		) {
			continue;
		}

		const speakerName = message.speakerName?.trim();
		if (speakerName && !isLegalNameReference(speakerName, legalName)) {
			const speakerLower = speakerName.toLowerCase();
			if (speakerLower !== "continue" && speakerLower !== "director" && speakerLower !== legalLower) {
				return speakerName;
			}
		}

		const prefix = extractSpeakerPrefix(message.content);
		if (prefix?.speakerLabel) {
			const label = prefix.speakerLabel.trim();
			if (!isLegalNameReference(label, legalName)) {
				return label;
			}

			const legalTokens = legalName.trim().split(/\s+/).filter(Boolean);
			if (legalTokens.length > 1 && label.toLowerCase() === legalTokens[0]?.toLowerCase()) {
				return label;
			}
		}
	}

	return null;
}

export function resolveSubjectPronoun(pronouns: string | null | undefined): "He" | "She" | "They" {
	const normalized = (pronouns ?? "").trim().toLowerCase();
	if (normalized.includes("she") && !normalized.includes("they")) {
		return "She";
	}
	if (/\bhe\b|\b him\b|\b his\b/.test(` ${normalized} `) && !normalized.includes("they")) {
		return "He";
	}
	return "They";
}

export function resolveSubjectPronounFromActionBeat(beatText: string): "He" | "She" | "They" | null {
	const inner = beatText.replace(/^\*+|\*+$/g, "").trim();
	const leadingMatch = inner.match(/^(He|She|They)\b/i);
	if (leadingMatch?.[1]) {
		const token = leadingMatch[1];
		if (token.toLowerCase() === "she") {
			return "She";
		}
		if (token.toLowerCase() === "he") {
			return "He";
		}
		return "They";
	}

	const inferred = inferGenderFromPronounsInText(inner);
	if (inferred === "male") {
		return "He";
	}
	if (inferred === "female") {
		return "She";
	}

	return null;
}

function replacePlayerNameInUnquotedProse(
	text: string,
	legalName: string,
	sceneName: string,
) {
	const legalTokens = nameTokens(legalName);
	const firstName = legalTokens[0] ?? "";
	const sceneLabel = normalizeSceneSpeakerLabel(sceneName);
	const fullNamePattern = new RegExp(`\\b${escapeRegex(legalName.trim())}\\b`, "gi");
	const firstNamePattern =
		firstName.length >= 2 ? new RegExp(`\\b${escapeRegex(firstName)}\\b`, "g") : null;

	let rebuilt = "";
	for (const region of splitDialogueQuoteRegions(text)) {
		if (region.kind === "quoted") {
			rebuilt += `"${region.text}"`;
			continue;
		}

		let prose = region.text;
		prose = prose.replace(fullNamePattern, sceneLabel);
		if (firstNamePattern && firstName.toLowerCase() !== sceneLabel.toLowerCase()) {
			prose = prose.replace(firstNamePattern, sceneLabel);
		}
		rebuilt += prose;
	}

	return rebuilt;
}

export function applyPlayerSceneNameToTranscript(
	text: string,
	legalName: string,
	sceneName: string,
) {
	const trimmedLegal = legalName.trim();
	const trimmedScene = sceneName.trim();
	if (!trimmedLegal || !trimmedScene) {
		return text;
	}

	if (trimmedLegal.toLowerCase() === trimmedScene.toLowerCase()) {
		return text;
	}

	const sceneLabel = normalizeSceneSpeakerLabel(trimmedScene);
	const lines = text.replace(/\r\n/g, "\n").split("\n");

	return lines
		.map((line) => {
			const match = line.match(/^([^\n:]{1,64})(:|\s[-—])\s*(.*)$/);
			if (match?.[1]) {
				const label = match[1].trim();
				if (isLegalNameReference(label, trimmedLegal)) {
					return `${sceneLabel}${match[2]} ${match[3] ?? ""}`;
				}
			}

			const narratorMatch = line.match(/^Narrator:\s*(.*)$/i);
			if (narratorMatch) {
				return `Narrator: ${replacePlayerNameInUnquotedProse(narratorMatch[1] ?? "", trimmedLegal, trimmedScene)}`;
			}

			return replacePlayerNameInUnquotedProse(line, trimmedLegal, trimmedScene);
		})
		.join("\n");
}

function wrapAsActionBeat(value: string) {
	const trimmed = value.trim();
	if (!trimmed) {
		return "";
	}
	if (trimmed.startsWith("*") && trimmed.endsWith("*") && trimmed.length > 2) {
		return trimmed;
	}
	return `*${trimmed}*`;
}

function looksLikeBareActionProse(text: string) {
	const trimmed = text.trim();
	if (!trimmed || trimmed.startsWith('"') || trimmed.startsWith("*")) {
		return false;
	}
	if (/^["'*(\[]/.test(trimmed)) {
		return false;
	}
	if (looksLikeClockTimeFragment(trimmed)) {
		return false;
	}
	if (/^\d/.test(trimmed)) {
		return false;
	}
	if (/[!?]$/.test(trimmed)) {
		return false;
	}
	if (/\b(I|you|we|me|my|your|our|I'm|you're|we're|don't|can't|won't|didn't|isn't)\b/i.test(trimmed)) {
		return false;
	}
	return true;
}

function wrapBareActionProseInUnquotedText(text: string) {
	let rebuilt = "";

	for (const region of splitDialogueQuoteRegions(text)) {
		if (region.kind === "quoted") {
			rebuilt += `"${region.text}"`;
			continue;
		}

		const prose = region.text;
		if (!prose.trim()) {
			rebuilt += prose;
			continue;
		}

		if (/\*[^*]+\*/.test(prose)) {
			rebuilt += prose;
			continue;
		}

		if (looksLikeBareActionProse(prose)) {
			const trimmed = prose.trim();
			const lead = prose.slice(0, prose.indexOf(trimmed));
			const trail = prose.slice(prose.indexOf(trimmed) + trimmed.length);
			rebuilt += `${lead}${wrapAsActionBeat(trimmed)}${trail}`;
			continue;
		}

		rebuilt += prose;
	}

	return rebuilt;
}

function normalizeActionBeatInner(beat: string, pronoun: "He" | "She" | "They" | null) {
	let inner = beat.replace(/^\*+|\*+$/g, "").trim();
	if (!inner) {
		return pronoun ? `*${pronoun}.*` : "*.*";
	}

	inner = inner.replace(/^(He|She|They)\s+/i, "").trim();
	if (!/[.!?…]$/.test(inner)) {
		inner = `${inner}.`;
	}

	if (!pronoun) {
		return `*${inner}*`;
	}

	const firstChar = inner.charAt(0);
	const rest = inner.slice(1);
	const normalizedRest = firstChar ? firstChar.toLowerCase() + rest : inner;
	return `*${pronoun} ${normalizedRest}*`;
}

function normalizeActionBeatsInSpeakerRemainder(
	remainder: string,
	resolvePronoun: (beatText: string) => "He" | "She" | "They" | null,
) {
	const wrappedRemainder = wrapBareActionProseInUnquotedText(remainder);
	let rebuilt = "";

	for (const region of splitDialogueQuoteRegions(wrappedRemainder)) {
		if (region.kind === "quoted") {
			rebuilt += `"${region.text}"`;
			continue;
		}

		rebuilt += region.text.replace(/\*[^*]+\*/g, (beat) => {
			const pronoun = resolvePronoun(beat);
			return normalizeActionBeatInner(beat, pronoun);
		});
	}

	return rebuilt;
}

function isReservedSpeakerLabel(label: string) {
	return RESERVED_SPEAKER_LABELS.has(label.trim().toLowerCase());
}

function shouldSkipActionBeatSpeaker(label: string) {
	const trimmed = label.trim();
	if (!trimmed) {
		return true;
	}
	if (isReservedSpeakerLabel(trimmed)) {
		return true;
	}
	if (isDeniedSpeakerLabel(trimmed)) {
		return true;
	}
	if (/^(?:He|She|They)\s+narrator$/i.test(trimmed)) {
		return true;
	}
	return false;
}

function lookupCharacterSubjectPronoun(
	speakerLabel: string,
	characterGenders?: CharacterTtsGenderMap | null,
): "He" | "She" | "They" | null {
	if (!characterGenders) {
		return null;
	}

	const keys = [
		normalizeCharacterTtsKey(speakerLabel),
		normalizeCharacterTtsKey(speakerLabel.split(/\s+/)[0] ?? ""),
	].filter(Boolean);

	for (const key of keys) {
		const gender = characterGenders[key];
		if (gender === "male") {
			return "He";
		}
		if (gender === "female") {
			return "She";
		}
	}
	return null;
}

function resolveSpeakerActionPronoun(
	beatText: string,
	speakerLabel: string,
	opts?: {
		playerSceneName?: string | null;
		playerLegalName?: string | null;
		playerPronouns?: string | null;
		characterGenders?: CharacterTtsGenderMap | null;
	},
): "He" | "She" | "They" {
	const playerSceneLabel = opts?.playerSceneName?.trim()
		? normalizeSceneSpeakerLabel(opts.playerSceneName)
		: "";
	const playerLegalLabel = opts?.playerLegalName?.trim()
		? normalizeSceneSpeakerLabel(opts.playerLegalName)
		: "";
	const normalizedSpeaker = normalizeSceneSpeakerLabel(speakerLabel);
	const isPlayerSpeaker =
		(playerSceneLabel && normalizedSpeaker === playerSceneLabel) ||
		(playerLegalLabel && normalizedSpeaker === playerLegalLabel);

	if (isPlayerSpeaker && opts?.playerPronouns?.trim()) {
		return resolveSubjectPronoun(opts.playerPronouns);
	}

	const fromStoryState = lookupCharacterSubjectPronoun(speakerLabel, opts?.characterGenders);
	if (fromStoryState) {
		return fromStoryState;
	}

	const inferred = resolveSubjectPronounFromActionBeat(beatText);
	return inferred ?? "They";
}

function parseSpeakerLineForActionBeats(line: string): {
	speakerLabel: string;
	separator: string;
	remainder: string;
	headerOnly: boolean;
} | null {
	const trimmed = line.trim();
	const colonIndex = findSpeakerColonIndex(trimmed);
	if (colonIndex === null) {
		return null;
	}

	const label = trimmed.slice(0, colonIndex).trim();
	if (!label || shouldSkipActionBeatSpeaker(label)) {
		return null;
	}

	const after = trimmed.slice(colonIndex + 1);
	if (/^\s*$/.test(after)) {
		return { speakerLabel: label, separator: ":", remainder: "", headerOnly: true };
	}

	if (!/^\s+\S/.test(after)) {
		return null;
	}

	return {
		speakerLabel: label,
		separator: ":",
		remainder: after.trim(),
		headerOnly: false,
	};
}

function normalizeSpeakerRemainderActionBeats(
	remainder: string,
	speakerLabel: string,
	opts?: {
		playerSceneName?: string | null;
		playerLegalName?: string | null;
		playerPronouns?: string | null;
		characterGenders?: CharacterTtsGenderMap | null;
	},
) {
	return normalizeActionBeatsInSpeakerRemainder(remainder, (beatText) =>
		resolveSpeakerActionPronoun(beatText, speakerLabel, opts),
	);
}

export function normalizeCharacterActionBeatsInTranscript(
	text: string,
	opts?: {
		playerSceneName?: string | null;
		playerLegalName?: string | null;
		playerPronouns?: string | null;
		characterGenders?: CharacterTtsGenderMap | null;
	},
) {
	const lines = text.replace(/\r\n/g, "\n").split("\n");
	const output: string[] = [];
	let pendingSpeaker: string | null = null;
	let pendingSeparator: string | null = null;
	let pendingRemainder: string[] = [];

	function flushPending() {
		if (!pendingSpeaker || !pendingSeparator) {
			return;
		}

		const remainder = pendingRemainder.join("\n");
		if (remainder.trim()) {
			const normalized = normalizeSpeakerRemainderActionBeats(remainder, pendingSpeaker, opts);
			output.push(`${pendingSpeaker}${pendingSeparator}`);
			for (const normalizedLine of normalized.split("\n")) {
				output.push(normalizedLine);
			}
		} else {
			output.push(`${pendingSpeaker}${pendingSeparator}`);
		}

		pendingSpeaker = null;
		pendingSeparator = null;
		pendingRemainder = [];
	}

	for (const line of lines) {
		const parsed = parseSpeakerLineForActionBeats(line);
		if (parsed?.headerOnly) {
			flushPending();
			pendingSpeaker = parsed.speakerLabel;
			pendingSeparator = parsed.separator;
			pendingRemainder = [];
			continue;
		}

		if (parsed && !parsed.headerOnly) {
			flushPending();
			const normalized = normalizeSpeakerRemainderActionBeats(
				parsed.remainder,
				parsed.speakerLabel,
				opts,
			);
			output.push(`${parsed.speakerLabel}${parsed.separator} ${normalized}`);
			continue;
		}

		if (pendingSpeaker) {
			pendingRemainder.push(line);
			continue;
		}

		output.push(line);
	}

	flushPending();
	return output.join("\n");
}

/** @deprecated Use normalizeCharacterActionBeatsInTranscript */
export function normalizePlayerActionBeatsInTranscript(
	text: string,
	sceneName: string,
	pronouns: string | null | undefined,
) {
	return normalizeCharacterActionBeatsInTranscript(text, {
		playerSceneName: sceneName,
		playerPronouns: pronouns,
	});
}

export function stripLeadingSubjectPronounForAudiobook(text: string) {
	return text.replace(/^(He|She|They)\s+/i, "").trim();
}
