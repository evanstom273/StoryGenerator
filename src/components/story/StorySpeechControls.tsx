import type { StoryMessage } from "../../types/models";
import { useStoryEngine } from "../../app/providers/StoryEngineProvider";
import { resolveGeminiNarrationTtsSettings } from "../../lib/ai/geminiTtsVoices";
import { registryChanged } from "../../lib/ai/characterTtsVoices";
import {
	buildChapterSpeechPlan,
	buildCharacterTtsRegistryForStory,
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
	const { aiSettings, getStoryCharacterTtsRegistry, saveStoryCharacterTtsRegistry } =
		useStoryEngine();
	const narrationTts = resolveGeminiNarrationTtsSettings(aiSettings?.geminiNarrationTts);
	const storyId = messages[0]?.storyId;
	const existingRegistry = storyId ? getStoryCharacterTtsRegistry(storyId) : undefined;

	const characterRegistry = buildCharacterTtsRegistryForStory(messages, {
		playerName: playerCharacterName,
		narrationTts,
		existingRegistry,
	});

	if (
		storyId &&
		registryChanged(existingRegistry, characterRegistry)
	) {
		void saveStoryCharacterTtsRegistry(storyId, characterRegistry);
	}

	const chapterMessages = getMessagesForChapterStartingAt(messages, messageId);
	const plan = buildChapterSpeechPlan(chapterMessages, {
		playerName: playerCharacterName,
		narrationTts,
		characterRegistry,
		allStoryMessages: messages,
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
