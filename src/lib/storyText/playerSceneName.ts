import type { StoryMessage, StoryStateCharacterState, StoryStateData } from "../../types/models";
import { inferGenderFromPronounsInText } from "../ai/characterTtsVoices";
import { extractSpeakerPrefix } from "./extractSpeakerPrefix";
import { splitDialogueQuoteRegions } from "./dialogueQuoteRegions";
import { normalizeSceneSpeakerLabel } from "./speakerLabels";

const RESERVED_SPEAKER_LABELS = new Set(["narrator", "director", "time", "system", "assistant"]);

function escapeRegex(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nameTokens(value: string) {
	return value.trim().split(/\s+/).filter(Boolean);
}

function isLegalNameReference(label: string, legalName: string) {
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
	storyState: StoryStateData | null | undefined,
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
		if (prefix?.speakerLabel && !isLegalNameReference(prefix.speakerLabel, legalName)) {
			return prefix.speakerLabel;
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

function resolveSpeakerActionPronoun(
	beatText: string,
	speakerLabel: string,
	opts?: {
		playerSceneName?: string | null;
		playerLegalName?: string | null;
		playerPronouns?: string | null;
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

	const inferred = resolveSubjectPronounFromActionBeat(beatText);
	return inferred ?? "They";
}

function normalizeSpeakerRemainderActionBeats(
	remainder: string,
	speakerLabel: string,
	opts?: {
		playerSceneName?: string | null;
		playerLegalName?: string | null;
		playerPronouns?: string | null;
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
		const headerOnly = line.match(/^([^\n:]{1,64})(:|\s[-—])\s*$/);
		if (headerOnly?.[1] && !isReservedSpeakerLabel(headerOnly[1])) {
			flushPending();
			pendingSpeaker = headerOnly[1].trim();
			pendingSeparator = headerOnly[2] ?? ":";
			pendingRemainder = [];
			continue;
		}

		const inline = line.match(/^([^\n:]{1,64})(:|\s[-—])\s*(.*)$/);
		if (inline?.[1] && !isReservedSpeakerLabel(inline[1])) {
			flushPending();
			const speakerLabel = inline[1].trim();
			const normalized = normalizeSpeakerRemainderActionBeats(inline[3] ?? "", speakerLabel, opts);
			output.push(`${speakerLabel}${inline[2]} ${normalized}`);
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
