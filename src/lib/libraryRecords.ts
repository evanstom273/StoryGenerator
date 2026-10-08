import type {
  PlayerCharacter,
  PlayerCharacterDraft,
  Universe,
  UniverseDraft,
  Story,
} from "../types/models";
import { createEntityId } from "./ids";
import { normalizeUniverseIds, getUniverseIds } from "./universeIds";
import {
  normalizeUniverseWikiSources,
  getPrimaryUniverseWikiUrl,
} from "./universeSources";
import {
  normalizePlayerCharacterAliases,
  normalizePlayerCharacterKnownTies,
} from "./playerCharacterPrompt";

function applyUniverseIdsFromDraft<
  T extends { universeId: string; universeIds?: string[] },
>(draft: { universeId: string; universeIds?: string[] }, entity: T): T {
  const universeIds = normalizeUniverseIds(
    draft.universeIds?.length ? draft.universeIds : [draft.universeId],
  );
  return {
    ...entity,
    universeId: universeIds[0] ?? draft.universeId,
    universeIds,
  };
}

export function createUniverseRecord(draft: UniverseDraft): Universe {
  const mode = draft.mode ?? "referenced";
  const concept = (draft.concept ?? "").trim();
  const description =
    (draft.description ?? "").trim() || (mode === "custom" ? concept : "");
  const wikiUrls = normalizeUniverseWikiSources(draft);
  const nextUniverse: Universe = {
    id: createEntityId("universe"),
    name: draft.name.trim(),
    description,
    wikiUrl: getPrimaryUniverseWikiUrl({ wikiUrl: draft.wikiUrl, wikiUrls }),
    wikiUrls,
    mode,
    concept: mode === "custom" && concept ? concept : undefined,
    genreTheme: draft.genreTheme?.trim() || undefined,
    tone: draft.tone?.trim() || undefined,
    universeBlueprint: draft.universeBlueprint?.trim() || undefined,
    notes: draft.notes?.trim() || undefined,
    importedLore: [],
    importedCharacters: [],
    importedLocations: [],
    importedRelationships: [],
    createdAt: new Date().toISOString(),
  };
  return nextUniverse;
}

export function updateUniverseRecord(
  draft: UniverseDraft,
  currentUniverse: Universe,
): Universe {
  const mode = draft.mode ?? currentUniverse.mode ?? "referenced";
  const concept =
    typeof draft.concept === "string"
      ? draft.concept.trim()
      : (currentUniverse.concept ?? "").trim();
  const draftDescription =
    typeof draft.description === "string" ? draft.description.trim() : "";
  const description =
    draftDescription ||
    (mode === "custom" ? concept : currentUniverse.description.trim());
  const wikiUrls = normalizeUniverseWikiSources({
    wikiUrl:
      typeof draft.wikiUrl === "string"
        ? draft.wikiUrl
        : currentUniverse.wikiUrl,
    wikiUrls: draft.wikiUrls ?? currentUniverse.wikiUrls,
  });
  const nextUniverse: Universe = {
    ...currentUniverse,
    name: draft.name.trim(),
    description,
    wikiUrl: getPrimaryUniverseWikiUrl({
      wikiUrl:
        typeof draft.wikiUrl === "string"
          ? draft.wikiUrl
          : currentUniverse.wikiUrl,
      wikiUrls,
    }),
    wikiUrls,
    mode,
    concept: mode === "custom" && concept ? concept : undefined,
    genreTheme: draft.genreTheme?.trim() || undefined,
    tone: draft.tone?.trim() || undefined,
    universeBlueprint: draft.universeBlueprint?.trim() || undefined,
    notes: draft.notes?.trim() || undefined,
  };
  return nextUniverse;
}

export function createCharacterRecord(
  draft: PlayerCharacterDraft,
): PlayerCharacter {
  const nextCharacter = applyUniverseIdsFromDraft(draft, {
    id: createEntityId("player-character"),
    name: draft.name.trim(),
    aliases: normalizePlayerCharacterAliases(draft.aliases),
    knownTies: normalizePlayerCharacterKnownTies(draft.knownTies),
    age: draft.age.trim(),
    gender: draft.gender.trim(),
    species: draft.species?.trim() ?? "",
    pronouns: draft.pronouns.trim(),
    characterConcept: draft.characterConcept?.trim() || undefined,
    appearance: draft.appearance.trim(),
    personality: draft.personality.trim(),
    background: draft.background.trim(),
    goals: "",
    notes: draft.notes.trim(),
    universeId: draft.universeId,
    scope: draft.scope ?? "library",
    storyId: draft.storyId,
    createdAt: new Date().toISOString(),
  } satisfies PlayerCharacter);
  return nextCharacter;
}

export function updateCharacterRecord(
  draft: PlayerCharacterDraft,
  currentCharacter: PlayerCharacter,
): PlayerCharacter {
  const nextCharacter = applyUniverseIdsFromDraft(draft, {
    ...currentCharacter,
    name: draft.name.trim(),
    aliases: normalizePlayerCharacterAliases(draft.aliases),
    knownTies: normalizePlayerCharacterKnownTies(draft.knownTies),
    age: draft.age.trim(),
    gender: draft.gender.trim(),
    species: draft.species?.trim() ?? "",
    pronouns: draft.pronouns.trim(),
    characterConcept: draft.characterConcept?.trim() || undefined,
    appearance: draft.appearance.trim(),
    personality: draft.personality.trim(),
    background: draft.background.trim(),
    goals: currentCharacter.goals,
    notes: draft.notes.trim(),
    universeId: draft.universeId,
    scope: draft.scope ?? currentCharacter.scope ?? "library",
    storyId: draft.storyId ?? currentCharacter.storyId,
  });
  return nextCharacter;
}

export function characterDeletionReason(
  id: string,
  stories: Story[],
): string | undefined {
  if (
    stories.some(
      (story) =>
        story.playerCharacterId === id ||
        story.importedCharacterIds?.includes(id),
    )
  ) {
    return "Remove or reassign linked stories before deleting this character.";
  }
}
export function universeDeletionReason(
  id: string,
  stories: Story[],
  characters: PlayerCharacter[],
): string | undefined {
  if (
    stories.some((story) => getUniverseIds(story).includes(id)) ||
    characters.some((character) => getUniverseIds(character).includes(id))
  ) {
    return "Remove or reassign linked characters and stories before deleting this universe.";
  }
}
