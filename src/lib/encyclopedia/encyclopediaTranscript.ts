import type { StoryChapter, StoryMessage } from "../../types/models";
import { resolveMessageChapterBoundary } from "../storyText/chapterNavigation";
import { isAuthorDirectiveMessage } from "../storyText/authorDirectives";
import { isContinueMessage } from "../storyText/continueMode";
import { isDirectorMessage } from "../storyText/directorMode";

export function shouldIndexMessageForEncyclopedia(
	message: Pick<StoryMessage, "role" | "content" | "speakerType" | "speakerName" | "authorDirective">,
): boolean {
	if (message.role === "system") return false;
	if (!message.content?.trim()) return false;
	if (isContinueMessage(message)) return false;
	if (isDirectorMessage(message)) return false;
	if (isAuthorDirectiveMessage(message)) return false;
	return true;
}

function resolveMessageSpeakerLabel(message: StoryMessage, playerName: string): string {
	if (message.role === "user") {
		return playerName.trim() || "Player";
	}
	if (message.speakerType === "canon") {
		return message.speakerName?.trim() || "Unknown canon character";
	}
	if (message.speakerType === "narrator") {
		return "Narrator";
	}
	return "Story";
}

export function formatSingleMessageForEncyclopedia(
	message: StoryMessage,
	playerName: string,
	messageNumber: number,
	messageNumberTotal: number,
	chapterLabel?: string,
): string {
	const boundary = resolveMessageChapterBoundary(message);
	const chapterNote =
		boundary?.kind === "start" && boundary.label?.trim()
			? boundary.label.trim()
			: chapterLabel?.trim() || undefined;
	const speaker = resolveMessageSpeakerLabel(message, playerName);
	const role = message.role;

	const lines = [
		`--- Message ${messageNumber} of ${messageNumberTotal} ---`,
		`Speaker: ${speaker}`,
		`Role: ${role}`,
	];
	if (chapterNote) {
		lines.push(`Chapter: ${chapterNote}`);
	}
	lines.push("", "MESSAGE TEXT:", message.content.trim(), "", `--- End Message ${messageNumber} ---`);

	return lines.join("\n");
}

export function formatTranscriptForEncyclopedia(
	messages: StoryMessage[],
	playerName: string,
	messageNumberStart = 1,
	messageNumberTotal?: number,
): string {
	const total = messageNumberTotal ?? messages.length;
	return messages
		.map((message, index) => {
			const number = messageNumberStart + index;
			return formatSingleMessageForEncyclopedia(message, playerName, number, total);
		})
		.join("\n\n");
}

export function resolveChapterLabelAtMessage(
	messageNumber: number,
	messages: StoryMessage[],
	chapters: StoryChapter[],
): string | undefined {
	const index = messageNumber - 1;
	if (index < 0 || index >= messages.length) return undefined;
	for (let i = index; i >= 0; i -= 1) {
		const boundary = resolveMessageChapterBoundary(messages[i]!);
		if (boundary?.kind === "start" && boundary.label?.trim()) {
			return boundary.label.trim();
		}
	}
	const chapter = chapters.find((c) => c.endsAtIndex >= messageNumber);
	if (chapter?.label?.trim()) return chapter.label.trim();
	return undefined;
}

export function resolveLatestChapterLabel(messages: StoryMessage[], chapters: StoryChapter[]): string | undefined {
	if (!messages.length) return undefined;
	return resolveChapterLabelAtMessage(messages.length, messages, chapters);
}
