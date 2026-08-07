import type {
	PlayerCharacter,
	RelationshipIndexEntry,
	StoryAuthorDirectiveState,
	StoryMessage,
	StoryStateDataV2,
} from "../types/models";
import { normalizePlayerCharacterAliases, resolvePlayerCharacterSceneName } from "./playerCharacterPrompt";
import { isAuthorDirectiveMessage } from "./storyText/authorDirectives";
import { isContinueMessage } from "./storyText/continueMode";
import { isDirectorMessage, isPlayerLegalNameDirectorBeat } from "./storyText/directorMode";
import { extractSpeakerPrefix } from "./storyText/extractSpeakerPrefix";

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeName(value: string): string {
	return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function nameTokens(value: string): string[] {
	return value.trim().split(/\s+/).filter(Boolean);
}

function collectNameVariants(...names: Array<string | null | undefined>): string[] {
	const seen = new Set<string>();
	const variants: string[] = [];

	for (const raw of names) {
		const trimmed = raw?.trim() ?? "";
		if (!trimmed) {
			continue;
		}

		const key = normalizeName(trimmed);
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		variants.push(trimmed);

		const tokens = nameTokens(trimmed);
		const first = tokens[0] ?? "";
		if (first.length >= 2 && !seen.has(normalizeName(first))) {
			seen.add(normalizeName(first));
			variants.push(first);
		}
	}

	return variants.sort((left, right) => right.length - left.length);
}

function buildMentionPattern(variants: string[]): RegExp | null {
	const parts = variants
		.map((variant) => escapeRegex(variant.trim()))
		.filter((variant) => variant.length >= 2);
	if (!parts.length) {
		return null;
	}
	return new RegExp(`\\b(?:${parts.join("|")})\\b`, "i");
}

export function textMentionsAnyName(text: string, variants: string[]): boolean {
	const trimmed = text.trim();
	if (!trimmed || !variants.length) {
		return false;
	}

	const pattern = buildMentionPattern(variants);
	return pattern ? pattern.test(trimmed) : false;
}

function isMetaTranscriptMessage(
	message: StoryMessage,
	opts: { playerLegalName: string; playerSceneName: string },
): boolean {
	if (message.role === "system" || message.speakerType === "system") {
		return true;
	}

	if (message.role !== "user") {
		return false;
	}

	if (
		isDirectorMessage(message) ||
		isContinueMessage(message) ||
		isAuthorDirectiveMessage(message)
	) {
		return true;
	}

	return isPlayerLegalNameDirectorBeat(message, opts.playerLegalName, opts.playerSceneName);
}

export function buildPlayerPresenceVariants(
	playerCharacter: Pick<PlayerCharacter, "name" | "aliases">,
	storyState?: StoryStateDataV2 | null,
): string[] {
	const legalName = playerCharacter.name.trim();
	const sceneName = resolvePlayerCharacterSceneName(playerCharacter, { storyState });
	const stateEntry = storyState?.characters?.[legalName];
	return collectNameVariants(
		legalName,
		sceneName,
		stateEntry?.narrativeName,
		stateEntry?.displayName,
		...normalizePlayerCharacterAliases(playerCharacter.aliases),
		...(stateEntry?.aliases ?? []),
	);
}

export function isPlayerPresentInTranscript(
	messages: StoryMessage[],
	playerCharacter: Pick<PlayerCharacter, "name" | "aliases">,
	opts?: { messageCount?: number; storyState?: StoryStateDataV2 | null },
): boolean {
	const legalName = playerCharacter.name.trim();
	const sceneName = resolvePlayerCharacterSceneName(playerCharacter, {
		storyState: opts?.storyState,
		recentMessages: messages,
	});
	if (!legalName) {
		return false;
	}

	const limit = opts?.messageCount ?? messages.length;
	const variants = buildPlayerPresenceVariants(playerCharacter, opts?.storyState);
	const metaOpts = { playerLegalName: legalName, playerSceneName: sceneName };

	for (let index = 0; index < Math.min(limit, messages.length); index += 1) {
		const message = messages[index]!;
		if (isMetaTranscriptMessage(message, metaOpts)) {
			continue;
		}

		const speaker =
			message.speakerName?.trim() || extractSpeakerPrefix(message.content)?.speakerLabel?.trim() || "";
		if (speaker && textMentionsAnyName(speaker, variants)) {
			if (message.role === "user" && !isMetaTranscriptMessage(message, metaOpts)) {
				return true;
			}
			if (message.role === "assistant") {
				return true;
			}
		}

		if (textMentionsAnyName(message.content, variants)) {
			return true;
		}
	}

	return false;
}

function collectCharacterVariants(name: string, storyState?: StoryStateDataV2 | null): string[] {
	const entry = storyState?.characters?.[name];
	const indexed = storyState?.indexes?.characters
		? Object.values(storyState.indexes.characters).find(
				(entity) => normalizeName(entity.name) === normalizeName(name),
			)
		: undefined;

	return collectNameVariants(
		name,
		entry?.canonicalName,
		entry?.displayName,
		entry?.narrativeName,
		indexed?.name,
		indexed?.narrativeName,
		...(entry?.aliases ?? []),
		...(indexed?.aliases ?? []),
	);
}

export function isCharacterPresentInTranscript(
	name: string,
	messages: StoryMessage[],
	opts?: {
		messageCount?: number;
		storyState?: StoryStateDataV2 | null;
		playerCharacter?: Pick<PlayerCharacter, "name" | "aliases"> | null;
	},
): boolean {
	const trimmed = name.trim();
	if (!trimmed) {
		return false;
	}

	if (opts?.playerCharacter) {
		const playerVariants = buildPlayerPresenceVariants(opts.playerCharacter, opts.storyState);
		if (playerVariants.some((variant) => normalizeName(variant) === normalizeName(trimmed))) {
			return isPlayerPresentInTranscript(messages, opts.playerCharacter, opts);
		}
	}

	const legalName = opts?.playerCharacter?.name.trim() ?? "";
	const sceneName = opts?.playerCharacter
		? resolvePlayerCharacterSceneName(opts.playerCharacter, {
				storyState: opts.storyState,
				recentMessages: messages,
			})
		: "";
	const metaOpts = { playerLegalName: legalName, playerSceneName: sceneName };
	const limit = opts?.messageCount ?? messages.length;
	const variants = collectCharacterVariants(trimmed, opts?.storyState);

	for (let index = 0; index < Math.min(limit, messages.length); index += 1) {
		const message = messages[index]!;
		if (isMetaTranscriptMessage(message, metaOpts)) {
			continue;
		}

		const speaker =
			message.speakerName?.trim() || extractSpeakerPrefix(message.content)?.speakerLabel?.trim() || "";
		if (speaker && textMentionsAnyName(speaker, variants)) {
			return true;
		}

		if (textMentionsAnyName(message.content, variants)) {
			return true;
		}
	}

	return false;
}

function filterTextByAbsentNames(text: string, absentVariants: string[]): string {
	if (!text.trim() || !absentVariants.length) {
		return text.trim();
	}

	return text
		.split(/(?<=[.!?])\s+/)
		.filter((sentence) => !textMentionsAnyName(sentence, absentVariants))
		.join(" ")
		.trim();
}

function filterIndexedList<T extends { thread?: string; fact?: string; moment?: string }>(
	items: T[] | undefined,
	absentVariants: string[],
): T[] | undefined {
	if (!items?.length || !absentVariants.length) {
		return items;
	}

	const filtered = items.filter((entry) => {
		const text = entry.thread ?? entry.fact ?? entry.moment ?? "";
		return !textMentionsAnyName(text, absentVariants);
	});

	return filtered.length ? filtered : [];
}

function filterRelationships(
	relationships: RelationshipIndexEntry[] | undefined,
	presentNames: Set<string>,
	playerPresent: boolean,
	playerVariants: string[],
): RelationshipIndexEntry[] | undefined {
	if (!Array.isArray(relationships) || !relationships.length) {
		return relationships;
	}

	return relationships.filter((entry) => {
		const left = normalizeName(entry.a);
		const right = normalizeName(entry.b);
		if (!presentNames.has(left) || !presentNames.has(right)) {
			return false;
		}

		if (!playerPresent) {
			const touchesPlayer = playerVariants.some(
				(variant) =>
					normalizeName(variant) === left || normalizeName(variant) === right,
			);
			if (touchesPlayer) {
				return false;
			}
		}

		return true;
	});
}

export function applyTranscriptPresenceGate(
	state: StoryStateDataV2,
	messages: StoryMessage[],
	playerCharacter: Pick<PlayerCharacter, "name" | "aliases">,
	opts?: { messageCount?: number },
): StoryStateDataV2 {
	const messageCount = opts?.messageCount ?? messages.length;
	if (!messageCount) {
		return createClearedStoryStateV2({
			rpStats: state.rpStats,
			authorDirectives: (state as StoryStateDataV2 & { authorDirectives?: unknown }).authorDirectives,
		});
	}

	const playerPresent = isPlayerPresentInTranscript(messages, playerCharacter, {
		messageCount,
		storyState: state,
	});
	const playerVariants = buildPlayerPresenceVariants(playerCharacter, state);
	const absentPlayerVariants = playerPresent ? [] : playerVariants;

	const presentNames = new Set<string>();
	const allCharacterNames = new Set<string>();

	for (const name of Object.keys(state.characters ?? {})) {
		allCharacterNames.add(name.trim());
	}
	if (state.indexes?.characters) {
		for (const entity of Object.values(state.indexes.characters)) {
			if (entity?.name?.trim()) {
				allCharacterNames.add(entity.name.trim());
			}
		}
	}

	for (const name of allCharacterNames) {
		if (
			isCharacterPresentInTranscript(name, messages, {
				messageCount,
				storyState: state,
				playerCharacter,
			})
		) {
			presentNames.add(normalizeName(name));
		}
	}

	const filteredCharacters: StoryStateDataV2["characters"] = {};
	for (const [name, entry] of Object.entries(state.characters ?? {})) {
		if (presentNames.has(normalizeName(name))) {
			filteredCharacters[name] = entry;
		}
	}

	const filteredIndexesCharacters =
		state.indexes?.characters && typeof state.indexes.characters === "object"
			? Object.fromEntries(
					Object.entries(state.indexes.characters).filter(([, entity]) =>
						entity?.name?.trim() ? presentNames.has(normalizeName(entity.name)) : false,
					),
				)
			: undefined;

	const filteredRelationships = filterRelationships(
		state.indexes?.relationships,
		presentNames,
		playerPresent,
		playerVariants,
	);

	const filteredNpcs =
		state.npcs && typeof state.npcs === "object"
			? Object.fromEntries(
					Object.entries(state.npcs).filter(([name]) => presentNames.has(normalizeName(name))),
				)
			: undefined;

	const filteredLocations =
		state.indexes?.locations && typeof state.indexes.locations === "object"
			? Object.fromEntries(
					Object.entries(state.indexes.locations).filter(([, entry]) => {
						const description = typeof entry?.description === "string" ? entry.description : "";
						return !textMentionsAnyName(description, absentPlayerVariants);
					}),
				)
			: state.indexes?.locations;

	const summaries = state.summaries ? { ...state.summaries } : undefined;
	if (summaries) {
		if (!playerPresent) {
			delete summaries.protagonistSummary;
			if (typeof summaries.premise === "string") {
				summaries.premise = filterTextByAbsentNames(summaries.premise, absentPlayerVariants);
			}
			if (typeof summaries.worldSummary === "string") {
				summaries.worldSummary = filterTextByAbsentNames(summaries.worldSummary, absentPlayerVariants);
			}
			if (typeof summaries.relationshipSummary === "string") {
				summaries.relationshipSummary = filterTextByAbsentNames(
					summaries.relationshipSummary,
					absentPlayerVariants,
				);
			}
			if (Array.isArray(summaries.recentDevelopments)) {
				summaries.recentDevelopments = summaries.recentDevelopments.filter(
					(entry) => typeof entry !== "string" || !textMentionsAnyName(entry, absentPlayerVariants),
				);
			}
			if (summaries.characterSummaries && typeof summaries.characterSummaries === "object") {
				summaries.characterSummaries = Object.fromEntries(
					Object.entries(summaries.characterSummaries).filter(
						([name, summary]) =>
							presentNames.has(normalizeName(name)) &&
							(typeof summary !== "string" || !textMentionsAnyName(summary, absentPlayerVariants)),
					),
				);
			}
		}
	}

	return {
		...state,
		characters: filteredCharacters,
		...(filteredNpcs ? { npcs: filteredNpcs } : state.npcs ? { npcs: {} } : {}),
		summaries,
		indexes: state.indexes
			? {
					...state.indexes,
					...(filteredIndexesCharacters ? { characters: filteredIndexesCharacters } : { characters: {} }),
					...(filteredRelationships ? { relationships: filteredRelationships } : { relationships: [] }),
					...(filteredLocations ? { locations: filteredLocations } : {}),
					openThreads: filterIndexedList(state.indexes.openThreads, absentPlayerVariants) ?? [],
					worldFacts: filterIndexedList(state.indexes.worldFacts, absentPlayerVariants) ?? [],
					significantMemories:
						filterIndexedList(state.indexes.significantMemories, absentPlayerVariants) ?? [],
				}
			: state.indexes,
		worldFacts: (state.worldFacts ?? []).filter(
			(fact) => !textMentionsAnyName(fact, absentPlayerVariants),
		),
		unresolvedThreads: (state.unresolvedThreads ?? []).filter(
			(thread) => !textMentionsAnyName(thread, absentPlayerVariants),
		),
		significantMemories: (state.significantMemories ?? []).filter(
			(memory) => !textMentionsAnyName(memory, absentPlayerVariants),
		),
	};
}

export function listPresentIndexedCharacterNames(
	state: StoryStateDataV2 | null | undefined,
	messages: StoryMessage[],
	playerCharacter?: Pick<PlayerCharacter, "name" | "aliases"> | null,
	opts?: { messageCount?: number },
): string[] {
	if (!state) {
		return [];
	}

	const names = new Set<string>();
	if (state.indexes?.characters && typeof state.indexes.characters === "object") {
		for (const entity of Object.values(state.indexes.characters)) {
			if (entity?.name?.trim()) {
				names.add(entity.name.trim());
			}
		}
	}
	for (const name of Object.keys(state.characters ?? {})) {
		if (name.trim()) {
			names.add(name.trim());
		}
	}

	return Array.from(names)
		.filter((name) =>
			playerCharacter
				? isCharacterPresentInTranscript(name, messages, {
						messageCount: opts?.messageCount,
						storyState: state,
						playerCharacter,
					})
				: isCharacterPresentInTranscript(name, messages, {
						messageCount: opts?.messageCount,
						storyState: state,
					}),
		)
		.sort((left, right) => left.localeCompare(right));
}

export function createClearedStoryStateV2(
	preserve?: {
		rpStats?: StoryStateDataV2["rpStats"];
		authorDirectives?: StoryAuthorDirectiveState;
	},
): StoryStateDataV2 {
	const now = new Date().toISOString();
	return {
		updatedAt: now,
		memoryArchitectureVersion: "2.0",
		characters: {},
		worldFacts: [],
		unresolvedThreads: [],
		sceneState: [],
		significantMemories: [],
		relationshipState: [],
		relationships: {},
		npcs: {},
		locations: {},
		summaries: {},
		lastIndexedAt: undefined,
		lastDeepIndexedAt: undefined,
		lastAutoDeepIndexedAt: undefined,
		lastIndexedMessageCount: 0,
		lastDeepIndexedMessageCount: 0,
		lastAutoDeepIndexedMessageCount: 0,
		messagesSinceDeepIndexUpdate: 0,
		indexes: {
			messageCount: 0,
			messageNumberingVersion: "1.0",
			characters: {},
			relationships: [],
			worldFacts: [],
			openThreads: [],
			significantMemories: [],
			locations: {},
		},
		...(preserve?.rpStats ? { rpStats: preserve.rpStats } : {}),
		...(preserve?.authorDirectives ? { authorDirectives: preserve.authorDirectives } : {}),
	};
}

export function buildResolvedPlayerPresenceKeys(
	playerCharacter: Pick<PlayerCharacter, "name" | "aliases">,
	storyState?: StoryStateDataV2 | null,
): Set<string> {
	const variants = buildPlayerPresenceVariants(playerCharacter, storyState);
	return new Set(variants.map((variant) => normalizeName(variant)));
}

export function relationshipTouchesAbsentPlayer(
	entry: { a: string; b: string },
	playerVariants: Set<string>,
	playerPresent: boolean,
): boolean {
	if (playerPresent) {
		return false;
	}

	const left = normalizeName(entry.a);
	const right = normalizeName(entry.b);
	return playerVariants.has(left) || playerVariants.has(right);
}
