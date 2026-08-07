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

function nameTokens(value: string): string[] {
	return value.trim().split(/\s+/).filter(Boolean);
}

function collectHiddenIdentityRecords(
	registry: NarrativeIdentityRegistry,
	messageCount?: number,
): NarrativeIdentityRecord[] {
	const seen = new Set<string>();
	const records: NarrativeIdentityRecord[] = [];

	for (const record of registry.values()) {
		const key = `${record.canonicalName}::${record.narrativeName}`;
		if (seen.has(key) || !shouldHideCanonicalIdentity(record, messageCount)) {
			continue;
		}
		seen.add(key);
		records.push(record);
	}

	return records;
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

		const canonicalTokens = nameTokens(canonical);
		const narrativeTokens = nameTokens(narrative);
		const canonicalFirst = canonicalTokens[0] ?? "";
		const narrativeFirst = narrativeTokens[0] ?? narrative;

		pairs.push({
			from: new RegExp(`\\b${escapeRegex(canonical)}\\b`, "gi"),
			to: narrative,
		});
		pairs.push({
			from: new RegExp(`\\b${escapeRegex(canonical)}'s\\b`, "gi"),
			to: `${narrative}'s`,
		});
		if (
			canonicalTokens.length > 1 &&
			canonicalFirst.length >= 3 &&
			normalizeName(canonicalFirst) !== normalizeName(narrativeFirst)
		) {
			pairs.push({
				from: new RegExp(`\\b${escapeRegex(canonicalFirst)}\\b`, "gi"),
				to: narrativeFirst,
			});
			pairs.push({
				from: new RegExp(`\\b${escapeRegex(canonicalFirst)}'s\\b`, "gi"),
				to: `${narrativeFirst}'s`,
			});
		}
		pairs.push({
			from: new RegExp(
				`['"]?${escapeRegex(narrative)}['"]?\\s*\\(\\s*${escapeRegex(canonical)}\\s*\\)`,
				"gi",
			),
			to: narrative,
		});
		if (canonicalFirst.length >= 2) {
			pairs.push({
				from: new RegExp(
					`['"]?${escapeRegex(narrative)}['"]?\\s*\\(\\s*${escapeRegex(canonicalFirst)}\\s*\\)`,
					"gi",
				),
				to: narrative,
			});
			pairs.push({
				from: new RegExp(`\\(\\s*${escapeRegex(canonicalFirst)}\\s*\\)`, "gi"),
				to: "",
			});
		}
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
				`,?\\s*\\bunaware that\\s+witness\\s+['"]?${escapeRegex(narrative)}['"]?\\s+was\\s+${escapeRegex(canonical)}\\s+himself\\b\\.?`,
				"gi",
			),
			to: "",
		});
		pairs.push({
			from: new RegExp(
				`,?\\s*\\bunaware that\\s+witness\\s+['"]?${escapeRegex(narrative)}['"]?\\s+was\\s+${escapeRegex(canonicalFirst)}\\s+himself\\b\\.?`,
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
		pairs.push({
			from: new RegExp(
				`\\b${escapeRegex(narrative)}\\s+posed as witness\\s+['"]?${escapeRegex(narrative)}['"]?\\b`,
				"gi",
			),
			to: narrative,
		});
	}

	return pairs.sort((left, right) => right.from.source.length - left.from.source.length);
}

const OMNISCIENT_FRAMING_PATTERNS: RegExp[] = [
	/\bdisguised as (?:witness\s+)?['"][^'"]+['"]\b/gi,
	/\bdisguised as (?:witness\s+)?\b[^,.;]+/gi,
	/\bfeigning\s+(?:shock|physical trauma|severe physical distress|physical distress)\b/gi,
	/\bintroducing himself as ['"][^'"]+['"]\b/gi,
	/\bposing as (?:witness\s+)?['"][^'"]+['"]\b/gi,
	/\(\s*disguised as\s+['"][^'"]+['"]\s*\)/gi,
	/\(\s*as witness\s+[^)]+\)/gi,
	/\bwhile presenting a staged witness account\b/gi,
	/\bwhile remaining completely unaware[^.]*\./gi,
	/\bunaware that witness ['"][^'"]+['"]\s+was\s+\w+\s+himself\b/gi,
];

const OMNISCIENT_VILLAIN_KEYWORDS =
	/\b(?:mastermind|evil mastermind|cold-blooded|orchestrat(?:e|es|ed|ing)|manipulat(?:e|es|ed|ing)|grand crime spree|chosen to initiate|his game|false identity|staged witness account|vanish(?:es|ed)? undetected|taunt(?:s|ing)?|executed his sudden escape|wealthy and cold-blooded|theatrical crimes|targets the)\b/i;

function identityMentionPattern(record: NarrativeIdentityRecord): RegExp {
	const tokens = new Set<string>();
	for (const value of [
		record.canonicalName,
		record.narrativeName,
		...nameTokens(record.canonicalName),
		...nameTokens(record.narrativeName),
	]) {
		const trimmed = value.trim();
		if (trimmed.length >= 3) {
			tokens.add(escapeRegex(trimmed));
		}
	}

	return new RegExp(`\\b(?:${Array.from(tokens).join("|")})\\b`, "i");
}

function splitReaderFacingSentences(text: string): string[] {
	return text
		.split(/(?<=[.!?])\s+/)
		.map((sentence) => sentence.trim())
		.filter(Boolean);
}

function scrubOmniscientIdentitySentences(
	text: string,
	records: NarrativeIdentityRecord[],
): string {
	if (!records.length || !text.trim()) {
		return text;
	}

	const sentences = splitReaderFacingSentences(text);
	const filtered = sentences.filter((sentence) => {
		for (const record of records) {
			const mentionPattern = identityMentionPattern(record);
			if (!mentionPattern.test(sentence)) {
				continue;
			}

			if (OMNISCIENT_VILLAIN_KEYWORDS.test(sentence)) {
				return false;
			}

			if (
				/\b(?:views?|handed|brought|claimed|executed)\b/i.test(sentence) &&
				new RegExp(`\\b${escapeRegex(nameTokens(record.canonicalName)[0] ?? "")}\\b`, "i").test(
					sentence,
				)
			) {
				return false;
			}
		}

		return true;
	});

	return filtered.join(" ");
}

function scrubOmniscientIdentityFraming(
	text: string,
	records: NarrativeIdentityRecord[],
): string {
	let next = text;

	for (const pattern of OMNISCIENT_FRAMING_PATTERNS) {
		next = next.replace(pattern, "");
	}

	for (const record of records) {
		const narrative = record.narrativeName.trim();
		if (!narrative) {
			continue;
		}

		next = next.replace(
			new RegExp(
				`\\b${escapeRegex(narrative)}\\s+targets the\\s+[^,.;]+`,
				"gi",
			),
			"",
		);
		next = next.replace(
			new RegExp(
				`\\bwhere\\s+${escapeRegex(narrative)}\\s+has chosen to initiate[^.]*\\.?`,
				"gi",
			),
			"",
		);
	}

	return scrubOmniscientIdentitySentences(next, records);
}

function normalizeRedactedReaderText(text: string): string {
	return text
		.replace(/\s{2,}/g, " ")
		.replace(/\s+([,.;:!?])/g, "$1")
		.replace(/,\s*,/g, ",")
		.replace(/,\s*\./g, ".")
		.replace(/\(\s*\)/g, "")
		.replace(/\s+—\s+—/g, " — ")
		.replace(/\s+\./g, ".")
		.trim();
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

	const hiddenRecords = collectHiddenIdentityRecords(registry, opts?.messageCount);
	next = scrubOmniscientIdentityFraming(next, hiddenRecords);

	return normalizeRedactedReaderText(next);
}

export function resolveNarrativeTranscriptSpeaker(
	speaker: string,
	registry: NarrativeIdentityRegistry,
	opts?: { messageCount?: number },
): string {
	const trimmed = speaker.trim();
	if (!trimmed) {
		return trimmed;
	}

	return resolveNarrativeDisplayName(trimmed, registry, opts);
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
