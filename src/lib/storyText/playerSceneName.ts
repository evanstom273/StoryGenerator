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

function isValidPlayerSceneNameForRename(name: string): boolean {
	const trimmed = name.trim();
	if (!trimmed || trimmed.length < 2) {
		return false;
	}
	if (!/^[A-Z]/.test(trimmed)) {
		return false;
	}
	return !isDeniedSpeakerLabel(trimmed);
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
		// Do not treat collective possessive "their" (e.g. "their apartment") as a player pronoun signal.
		const hasNeutral =
			/\bthey\/them\b/i.test(content) ||
			/\b(they|them|themself|themselves)\b/i.test(content);

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
		if (chosenName && isValidPlayerSceneNameForRename(chosenName)) {
			sceneName = chosenName;
		}
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
	let inner = beat.replace(/^\*+|\*+$/g, "").trim();
	if (!inner) {
		return pronoun ? `*${pronoun}.*` : "*.*";
	}

	if (!isConfidentBareActionVerbOpening(inner)) {
		return `*${inner}*`;
	}

	inner = inner.replace(
		/^(She|He|They)\s+(hers|his|theirs)\s+/i,
		(_, subject, possessive: string) => {
			const normalized = possessive.toLowerCase();
			if (normalized === "hers") {
				return `${subject} lets her `;
			}
			if (normalized === "his") {
				return `${subject} lets his `;
			}
			return `${subject} lets their `;
		},
	);

	inner = inner.replace(/^(He|She|They)\s+/i, "").trim();
	inner = inner.replace(/^(Her|His|Their)\s+/i, (match) => `${match.trim().toLowerCase()} `).trim();
	inner = inner.replace(/\bgentlies\s+(\w+)\b/gi, (_, verb: string) => `gently ${conjugateThirdPersonSingular(verb)}`);
	inner = inner.replace(/\bgentlies\b/gi, "gently");
	inner = inner.replace(/^(\w+),s\b/, "$1s");
	if (pronoun) {
		inner = alignSelfPossessivesForSubject(inner, pronoun);
	}
	if (!/[.!?…]$/.test(inner)) {
		inner = `${inner}.`;
	}

	if (!pronoun) {
		return `*${inner}*`;
	}

	if (/^(her|his|their)\s+/i.test(inner)) {
		const [determiner, ...restWords] = inner.split(/\s+/);
		const firstRest = restWords[0] ?? "";
		if (/^(eyes|gaze|hands?|fingers?|breath|voice)\b/i.test(firstRest)) {
			const tail = restWords.slice(1).join(" ");
			const normalizedRest = tail ? `${firstRest} ${tail}` : firstRest;
			return `*${pronoun} lets ${determiner?.toLowerCase() ?? "her"} ${normalizedRest}*`;
		}
	}

	const [firstWord, ...restWords] = inner.split(/\s+/);
	const firstToken = firstWord ?? "";
	const remainder = restWords.join(" ");
	if (/^[a-z]+ly$/i.test(firstToken) && restWords.length > 0) {
		const verb = restWords[0] ?? "";
		const normalizedVerb = conjugateThirdPersonSingular(verb);
		const tail = restWords.slice(1).join(" ");
		const normalizedRest = tail
			? `${firstToken} ${normalizedVerb} ${tail}`
			: `${firstToken} ${normalizedVerb}`;
		return `*${pronoun} ${normalizedRest}*`;
	}
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
