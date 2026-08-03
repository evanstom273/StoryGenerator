import type { StoryMessage } from "../../types/models";
import { useStoryEngine } from "../../app/providers/StoryEngineProvider";
import { resolveGeminiNarrationTtsSettings } from "../../lib/ai/geminiTtsVoices";
import {
	buildChapterSpeechPlan,
	buildTurnBlockSpeechPlan,
	getTurnBlockPlayId,
	isSpeechExcludedMessage,
} from "../../lib/storyText/messageSpeechText";
import { getMessagesForChapterStartingAt } from "../../lib/storyText/chapterNavigation";
import { cn } from "../../utils/cn";
import { MessagePlayButton } from "./MessagePlayButton";

interface ChapterListenBannerProps {
	messageId: string;
	label: string;
	highlighted: boolean;
	messages: StoryMessage[];
	playerCharacterName: string;
	className?: string;
}

export function ChapterListenBanner({
	messageId,
	label,
	highlighted,
	messages,
	playerCharacterName,
	className,
}: ChapterListenBannerProps) {
	const { aiSettings } = useStoryEngine();
	const narrationTts = resolveGeminiNarrationTtsSettings(aiSettings?.geminiNarrationTts);
	const chapterMessages = getMessagesForChapterStartingAt(messages, messageId);
	const plan = buildChapterSpeechPlan(chapterMessages, {
		playerName: playerCharacterName,
		narrationTts,
	});

	return (
		<div
			id={`story-chapter-start-${messageId}`}
			className={cn(
				"max-lg:scroll-mt-[6.5rem] lg:scroll-mt-10 rounded-2xl border border-accent/20 bg-accent/8 px-3 py-3 text-center text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft",
				highlighted ? "ring-2 ring-accent/35" : "",
				className,
			)}
		>
			<div className="flex flex-wrap items-center justify-center gap-3">
				<span>{label}</span>
				{plan ? (
					<MessagePlayButton
						playId={`chapter-${messageId}`}
						plan={plan}
						label="Listen"
						className="normal-case tracking-normal"
					/>
				) : null}
			</div>
		</div>
	);
}

interface StoryMessagePlayButtonProps {
	message: StoryMessage;
	messages: StoryMessage[];
	playerCharacterName: string;
}

export function StoryMessagePlayButton({
	message,
	messages,
	playerCharacterName,
}: StoryMessagePlayButtonProps) {
	const { aiSettings } = useStoryEngine();
	const narrationTts = resolveGeminiNarrationTtsSettings(aiSettings?.geminiNarrationTts);

	if (message.role === "system" || isSpeechExcludedMessage(message)) {
		return null;
	}

	const plan = buildTurnBlockSpeechPlan(messages, message.id, {
		playerName: playerCharacterName,
		narrationTts,
	});
	const playId = getTurnBlockPlayId(messages, message.id);

	if (!plan || !playId) {
		return null;
	}

	return <MessagePlayButton playId={playId} plan={plan} />;
}
