import type { StoryEncyclopedia } from "../../types/models";
import { safeParseStoryStateData } from "../storyStateV2";
import { isEncyclopediaIndexed } from "./encyclopediaMerge";

export function parseStoryEncyclopedia(stateJson: string | undefined | null): StoryEncyclopedia | undefined {
	if (!stateJson?.trim()) return undefined;
	const parsed = safeParseStoryStateData(stateJson);
	return parsed?.encyclopedia;
}

export function isStoryEncyclopediaIndexed(stateJson: string | undefined | null): boolean {
	return isEncyclopediaIndexed(parseStoryEncyclopedia(stateJson));
}
