import type { EntityId, PlayerCharacter, Story } from "../types/models";
import { normalizeStoryImportedCharacterIds } from "./storyImportedCharacters";
import { characterMatchesUniverses, getUniverseIds } from "./universeIds";

/**
 * Library sheets a story's player character can be switched to: the same rule the
 * story-start picker uses (library scope, sharing one of the story's universes),
 * minus the current player character.
 */
export function getSwappablePlayerCharacters(
	story: Pick<Story, "universeId" | "universeIds" | "playerCharacterId">,
	characters: readonly PlayerCharacter[],
): PlayerCharacter[] {
	const universeIds = getUniverseIds(story);
	return characters.filter(
		(character) =>
			character.id !== story.playerCharacterId &&
			(character.scope ?? "library") === "library" &&
			characterMatchesUniverses(character, universeIds),
	);
}

/**
 * The story and runtime state after switching the player character. The transcript
 * is untouched. An identity override recorded for the old character is dropped, and
 * the new character cannot also be one of the story's imported characters.
 */
export function buildPlayerCharacterSwap(params: {
	story: Story;
	state: Record<string, any> | null;
	nextCharacter: PlayerCharacter;
	now: string;
}): { story: Story; state: Record<string, any> | null } {
	const { story, state, nextCharacter, now } = params;
	if (nextCharacter.id === story.playerCharacterId) {
		throw new Error("That character is already this story's player character.");
	}
	if (!getSwappablePlayerCharacters(story, [nextCharacter]).length) {
		throw new Error("Choose a library character from this story's universe.");
	}

	const importedCharacterIds = normalizeStoryImportedCharacterIds(story.importedCharacterIds).filter(
		(id: EntityId) => id !== nextCharacter.id,
	);
	const nextStory: Story = { ...story, playerCharacterId: nextCharacter.id, updatedAt: now };
	if (importedCharacterIds.length) {
		nextStory.importedCharacterIds = importedCharacterIds;
	} else {
		delete nextStory.importedCharacterIds;
	}

	let nextState = state;
	if (state?.playerIdentityOverride) {
		nextState = { ...state };
		delete nextState.playerIdentityOverride;
	}

	return { story: nextStory, state: nextState };
}

/** True when a sheet has nothing beyond its name, so the AI would know only the name. */
export function isPlayerCharacterSheetEmpty(character: PlayerCharacter) {
	return [
		character.characterConcept,
		character.appearance,
		character.personality,
		character.background,
		character.goals,
		character.notes,
		character.age,
		character.gender,
		character.pronouns,
		character.species,
	].every((value) => !value?.trim());
}
