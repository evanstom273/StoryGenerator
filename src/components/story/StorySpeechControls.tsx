import { useEffect, useState } from "react";
import type { StoryMessage } from "../../types/models";
import { useStoryEngine } from "../../app/providers/StoryEngineProvider";
import { resolveGeminiNarrationTtsSettings } from "../../lib/ai/geminiTtsVoices";
import {
	buildCharacterGenderHintsFromStoryState,
	registryChanged,
	type CharacterTtsGenderMap,
} from "../../lib/ai/characterTtsVoices";
import {
	buildChapterSpeechPlan,
	buildCharacterTtsRegistryForStory,
} from "../../lib/storyText/messageSpeechText";
import { getMessagesForChapterStartingAt } from "../../lib/storyText/chapterNavigation";
import { safeParseStoryStateData } from "../../lib/storyStateV2";
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
	const {
		aiSettings,
		getStoryCharacterTtsRegistry,
		saveStoryCharacterTtsRegistry,
		fetchStoryState,
		getStoryById,
		getPlayerCharacterById,
	} = useStoryEngine();
	const narrationTts = resolveGeminiNarrationTtsSettings(aiSettings?.geminiNarrationTts);
	const storyId = messages[0]?.storyId;
	const existingRegistry = storyId ? getStoryCharacterTtsRegistry(storyId) : undefined;
	const story = storyId ? getStoryById(storyId) : undefined;
	const playerCharacter = story?.playerCharacterId
		? getPlayerCharacterById(story.playerCharacterId)
		: undefined;
	const [characterGenders, setCharacterGenders] = useState<CharacterTtsGenderMap>({});

	useEffect(() => {
		if (!storyId) {
			setCharacterGenders({});
			return;
		}

		let cancelled = false;

		void fetchStoryState(storyId).then((storyState) => {
			if (cancelled) {
				return;
			}

			const parsed = storyState?.stateJson ? safeParseStoryStateData(storyState.stateJson) : null;
			setCharacterGenders(
				buildCharacterGenderHintsFromStoryState(parsed, {
					playerName: playerCharacterName,
					playerGender: playerCharacter?.gender,
					playerPronouns: playerCharacter?.pronouns,
				}),
			);
		});

		return () => {
			cancelled = true;
		};
	}, [
		fetchStoryState,
		playerCharacter?.gender,
		playerCharacter?.pronouns,
		playerCharacterName,
		storyId,
	]);

	const characterRegistry = buildCharacterTtsRegistryForStory(messages, {
		playerName: playerCharacterName,
		narrationTts,
		existingRegistry,
		characterGenders,
	});

	if (storyId && registryChanged(existingRegistry, characterRegistry)) {
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
