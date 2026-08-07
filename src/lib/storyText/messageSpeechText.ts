import type { StoryMessage } from "../../types/models";
import {
	formatNarratorBlockForDisplay,
	parseSceneBlocks,
	repairNarratorLabelLines,
	type SceneBlock,
} from "./parseSceneBlocks";
import { parseActionSegments } from "./parseActionSegments";
import {
	DIALOGUE_QUOTE_PAIRS,
	normalizeQuotedDialogueContent,
	splitDialogueQuoteRegions,
} from "./dialogueQuoteRegions";
import { stripLeadingSubjectPronounForAudiobook } from "./playerSceneName";
import { sanitizeMessageForDisplay } from "./transcriptSanitizer";
import type { GeminiNarrationTtsSettings } from "../ai/geminiTtsVoices";
import type { AudiobookPerformanceMode } from "../ai/audiobookPerformance";
import { DEFAULT_AUDIOBOOK_PERFORMANCE_MODE } from "../ai/audiobookPerformance";
import type { CharacterTtsGenderMap, CharacterTtsRegistry } from "../ai/characterTtsVoices";
import {
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
		isDirectorMessage(message) ||
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

function stripActionMarkers(text: string) {
	return text.replace(/\*([^*]+)\*/g, "$1").replace(/\s+/g, " ").trim();
}

type CharacterSpeechPart =
	| { kind: "dialogue"; text: string }
	| {
			kind: "narration";
			text: string;
			narratorStyle?: "character_action" | "player_third_person_action" | "omniscient";
	  };

const FIRST_PERSON_STAGING_START =
	/^(?:I(?:'m|'ve|'ll|'d)?|me|my(?:self)?|mine|we(?:'re|'ve|'ll|'d)?|us|our(?:selves)?|ours)\b/i;

function findNextQuoteOpen(text: string, fromIndex: number) {
	let bestIndex = -1;
	let bestPair: { open: string; close: string } | null = null;

	for (const pair of DIALOGUE_QUOTE_PAIRS) {
		const index = text.indexOf(pair.open, fromIndex);
		if (index >= 0 && (bestIndex < 0 || index < bestIndex)) {
			bestIndex = index;
			bestPair = pair;
		}
	}

	if (bestIndex < 0 || !bestPair) {
		return null;
	}

	return { index: bestIndex, pair: bestPair };
}

function appendUnquotedNarration(parts: CharacterSpeechPart[], text: string) {
	const narration = stripActionMarkers(text);
	if (narration) {
		parts.push({ kind: "narration", text: narration, narratorStyle: "character_action" });
	}
}

function isFirstPersonPerspectiveStaging(text: string) {
	const cleaned = stripActionMarkers(text).trim();
	if (!cleaned) {
		return false;
	}

	const segments = [
		...cleaned.split(/[,;]\s+/),
		...splitStagingSentences(cleaned),
	];
	return segments.some((segment) => FIRST_PERSON_STAGING_START.test(segment.trim()));
}

function isPlayerPerspectiveSpeaker(speakerLabel: string, playerName?: string | null) {
	const normalizedSpeaker = speakerLabel.trim().toLowerCase();
	const normalizedPlayer = playerName?.trim().toLowerCase();
	if (!normalizedSpeaker || !normalizedPlayer) {
		return false;
	}

	if (normalizedSpeaker === normalizedPlayer) {
		return true;
	}

	const speakerFirst = normalizedSpeaker.split(/\s+/)[0] ?? "";
	const playerFirst = normalizedPlayer.split(/\s+/)[0] ?? "";
	return speakerFirst.length > 1 && speakerFirst === playerFirst;
}

function splitStagingSentences(text: string) {
	const cleaned = stripActionMarkers(text).trim();
	if (!cleaned) {
		return [];
	}

	const sentences: string[] = [];
	let current = "";

	for (const character of cleaned) {
		current += character;
		if (character === "." || character === "!" || character === "?") {
			const trimmed = current.trim();
			if (trimmed) {
				sentences.push(trimmed);
			}
			current = "";
		}
	}

	const remainder = current.trim();
	if (remainder) {
		sentences.push(remainder);
	}

	return sentences.length ? sentences : [cleaned];
}

function appendActionSegmentSpeechParts(
	parts: CharacterSpeechPart[],
	text: string,
	playerPerspective: boolean,
) {
	const cleaned = stripActionMarkers(text).trim();
	if (!cleaned) {
		return;
	}

	if (playerPerspective) {
		if (isFirstPersonPerspectiveStaging(cleaned)) {
			parts.push({ kind: "dialogue", text: cleaned });
		} else {
			parts.push({
				kind: "narration",
				text: cleaned,
				narratorStyle: "player_third_person_action",
			});
		}
		return;
	}

	appendUnquotedNarration(parts, text);
}

function appendUnquotedStagingBetweenQuotes(parts: CharacterSpeechPart[], text: string) {
	for (const sentence of splitStagingSentences(text)) {
		const cleaned = sentence.trim();
		if (!cleaned) {
			continue;
		}

		if (isFirstPersonPerspectiveStaging(cleaned)) {
			parts.push({ kind: "dialogue", text: cleaned });
			continue;
		}

		parts.push({
			kind: "narration",
			text: cleaned,
			narratorStyle: "omniscient",
		});
	}
}

function appendQuotedAndUnquotedSpeechParts(parts: CharacterSpeechPart[], text: string) {
	let cursor = 0;

	while (cursor < text.length) {
		while (cursor < text.length && /\s/.test(text[cursor]!)) {
			cursor += 1;
		}

		if (cursor >= text.length) {
			break;
		}

		const quote = findNextQuoteOpen(text, cursor);
		if (!quote || quote.index > cursor) {
			const unquotedEnd = quote?.index ?? text.length;
			appendUnquotedNarration(parts, text.slice(cursor, unquotedEnd));
			cursor = unquotedEnd;
			if (!quote) {
				break;
			}
		}

		const dialogueStart = quote.index + quote.pair.open.length;
		const closeIndex = text.indexOf(quote.pair.close, dialogueStart);
		if (closeIndex < 0) {
			appendUnquotedNarration(parts, text.slice(cursor));
			break;
		}

		const dialogue = text.slice(dialogueStart, closeIndex).trim();
		if (dialogue) {
			parts.push({ kind: "dialogue", text: dialogue });
		}

		cursor = closeIndex + quote.pair.close.length;
	}
}

function parseCharacterBlockSpeechParts(
	text: string,
	options: { playerPerspective?: boolean } = {},
) {
	const parts: CharacterSpeechPart[] = [];
	const hasQuotedDialogue = splitDialogueQuoteRegions(text).some((region) => region.kind === "quoted");
	const playerPerspective = options.playerPerspective ?? false;

	for (const region of splitDialogueQuoteRegions(text)) {
		if (region.kind === "quoted") {
			const dialogue = normalizeQuotedDialogueContent(region.text);
			if (dialogue) {
				parts.push({ kind: "dialogue", text: dialogue });
			}
			continue;
		}

		for (const segment of parseActionSegments(region.text)) {
			if (segment.type === "action") {
				appendActionSegmentSpeechParts(parts, segment.text, playerPerspective);
				continue;
			}

			if (hasQuotedDialogue) {
				appendUnquotedStagingBetweenQuotes(parts, segment.text);
			} else {
				appendQuotedAndUnquotedSpeechParts(parts, segment.text);
			}
		}
	}

	return parts;
}

function formatCharacterActionForNarratorSpeech(speakerLabel: string, text: string) {
	let cleaned = stripActionMarkers(text);
	if (!cleaned) {
		return "";
	}

	cleaned = stripLeadingSubjectPronounForAudiobook(cleaned);

	if (speakerNameAlreadyPrefixesText(speakerLabel, cleaned)) {
		return cleaned;
	}

	return `${speakerLabel.trim()} ${cleaned}`;
}

function formatNarrationPartForSpeech(
	speakerLabel: string,
	part: Extract<CharacterSpeechPart, { kind: "narration" }>,
	audiobookPerformanceMode: AudiobookPerformanceMode = DEFAULT_AUDIOBOOK_PERFORMANCE_MODE,
) {
	if (part.narratorStyle === "omniscient") {
		return stripActionMarkers(part.text);
	}

	if (
		part.narratorStyle === "player_third_person_action" &&
		audiobookPerformanceMode !== "single_narrator"
	) {
		return stripActionMarkers(part.text);
	}

	return formatCharacterActionForNarratorSpeech(speakerLabel, part.text);
}

function buildSpeechScriptLinesFromCharacterBlock(
	speakerLabel: string,
	block: SceneBlock,
	characterRegistry: CharacterTtsRegistry,
	options: {
		playerPerspective?: boolean;
		audiobookPerformanceMode?: AudiobookPerformanceMode;
	} = {},
): SpeechScriptLine[] {
	const lines: SpeechScriptLine[] = [];
	const ttsSpeaker = resolveTtsSpeakerLabel(speakerLabel, characterRegistry);
	const performanceMode = options.audiobookPerformanceMode ?? DEFAULT_AUDIOBOOK_PERFORMANCE_MODE;

	for (const part of parseCharacterBlockSpeechParts(block.text, {
		playerPerspective: options.playerPerspective,
	})) {
		if (part.kind === "dialogue") {
			lines.push({ speaker: ttsSpeaker, text: part.text });
			continue;
		}

		const narrated = formatNarrationPartForSpeech(speakerLabel, part, performanceMode);
		if (narrated.trim()) {
			lines.push({ speaker: NARRATOR_SPEAKER_ALIAS, text: narrated });
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

function collapseScriptLinesToSingleNarrator(scriptLines: SpeechScriptLine[]): SpeechScriptLine[] {
	return scriptLines.map((line) => ({
		speaker: NARRATOR_SPEAKER_ALIAS,
		text: line.text,
		messageBreakAfter: line.messageBreakAfter,
	}));
}

function finalizeSpeechPlan(
	scriptLines: SpeechScriptLine[],
	characterRegistry: CharacterTtsRegistry,
	narrationTts: GeminiNarrationTtsSettings,
	audiobookPerformanceMode: AudiobookPerformanceMode = "radio_drama",
): SpeechSynthesisPlan | null {
	const effectiveLines =
		audiobookPerformanceMode === "single_narrator"
			? collapseScriptLinesToSingleNarrator(scriptLines)
			: scriptLines;

	if (!effectiveLines.length) {
		return null;
	}

	const text = effectiveLines.map((line) => `${line.speaker}: ${line.text}`).join("\n");
	const speakers = buildSpeakersFromRegistry(characterRegistry, narrationTts, effectiveLines);
	const hasCharacterDialogue = effectiveLines.some(
		(line) => line.speaker !== NARRATOR_SPEAKER_ALIAS,
	);

	return {
		text,
		scriptLines: effectiveLines,
		speakers,
		multiSpeaker: audiobookPerformanceMode === "radio_drama" && hasCharacterDialogue,
	};
}

export function formatChapterTitleForSpeech(label: string) {
	return label.trim().replace(/\s+/g, " ");
}

export function shouldAnnounceChapterTitle(label: string | null | undefined) {
	const trimmed = label?.trim();
	if (!trimmed) {
		return false;
	}

	const normalized = trimmed.toLowerCase();
	return normalized !== "full story";
}

function prependChapterTitleScriptLines(
	scriptLines: SpeechScriptLine[],
	chapterTitle: string | null | undefined,
): SpeechScriptLine[] {
	if (!shouldAnnounceChapterTitle(chapterTitle)) {
		return scriptLines;
	}

	const titleText = formatChapterTitleForSpeech(chapterTitle!);
	if (!titleText) {
		return scriptLines;
	}

	return [
		{
			speaker: NARRATOR_SPEAKER_ALIAS,
			text: titleText,
			messageBreakAfter: true,
		},
		...scriptLines,
	];
}

function buildSpeechPlanFromBlocks(
	blocks: SceneBlock[],
	narrationTts: GeminiNarrationTtsSettings,
	options: {
		defaultCharacterLabel?: string | null;
		characterRegistry: CharacterTtsRegistry;
		playerName?: string | null;
		audiobookPerformanceMode?: AudiobookPerformanceMode;
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
				{
					playerPerspective: isPlayerPerspectiveSpeaker(
						speechBlock.speakerLabel!,
						options.playerName ?? options.defaultCharacterLabel,
					),
					audiobookPerformanceMode:
						options.audiobookPerformanceMode ?? DEFAULT_AUDIOBOOK_PERFORMANCE_MODE,
				},
			);
			scriptLines.push(...characterLines);
		}
	}

	return finalizeSpeechPlan(
		scriptLines,
		options.characterRegistry,
		narrationTts,
		options.audiobookPerformanceMode ?? DEFAULT_AUDIOBOOK_PERFORMANCE_MODE,
	);
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
			applyActionBeatFormatting: false,
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
			applyActionBeatFormatting: false,
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
		playerSceneName?: string | null;
		playerPronouns?: string | null;
		latestUserMessage?: string | null;
		narrationTts: GeminiNarrationTtsSettings;
		characterRegistry: CharacterTtsRegistry;
		audiobookPerformanceMode?: AudiobookPerformanceMode;
	},
): SpeechScriptLine[] {
	if (message.role === "user") {
		if (!isSpeakableUserMessage(message)) {
			return [];
		}

		const rawContent = message.content.trim();
		const defaultCharacterLabel =
			message.speakerName?.trim() || options.playerName?.trim() || "Player";

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
				{
					playerPerspective: true,
					audiobookPerformanceMode:
						options.audiobookPerformanceMode ?? DEFAULT_AUDIOBOOK_PERFORMANCE_MODE,
				},
			);
		}

		const plan = buildSpeechPlanFromBlocks(blocks, options.narrationTts, {
			defaultCharacterLabel,
			characterRegistry: options.characterRegistry,
			playerName: options.playerName,
			audiobookPerformanceMode: options.audiobookPerformanceMode,
		});
		return plan?.scriptLines ?? [];
	}

	if (message.role !== "assistant") {
		return [];
	}

	const sanitized = sanitizeMessageForDisplay({
		message,
		playerName: options.playerName,
		playerSceneName: options.playerSceneName,
		playerPronouns: options.playerPronouns,
		latestUserMessage: options.latestUserMessage,
		applyActionBeatFormatting: false,
	});
	const repaired = repairNarratorLabelLines(sanitized);
	const blocks = parseSceneBlocks(repaired);
	const plan = buildSpeechPlanFromBlocks(blocks, options.narrationTts, {
		characterRegistry: options.characterRegistry,
		playerName: options.playerName,
		audiobookPerformanceMode: options.audiobookPerformanceMode,
	});

	return plan?.scriptLines ?? [];
}

export function buildStoryMessageSpeechPlan(
	message: StoryMessage,
	options: {
		playerName?: string | null;
		playerSceneName?: string | null;
		playerPronouns?: string | null;
		latestUserMessage?: string | null;
		narrationTts: GeminiNarrationTtsSettings;
		characterRegistry?: CharacterTtsRegistry;
		audiobookPerformanceMode?: AudiobookPerformanceMode;
	},
): SpeechSynthesisPlan | null {
	const characterRegistry =
		options.characterRegistry ??
		buildCharacterRegistryForMessages([message], options.playerName, options.narrationTts);
	const performanceMode = options.audiobookPerformanceMode ?? DEFAULT_AUDIOBOOK_PERFORMANCE_MODE;

	const scriptLines = buildStoryMessageSpeechScriptLines(message, {
		...options,
		characterRegistry,
		audiobookPerformanceMode: performanceMode,
	});

	return finalizeSpeechPlan(scriptLines, characterRegistry, options.narrationTts, performanceMode);
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
		playerSceneName?: string | null;
		playerPronouns?: string | null;
		narrationTts: GeminiNarrationTtsSettings;
		characterRegistry: CharacterTtsRegistry;
		audiobookPerformanceMode?: AudiobookPerformanceMode;
	},
): SpeechSynthesisPlan | null {
	const performanceMode = options.audiobookPerformanceMode ?? DEFAULT_AUDIOBOOK_PERFORMANCE_MODE;
	const scriptLines: SpeechScriptLine[] = [];

	for (let index = 0; index < messages.length; index += 1) {
		const message = messages[index]!;
		if (isSpeechExcludedMessage(message)) {
			continue;
		}

		const lines = buildStoryMessageSpeechScriptLines(message, {
			playerName: options.playerName,
			playerSceneName: options.playerSceneName,
			playerPronouns: options.playerPronouns,
			latestUserMessage: resolveLatestUserMessageBefore(messages, index),
			narrationTts: options.narrationTts,
			characterRegistry: options.characterRegistry,
			audiobookPerformanceMode: performanceMode,
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

	return finalizeSpeechPlan(
		scriptLines,
		options.characterRegistry,
		options.narrationTts,
		performanceMode,
	);
}

export function buildChapterSpeechPlan(
	messages: StoryMessage[],
	options: {
		playerName?: string | null;
		playerSceneName?: string | null;
		playerPronouns?: string | null;
		narrationTts: GeminiNarrationTtsSettings;
		characterRegistry?: CharacterTtsRegistry;
		allStoryMessages?: StoryMessage[];
		chapterTitle?: string | null;
		audiobookPerformanceMode?: AudiobookPerformanceMode;
	},
): SpeechSynthesisPlan | null {
	const registrySource = options.allStoryMessages ?? messages;
	const characterRegistry =
		options.characterRegistry ??
		buildCharacterRegistryForMessages(registrySource, options.playerName, options.narrationTts);
	const performanceMode = options.audiobookPerformanceMode ?? DEFAULT_AUDIOBOOK_PERFORMANCE_MODE;

	const basePlan = buildSpeechPlanFromMessages(messages, {
		playerName: options.playerName,
		playerSceneName: options.playerSceneName,
		playerPronouns: options.playerPronouns,
		narrationTts: options.narrationTts,
		characterRegistry,
		audiobookPerformanceMode: performanceMode,
	});

	if (!basePlan) {
		return null;
	}

	const scriptLines = prependChapterTitleScriptLines(basePlan.scriptLines, options.chapterTitle);
	return finalizeSpeechPlan(scriptLines, characterRegistry, options.narrationTts, performanceMode);
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
