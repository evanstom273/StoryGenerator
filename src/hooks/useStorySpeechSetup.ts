import { useEffect, useState } from "react";
import type { StoryMessage } from "../types/models";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";
import { resolveGeminiNarrationTtsSettings } from "../lib/ai/geminiTtsVoices";
import {
	buildCharacterGenderHintsFromStoryState,
	registryChanged,
	type CharacterTtsGenderMap,
	type CharacterTtsRegistry,
} from "../lib/ai/characterTtsVoices";
import { buildCharacterTtsRegistryForStory } from "../lib/storyText/messageSpeechText";
import { safeParseStoryStateData } from "../lib/storyStateV2";
import {
	clampAudiobookParallelChapters,
	DEFAULT_AUDIOBOOK_PARALLEL_CHAPTERS,
} from "../lib/ai/storyAudiobookParallel";

export function useStorySpeechSetup(messages: StoryMessage[], playerCharacterName: string) {
	const {
		aiSettings,
		getStoryCharacterTtsRegistry,
		saveStoryCharacterTtsRegistry,
		fetchStoryState,
		getStoryById,
		getPlayerCharacterById,
		getStoryAIConfig,
	} = useStoryEngine();
	const narrationTts = resolveGeminiNarrationTtsSettings(aiSettings?.geminiNarrationTts);
	const storyId = messages[0]?.storyId;
	const existingRegistry = storyId ? getStoryCharacterTtsRegistry(storyId) : undefined;
	const story = storyId ? getStoryById(storyId) : undefined;
	const playerCharacter = story?.playerCharacterId
		? getPlayerCharacterById(story.playerCharacterId)
		: undefined;
	const [characterGenders, setCharacterGenders] = useState<CharacterTtsGenderMap>({});
	const [audiobookParallelChapters, setAudiobookParallelChapters] = useState(
		DEFAULT_AUDIOBOOK_PARALLEL_CHAPTERS,
	);

	useEffect(() => {
		if (!storyId) {
			setAudiobookParallelChapters(DEFAULT_AUDIOBOOK_PARALLEL_CHAPTERS);
			return;
		}

		let cancelled = false;

		void getStoryAIConfig(storyId).then((config) => {
			if (cancelled) {
				return;
			}

			setAudiobookParallelChapters(
				clampAudiobookParallelChapters(config?.audiobookParallelChapters),
			);
		});

		return () => {
			cancelled = true;
		};
	}, [getStoryAIConfig, storyId]);

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

	const characterRegistry: CharacterTtsRegistry = buildCharacterTtsRegistryForStory(messages, {
		playerName: playerCharacterName,
		narrationTts,
		existingRegistry,
		characterGenders,
	});

	if (storyId && registryChanged(existingRegistry, characterRegistry)) {
		void saveStoryCharacterTtsRegistry(storyId, characterRegistry);
	}

	return {
		narrationTts,
		storyId,
		storyTitle: story?.title ?? "Story",
		characterRegistry,
		hasGeminiKey: Boolean(aiSettings?.apiKeys?.gemini?.trim()),
		audiobookParallelChapters,
	};
}
