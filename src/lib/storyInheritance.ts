import type { EntityId, StoryIndex } from "../types/models";

/**
 * Creates the derived-memory baseline for a sequel.
 *
 * Historical chapter summaries keep their original story provenance. Character
 * and relationship records are copied as the sequel's starting continuity
 * state, while indexing progress is reset because the sequel has its own
 * transcript and message IDs.
 */
export function createInheritedStoryIndex(params: {
  parentIndex: StoryIndex;
  parentStoryId: EntityId;
  childStoryId: EntityId;
  parentStoryTitle?: string;
  inheritedAt?: string;
}): StoryIndex {
  const { parentIndex, parentStoryId, childStoryId } = params;
  const inheritedAt = params.inheritedAt ?? new Date().toISOString();

  return {
    id: `story-index:${childStoryId}`,
    storyId: childStoryId,
    chapterSummaries: parentIndex.chapterSummaries.map((summary) => ({
      ...summary,
      originStoryId: summary.originStoryId ?? parentStoryId,
      originStoryTitle: summary.originStoryTitle ?? params.parentStoryTitle,
      sourceMessageIds: [...summary.sourceMessageIds],
    })),
    characters: parentIndex.characters.map((character) => ({
      ...character,
      aliases: [...character.aliases],
      developments: [...character.developments],
      provenance: [...character.provenance],
    })),
    relationships: parentIndex.relationships.map((relationship) => ({
      ...relationship,
      developments: [...relationship.developments],
      provenance: [...relationship.provenance],
    })),
    indexedMessageCount: 0,
    inheritedFromStoryId: parentStoryId,
    inheritedAt,
    updatedAt: inheritedAt,
  };
}
