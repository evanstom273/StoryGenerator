import { getUniverseIds } from "./universeIds";
import type { EntityId, PlayerCharacter, Story, StoryChapter, Universe } from "../types/models";

export type LibrarySearchContentType = "all" | "story" | "universe" | "character";
export type LibrarySearchStoryStatus = "active" | "archived" | "all";
export type LibrarySearchStoryFeatures =
	| "all"
	| "rp"
	| "non-rp"
	| "mature"
	| "non-mature"
	| "has-summary"
	| "no-summary"
	| "prequel"
	| "playable"
	| "sequel"
	| "branch"
	| "guided-history"
	| "no-guided-history";
export type LibrarySearchUniverseMode = "all" | "referenced" | "custom";
export type LibrarySearchCharacterActivity = "all" | "active" | "idle";
export type LibrarySearchAutoIndexMode = "all" | "disabled" | "messages" | "chapter";
export type LibrarySearchSort =
	| "relevance"
	| "updated"
	| "created"
	| "alpha"
	| "alpha-desc"
	| "messages-asc"
	| "messages-desc"
	| "chapters-asc"
	| "chapters-desc"
	| "story-count-asc"
	| "story-count-desc"
	| "type";

export type LibrarySearchResultStats = {
	messageCount?: number;
	chapterCount?: number;
	storyCount?: number;
	characterCount?: number;
};

export type LibrarySearchResult = {
	type: "story" | "universe" | "character";
	id: EntityId;
	title: string;
	subtitle?: string;
	meta?: string;
	href: string;
	score: number;
	updatedAt: string;
	createdAt: string;
	badges: string[];
	stats: LibrarySearchResultStats;
};

export type LibrarySearchFilters = {
	query: string;
	contentType: LibrarySearchContentType;
	storyStatus: LibrarySearchStoryStatus;
	universeId: string;
	playerCharacterId: string;
	sort: LibrarySearchSort;
	storyFeatures: LibrarySearchStoryFeatures;
	universeMode: LibrarySearchUniverseMode;
	characterActivity: LibrarySearchCharacterActivity;
	autoIndexMode: LibrarySearchAutoIndexMode;
	minMessages: string;
	maxMessages: string;
	minChapters: string;
	maxChapters: string;
	minStories: string;
	maxStories: string;
};

type SearchContext = {
	stories: Story[];
	universes: Universe[];
	playerCharacters: PlayerCharacter[];
	getUniverseById: (id: EntityId) => Universe | undefined;
	getPlayerCharacterById: (id: EntityId) => PlayerCharacter | undefined;
	getMessagesForStory: (storyId: EntityId) => Array<{ id: EntityId }>;
	getChaptersForStory: (storyId: EntityId) => StoryChapter[];
};

type LibraryMetrics = {
	storyMessageCounts: Map<EntityId, number>;
	storyChapterCounts: Map<EntityId, number>;
	universeStoryCounts: Map<EntityId, number>;
	universeCharacterCounts: Map<EntityId, number>;
	characterStoryCounts: Map<EntityId, number>;
};

function normalizeQuery(query: string) {
	return query.trim().toLowerCase();
}

function parseOptionalNumber(value: string): number | null {
	const trimmed = value.trim();
	if (!trimmed) {
		return null;
	}
	const parsed = Number(trimmed);
	return Number.isFinite(parsed) ? parsed : null;
}

function withinRange(value: number, min: number | null, max: number | null) {
	if (min !== null && value < min) {
		return false;
	}
	if (max !== null && value > max) {
		return false;
	}
	return true;
}

function scoreTextMatch(query: string, value: string | undefined | null, weight: number) {
	if (!query || !value) {
		return 0;
	}
	const haystack = value.toLowerCase();
	if (haystack === query) {
		return weight * 3;
	}
	if (haystack.startsWith(query)) {
		return weight * 2;
	}
	if (haystack.includes(query)) {
		return weight;
	}
	return 0;
}

function scoreValues(query: string, values: Array<string | undefined | null>, weight: number) {
	return values.reduce((total, value) => total + scoreTextMatch(query, value, weight), 0);
}

function compareByDate(left: string, right: string) {
	return new Date(right).getTime() - new Date(left).getTime();
}

function compareNumeric(left: number, right: number) {
	return left - right;
}

function buildMetrics(context: SearchContext): LibraryMetrics {
	const storyMessageCounts = new Map<EntityId, number>();
	const storyChapterCounts = new Map<EntityId, number>();
	const universeStoryCounts = new Map<EntityId, number>();
	const universeCharacterCounts = new Map<EntityId, number>();
	const characterStoryCounts = new Map<EntityId, number>();

	for (const story of context.stories) {
		if (story.isArchived) {
			continue;
		}
		const messageCount = context.getMessagesForStory(story.id).length;
		const chapterCount = context.getChaptersForStory(story.id).length;
		storyMessageCounts.set(story.id, messageCount);
		storyChapterCounts.set(story.id, chapterCount);
		characterStoryCounts.set(
			story.playerCharacterId,
			(characterStoryCounts.get(story.playerCharacterId) ?? 0) + 1,
		);
		for (const universeId of getUniverseIds(story)) {
			universeStoryCounts.set(universeId, (universeStoryCounts.get(universeId) ?? 0) + 1);
		}
	}

	for (const character of context.playerCharacters) {
		if ((character.scope ?? "library") !== "library") {
			continue;
		}
		for (const universeId of getUniverseIds(character)) {
			universeCharacterCounts.set(
				universeId,
				(universeCharacterCounts.get(universeId) ?? 0) + 1,
			);
		}
	}

	return {
		storyMessageCounts,
		storyChapterCounts,
		universeStoryCounts,
		universeCharacterCounts,
		characterStoryCounts,
	};
}

function sortResults(results: LibrarySearchResult[], sort: LibrarySearchSort, hasQuery: boolean) {
	const items = [...results];

	const compareUpdated = (left: LibrarySearchResult, right: LibrarySearchResult) =>
		compareByDate(left.updatedAt, right.updatedAt);
	const compareCreated = (left: LibrarySearchResult, right: LibrarySearchResult) =>
		compareByDate(left.createdAt, right.createdAt);
	const compareAlpha = (left: LibrarySearchResult, right: LibrarySearchResult) =>
		left.title.localeCompare(right.title);

	if (sort === "relevance" && hasQuery) {
		items.sort((left, right) => right.score - left.score || compareUpdated(left, right));
		return items;
	}
	if (sort === "created") {
		items.sort(compareCreated);
		return items;
	}
	if (sort === "alpha") {
		items.sort(compareAlpha);
		return items;
	}
	if (sort === "alpha-desc") {
		items.sort((left, right) => compareAlpha(right, left));
		return items;
	}
	if (sort === "messages-asc" || sort === "messages-desc") {
		const direction = sort === "messages-asc" ? 1 : -1;
		items.sort(
			(left, right) =>
				direction * compareNumeric(left.stats.messageCount ?? -1, right.stats.messageCount ?? -1)
				|| compareUpdated(left, right),
		);
		return items;
	}
	if (sort === "chapters-asc" || sort === "chapters-desc") {
		const direction = sort === "chapters-asc" ? 1 : -1;
		items.sort(
			(left, right) =>
				direction * compareNumeric(left.stats.chapterCount ?? -1, right.stats.chapterCount ?? -1)
				|| compareUpdated(left, right),
		);
		return items;
	}
	if (sort === "story-count-asc" || sort === "story-count-desc") {
		const direction = sort === "story-count-asc" ? 1 : -1;
		items.sort(
			(left, right) =>
				direction * compareNumeric(left.stats.storyCount ?? -1, right.stats.storyCount ?? -1)
				|| compareAlpha(left, right),
		);
		return items;
	}
	if (sort === "type") {
		const typeOrder = { story: 0, universe: 1, character: 2 } as const;
		items.sort(
			(left, right) =>
				typeOrder[left.type] - typeOrder[right.type] || compareAlpha(left, right),
		);
		return items;
	}

	items.sort(compareUpdated);
	return items;
}

function storyMatchesStatus(story: Story, storyStatus: LibrarySearchStoryStatus) {
	if (storyStatus === "all") {
		return true;
	}
	if (storyStatus === "archived") {
		return Boolean(story.isArchived);
	}
	return !story.isArchived;
}

function storyMatchesFeatures(story: Story, storyFeatures: LibrarySearchStoryFeatures) {
	switch (storyFeatures) {
		case "all":
			return true;
		case "rp":
			return Boolean(story.rpMode);
		case "non-rp":
			return !story.rpMode;
		case "mature":
			return Boolean(story.matureFictionMode);
		case "non-mature":
			return !story.matureFictionMode;
		case "has-summary":
			return Boolean(story.currentSummary?.trim());
		case "no-summary":
			return !story.currentSummary?.trim();
		case "prequel":
			return story.readOnlyReason === "sequel_prequel";
		case "playable":
			return story.readOnlyReason !== "sequel_prequel";
		case "sequel":
			return story.lineageType === "sequel";
		case "branch":
			return story.lineageType === "branch";
		case "guided-history":
			return Boolean(story.guidedGenerationMeta?.historyChapterCount);
		case "no-guided-history":
			return !story.guidedGenerationMeta?.historyChapterCount;
		default:
			return true;
	}
}

function storyMatchesAutoIndex(story: Story, autoIndexMode: LibrarySearchAutoIndexMode) {
	if (autoIndexMode === "all") {
		return true;
	}
	const mode =
		story.autoIndexMode ??
		(story.autoIndexInterval === "disabled" ? "disabled" : "messages");
	return mode === autoIndexMode;
}

function matchesUniverse(universeIds: EntityId[], universeFilter: string) {
	if (universeFilter === "all") {
		return true;
	}
	return universeIds.includes(universeFilter);
}

function matchesPlayerCharacter(entityCharacterIds: EntityId[], playerCharacterFilter: string) {
	if (playerCharacterFilter === "all") {
		return true;
	}
	return entityCharacterIds.includes(playerCharacterFilter);
}

function formatMessageMeta(messageCount: number, chapterCount: number) {
	const parts = [`${messageCount} message${messageCount === 1 ? "" : "s"}`];
	if (chapterCount > 0) {
		parts.push(`${chapterCount} chapter${chapterCount === 1 ? "" : "s"}`);
	}
	return parts.join(" · ");
}

function searchStories(
	query: string,
	filters: LibrarySearchFilters,
	context: SearchContext,
	metrics: LibraryMetrics,
): LibrarySearchResult[] {
	const minMessages = parseOptionalNumber(filters.minMessages);
	const maxMessages = parseOptionalNumber(filters.maxMessages);
	const minChapters = parseOptionalNumber(filters.minChapters);
	const maxChapters = parseOptionalNumber(filters.maxChapters);

	return context.stories
		.filter((story) => storyMatchesStatus(story, filters.storyStatus))
		.filter((story) => storyMatchesFeatures(story, filters.storyFeatures))
		.filter((story) => storyMatchesAutoIndex(story, filters.autoIndexMode))
		.filter((story) => matchesUniverse(getUniverseIds(story), filters.universeId))
		.filter((story) => matchesPlayerCharacter([story.playerCharacterId], filters.playerCharacterId))
		.map((story) => {
			const universeNames = getUniverseIds(story)
				.map((id) => context.getUniverseById(id)?.name)
				.filter(Boolean)
				.join(", ");
			const characterName = context.getPlayerCharacterById(story.playerCharacterId)?.name;
			const messageCount = metrics.storyMessageCounts.get(story.id) ?? context.getMessagesForStory(story.id).length;
			const chapterCount = metrics.storyChapterCounts.get(story.id) ?? context.getChaptersForStory(story.id).length;
			const score = scoreValues(query, [story.title], 40)
				+ scoreValues(query, [story.currentSummary, universeNames, characterName, story.openingPrompt], 12)
				+ scoreValues(query, [story.readOnlyReason, story.lineageType], 4)
				+ (query && String(messageCount).includes(query) ? 8 : 0)
				+ (query && String(chapterCount).includes(query) ? 6 : 0);

			const badges: string[] = ["Story"];
			if (story.isArchived) {
				badges.push("Archived");
			}
			if (story.rpMode) {
				badges.push("RP");
			}
			if (story.matureFictionMode) {
				badges.push("Mature");
			}
			if (story.readOnlyReason === "sequel_prequel") {
				badges.push("Prequel");
			}
			if (story.lineageType === "sequel") {
				badges.push("Sequel");
			}
			if (story.lineageType === "branch") {
				badges.push("Branch");
			}
			if (story.guidedGenerationMeta?.historyChapterCount) {
				badges.push("Guided history");
			}

			const metaParts = [characterName, formatMessageMeta(messageCount, chapterCount)].filter(Boolean);

			return {
				type: "story" as const,
				id: story.id,
				title: story.title,
				subtitle: universeNames || undefined,
				meta: metaParts.join(" · ") || undefined,
				href: `/stories/${story.id}`,
				score,
				updatedAt: story.updatedAt,
				createdAt: story.createdAt,
				badges,
				stats: {
					messageCount,
					chapterCount,
				},
			};
		})
		.filter((result) => {
			if (query && result.score <= 0) {
				return false;
			}
			const messageCount = result.stats.messageCount ?? 0;
			const chapterCount = result.stats.chapterCount ?? 0;
			return withinRange(messageCount, minMessages, maxMessages)
				&& withinRange(chapterCount, minChapters, maxChapters);
		});
}

function searchUniverses(
	query: string,
	filters: LibrarySearchFilters,
	context: SearchContext,
	metrics: LibraryMetrics,
): LibrarySearchResult[] {
	const minStories = parseOptionalNumber(filters.minStories);
	const maxStories = parseOptionalNumber(filters.maxStories);

	return context.universes
		.filter((universe) => matchesUniverse([universe.id], filters.universeId))
		.filter((universe) => {
			if (filters.universeMode === "all") {
				return true;
			}
			return (universe.mode ?? "custom") === filters.universeMode;
		})
		.map((universe) => {
			const wikiLabels = (universe.wikiUrls ?? []).map((source) => source.label).filter(Boolean);
			const storyCount = metrics.universeStoryCounts.get(universe.id) ?? 0;
			const characterCount = metrics.universeCharacterCounts.get(universe.id) ?? 0;
			const score = scoreValues(query, [universe.name], 40)
				+ scoreValues(
					query,
					[
						universe.description,
						universe.concept,
						universe.genreTheme,
						universe.tone,
						universe.universeBlueprint,
						universe.notes,
						universe.wikiUrl,
						...wikiLabels,
					],
					12,
				)
				+ (query && String(storyCount).includes(query) ? 6 : 0);

			const badges = ["Universe"];
			if (universe.mode === "referenced") {
				badges.push("Referenced");
			} else {
				badges.push("Custom");
			}

			return {
				type: "universe" as const,
				id: universe.id,
				title: universe.name,
				subtitle: universe.genreTheme || universe.concept || undefined,
				meta: `${storyCount} active ${storyCount === 1 ? "story" : "stories"} · ${characterCount} ${characterCount === 1 ? "character" : "characters"}`,
				href: `/universes/${universe.id}`,
				score,
				updatedAt: universe.createdAt,
				createdAt: universe.createdAt,
				badges,
				stats: {
					storyCount,
					characterCount,
				},
			};
		})
		.filter((result) => {
			if (query && result.score <= 0) {
				return false;
			}
			const storyCount = result.stats.storyCount ?? 0;
			return withinRange(storyCount, minStories, maxStories);
		});
}

function searchCharacters(
	query: string,
	filters: LibrarySearchFilters,
	context: SearchContext,
	metrics: LibraryMetrics,
): LibrarySearchResult[] {
	const minStories = parseOptionalNumber(filters.minStories);
	const maxStories = parseOptionalNumber(filters.maxStories);

	return context.playerCharacters
		.filter((character) => (character.scope ?? "library") === "library")
		.filter((character) => matchesUniverse(getUniverseIds(character), filters.universeId))
		.filter((character) => matchesPlayerCharacter([character.id], filters.playerCharacterId))
		.filter((character) => {
			const storyCount = metrics.characterStoryCounts.get(character.id) ?? 0;
			if (filters.characterActivity === "active") {
				return storyCount > 0;
			}
			if (filters.characterActivity === "idle") {
				return storyCount === 0;
			}
			return true;
		})
		.map((character) => {
			const universeNames = getUniverseIds(character)
				.map((id) => context.getUniverseById(id)?.name)
				.filter(Boolean)
				.join(", ");
			const storyCount = metrics.characterStoryCounts.get(character.id) ?? 0;
			const score = scoreValues(query, [character.name], 40)
				+ scoreValues(
					query,
					[
						...(character.aliases ?? []),
						character.characterConcept,
						character.background,
						character.notes,
						character.appearance,
						character.personality,
						character.gender,
						character.pronouns,
						character.species,
						character.age,
						universeNames,
					],
					12,
				)
				+ (query && String(storyCount).includes(query) ? 6 : 0);

			return {
				type: "character" as const,
				id: character.id,
				title: character.name,
				subtitle: universeNames || undefined,
				meta: [
					character.characterConcept?.slice(0, 120),
					`${storyCount} active ${storyCount === 1 ? "story" : "stories"}`,
				]
					.filter(Boolean)
					.join(" · "),
				href: `/player-characters/${character.id}`,
				score,
				updatedAt: character.createdAt,
				createdAt: character.createdAt,
				badges: storyCount > 0 ? ["Character", "In play"] : ["Character", "Idle"],
				stats: {
					storyCount,
				},
			};
		})
		.filter((result) => {
			if (query && result.score <= 0) {
				return false;
			}
			const storyCount = result.stats.storyCount ?? 0;
			return withinRange(storyCount, minStories, maxStories);
		});
}

export function searchLibrary(
	filters: LibrarySearchFilters,
	context: SearchContext,
): LibrarySearchResult[] {
	const query = normalizeQuery(filters.query);
	const hasQuery = Boolean(query);
	const metrics = buildMetrics(context);
	const results: LibrarySearchResult[] = [];

	if (filters.contentType === "all" || filters.contentType === "story") {
		results.push(...searchStories(query, filters, context, metrics));
	}
	if (filters.contentType === "all" || filters.contentType === "universe") {
		results.push(...searchUniverses(query, filters, context, metrics));
	}
	if (filters.contentType === "all" || filters.contentType === "character") {
		results.push(...searchCharacters(query, filters, context, metrics));
	}

	return sortResults(results, filters.sort, hasQuery);
}

export const DEFAULT_LIBRARY_SEARCH_FILTERS: LibrarySearchFilters = {
	query: "",
	contentType: "all",
	storyStatus: "active",
	universeId: "all",
	playerCharacterId: "all",
	sort: "relevance",
	storyFeatures: "all",
	universeMode: "all",
	characterActivity: "all",
	autoIndexMode: "all",
	minMessages: "",
	maxMessages: "",
	minChapters: "",
	maxChapters: "",
	minStories: "",
	maxStories: "",
};

export const LIBRARY_SEARCH_MESSAGE_PRESETS = ["10", "25", "50", "100", "250", "500", "1000"] as const;
export const LIBRARY_SEARCH_CHAPTER_PRESETS = ["1", "3", "5", "10", "20"] as const;
export const LIBRARY_SEARCH_STORY_COUNT_PRESETS = ["1", "2", "3", "5", "10"] as const;
