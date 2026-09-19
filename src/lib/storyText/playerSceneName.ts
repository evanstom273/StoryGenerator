import type { StoryMessage, StoryStateCharacterState, StoryStateData, StoryStateDataV2 } from "../../types/models";
import { isDirectorMessage } from "./directorMode";
import {
	type CharacterTtsGenderMap,
	inferGenderFromPronounsInText,
	normalizeCharacterTtsKey,
} from "../ai/characterTtsVoices";
import { isDeniedSpeakerLabel } from "../relationshipIndex";
import { splitDialogueQuoteRegions } from "./dialogueQuoteRegions";
import { findSpeakerColonIndex, looksLikeClockTimeFragment } from "./clockTimeInProse";
import { isSubjectPronounPseudoSpeaker } from "./narratorBlockRepair";
import { normalizeSceneSpeakerLabel } from "./speakerLabels";
import type { PlayerTranscriptIdentity } from "./playerTranscriptIdentity";
import { speakerLabelRefersToPlayer } from "./playerTranscriptIdentity";

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

type PlayerIdentityMessageKind = "player" | "instruction" | null;

function playerIdentityMessageKind(message: StoryMessage): PlayerIdentityMessageKind {
	if (message.role !== "user") return null;
	if (message.authorDirective || message.speakerType === "author" || message.speakerType === "canon") {
		return "instruction";
	}
	if (isDirectorMessage(message) || message.speakerType === "director") return "instruction";
	if (message.speakerType && message.speakerType !== "player") return null;
	return "player";
}

function instructionTargetsPlayer(content: string, legalName: string, sceneName: string) {
	const targets = [legalName, sceneName]
		.map((value) => value.trim())
		.filter((value) => value.length >= 2);
	return /\b(?:protagonist|player character|player's character|PC)\b/i.test(content) ||
		targets.some((name) => new RegExp(`\\b${escapeRegex(name)}\\b`, "i").test(content));
}

function extractExplicitPronouns(
	content: string,
	kind: Exclude<PlayerIdentityMessageKind, null>,
	legalName: string,
	sceneName: string,
) {
	const normalized = content.replace(/\r\n/g, "\n");
	if (kind === "player") {
		const direct = normalized.match(/\b(?:my pronouns? (?:are|are now)|i (?:want|would like) to use|i use|i go by|use)\s+(she\/her|he\/him|they\/them)\b/i)?.[1];
		if (direct) return direct.toLowerCase();
		const selfDescription = normalized.match(/\bI(?:'m| am)\s+(?:a\s+)?(girl|woman|boy|man|non[- ]binary)\b/i)?.[1]?.toLowerCase();
		if (selfDescription === "girl" || selfDescription === "woman") return "she/her";
		if (selfDescription === "boy" || selfDescription === "man") return "he/him";
		if (selfDescription?.startsWith("non")) return "they/them";
		return null;
	}

	if (!instructionTargetsPlayer(normalized, legalName, sceneName)) return null;
	const target = `(?:${[legalName, sceneName, "the protagonist", "player character", "the PC"]
		.map((value) => value.trim())
		.filter(Boolean)
		.map(escapeRegex)
		.join("|")})`;
	const explicit = [
		new RegExp(`\\b${target}\\s+(?:uses?|has)\\s+(?:the\\s+)?pronouns?\\s+(?:of\\s+)?(she\\/her|he\\/him|they\\/them)\\b`, "i"),
		new RegExp(`\\b${target}['’]?s\\s+pronouns?\\s+(?:are|should be)\\s+(she\\/her|he\\/him|they\\/them)\\b`, "i"),
		new RegExp(`\\buse\\s+(she\\/her|he\\/him|they\\/them)\\s+for\\s+${target}\\b`, "i"),
		new RegExp(`\\brefer to\\s+${target}\\s+with\\s+(she\\/her|he\\/him|they\\/them)\\b`, "i"),
	];
	for (const pattern of explicit) {
		const match = normalized.match(pattern)?.[1];
		if (match) return match.toLowerCase();
	}
	return null;
}

function extractAuthoredIdentity(
	message: StoryMessage,
	legalName: string,
	sheetPreferredName: string,
): EstablishedPlayerIdentity | null {
	const kind = playerIdentityMessageKind(message);
	if (!kind) return null;
	const content = message.content.replace(/\r\n/g, "\n");
	const pronouns = extractExplicitPronouns(content, kind, legalName, sheetPreferredName);
	const targetsPlayer = kind === "player" || instructionTargetsPlayer(content, legalName, sheetPreferredName);
	const sceneName = targetsPlayer
		? extractChosenNameCandidate(content, legalName, sheetPreferredName)
		: null;
	if (!pronouns && !sceneName) return null;
	return { ...(sceneName ? { sceneName } : {}), ...(pronouns ? { pronouns } : {}) };
}

function extractChosenNameCandidate(
	content: string,
	legalName: string,
	sheetPreferredName: string,
): string | null {
	const patterns = [
		/"([A-Z][a-z]+(?:[ '-][A-Z][a-z]+){0,2})\.{0,3}\s*that['']?s my\.{0,3}\s*name/i,
		/\bmy name is\s+"?([A-Z][a-z]+(?:[ '-][A-Z][a-z]+){0,2})"?/i,
		/\bcall me\s+"?([A-Z][a-z]+(?:[ '-][A-Z][a-z]+){0,2})"?/i,
		/\bIt suits you so perfectly,\s+([A-Z][a-z]+(?:[ '-][A-Z][a-z]+){0,2})\b/i,
		/\bIt'?s beautiful\.?\s*It suits you so perfectly,\s+([A-Z][a-z]+(?:[ '-][A-Z][a-z]+){0,2})\b/i,
	];

	for (const pattern of patterns) {
		const match = content.match(pattern);
		const candidate = match?.[1]
			?.trim()
			.replace(/\s+(?:from\s+now(?:\s+on)?|going\s+forward|please)$/i, "")
			.trim();
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

export function inferExplicitPlayerSceneRenameFromDirectorNotes(
	messages: StoryMessage[],
	legalName: string,
	sheetPreferredName?: string,
): string | null {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (message.role !== "user" || !isDirectorMessage(message)) {
			continue;
		}

		const chosenName = extractChosenNameCandidate(
			message.content.replace(/\r\n/g, "\n"),
			legalName,
			sheetPreferredName ?? "",
		);
		if (chosenName) {
			return chosenName;
		}
	}

	return null;
}

/** @deprecated Use inferExplicitPlayerSceneRenameFromDirectorNotes. Prose scanning removed. */
export function inferPlayerSceneNameFromDirectorNotes(
	messages: StoryMessage[],
	legalName: string,
	sheetPreferredName?: string,
): string | null {
	return inferExplicitPlayerSceneRenameFromDirectorNotes(
		messages,
		legalName,
		sheetPreferredName,
	);
}

export function inferPlayerPronounsFromMessages(
	messages: StoryMessage[],
	legalName: string,
	sceneName: string,
): string | null {
	return detectEstablishedPlayerIdentityFromMessages(messages, legalName, sceneName)?.pronouns ?? null;
}

export function inferPlayerPronounsFromDirectorNotes(
	messages: StoryMessage[],
): string | null {
	return detectEstablishedPlayerIdentityFromMessages(messages, "", "")?.pronouns ?? null;
}

export interface EstablishedPlayerIdentity {
	sceneName?: string;
	pronouns?: string;
	sourceMessageId?: string;
	source?: "player_turn" | "director_instruction" | "author_instruction";
}

export function detectEstablishedPlayerIdentityFromMessages(
	messages: StoryMessage[],
	legalName: string,
	sheetPreferredName: string,
): EstablishedPlayerIdentity | null {
	let established: EstablishedPlayerIdentity | null = null;
	for (const message of messages) {
		const next = extractAuthoredIdentity(message, legalName, sheetPreferredName);
		if (!next) continue;
		const kind = playerIdentityMessageKind(message);
		if (!kind) continue;
		established = {
			...(established ?? {}),
			...next,
			sourceMessageId: message.id,
			source: kind === "player" ? "player_turn" : message.authorDirective || message.speakerType === "author"
				? "author_instruction"
				: "director_instruction",
		};
	}
	return established;
}

export function inferPlayerSceneNameFromMessages(
	messages: StoryMessage[],
	legalName: string,
): string | null {
	return detectEstablishedPlayerIdentityFromMessages(messages, legalName, "")?.sceneName ?? null;
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

	if (/\b(?:their|them|they)\b/i.test(inner)) {
		return null;
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
	return applyPlayerSpeakerLabelsToTranscript(text, {
		legalName,
		sceneName,
		aliases: [legalName, sceneName],
	});
}

export function applyPlayerSpeakerLabelsToTranscript(
	text: string,
	identity: PlayerTranscriptIdentity,
) {
	const trimmedScene = identity.sceneName.trim();
	if (!trimmedScene) {
		return text;
	}

	const sceneLabel = normalizeSceneSpeakerLabel(trimmedScene);
	const lines = text.replace(/\r\n/g, "\n").split("\n");

	return lines
		.map((line) => {
			const match = line.match(/^([^\n:]{1,64})(:|\s[-—])\s*(.*)$/);
			if (match?.[1] && speakerLabelRefersToPlayer(match[1], identity)) {
				return `${sceneLabel}${match[2]} ${match[3] ?? ""}`;
			}

			const narratorMatch = line.match(/^Narrator:\s*(.*)$/i);
			if (narratorMatch) {
				return `Narrator: ${replacePlayerNameInUnquotedProse(
					narratorMatch[1] ?? "",
					identity.legalName,
					trimmedScene,
				)}`;
			}

			return replacePlayerNameInUnquotedProse(line, identity.legalName, trimmedScene);
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

function conjugateThirdPersonSingular(verb: string) {
	const lower = verb.toLowerCase();
	if (!lower || /^(is|was|are|were|has|have|had|does|do|did)$/.test(lower)) {
		return lower;
	}
	if (/^(he|she|they|her|his|their|him|hers|its)$/i.test(lower)) {
		return lower;
	}
	if (/^[a-z]+ly$/.test(lower)) {
		return lower;
	}
	if (lower.endsWith("s") || lower.endsWith("ed") || lower.endsWith("ing")) {
		return lower;
	}
	if (/(?:ch|sh|x|z|o)$/.test(lower)) {
		return `${lower}es`;
	}
	if (lower.endsWith("y") && !/[aeiou]y$/.test(lower)) {
		return `${lower.slice(0, -1)}ies`;
	}
	return `${lower}s`;
}

const CONFIDENT_BARE_ACTION_VERBS = new Set([
	"approach",
	"ask",
	"breathe",
	"brush",
	"clench",
	"close",
	"cross",
	"cry",
	"enter",
	"exhale",
	"fold",
	"frown",
	"gaze",
	"gesture",
	"glance",
	"grip",
	"groan",
	"hold",
	"inhale",
	"knot",
	"let",
	"laugh",
	"lean",
	"lift",
	"listen",
	"look",
	"lower",
	"murmur",
	"nod",
	"open",
	"pause",
	"press",
	"pull",
	"raise",
	"reach",
	"relax",
	"reply",
	"rest",
	"retreat",
	"run",
	"say",
	"settle",
	"shake",
	"shift",
	"shrug",
	"sigh",
	"sit",
	"smile",
	"speak",
	"sprint",
	"stare",
	"step",
	"swallow",
	"take",
	"tap",
	"tense",
	"touch",
	"trace",
	"turn",
	"tilt",
	"wait",
	"walk",
	"watch",
	"whisper",
	"wipe",
	"wince",
]);

const ACTION_BEAT_DETERMINERS = new Set(["a", "an", "the"]);

function actionVerbBaseCandidates(token: string) {
	const lower = token.toLowerCase();
	const candidates = new Set([lower]);

	if (lower.endsWith("ies") && lower.length > 3) {
		candidates.add(`${lower.slice(0, -3)}y`);
	}
	if (lower.endsWith("es") && lower.length > 2) {
		candidates.add(lower.slice(0, -2));
	}
	if (lower.endsWith("s") && lower.length > 1) {
		candidates.add(lower.slice(0, -1));
	}
	if (lower.endsWith("ed") && lower.length > 2) {
		candidates.add(lower.slice(0, -2));
	}
	if (lower.endsWith("ing") && lower.length > 3) {
		candidates.add(lower.slice(0, -3));
	}

	return candidates;
}

function isConfidentBareActionVerbOpening(inner: string) {
	const firstToken = inner.match(/^[A-Za-z][A-Za-z'-]*/)?.[0] ?? "";
	if (!firstToken) {
		return false;
	}

	const lower = firstToken.toLowerCase();
	if (ACTION_BEAT_DETERMINERS.has(lower)) {
		return false;
	}
	if (["he", "she", "they", "her", "his", "their"].includes(lower)) {
		return true;
	}
	return [...actionVerbBaseCandidates(firstToken)].some((candidate) =>
		CONFIDENT_BARE_ACTION_VERBS.has(candidate),
	);
}

function alignSelfPossessivesForSubject(inner: string, pronoun: "He" | "She" | "They") {
	if (pronoun === "They") {
		return inner;
	}

	const possessive = pronoun === "She" ? "her" : "his";
	const objectPronoun = pronoun === "She" ? "her" : "him";
	return inner
		.replace(/\btheir\b/gi, possessive)
		.replace(/\bthem\b/gi, objectPronoun);
}

function normalizeActionBeatInner(beat: string, pronoun: "He" | "She" | "They" | null) {
	const originalInner = beat.replace(/^\*+|\*+$/g, "").trim();
	let inner = originalInner;
	if (!inner) {
		return pronoun ? `*${pronoun}.*` : "*.*";
	}

	// Only repair a genuinely bare verb opening. Subject-, possessive-, determiner-,
	// and sentence-led beats are already authored prose and must remain untouched.
	if (/^(?:He|She|They)\b/i.test(inner)) {
		const malformedPossessive = inner.match(/^(He|She|They)\s+(hers|his|theirs)\s+(.+)$/i);
		if (malformedPossessive?.[1] && malformedPossessive[2] && malformedPossessive[3]) {
			const possessive = malformedPossessive[2].toLowerCase() === "his" ? "his" :
				malformedPossessive[2].toLowerCase() === "theirs" ? "their" : "her";
			return `*${malformedPossessive[1]} lets ${possessive} ${malformedPossessive[3]}*`;
		}
		const malformedVerb = inner.match(/^(He|She|They)\s+(gentlies|smile,s)\b\s*(.*)$/i);
		if (malformedVerb?.[1] && malformedVerb[2]) {
			const subject = pronoun ?? malformedVerb[1];
			if (malformedVerb[2].toLowerCase() === "gentlies") {
				const [verb, ...tail] = (malformedVerb[3] ?? "").split(/\s+/).filter(Boolean);
				const normalizedTail = tail.length ? ` ${tail.join(" ")}` : "";
				return `*${subject} gently ${verb ? conjugateThirdPersonSingular(verb) : ""}${normalizedTail}*`;
			}
			return `*${subject} smiles${malformedVerb[3] ? ` ${malformedVerb[3]}` : ""}*`;
		}
		if (pronoun) {
			const subject = inner.match(/^(He|She|They)\b/i)?.[1];
			if (subject && subject.toLowerCase() !== pronoun.toLowerCase()) {
				const corrected = `${pronoun}${inner.slice(subject.length)}`;
				const correctedMatch = corrected.match(/^(He|She|They)\s+([A-Za-z][A-Za-z'-]*)(\b[\s\S]*)$/i);
				if (correctedMatch?.[2]) {
					const verb = conjugateThirdPersonSingular(correctedMatch[2]);
					return `*${alignSelfPossessivesForSubject(`${pronoun} ${verb}${correctedMatch[3]}`, pronoun)}*`;
				}
				return `*${alignSelfPossessivesForSubject(corrected, pronoun)}*`;
			}
		}
		const subjectMatch = inner.match(/^(He|She|They)\s+([A-Za-z][A-Za-z'-]*)(\b[\s\S]*)$/i);
		if (subjectMatch?.[1] && subjectMatch[2]) {
			const normalizedVerb = conjugateThirdPersonSingular(subjectMatch[2]);
			if (normalizedVerb !== subjectMatch[2].toLowerCase()) {
				return `*${subjectMatch[1]} ${normalizedVerb}${subjectMatch[3]}*`;
			}
		}
		return `*${originalInner}*`;
	}
	if (/^(?:His|Her|Their)\b/i.test(inner) || /^(?:A|An|The)\b/i.test(inner)) {
		const possessiveMatch = inner.match(/^(His|Her|Their)\s+(eyes|gaze|hands?|fingers?|breath|voice)\b\s*(.*)$/i);
		if (pronoun && possessiveMatch?.[1] && possessiveMatch[2]) {
			const possessive = pronoun === "She" ? "her" : pronoun === "He" ? "his" : "their";
			const tail = possessiveMatch[3] ? ` ${possessiveMatch[3]}` : "";
			return `*${pronoun} lets ${possessive} ${possessiveMatch[2]}${tail}*`;
		}
		return `*${originalInner}*`;
	}
	if (!isConfidentBareActionVerbOpening(inner)) {
		return `*${inner}*`;
	}

	// Conjugate only the opening verb. Any later verbs belong to the authored tail.
	if (pronoun) {
		inner = alignSelfPossessivesForSubject(inner, pronoun);
	}
	if (!/[.!?…]$/.test(inner)) {
		inner = `${inner}.`;
	}

	if (!pronoun) {
		return `*${inner}*`;
	}

	const [firstWord, ...restWords] = inner.split(/\s+/);
	const firstToken = firstWord ?? "";
	const remainder = restWords.join(" ");
	const normalizedVerb = conjugateThirdPersonSingular(firstToken);
	const normalizedRest = remainder ? `${normalizedVerb} ${remainder}` : normalizedVerb;
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
	if (/\bnarrator\b/i.test(trimmed.replace(/^\*+|\*+$/g, ""))) {
		return true;
	}
	if (isSubjectPronounPseudoSpeaker(trimmed)) {
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

function lookupPlayerSubjectPronoun(identity: PlayerTranscriptIdentity): "He" | "She" | "They" | null {
	const candidates = [identity.sceneName, identity.legalName, ...identity.aliases];
	for (const candidate of candidates) {
		const resolved = lookupCharacterSubjectPronoun(candidate, identity.characterGenders);
		if (resolved) {
			return resolved;
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
		playerIdentity?: PlayerTranscriptIdentity | null;
		forcePlayerPronouns?: boolean;
	},
): "He" | "She" | "They" {
	const identity = opts?.playerIdentity;
	if (identity && speakerLabelRefersToPlayer(speakerLabel, identity)) {
		if (identity.pronouns?.trim()) {
			return resolveSubjectPronoun(identity.pronouns);
		}
		const fromPlayerGender = lookupPlayerSubjectPronoun(identity);
		if (fromPlayerGender) {
			return fromPlayerGender;
		}
	}

	const playerSceneLabel = opts?.playerSceneName?.trim()
		? normalizeSceneSpeakerLabel(opts.playerSceneName)
		: "";
	const playerLegalLabel = opts?.playerLegalName?.trim()
		? normalizeSceneSpeakerLabel(opts.playerLegalName)
		: "";
	const normalizedSpeaker = normalizeSceneSpeakerLabel(speakerLabel);
	const legalFirstName = playerLegalLabel.split(/\s+/)[0] ?? "";
	const legacyPlayerLabels = identity ? collectLegacyPlayerSpeakerLabels(identity) : new Set<string>();
	const isPlayerSpeaker =
		(identity && speakerLabelRefersToPlayer(speakerLabel, identity)) ||
		(playerSceneLabel && normalizedSpeaker === playerSceneLabel) ||
		(playerLegalLabel && normalizedSpeaker === playerLegalLabel) ||
		(legalFirstName.length >= 2 && normalizedSpeaker === legalFirstName) ||
		legacyPlayerLabels.has(normalizedSpeaker.toLowerCase());

	if (isPlayerSpeaker && opts?.playerPronouns?.trim()) {
		return resolveSubjectPronoun(opts.playerPronouns);
	}

	if (isPlayerSpeaker && identity?.pronouns?.trim()) {
		return resolveSubjectPronoun(identity.pronouns);
	}

	const fromStoryState = lookupCharacterSubjectPronoun(speakerLabel, opts?.characterGenders);
	if (fromStoryState) {
		return fromStoryState;
	}

	if (isPlayerSpeaker || opts?.forcePlayerPronouns) {
		if (identity?.pronouns?.trim()) {
			return resolveSubjectPronoun(identity.pronouns);
		}
		const fromPlayerGender = identity ? lookupPlayerSubjectPronoun(identity) : null;
		if (fromPlayerGender) {
			return fromPlayerGender;
		}
	}

	if (opts?.forcePlayerPronouns) {
		return "They";
	}

	const inferred = resolveSubjectPronounFromActionBeat(beatText);
	return inferred ?? "They";
}

function collectLegacyPlayerSpeakerLabels(identity: PlayerTranscriptIdentity): Set<string> {
	return new Set(
		[identity.legalName, identity.sceneName, ...identity.aliases].map((label) =>
			normalizeSceneSpeakerLabel(label).toLowerCase(),
		),
	);
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
		playerIdentity?: PlayerTranscriptIdentity | null;
		forcePlayerPronouns?: boolean;
	},
) {
	return normalizeActionBeatsInSpeakerRemainder(remainder, (beatText) =>
		resolveSpeakerActionPronoun(beatText, speakerLabel, opts),
	);
}

function resolveActionBeatOptions(opts?: {
	playerSceneName?: string | null;
	playerLegalName?: string | null;
	playerPronouns?: string | null;
	characterGenders?: CharacterTtsGenderMap | null;
	playerIdentity?: PlayerTranscriptIdentity | null;
	forcePlayerPronouns?: boolean;
}) {
	if (!opts?.playerIdentity) {
		return opts;
	}

	return {
		...opts,
		playerSceneName: opts.playerSceneName ?? opts.playerIdentity.sceneName,
		playerLegalName: opts.playerLegalName ?? opts.playerIdentity.legalName,
		playerPronouns: opts.playerPronouns ?? opts.playerIdentity.pronouns,
		characterGenders: opts.characterGenders ?? opts.playerIdentity.characterGenders,
	};
}

export function normalizeCharacterActionBeatsInTranscript(
	text: string,
	opts?: {
		playerSceneName?: string | null;
		playerLegalName?: string | null;
		playerPronouns?: string | null;
		characterGenders?: CharacterTtsGenderMap | null;
		playerIdentity?: PlayerTranscriptIdentity | null;
		forcePlayerPronouns?: boolean;
	},
) {
	const beatOpts = resolveActionBeatOptions(opts);
	const lines = text.replace(/\r\n/g, "\n").split("\n");
	const output: string[] = [];
	let pendingSpeaker: string | null = null;
	let pendingSeparator: string | null = null;
	let pendingRemainder: string[] = [];

	function flushPending() {
		if (!pendingSpeaker || !pendingSeparator) {
			return;
		}

		let remainder = pendingRemainder.join("\n");
		remainder = remainder
			.split("\n")
			.map((pendingLine) => pendingLine.replace(/^Narrator:\s*/i, "").trim())
			.filter(Boolean)
			.join(" ");
		if (remainder.trim()) {
			const normalized = normalizeSpeakerRemainderActionBeats(remainder, pendingSpeaker, beatOpts);
			output.push(`${pendingSpeaker}${pendingSeparator} ${normalized}`);
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
				beatOpts,
			);
			output.push(`${parsed.speakerLabel}${parsed.separator} ${normalized}`);
			continue;
		}

		if (pendingSpeaker) {
			const trimmed = line.trim();
			if (/^Narrator:\s*/i.test(trimmed) && pendingRemainder.length > 0) {
				flushPending();
				output.push(line);
				continue;
			}
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
