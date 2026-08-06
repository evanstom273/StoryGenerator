import { getUniverseIds } from "./universeIds";
import type { EntityId, PlayerCharacter, Story, Universe } from "../types/models";

export type LibrarySearchContentType = "all" | "story" | "universe" | "character";
export type LibrarySearchStoryStatus = "active" | "archived" | "all";
export type LibrarySearchSort = "relevance" | "updated" | "created" | "alpha";

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
};

export type LibrarySearchFilters = {
	query: string;
	contentType: LibrarySearchContentType;
	storyStatus: LibrarySearchStoryStatus;
	universeId: string;
	sort: LibrarySearchSort;
};

type SearchContext = {
	stories: Story[];
	universes: Universe[];
	playerCharacters: PlayerCharacter[];
	getUniverseById: (id: EntityId) => Universe | undefined;
	getPlayerCharacterById: (id: EntityId) => PlayerCharacter | undefined;
};

function normalizeQuery(query: string) {
	return query.trim().toLowerCase();
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

function sortResults(results: LibrarySearchResult[], sort: LibrarySearchSort, hasQuery: boolean) {
	const items = [...results];
	if (sort === "relevance" && hasQuery) {
		items.sort((left, right) => right.score - left.score || compareByDate(left.updatedAt, right.updatedAt));
		return items;
	}
	if (sort === "created") {
		items.sort((left, right) => compareByDate(left.createdAt, right.createdAt));
		return items;
	}
	if (sort === "alpha") {
		items.sort((left, right) => left.title.localeCompare(right.title));
		return items;
	}
	items.sort((left, right) => compareByDate(left.updatedAt, right.updatedAt));
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

function matchesUniverse(
	universeIds: EntityId[],
	universeFilter: string,
) {
	if (universeFilter === "all") {
		return true;
	}
	return universeIds.includes(universeFilter);
}

function searchStories(
	query: string,
	filters: LibrarySearchFilters,
	context: SearchContext,
): LibrarySearchResult[] {
	return context.stories
		.filter((story) => storyMatchesStatus(story, filters.storyStatus))
		.filter((story) => matchesUniverse(getUniverseIds(story), filters.universeId))
		.map((story) => {
			const universeNames = getUniverseIds(story)
				.map((id) => context.getUniverseById(id)?.name)
				.filter(Boolean)
				.join(", ");
			const characterName = context.getPlayerCharacterById(story.playerCharacterId)?.name;
			const score = scoreValues(query, [story.title], 40)
				+ scoreValues(query, [story.currentSummary, universeNames, characterName], 12)
				+ scoreValues(query, [story.readOnlyReason], 4);

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

			return {
				type: "story" as const,
				id: story.id,
				title: story.title,
				subtitle: universeNames || undefined,
				meta: characterName || undefined,
				href: `/stories/${story.id}`,
				score,
				updatedAt: story.updatedAt,
				createdAt: story.createdAt,
				badges,
			};
		})
		.filter((result) => !query || result.score > 0);
}

function searchUniverses(
	query: string,
	filters: LibrarySearchFilters,
	context: SearchContext,
): LibrarySearchResult[] {
	return context.universes
		.filter((universe) => matchesUniverse([universe.id], filters.universeId))
		.map((universe) => {
			const wikiLabels = (universe.wikiUrls ?? []).map((source) => source.label).filter(Boolean);
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
				);

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
				meta: universe.description?.slice(0, 120) || undefined,
				href: `/universes/${universe.id}`,
				score,
				updatedAt: universe.createdAt,
				createdAt: universe.createdAt,
				badges,
			};
		})
		.filter((result) => !query || result.score > 0);
}

function searchCharacters(
	query: string,
	filters: LibrarySearchFilters,
	context: SearchContext,
): LibrarySearchResult[] {
	return context.playerCharacters
		.filter((character) => (character.scope ?? "library") === "library")
		.filter((character) => {
			if (filters.universeId === "all") {
				return true;
			}
			return getUniverseIds(character).includes(filters.universeId);
		})
		.map((character) => {
			const universeNames = getUniverseIds(character)
				.map((id) => context.getUniverseById(id)?.name)
				.filter(Boolean)
				.join(", ");
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
				);

			return {
				type: "character" as const,
				id: character.id,
				title: character.name,
				subtitle: universeNames || undefined,
				meta: character.characterConcept?.slice(0, 120) || undefined,
				href: `/player-characters/${character.id}`,
				score,
				updatedAt: character.createdAt,
				createdAt: character.createdAt,
				badges: ["Character"],
			};
		})
		.filter((result) => !query || result.score > 0);
}

export function searchLibrary(
	filters: LibrarySearchFilters,
	context: SearchContext,
): LibrarySearchResult[] {
	const query = normalizeQuery(filters.query);
	const hasQuery = Boolean(query);
	const results: LibrarySearchResult[] = [];

	if (filters.contentType === "all" || filters.contentType === "story") {
		results.push(...searchStories(query, filters, context));
	}
	if (filters.contentType === "all" || filters.contentType === "universe") {
		results.push(...searchUniverses(query, filters, context));
	}
	if (filters.contentType === "all" || filters.contentType === "character") {
		results.push(...searchCharacters(query, filters, context));
	}

	return sortResults(results, filters.sort, hasQuery);
}

export const DEFAULT_LIBRARY_SEARCH_FILTERS: LibrarySearchFilters = {
	query: "",
	contentType: "all",
	storyStatus: "active",
	universeId: "all",
	sort: "relevance",
};
