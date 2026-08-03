import type { StoryMessage } from "../../types/models";
import { parseSceneBlocks } from "./parseSceneBlocks";
import { sanitizeMessageForDisplay } from "./transcriptSanitizer";
import type { GeminiNarrationTtsSettings } from "../ai/geminiTtsVoices";

export interface SpeechSynthesisPlan {
	text: string;
	speakers: Array<{ name: string; voice: string }>;
	multiSpeaker: boolean;
}

function stripActionMarkers(text: string) {
	return text.replace(/\*([^*]+)\*/g, "$1").replace(/\s+/g, " ").trim();
}

function buildSpeakerScriptLine(speaker: string, text: string) {
	return `${speaker}: ${stripActionMarkers(text)}`;
}

export function buildStoryMessageSpeechPlan(
	message: StoryMessage,
	options: {
		playerName?: string | null;
		latestUserMessage?: string | null;
		narrationTts: GeminiNarrationTtsSettings;
	},
): SpeechSynthesisPlan | null {
	if (message.role !== "assistant") {
		return null;
	}

	const sanitized = sanitizeMessageForDisplay({
		message,
		playerName: options.playerName,
		latestUserMessage: options.latestUserMessage,
	});
	const blocks = parseSceneBlocks(sanitized);
	const scriptLines: string[] = [];
	let hasCharacterDialogue = false;

	for (const block of blocks) {
		const isNarrator = !block.speakerLabel || block.speakerLabel === "Narrator";
		const text = stripActionMarkers(block.text);
		if (!text) {
			continue;
		}

		if (isNarrator) {
			scriptLines.push(buildSpeakerScriptLine("Narrator", block.text));
		} else {
			hasCharacterDialogue = true;
			scriptLines.push(buildSpeakerScriptLine("Character", block.text));
		}
	}

	if (!scriptLines.length) {
		return null;
	}

	const narratorVoice = options.narrationTts.voice;
	const characterVoice = options.narrationTts.characterVoice;

	if (!hasCharacterDialogue) {
		const plainText = blocks
			.map((block) => stripActionMarkers(block.text))
			.filter(Boolean)
			.join("\n\n");

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
			{ name: "Character", voice: characterVoice },
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
	const parts: string[] = [];

	for (const message of messages) {
		if (message.role !== "assistant") {
			continue;
		}

		const plan = buildStoryMessageSpeechPlan(message, {
			playerName: options.playerName,
			narrationTts: options.narrationTts,
		});
		if (plan?.text.trim()) {
			parts.push(plan.text.trim());
		}
	}

	if (!parts.length) {
		return null;
	}

	return {
		text: parts.join("\n\n"),
		speakers: [{ name: "Narrator", voice: options.narrationTts.voice }],
		multiSpeaker: false,
	};
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
