import type { StoryChapter, StoryMessage } from "../../types/models";
import { resolveMessageChapterBoundary } from "../storyText/chapterNavigation";
import { isAuthorDirectiveMessage } from "../storyText/authorDirectives";
import { isContinueMessage } from "../storyText/continueMode";
import { isDirectorMessage } from "../storyText/directorMode";

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
			const boundary = resolveMessageChapterBoundary(message);
			const chapterNote =
				boundary?.kind === "start" && boundary.label?.trim()
					? ` [Chapter start: ${boundary.label.trim()}]`
					: "";
			const prefix =
				message.role === "user"
					? isAuthorDirectiveMessage(message)
						? message.authorDirective?.kind ?? "author"
						: isContinueMessage(message)
							? "continue"
							: isDirectorMessage(message)
								? "director"
								: `user (${playerName})`
					: message.speakerType === "canon"
						? `canon (${message.speakerName?.trim() || "Unknown"})`
						: message.speakerType === "narrator"
							? "narrator"
							: "assistant";
			return `[Message ${number}/${total}]${chapterNote} ${prefix}: ${message.content}`;
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
