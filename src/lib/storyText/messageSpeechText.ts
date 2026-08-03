import type { StoryMessage } from "../../types/models";
import {
	formatNarratorBlockForDisplay,
	parseSceneBlocks,
	repairNarratorLabelLines,
	type SceneBlock,
} from "./parseSceneBlocks";
import { parseActionSegments } from "./parseActionSegments";
import { sanitizeMessageForDisplay } from "./transcriptSanitizer";
import type { GeminiNarrationTtsSettings } from "../ai/geminiTtsVoices";
import type { CharacterTtsGenderMap, CharacterTtsRegistry } from "../ai/characterTtsVoices";
import {
	DIRECTOR_TTS_KEY,
	DIRECTOR_TTS_LABEL,
	applyCharacterGenderHintForName,
	ensureCharacterTtsRegistry,
	inferGenderFromPronounsInText,
	normalizeCharacterTtsKey,
	resolveCharacterTtsKey,
} from "../ai/characterTtsVoices";
import { isAuthorDirectiveMessage } from "./authorDirectives";
import { isContinueMessage } from "./continueMode";
import { isDirectorMessage } from "./directorMode";

export interface SpeechScriptLine {
	speaker: string;
	text: string;
	messageBreakAfter?: boolean;
}

export interface SpeechSynthesisPlan {
	text: string;
	scriptLines: SpeechScriptLine[];
	speakers: Array<{ name: string; voice: string }>;
	multiSpeaker: boolean;
}

const NARRATOR_SPEAKER_ALIAS = "Narrator";

export function isSpeechExcludedMessage(message: StoryMessage) {
	if (message.role === "system" || message.speakerType === "system") {
		return true;
	}

	if (message.role !== "user") {
		return false;
	}

	return (
		isContinueMessage(message) ||
		isAuthorDirectiveMessage(message) ||
		message.speakerType === "canon"
	);
}

export function resolveLatestUserMessageBefore(messages: StoryMessage[], beforeIndex: number) {
	for (let index = beforeIndex - 1; index >= 0; index -= 1) {
		const message = messages[index]!;
		if (message.role === "user" && !isSpeechExcludedMessage(message)) {
			return message.content;
		}
	}

	return null;
}

function formatCharacterDialogueForSpeech(speakerLabel: string, text: string) {
	const cleaned = stripActionMarkers(text);
	if (!cleaned) {
		return "";
	}

	if (speakerNameAlreadyPrefixesText(speakerLabel, cleaned)) {
		return cleaned;
	}

	return `${speakerLabel.trim()} ${cleaned}`;
}

function stripActionMarkers(text: string) {
	return text.replace(/\*([^*]+)\*/g, "$1").replace(/\s+/g, " ").trim();
}

function isQuotedDialogue(text: string) {
	const trimmed = text.trim();
	return /^["“‘'„]/.test(trimmed);
}

function stripDialogueQuotes(text: string) {
	let trimmed = text.trim();
	const pairs: Array<[string, string]> = [
		['"', '"'],
		["“", "”"],
		["‘", "’"],
		["'", "'"],
	];

	for (const [open, close] of pairs) {
		if (trimmed.startsWith(open) && trimmed.endsWith(close) && trimmed.length > open.length + close.length) {
			return trimmed.slice(open.length, trimmed.length - close.length).trim();
		}
	}

	return stripActionMarkers(trimmed);
}

function formatCharacterActionForNarratorSpeech(speakerLabel: string, text: string) {
	const cleaned = stripActionMarkers(text);
	if (!cleaned) {
		return "";
	}

	if (speakerNameAlreadyPrefixesText(speakerLabel, cleaned)) {
		return cleaned;
	}

	return `${speakerLabel.trim()} ${cleaned}`;
}

function looksLikeNarratedActionLine(text: string) {
	const cleaned = stripActionMarkers(text);
	if (!cleaned) {
		return false;
	}

	if (looksLikeSpokenDialogue(cleaned)) {
		return false;
	}

	const firstChar = cleaned[0];
	if (firstChar && firstChar === firstChar.toLowerCase() && firstChar !== firstChar.toUpperCase()) {
		return true;
	}

	return looksLikePhysicalAction(cleaned);
}

function looksLikePhysicalAction(text: string) {
	const cleaned = stripActionMarkers(text).trim();
	return /^(puts|spins|folds|leans|stares|looks|steps|walks|runs|sits|stands|turns|nods|shrugs|taps|glances|gazes|reaches|opens|closes|pulls|pushes)\b/i.test(
		cleaned,
	);
}

function looksLikeSpokenDialogue(text: string) {
	const cleaned = stripActionMarkers(text).trim();
	if (!cleaned) {
		return false;
	}

	if (isQuotedDialogue(cleaned)) {
		return true;
	}

	if (cleaned.length > 120) {
		return false;
	}

	if (!/[.!?]["']?$/.test(cleaned)) {
		return false;
	}

	return !looksLikePhysicalAction(cleaned);
}

function buildSpeechScriptLinesFromCharacterBlock(
	speakerLabel: string,
	block: SceneBlock,
	characterRegistry: CharacterTtsRegistry,
): SpeechScriptLine[] {
	const lines: SpeechScriptLine[] = [];
	const ttsSpeaker = resolveTtsSpeakerLabel(speakerLabel, characterRegistry);
	const hasActionSegment = block.segments.some((segment) => segment.type === "action");

	for (const segment of block.segments) {
		if (segment.type === "action") {
			if (looksLikeSpokenDialogue(segment.text)) {
				const dialogue = stripDialogueQuotes(segment.text);
				if (dialogue.trim()) {
					lines.push({ speaker: ttsSpeaker, text: dialogue });
				}
				continue;
			}

			const narrated = formatCharacterActionForNarratorSpeech(speakerLabel, segment.text);
			if (narrated.trim()) {
				lines.push({ speaker: NARRATOR_SPEAKER_ALIAS, text: narrated });
			}
			continue;
		}

		const rawText = segment.text.trim();
		if (!rawText) {
			continue;
		}

		if (isQuotedDialogue(rawText) || (hasActionSegment && !looksLikeNarratedActionLine(rawText))) {
			const dialogue = stripDialogueQuotes(rawText);
			if (dialogue.trim()) {
				lines.push({ speaker: ttsSpeaker, text: dialogue });
			}
			continue;
		}

		if (looksLikeNarratedActionLine(rawText)) {
			const narrated = formatCharacterActionForNarratorSpeech(speakerLabel, rawText);
			if (narrated.trim()) {
				lines.push({ speaker: NARRATOR_SPEAKER_ALIAS, text: narrated });
			}
			continue;
		}

		const dialogue = stripActionMarkers(rawText);
		if (dialogue.trim()) {
			lines.push({ speaker: ttsSpeaker, text: dialogue });
		}
	}

	if (!lines.length && block.text.trim()) {
		const speechText = formatCharacterDialogueForSpeech(speakerLabel, block.text);
		if (speechText.trim()) {
			lines.push({ speaker: ttsSpeaker, text: speechText });
		}
	}

	return lines;
}

function speakerNameAlreadyPrefixesText(speakerLabel: string, text: string) {
	const cleaned = stripActionMarkers(text);
	if (!cleaned) {
		return true;
	}

	const lowerText = cleaned.toLowerCase();
	const normalizedSpeaker = speakerLabel.trim();
	if (!normalizedSpeaker) {
		return false;
	}

	if (lowerText.startsWith(normalizedSpeaker.toLowerCase())) {
		return true;
	}

	const firstToken = normalizedSpeaker.split(/\s+/)[0] ?? "";
	return firstToken.length > 1 && lowerText.startsWith(firstToken.toLowerCase());
}

function resolveTtsSpeakerLabel(
	speakerLabel: string,
	characterRegistry: CharacterTtsRegistry,
) {
	const key = resolveCharacterTtsKey(speakerLabel, characterRegistry.labels);
	return characterRegistry.labels[key] ?? speakerLabel.trim();
}

function buildSpeakersFromRegistry(
	characterRegistry: CharacterTtsRegistry,
	narrationTts: GeminiNarrationTtsSettings,
	scriptLines: SpeechScriptLine[],
) {
	const narratorVoice = narrationTts.voice;
	const speakers: Array<{ name: string; voice: string }> = [
		{ name: NARRATOR_SPEAKER_ALIAS, voice: narratorVoice },
	];

	const seen = new Set<string>([NARRATOR_SPEAKER_ALIAS]);

	for (const line of scriptLines) {
		if (line.speaker === NARRATOR_SPEAKER_ALIAS || seen.has(line.speaker)) {
			continue;
		}

		seen.add(line.speaker);
		const registryKey = resolveCharacterTtsKey(line.speaker, characterRegistry.labels);
		const voice = characterRegistry.voices[registryKey] ?? narrationTts.characterVoice;

		speakers.push({ name: line.speaker, voice: voice ?? narrationTts.characterVoice });
	}

	return speakers;
}

function finalizeSpeechPlan(
	scriptLines: SpeechScriptLine[],
	characterRegistry: CharacterTtsRegistry,
	narrationTts: GeminiNarrationTtsSettings,
): SpeechSynthesisPlan | null {
	if (!scriptLines.length) {
		return null;
	}

	const text = scriptLines.map((line) => `${line.speaker}: ${line.text}`).join("\n");
	const speakers = buildSpeakersFromRegistry(characterRegistry, narrationTts, scriptLines);
	const hasCharacterDialogue = scriptLines.some(
		(line) => line.speaker !== NARRATOR_SPEAKER_ALIAS,
	);

	return {
		text,
		scriptLines,
		speakers,
		multiSpeaker: hasCharacterDialogue,
	};
}

function buildSpeechPlanFromBlocks(
	blocks: SceneBlock[],
	narrationTts: GeminiNarrationTtsSettings,
	options: {
		defaultCharacterLabel?: string | null;
		characterRegistry: CharacterTtsRegistry;
	},
): SpeechSynthesisPlan | null {
	const scriptLines: SpeechScriptLine[] = [];
	const defaultCharacterLabel = options.defaultCharacterLabel?.trim() || "Character";

	for (const block of blocks) {
		let isNarrator = !block.speakerLabel || block.speakerLabel === NARRATOR_SPEAKER_ALIAS;
		let speakerLabel = block.speakerLabel;

		if (!isNarrator && !speakerLabel) {
			speakerLabel = defaultCharacterLabel;
			isNarrator = false;
		}

		const speechBlock: SceneBlock = speakerLabel ? { ...block, speakerLabel } : block;

		if (isNarrator) {
			const speechText = formatNarratorBlockForDisplay(speechBlock.text);
			if (!speechText.trim()) {
				continue;
			}
			scriptLines.push({ speaker: NARRATOR_SPEAKER_ALIAS, text: speechText });
		} else {
			const characterLines = buildSpeechScriptLinesFromCharacterBlock(
				speechBlock.speakerLabel!,
				speechBlock,
				options.characterRegistry,
			);
			scriptLines.push(...characterLines);
		}
	}

	return finalizeSpeechPlan(scriptLines, options.characterRegistry, narrationTts);
}

export function isSpeakableUserMessage(message: StoryMessage) {
	if (message.role !== "user") {
		return false;
	}

	if (isSpeechExcludedMessage(message)) {
		return false;
	}

	return Boolean(message.content?.trim());
}

export function collectCharacterTtsCandidatesFromMessages(
	messages: StoryMessage[],
	playerName?: string | null,
) {
	const candidates: Array<{ key: string; label: string }> = [];
	const seen = new Set<string>();

	const addCandidate = (label: string) => {
		const trimmed = label.trim();
		if (!trimmed) {
			return;
		}

		const key = normalizeCharacterTtsKey(trimmed);
		if (seen.has(key)) {
			return;
		}

		seen.add(key);
		candidates.push({ key, label: trimmed });
	};

	if (playerName?.trim()) {
		addCandidate(playerName.trim());
	}

	for (const message of messages) {
		if (isSpeechExcludedMessage(message)) {
			continue;
		}

		if (message.role === "user") {
			if (isDirectorMessage(message)) {
				addCandidate(DIRECTOR_TTS_LABEL);
				continue;
			}

			const label =
				message.speakerName?.trim() ||
				(message.speakerType === "narrator" ? NARRATOR_SPEAKER_ALIAS : playerName?.trim()) ||
				"Player";
			if (message.speakerType !== "narrator") {
				addCandidate(label);
			}
			continue;
		}

		if (message.role !== "assistant") {
			continue;
		}

		const sanitized = sanitizeMessageForDisplay({
			message,
			playerName,
		});
		const repaired = repairNarratorLabelLines(sanitized);
		const blocks = parseSceneBlocks(repaired);

		for (const block of blocks) {
			if (!block.speakerLabel || block.speakerLabel === NARRATOR_SPEAKER_ALIAS) {
				continue;
			}
			addCandidate(block.speakerLabel);
		}
	}

	return candidates;
}

const NAME_PREFIXED_ACTION_LINE =
	/^([A-Z][a-zA-Z''-]*(?:\s+[A-Z][a-zA-Z''-]*){0,3})\s+(.+)$/;

function inferGenderHintFromNamePrefixedLine(line: string) {
	const trimmed = line.trim();
	const match = trimmed.match(NAME_PREFIXED_ACTION_LINE);
	if (!match?.[1] || !match[2]) {
		return null;
	}

	const name = match[1].trim();
	const remainder = match[2].trim();
	if (!name || !remainder) {
		return null;
	}

	const gender = inferGenderFromPronounsInText(remainder);
	if (!gender) {
		return null;
	}

	return { name, gender };
}

function collectGenderHintsFromTextLines(
	hints: CharacterTtsGenderMap,
	text: string,
	speakerLabel?: string | null,
) {
	if (speakerLabel && speakerLabel !== NARRATOR_SPEAKER_ALIAS) {
		const speakerGender = inferGenderFromPronounsInText(text);
		if (speakerGender) {
			applyCharacterGenderHintForName(hints, speakerLabel, speakerGender);
		}
	}

	for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
		const nameHint = inferGenderHintFromNamePrefixedLine(line);
		if (nameHint) {
			applyCharacterGenderHintForName(hints, nameHint.name, nameHint.gender);
		}
	}
}

export function buildCharacterGenderHintsFromMessages(
	messages: StoryMessage[],
	playerName?: string | null,
): CharacterTtsGenderMap {
	const hints: CharacterTtsGenderMap = {};

	for (const message of messages) {
		if (isSpeechExcludedMessage(message)) {
			continue;
		}

		if (message.role === "user") {
			if (isDirectorMessage(message)) {
				continue;
			}

			const label =
				message.speakerName?.trim() ||
				(message.speakerType === "narrator" ? null : playerName?.trim()) ||
				null;
			if (label) {
				collectGenderHintsFromTextLines(hints, message.content, label);
			}

			const repaired = repairNarratorLabelLines(message.content);
			const blocks = parseSceneBlocks(repaired);
			for (const block of blocks) {
				collectGenderHintsFromTextLines(hints, block.text, block.speakerLabel);
			}
			continue;
		}

		if (message.role !== "assistant") {
			continue;
		}

		const sanitized = sanitizeMessageForDisplay({
			message,
			playerName,
		});
		const repaired = repairNarratorLabelLines(sanitized);
		const blocks = parseSceneBlocks(repaired);

		for (const block of blocks) {
			collectGenderHintsFromTextLines(hints, block.text, block.speakerLabel);
		}

		collectGenderHintsFromTextLines(hints, repaired);
	}

	return hints;
}

export function buildStoryMessageSpeechScriptLines(
	message: StoryMessage,
	options: {
		playerName?: string | null;
		latestUserMessage?: string | null;
		narrationTts: GeminiNarrationTtsSettings;
		characterRegistry: CharacterTtsRegistry;
	},
): SpeechScriptLine[] {
	if (message.role === "user") {
		if (!isSpeakableUserMessage(message)) {
			return [];
		}

		const rawContent = message.content.trim();
		const defaultCharacterLabel =
			message.speakerName?.trim() || options.playerName?.trim() || "Player";

		if (isDirectorMessage(message)) {
			const direction = stripActionMarkers(rawContent);
			if (!direction) {
				return [];
			}

			const directorSpeaker =
				options.characterRegistry.labels[DIRECTOR_TTS_KEY] ?? DIRECTOR_TTS_LABEL;
			return [{ speaker: directorSpeaker, text: direction }];
		}

		if (message.speakerType === "narrator") {
			const text = formatNarratorBlockForDisplay(rawContent);
			if (!text.trim()) {
				return [];
			}

			return [{ speaker: NARRATOR_SPEAKER_ALIAS, text }];
		}

		const repaired = repairNarratorLabelLines(rawContent);
		const blocks = parseSceneBlocks(repaired);
		const hasSpeakerLabels = blocks.some(
			(block) => block.speakerLabel && block.speakerLabel !== NARRATOR_SPEAKER_ALIAS,
		);

		if (!hasSpeakerLabels && blocks.length <= 1) {
			const block =
				blocks[0] ??
				({
					text: rawContent,
					segments: parseActionSegments(rawContent),
				} satisfies SceneBlock);

			return buildSpeechScriptLinesFromCharacterBlock(
				defaultCharacterLabel,
				block,
				options.characterRegistry,
			);
		}

		const plan = buildSpeechPlanFromBlocks(blocks, options.narrationTts, {
			defaultCharacterLabel,
			characterRegistry: options.characterRegistry,
		});
		return plan?.scriptLines ?? [];
	}

	if (message.role !== "assistant") {
		return [];
	}

	const sanitized = sanitizeMessageForDisplay({
		message,
		playerName: options.playerName,
		latestUserMessage: options.latestUserMessage,
	});
	const repaired = repairNarratorLabelLines(sanitized);
	const blocks = parseSceneBlocks(repaired);
	const plan = buildSpeechPlanFromBlocks(blocks, options.narrationTts, {
		characterRegistry: options.characterRegistry,
	});

	return plan?.scriptLines ?? [];
}

export function buildStoryMessageSpeechPlan(
	message: StoryMessage,
	options: {
		playerName?: string | null;
		latestUserMessage?: string | null;
		narrationTts: GeminiNarrationTtsSettings;
		characterRegistry?: CharacterTtsRegistry;
	},
): SpeechSynthesisPlan | null {
	const characterRegistry =
		options.characterRegistry ??
		buildCharacterRegistryForMessages([message], options.playerName, options.narrationTts);

	const scriptLines = buildStoryMessageSpeechScriptLines(message, {
		...options,
		characterRegistry,
	});

	return finalizeSpeechPlan(scriptLines, characterRegistry, options.narrationTts);
}

function buildCharacterRegistryForMessages(
	messages: StoryMessage[],
	playerName: string | null | undefined,
	narrationTts: GeminiNarrationTtsSettings,
	existingRegistry?: CharacterTtsRegistry,
	characterGenders?: CharacterTtsGenderMap | null,
): CharacterTtsRegistry {
	const messageGenderHints = buildCharacterGenderHintsFromMessages(messages, playerName);
	const mergedGenderHints = { ...messageGenderHints, ...(characterGenders ?? {}) };

	const candidates = collectCharacterTtsCandidatesFromMessages(messages, playerName);
	const directorCandidate = candidates.find((entry) => entry.key === DIRECTOR_TTS_KEY);
	if (!directorCandidate) {
		const hasDirector = messages.some((message) => isDirectorMessage(message));
		if (hasDirector) {
			candidates.push({ key: DIRECTOR_TTS_KEY, label: DIRECTOR_TTS_LABEL });
		}
	}

	return ensureCharacterTtsRegistry({
		existingVoices: existingRegistry?.voices,
		existingLabels: existingRegistry?.labels,
		characters: candidates,
		narrationTts,
		playerName,
		characterGenders: mergedGenderHints,
	});
}

function buildSpeechPlanFromMessages(
	messages: StoryMessage[],
	options: {
		playerName?: string | null;
		narrationTts: GeminiNarrationTtsSettings;
		characterRegistry: CharacterTtsRegistry;
	},
): SpeechSynthesisPlan | null {
	const scriptLines: SpeechScriptLine[] = [];

	for (let index = 0; index < messages.length; index += 1) {
		const message = messages[index]!;
		if (isSpeechExcludedMessage(message)) {
			continue;
		}

		const lines = buildStoryMessageSpeechScriptLines(message, {
			playerName: options.playerName,
			latestUserMessage: resolveLatestUserMessageBefore(messages, index),
			narrationTts: options.narrationTts,
			characterRegistry: options.characterRegistry,
		});

		if (lines.length) {
			for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
				const line = lines[lineIndex]!;
				scriptLines.push(
					lineIndex === lines.length - 1 ? { ...line, messageBreakAfter: true } : line,
				);
			}
		}
	}

	return finalizeSpeechPlan(scriptLines, options.characterRegistry, options.narrationTts);
}

export function buildChapterSpeechPlan(
	messages: StoryMessage[],
	options: {
		playerName?: string | null;
		narrationTts: GeminiNarrationTtsSettings;
		characterRegistry?: CharacterTtsRegistry;
		allStoryMessages?: StoryMessage[];
	},
): SpeechSynthesisPlan | null {
	const registrySource = options.allStoryMessages ?? messages;
	const characterRegistry =
		options.characterRegistry ??
		buildCharacterRegistryForMessages(registrySource, options.playerName, options.narrationTts);

	return buildSpeechPlanFromMessages(messages, {
		playerName: options.playerName,
		narrationTts: options.narrationTts,
		characterRegistry,
	});
}

export function buildCharacterTtsRegistryForStory(
	allMessages: StoryMessage[],
	options: {
		playerName?: string | null;
		narrationTts: GeminiNarrationTtsSettings;
		existingRegistry?: CharacterTtsRegistry;
		characterGenders?: CharacterTtsGenderMap | null;
	},
): CharacterTtsRegistry {
	return buildCharacterRegistryForMessages(
		allMessages,
		options.playerName,
		options.narrationTts,
		options.existingRegistry,
		options.characterGenders,
	);
}


export function metaChatContentToSpeechText(markdown: string) {
	const withoutCode = markdown
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/`([^`]+)`/g, "$1")
		.replace(/^#{1,6}\s+/gm, "")
		.replace(/\*\*([^*]+)\*\*/g, "$1")
		.replace(/\*([^*]+)\*/g, "$1")
		.replace(/_([^_]+)_/g, "$1")
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replace(/^[-*+]\s+/gm, "")
		.replace(/\s+/g, " ")
		.trim();

	return withoutCode;
}

export function buildMetaChatSpeechPlan(
	content: string,
	narrationTts: GeminiNarrationTtsSettings,
): SpeechSynthesisPlan | null {
	const text = metaChatContentToSpeechText(content);
	if (!text) {
		return null;
	}

	return {
		text,
		scriptLines: [{ speaker: NARRATOR_SPEAKER_ALIAS, text }],
		speakers: [{ name: NARRATOR_SPEAKER_ALIAS, voice: narrationTts.voice }],
		multiSpeaker: false,
	};
}
