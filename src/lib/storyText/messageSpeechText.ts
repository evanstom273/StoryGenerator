import type { StoryMessage } from "../../types/models";
import {
	formatNarratorBlockForDisplay,
	parseSceneBlocks,
	repairNarratorLabelLines,
	type SceneBlock,
} from "./parseSceneBlocks";
import { sanitizeMessageForDisplay } from "./transcriptSanitizer";
import type { GeminiNarrationTtsSettings } from "../ai/geminiTtsVoices";
import { isAuthorDirectiveMessage } from "./authorDirectives";
import { isContinueMessage } from "./continueMode";
import { isDirectorMessage } from "./directorMode";

export interface SpeechSynthesisPlan {
	text: string;
	speakers: Array<{ name: string; voice: string }>;
	multiSpeaker: boolean;
}

const CHARACTER_SPEAKER_ALIAS = "Character";

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

function messagePlanUsesCharacterVoice(plan: SpeechSynthesisPlan) {
	return (
		plan.multiSpeaker ||
		plan.speakers.some((speaker) => speaker.name === CHARACTER_SPEAKER_ALIAS)
	);
}

function stripActionMarkers(text: string) {
	return text.replace(/\*([^*]+)\*/g, "$1").replace(/\s+/g, " ").trim();
}

function buildSpeakerScriptLine(speaker: string, text: string) {
	return `${speaker}: ${stripActionMarkers(text)}`;
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

function formatCharacterBlockForSpeech(speakerLabel: string, text: string) {
	const cleaned = stripActionMarkers(text);
	if (!cleaned) {
		return "";
	}

	if (speakerNameAlreadyPrefixesText(speakerLabel, cleaned)) {
		return cleaned;
	}

	return `${speakerLabel.trim()} ${cleaned}`;
}

function formatBlockTextForSpeech(block: SceneBlock) {
	const isNarrator = !block.speakerLabel || block.speakerLabel === "Narrator";
	if (isNarrator) {
		return formatNarratorBlockForDisplay(block.text);
	}

	return formatCharacterBlockForSpeech(block.speakerLabel!, block.text);
}

function buildSpeechPlanFromBlocks(
	blocks: SceneBlock[],
	narrationTts: GeminiNarrationTtsSettings,
	options?: { defaultCharacterLabel?: string | null },
): SpeechSynthesisPlan | null {
	const scriptLines: string[] = [];
	const narrationLines: string[] = [];
	let hasCharacterDialogue = false;
	const defaultCharacterLabel = options?.defaultCharacterLabel?.trim() || "Character";

	for (const block of blocks) {
		let isNarrator = !block.speakerLabel || block.speakerLabel === "Narrator";
		let speakerLabel = block.speakerLabel;

		if (!isNarrator && !speakerLabel) {
			speakerLabel = defaultCharacterLabel;
			isNarrator = false;
		}

		const speechBlock: SceneBlock = speakerLabel
			? { ...block, speakerLabel }
			: block;
		const speechText = formatBlockTextForSpeech(speechBlock);
		if (!speechText.trim()) {
			continue;
		}

		if (isNarrator) {
			narrationLines.push(speechText);
			scriptLines.push(buildSpeakerScriptLine("Narrator", speechText));
		} else {
			hasCharacterDialogue = true;
			scriptLines.push(buildSpeakerScriptLine(CHARACTER_SPEAKER_ALIAS, speechText));
		}
	}

	if (!scriptLines.length) {
		return null;
	}

	const narratorVoice = narrationTts.voice;
	const characterVoice = narrationTts.characterVoice;

	if (!hasCharacterDialogue) {
		const plainText = narrationLines.join("\n\n");

		return {
			text: plainText,
			speakers: [{ name: "Narrator", voice: narratorVoice }],
			multiSpeaker: false,
		};
	}

	return {
		text: scriptLines.join("\n"),
		speakers: [
			{ name: "Narrator", voice: narratorVoice },
			{ name: CHARACTER_SPEAKER_ALIAS, voice: characterVoice },
		],
		multiSpeaker: true,
	};
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

export function buildStoryMessageSpeechPlan(
	message: StoryMessage,
	options: {
		playerName?: string | null;
		latestUserMessage?: string | null;
		narrationTts: GeminiNarrationTtsSettings;
	},
): SpeechSynthesisPlan | null {
	if (message.role === "user") {
		if (!isSpeakableUserMessage(message)) {
			return null;
		}

		const rawContent = message.content.trim();
		const defaultCharacterLabel =
			message.speakerName?.trim() || options.playerName?.trim() || "Player";

		if (isDirectorMessage(message)) {
			const direction = stripActionMarkers(rawContent);
			if (!direction) {
				return null;
			}

			return {
				text: `Director: ${direction}`,
				speakers: [{ name: "Narrator", voice: options.narrationTts.voice }],
				multiSpeaker: false,
			};
		}

		if (message.speakerType === "narrator") {
			const text = formatNarratorBlockForDisplay(rawContent);
			if (!text.trim()) {
				return null;
			}

			return {
				text,
				speakers: [{ name: "Narrator", voice: options.narrationTts.voice }],
				multiSpeaker: false,
			};
		}

		const repaired = repairNarratorLabelLines(rawContent);
		const blocks = parseSceneBlocks(repaired);
		const hasSpeakerLabels = blocks.some(
			(block) => block.speakerLabel && block.speakerLabel !== "Narrator",
		);

		if (!hasSpeakerLabels && blocks.length <= 1) {
			const speechText = formatCharacterBlockForSpeech(defaultCharacterLabel, rawContent);
			if (!speechText.trim()) {
				return null;
			}

			return {
				text: speechText,
				speakers: [{ name: "Narrator", voice: options.narrationTts.characterVoice }],
				multiSpeaker: false,
			};
		}

		return buildSpeechPlanFromBlocks(blocks, options.narrationTts, {
			defaultCharacterLabel,
		});
	}

	if (message.role !== "assistant") {
		return null;
	}

	const sanitized = sanitizeMessageForDisplay({
		message,
		playerName: options.playerName,
		latestUserMessage: options.latestUserMessage,
	});
	const repaired = repairNarratorLabelLines(sanitized);
	const blocks = parseSceneBlocks(repaired);

	return buildSpeechPlanFromBlocks(blocks, options.narrationTts);
}

function buildSpeechPlanFromMessages(
	messages: StoryMessage[],
	options: {
		playerName?: string | null;
		narrationTts: GeminiNarrationTtsSettings;
	},
): SpeechSynthesisPlan | null {
	const parts: string[] = [];
	let hasCharacterDialogue = false;

	for (let index = 0; index < messages.length; index += 1) {
		const message = messages[index]!;
		if (isSpeechExcludedMessage(message)) {
			continue;
		}

		const plan = buildStoryMessageSpeechPlan(message, {
			playerName: options.playerName,
			latestUserMessage: resolveLatestUserMessageBefore(messages, index),
			narrationTts: options.narrationTts,
		});

		if (!plan?.text.trim()) {
			continue;
		}

		parts.push(plan.text.trim());
		if (messagePlanUsesCharacterVoice(plan)) {
			hasCharacterDialogue = true;
		}
	}

	if (!parts.length) {
		return null;
	}

	const narratorVoice = options.narrationTts.voice;
	const characterVoice = options.narrationTts.characterVoice;
	const text = parts.join("\n\n");

	if (!hasCharacterDialogue) {
		return {
			text,
			speakers: [{ name: "Narrator", voice: narratorVoice }],
			multiSpeaker: false,
		};
	}

	return {
		text,
		speakers: [
			{ name: "Narrator", voice: narratorVoice },
			{ name: CHARACTER_SPEAKER_ALIAS, voice: characterVoice },
		],
		multiSpeaker: true,
	};
}

export function buildChapterSpeechPlan(
	messages: StoryMessage[],
	options: {
		playerName?: string | null;
		narrationTts: GeminiNarrationTtsSettings;
	},
): SpeechSynthesisPlan | null {
	return buildSpeechPlanFromMessages(messages, options);
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
		speakers: [{ name: "Narrator", voice: narrationTts.voice }],
		multiSpeaker: false,
	};
}
