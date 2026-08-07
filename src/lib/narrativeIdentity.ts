import type {
	IndexedEntity,
	PlayerCharacter,
	StoryMessage,
	StoryStateCharacterState,
	StoryStateData,
	StoryStateDataV2,
} from "../types/models";
import { resolvePlayerCharacterSceneName } from "./playerCharacterPrompt";
import { findPlayerStoryStateEntry } from "./storyText/playerSceneName";

export type NarrativeIdentityRecord = {
	canonicalName: string;
	narrativeName: string;
	identityRevealedAtMessage?: number;
};

export type NarrativeIdentityRegistry = Map<string, NarrativeIdentityRecord>;

export type BuildNarrativeIdentityRegistryInput = {
	storyState: StoryStateData | StoryStateDataV2 | null | undefined;
	playerCharacter?: Pick<PlayerCharacter, "name" | "aliases"> | null;
	messages?: StoryMessage[];
	messageCount?: number;
};

function normalizeName(value: string): string {
	return value.trim().toLowerCase();
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectTranscriptSpeakerLabels(messages: StoryMessage[]): Set<string> {
	const labels = new Set<string>();
	for (const message of messages) {
		const speaker = message.speakerName?.trim();
		if (speaker) {
			labels.add(speaker);
		}
	}
	return labels;
}

function isIdentityRevealed(
	record: NarrativeIdentityRecord,
	messageCount?: number,
): boolean {
	if (!record.identityRevealedAtMessage || !Number.isFinite(record.identityRevealedAtMessage)) {
		return false;
	}

	if (!messageCount || messageCount < 1) {
		return record.identityRevealedAtMessage > 0;
	}

	return record.identityRevealedAtMessage <= messageCount;
}

function resolveCharacterNarrativeIdentity(
	canonicalName: string,
	stateEntry: StoryStateCharacterState | undefined,
	indexedEntry: IndexedEntity | undefined,
	transcriptSpeakers: Set<string>,
): NarrativeIdentityRecord {
	const canonical =
		stateEntry?.canonicalName?.trim() ||
		indexedEntry?.name?.trim() ||
		canonicalName.trim();
	const explicitNarrative =
		stateEntry?.narrativeName?.trim() || indexedEntry?.narrativeName?.trim();
	const displayName = stateEntry?.displayName?.trim();
	const aliases = [
		...(stateEntry?.aliases ?? []),
		...(indexedEntry?.aliases ?? []),
	];
	const identityRevealedAtMessage =
		stateEntry?.identityRevealedAtMessage ?? indexedEntry?.identityRevealedAtMessage;

	let narrativeName =
		explicitNarrative ||
		(displayName && normalizeName(displayName) !== normalizeName(canonical) ? displayName : "");

	if (!narrativeName) {
		const canonicalInTranscript = [...transcriptSpeakers].some(
			(label) => normalizeName(label) === normalizeName(canonical),
		);
		const aliasUsedInTranscript = aliases.find((alias) => transcriptSpeakers.has(alias.trim()));
		if (!canonicalInTranscript && aliasUsedInTranscript) {
			narrativeName = aliasUsedInTranscript.trim();
		} else {
			narrativeName = canonical;
		}
	}

	return {
		canonicalName: canonical,
		narrativeName,
		identityRevealedAtMessage,
	};
}

export function buildNarrativeIdentityRegistry(
	input: BuildNarrativeIdentityRegistryInput,
): NarrativeIdentityRegistry {
	const registry: NarrativeIdentityRegistry = new Map();
	const storyState = input.storyState;
	if (!storyState) {
		return registry;
	}

	const transcriptSpeakers = collectTranscriptSpeakerLabels(input.messages ?? []);
	const indexedCharacters =
		storyState.indexes?.characters && typeof storyState.indexes.characters === "object"
			? storyState.indexes.characters
			: {};
	const characterKeys = new Set<string>([
		...Object.keys(storyState.characters ?? {}),
		...Object.values(indexedCharacters).map((entry) => entry.name?.trim() ?? ""),
	]);

	for (const key of characterKeys) {
		const trimmedKey = key.trim();
		if (!trimmedKey) {
			continue;
		}

		const stateEntry = storyState.characters?.[trimmedKey];
		const indexedEntry = Object.values(indexedCharacters).find(
			(entry) =>
				normalizeName(entry.name) === normalizeName(trimmedKey) ||
				entry.aliases?.some((alias) => normalizeName(alias) === normalizeName(trimmedKey)),
		);

		const record = resolveCharacterNarrativeIdentity(
			trimmedKey,
			stateEntry,
			indexedEntry,
			transcriptSpeakers,
		);
		registry.set(normalizeName(record.canonicalName), record);
		for (const alias of [...(stateEntry?.aliases ?? []), ...(indexedEntry?.aliases ?? [])]) {
			const trimmedAlias = alias.trim();
			if (trimmedAlias) {
				registry.set(normalizeName(trimmedAlias), record);
			}
		}
	}

	if (input.playerCharacter?.name?.trim()) {
		const legalName = input.playerCharacter.name.trim();
		const narrativeName = resolvePlayerCharacterSceneName(input.playerCharacter, {
			storyState,
			recentMessages: input.messages,
		});
		const playerEntry = findPlayerStoryStateEntry(storyState, legalName);
		const record: NarrativeIdentityRecord = {
			canonicalName: legalName,
			narrativeName,
			identityRevealedAtMessage: playerEntry?.identityRevealedAtMessage,
		};
		registry.set(normalizeName(legalName), record);
		for (const alias of input.playerCharacter.aliases ?? []) {
			const trimmedAlias = alias.trim();
			if (trimmedAlias) {
				registry.set(normalizeName(trimmedAlias), record);
			}
		}
	}

	return registry;
}

export function lookupNarrativeIdentity(
	registry: NarrativeIdentityRegistry,
	name: string,
): NarrativeIdentityRecord | null {
	const trimmed = name.trim();
	if (!trimmed) {
		return null;
	}
	return registry.get(normalizeName(trimmed)) ?? null;
}

export function resolveNarrativeDisplayName(
	name: string,
	registry: NarrativeIdentityRegistry,
	opts?: { messageCount?: number },
): string {
	const trimmed = name.trim();
	if (!trimmed) {
		return trimmed;
	}

	const record = lookupNarrativeIdentity(registry, trimmed);
	if (!record) {
		return trimmed;
	}

	if (isIdentityRevealed(record, opts?.messageCount)) {
		if (normalizeName(record.narrativeName) === normalizeName(record.canonicalName)) {
			return record.canonicalName;
		}
		return `${record.narrativeName} (revealed to be ${record.canonicalName})`;
	}

	if (normalizeName(record.canonicalName) === normalizeName(trimmed)) {
		return record.narrativeName;
	}

	return record.narrativeName;
}

export function shouldHideCanonicalIdentity(
	record: NarrativeIdentityRecord,
	messageCount?: number,
): boolean {
	return (
		normalizeName(record.narrativeName) !== normalizeName(record.canonicalName) &&
		!isIdentityRevealed(record, messageCount)
	);
}

function buildReplacementPairs(
	registry: NarrativeIdentityRegistry,
	messageCount?: number,
): Array<{ from: RegExp; to: string }> {
	const pairs: Array<{ from: RegExp; to: string }> = [];
	const seen = new Set<string>();

	for (const record of registry.values()) {
		const key = `${record.canonicalName}::${record.narrativeName}`;
		if (seen.has(key) || !shouldHideCanonicalIdentity(record, messageCount)) {
			continue;
		}
		seen.add(key);

		const canonical = record.canonicalName.trim();
		const narrative = record.narrativeName.trim();
		if (!canonical || !narrative || normalizeName(canonical) === normalizeName(narrative)) {
			continue;
		}

		pairs.push({
			from: new RegExp(`\\b${escapeRegex(canonical)}\\b`, "gi"),
			to: narrative,
		});
		pairs.push({
			from: new RegExp(
				`['"]?${escapeRegex(narrative)}['"]?\\s*\\(\\s*${escapeRegex(canonical)}\\s*\\)`,
				"gi",
			),
			to: narrative,
		});
		pairs.push({
			from: new RegExp(
				`\\(\\s*revealed to be\\s+${escapeRegex(canonical)}\\s*\\)`,
				"gi",
			),
			to: "",
		});
		pairs.push({
			from: new RegExp(
				`,?\\s*\\bunaware that\\s+['"]?${escapeRegex(narrative)}['"]?\\s+is\\s+${escapeRegex(canonical)}\\b\\.?`,
				"gi",
			),
			to: "",
		});
		pairs.push({
			from: new RegExp(
				`\\bposing as\\s+${escapeRegex(narrative)}\\b`,
				"gi",
			),
			to: `as ${narrative}`,
		});
	}

	return pairs.sort((left, right) => right.from.source.length - left.from.source.length);
}

export function applyNarrativeIdentityToText(
	text: string,
	registry: NarrativeIdentityRegistry,
	opts?: { messageCount?: number },
): string {
	let next = text;
	for (const pair of buildReplacementPairs(registry, opts?.messageCount)) {
		next = next.replace(pair.from, pair.to);
	}

	return next
		.replace(/\s{2,}/g, " ")
		.replace(/\s+([,.;:!?])/g, "$1")
		.replace(/,\s*\./g, ".")
		.replace(/\(\s*\)/g, "")
		.replace(/\s+—\s+—/g, " — ")
		.trim();
}

export function applyNarrativeIdentityToRelationships<
	T extends {
		a: string;
		b: string;
		summary?: string;
		history?: Array<{ summary: string; messageNumber?: number }>;
	},
>(
	relationships: T[],
	registry: NarrativeIdentityRegistry,
	opts?: { messageCount?: number },
): T[] {
	return relationships.map((entry) => ({
		...entry,
		a: resolveNarrativeDisplayName(entry.a, registry, opts),
		b: resolveNarrativeDisplayName(entry.b, registry, opts),
		summary: entry.summary
			? applyNarrativeIdentityToText(entry.summary, registry, opts)
			: entry.summary,
		history: entry.history?.map((beat) => ({
			...beat,
			summary: applyNarrativeIdentityToText(beat.summary, registry, opts),
		})),
	}));
}

export type NarrativeIdentityPromptContext = {
	registry: NarrativeIdentityRegistry;
	messageCount?: number;
};

export function createNarrativeIdentityPromptContext(
	input: BuildNarrativeIdentityRegistryInput,
): NarrativeIdentityPromptContext {
	return {
		registry: buildNarrativeIdentityRegistry(input),
		messageCount: input.messageCount ?? input.messages?.length,
	};
}

export function redactNarrativePromptText(
	text: string,
	ctx?: NarrativeIdentityPromptContext,
): string {
	if (!ctx || !text.trim()) {
		return text;
	}

	return applyNarrativeIdentityToText(text, ctx.registry, { messageCount: ctx.messageCount });
}

export function resolveNarrativePromptName(
	name: string,
	ctx?: NarrativeIdentityPromptContext,
): string {
	if (!ctx || !name.trim()) {
		return name;
	}

	return resolveNarrativeDisplayName(name, ctx.registry, { messageCount: ctx.messageCount });
}

export function resolveNarrativeProtagonistName(
	playerCharacter: Pick<PlayerCharacter, "name" | "aliases">,
	storyState?: StoryStateData | StoryStateDataV2 | null,
	messages?: StoryMessage[],
): string {
	return resolvePlayerCharacterSceneName(playerCharacter, {
		storyState,
		recentMessages: messages,
	});
}
