import type { EntityId, Story, StoryChapter, StoryMessage } from "../types/models";
import { sortByTimestampAsc } from "./dates";
import { createEntityId } from "./ids";
import { applyAuthorDirectivesToStoryState } from "./storyText/authorDirectives";

export interface BranchRecords {
	story: Story;
	messages: StoryMessage[];
	chapters: StoryChapter[];
	/** Runtime state for the branch, or null when the original had none. */
	state: Record<string, any> | null;
}

/**
 * Builds the records for a branch that copies the original story up to and
 * including `fromMessageId`. Nothing after the branch point is carried over:
 * author declarations are rebuilt from the copied messages and a player identity
 * change made later is dropped. The Story Index is deliberately not copied; the
 * caller rebuilds it from the copied transcript.
 */
export function buildBranchRecords(params: {
	story: Story;
	messages: StoryMessage[];
	chapters: StoryChapter[];
	state: Record<string, any> | null;
	fromMessageId: EntityId;
	newStoryId: EntityId;
	title: string;
	now: string;
}): BranchRecords {
	const { story, chapters, state, fromMessageId, newStoryId, now } = params;
	const sorted = sortByTimestampAsc(params.messages);
	const cutIndex = sorted.findIndex((message) => message.id === fromMessageId);
	if (cutIndex < 0) {
		throw new Error("The message to branch from could not be found in this story.");
	}

	const idMap = new Map<EntityId, EntityId>();
	const messages = sorted.slice(0, cutIndex + 1).map((message) => {
		const id = createEntityId("story-message");
		idMap.set(message.id, id);
		return { ...message, id, storyId: newStoryId };
	});

	const branchChapters = chapters
		.filter((chapter) => idMap.has(chapter.endsAtMessageId))
		.map((chapter) => ({
			...chapter,
			id: createEntityId("story-chapter"),
			storyId: newStoryId,
			endsAtMessageId: idMap.get(chapter.endsAtMessageId)!,
		}));

	let branchState: Record<string, any> | null = null;
	if (state) {
		branchState = applyAuthorDirectivesToStoryState(state, messages) as Record<string, any>;
		const override = branchState.playerIdentityOverride;
		if (override?.sourceMessageId) {
			const remapped = idMap.get(override.sourceMessageId);
			if (remapped) {
				branchState.playerIdentityOverride = { ...override, sourceMessageId: remapped };
			} else {
				delete branchState.playerIdentityOverride;
			}
		}
	}

	return {
		story: {
			...story,
			id: newStoryId,
			title: params.title.trim(),
			parentStoryId: story.id,
			lineageKind: "branch",
			branchedFromMessageId: fromMessageId,
			isArchived: false,
			isFavorite: false,
			guidedGenerationMeta: undefined,
			createdAt: now,
			updatedAt: now,
		},
		messages,
		chapters: branchChapters,
		state: branchState,
	};
}

/**
 * The story whose index a full re-index should inherit from. Sequels inherit their
 * parent's index; branches are copies, so they skip past their branch ancestors
 * and inherit whatever the story they branched from inherited (if anything).
 */
export async function resolveIndexInheritanceParentId(
	story: Pick<Story, "id" | "parentStoryId" | "lineageKind">,
	getStory: (id: EntityId) => Promise<Pick<Story, "id" | "parentStoryId" | "lineageKind"> | null | undefined>,
): Promise<EntityId | null> {
	let current: Pick<Story, "id" | "parentStoryId" | "lineageKind"> | null | undefined = story;
	const seen = new Set<EntityId>();
	while (current?.lineageKind === "branch" && current.parentStoryId && !seen.has(current.id)) {
		seen.add(current.id);
		current = await getStory(current.parentStoryId);
	}
	return current?.parentStoryId ?? null;
}
