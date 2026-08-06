import type {
	IndexedEntity,
	RelationshipHistoryEntry,
	RelationshipIndexEntry,
	RelationshipTier,
	StoryIndexesV2,
} from "../types/models";

/** Full tier vocabulary shared by overlay, RP extractor, and index sanitizer. */
export const RELATIONSHIP_TIERS: readonly RelationshipTier[] = [
	"devoted",
	"lover",
	"partner",
	"best friend",
	"confidant",
	"close friend",
	"friend",
	"family",
	"mentor",
	"mentee",
	"caregiver",
	"patient",
	"ally",
	"colleague",
	"professional",
	"acquaintance",
	"stranger",
	"complicated",
	"guarded",
	"distant",
	"estranged",
	"rival",
	"adversary",
	"enemy",
	"nemesis",
	"threat",
] as const;

const RELATIONSHIP_TIER_SET = new Set<string>(RELATIONSHIP_TIERS);

/** Prefer specific tiers over generic stranger/acquaintance when merging. */
const TIER_SPECIFICITY: Record<string, number> = {
	stranger: 0,
	acquaintance: 1,
	professional: 2,
	colleague: 3,
	ally: 4,
	patient: 5,
	caregiver: 6,
	mentee: 7,
	mentor: 11,
	friend: 9,
	"close friend": 10,
	confidant: 11,
	"best friend": 12,
	partner: 13,
	family: 14,
	lover: 15,
	devoted: 16,
	guarded: 17,
	distant: 18,
	complicated: 19,
	estranged: 20,
	rival: 21,
	adversary: 22,
	threat: 23,
	enemy: 24,
	nemesis: 25,
};

/** Written numbers the model uses in time skips ("Fifteen: minutes later"). */
export const NUMBER_WORD_SPEAKER_DENY = [
	"Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
	"Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
	"Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
] as const;

/** Labels that must never become characters or relationship endpoints. */
export const SPEAKER_LABEL_DENYLIST = new Set([
	"He", "She", "They", "It", "We", "You", "I", "His", "Her", "Their", "Its",
	"The", "A", "An", "And", "But", "Or", "So", "Then", "Now",
	"Later", "Meanwhile", "Outside", "Inside", "Suddenly", "Time",
	"Note", "Warning", "However", "Therefore", "Eventually", "Finally",
	"Scene", "Chapter", "Part", "First", "Next", "Narrator",
	"As", "With", "After", "Before", "While", "When", "Once", "Until",
	"From", "Into", "Through", "Against", "Between", "Without",
	// Weather / atmosphere headers the model sometimes emits as pseudo-speakers
	"Sun", "Moon", "Rain", "Snow", "Wind", "Storm", "Thunder", "Lightning",
	"Morning", "Evening", "Dawn", "Dusk", "Day", "Night", "Midnight", "Noon",
	"Spring", "Summer", "Autumn", "Fall", "Winter",
	"Weather", "Sky", "Clouds", "Fog", "Mist", "Darkness", "Silence",
	...NUMBER_WORD_SPEAKER_DENY,
]);

const ENVIRONMENTAL_SINGLE_WORDS = new Set([
	"sun", "moon", "rain", "snow", "wind", "storm", "thunder", "lightning",
	"morning", "evening", "dawn", "dusk", "day", "night", "midnight", "noon",
	"spring", "summer", "autumn", "fall", "winter",
	"weather", "sky", "clouds", "fog", "mist", "darkness", "silence",
]);

export function normalizeRelationshipKey(value: string): string {
	return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function makeRelationshipPairKey(a: string, b: string): string {
	const [x, y] = [normalizeRelationshipKey(a), normalizeRelationshipKey(b)].sort();
	return `${x}::${y}`;
}

export function isDeniedSpeakerLabel(label: string | null | undefined): boolean {
	if (!label?.trim()) return true;
	const trimmed = label.trim();
	if (SPEAKER_LABEL_DENYLIST.has(trimmed)) return true;
	const first = trimmed.split(/\s+/)[0] ?? "";
	return SPEAKER_LABEL_DENYLIST.has(first);
}

/** Possessive pseudo-speaker lines like "Jamie's:" — not a character. */
export function isPossessiveSpeakerLabel(label: string): boolean {
	const trimmed = label.trim();
	return /^[A-Z][a-zA-Z''-]*['']s$/i.test(trimmed);
}

/** Strip mood/state parentheticals and possessive suffixes from relationship endpoint names. */
export function stripRelationshipEndpointAnnotations(name: string): string {
	let s = name.trim();
	s = s.replace(/\s*\([^)]*\)\s*/g, " ").trim();
	s = s.replace(/['']s$/i, "").trim();
	return s.replace(/\s+/g, " ");
}

function addNameTokensToVariantSet(variants: Set<string>, raw: string) {
	const trimmed = raw.trim();
	if (!trimmed) return;
	variants.add(normalizeRelationshipKey(trimmed));
	const stripped = stripRelationshipEndpointAnnotations(trimmed);
	if (!stripped) return;
	variants.add(normalizeRelationshipKey(stripped));
	const tokens = stripped.split(/\s+/).filter(Boolean);
	if (tokens[0]) variants.add(normalizeRelationshipKey(tokens[0]));
	if (tokens.length > 1) {
		variants.add(normalizeRelationshipKey(tokens[tokens.length - 1]!));
	}
}

export function buildPlayerNameVariants(playerName: string, playerAliases?: string[]): Set<string> {
	const variants = new Set<string>();
	const trimmed = playerName.trim();
	if (!trimmed) return variants;
	addNameTokensToVariantSet(variants, trimmed);
	for (const alias of playerAliases ?? []) {
		addNameTokensToVariantSet(variants, alias);
	}
	return variants;
}

/** Pull in every name/alias for indexed characters that share any label with the player. */
export function expandPlayerNameVariantsFromIndexedCharacters(
	variants: Set<string>,
	indexedCharacters?: StoryIndexesV2["characters"],
): Set<string> {
	if (!indexedCharacters || typeof indexedCharacters !== "object") {
		return variants;
	}

	const expanded = new Set(variants);
	let changed = true;
	while (changed) {
		changed = false;
		for (const [key, value] of Object.entries(indexedCharacters)) {
			if (!value || typeof value !== "object") continue;
			const entity = value as IndexedEntity;
			const names = new Set<string>();
			const push = (raw: unknown) => {
				if (typeof raw === "string" && raw.trim()) {
					names.add(normalizeRelationshipKey(raw.trim()));
				}
			};
			push(key);
			push(entity.name);
			for (const alias of Array.isArray(entity.aliases) ? entity.aliases : []) {
				push(alias);
			}
			const overlapsPlayer = Array.from(names).some((name) => expanded.has(name));
			if (!overlapsPlayer) continue;
			for (const name of names) {
				if (!expanded.has(name)) {
					expanded.add(name);
					changed = true;
				}
			}
		}
	}
	return expanded;
}

export function buildResolvedPlayerNameVariants(params: {
	playerName: string;
	playerAliases?: string[];
	indexedCharacters?: StoryIndexesV2["characters"];
}): Set<string> {
	const base = buildPlayerNameVariants(params.playerName, params.playerAliases);
	return expandPlayerNameVariantsFromIndexedCharacters(base, params.indexedCharacters);
}

export function isIndexedPlayerCharacterDuplicate(
	entityKey: string,
	entity: IndexedEntity | undefined,
	playerVariants: Set<string>,
): boolean {
	const names = new Set<string>();
	const push = (raw: unknown) => {
		if (typeof raw === "string" && raw.trim()) {
			names.add(normalizeRelationshipKey(raw.trim()));
		}
	};
	push(entityKey);
	if (entity) {
		push(entity.name);
		for (const alias of Array.isArray(entity.aliases) ? entity.aliases : []) {
			push(alias);
		}
	}
	return Array.from(names).some((name) => playerVariants.has(name));
}

export function isPlayerNameVariant(
	name: string,
	playerName: string,
	variants?: Set<string>,
): boolean {
	const norm = normalizeRelationshipKey(stripRelationshipEndpointAnnotations(name));
	const set = variants ?? buildPlayerNameVariants(playerName);
	return set.has(norm);
}

export function canonicalizeRelationshipEndpoint(
	name: string,
	playerName: string,
	aliasToCanonical: Map<string, string>,
	playerVariants?: Set<string>,
): string | null {
	if (isPossessiveSpeakerLabel(name.trim())) return null;
	const stripped = stripRelationshipEndpointAnnotations(name);
	if (!stripped || !isPlausibleCharacterName(stripped)) return null;
	const variants = playerVariants ?? buildPlayerNameVariants(playerName);
	if (isPlayerNameVariant(stripped, playerName, variants)) {
		return playerName.trim();
	}
	const resolved = resolveCanonicalCharacterName(stripped, aliasToCanonical);
	if (isPlayerNameVariant(resolved, playerName, variants)) {
		return playerName.trim();
	}
	return resolved;
}

export function sanitizeRelationshipTier(value: unknown): RelationshipTier {
	if (typeof value === "string" && RELATIONSHIP_TIER_SET.has(value)) {
		return value as RelationshipTier;
	}
	return "stranger";
}

export function isPlausibleCharacterName(name: string): boolean {
	if (!name.trim() || isDeniedSpeakerLabel(name)) return false;
	if (isPossessiveSpeakerLabel(name.trim())) return false;
	if (/\([^)]*\)/.test(name)) return false;
	const words = name.trim().split(/\s+/);
	if (words.length === 1 && ENVIRONMENTAL_SINGLE_WORDS.has(normalizeRelationshipKey(name))) {
		return false;
	}
	return true;
}

export function buildCharacterAllowlist(params: {
	playerName: string;
	playerAliases?: string[];
	indexedCharacters?: StoryIndexesV2["characters"];
	universeImportedCharacters?: string[];
	existingRelationships?: RelationshipIndexEntry[];
}): Set<string> {
	const allowlist = new Set<string>();
	const playerVariants = buildResolvedPlayerNameVariants({
		playerName: params.playerName,
		playerAliases: params.playerAliases,
		indexedCharacters: params.indexedCharacters,
	});

	const add = (raw: string | null | undefined) => {
		if (!raw?.trim() || isPossessiveSpeakerLabel(raw.trim())) return;
		const stripped = stripRelationshipEndpointAnnotations(raw);
		if (!isPlausibleCharacterName(stripped)) return;
		if (isPlayerNameVariant(stripped, params.playerName, playerVariants)) return;
		allowlist.add(normalizeRelationshipKey(stripped));
	};

	add(params.playerName);

	if (params.indexedCharacters && typeof params.indexedCharacters === "object") {
		for (const [key, value] of Object.entries(params.indexedCharacters)) {
			add(key);
			if (value && typeof value === "object") {
				const entity = value as IndexedEntity;
				add(entity.name);
				for (const alias of Array.isArray(entity.aliases) ? entity.aliases : []) {
					add(alias);
				}
			}
		}
	}

	for (const imported of params.universeImportedCharacters ?? []) {
		add(imported);
	}

	for (const rel of params.existingRelationships ?? []) {
		add(rel.a);
		add(rel.b);
	}

	return allowlist;
}

export function canTrackRelationshipParticipant(name: string, allowlist: Set<string>, playerName?: string): boolean {
	const stripped = stripRelationshipEndpointAnnotations(name);
	if (!isPlausibleCharacterName(stripped) || isPossessiveSpeakerLabel(name.trim())) return false;
	if (playerName && isPlayerNameVariant(stripped, playerName)) return false;
	return allowlist.has(normalizeRelationshipKey(stripped));
}

export function resolveCanonicalCharacterName(
	name: string,
	aliasToCanonical: Map<string, string>,
): string {
	const norm = normalizeRelationshipKey(name);
	return aliasToCanonical.get(norm) ?? name.trim();
}

function mergeEvidence(left: RelationshipIndexEntry["evidence"], right: RelationshipIndexEntry["evidence"]) {
	const leftNumbers = Array.isArray(left?.messageNumbers) ? left.messageNumbers : [];
	const rightNumbers = Array.isArray(right?.messageNumbers) ? right.messageNumbers : [];
	const merged = Array.from(
		new Set(
			[...leftNumbers, ...rightNumbers].filter((n) => typeof n === "number" && Number.isFinite(n) && n >= 1),
		),
	).sort((a, b) => a - b);
	return merged.length ? { messageNumbers: merged } : undefined;
}

function mergeHistory(
	left: RelationshipHistoryEntry[] | undefined,
	right: RelationshipHistoryEntry[] | undefined,
): RelationshipHistoryEntry[] | undefined {
	return mergeRelationshipHistory(left, right);
}

function tokenizeHistorySummary(summary: string) {
	return summary
		.toLowerCase()
		.replace(/[^\w\s]/g, " ")
		.split(/\s+/)
		.filter((word) => word.length > 3);
}

function historySummariesSimilar(left: string, right: string) {
	const normalizedLeft = left.toLowerCase().trim();
	const normalizedRight = right.toLowerCase().trim();
	if (!normalizedLeft || !normalizedRight) {
		return false;
	}
	if (normalizedLeft === normalizedRight) {
		return true;
	}
	if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) {
		return true;
	}

	// Same beat when both describe approving/sanctioning the player's demonstrations.
	const demoBeat = /\bdemonstrat/i;
	const approvalBeat = /\b(sanction|approved|authorized|permit)/i;
	if (
		demoBeat.test(normalizedLeft) &&
		demoBeat.test(normalizedRight) &&
		(/\b(jamie|wands)\b/.test(normalizedLeft) || approvalBeat.test(normalizedLeft)) &&
		(/\b(jamie|wands)\b/.test(normalizedRight) || approvalBeat.test(normalizedRight))
	) {
		return true;
	}

	// Same beat when both describe rushing back for Wands at Four (or similar event).
	if (
		/\bwands\b/.test(normalizedLeft) &&
		/\bwands\b/.test(normalizedRight) &&
		/\b(back|rush|hurried|return|early|miss)\b/.test(normalizedLeft) &&
		/\b(back|rush|hurried|return|early|miss)\b/.test(normalizedRight)
	) {
		return true;
	}

	const leftTokens = tokenizeHistorySummary(normalizedLeft);
	const rightTokenSet = new Set(tokenizeHistorySummary(normalizedRight));
	const overlap = leftTokens.filter((word) => rightTokenSet.has(word));
	const minTokenCount = Math.min(leftTokens.length, rightTokenSet.size);
	if (minTokenCount === 0) {
		return false;
	}

	return overlap.length >= Math.min(3, Math.ceil(minTokenCount * 0.6));
}

export function mergeRelationshipHistory(
	left: RelationshipHistoryEntry[] | undefined,
	right: RelationshipHistoryEntry[] | undefined,
): RelationshipHistoryEntry[] | undefined {
	const combined = [...(left ?? []), ...(right ?? [])];
	if (!combined.length) {
		return undefined;
	}

	const deduped: RelationshipHistoryEntry[] = [];
	for (const entry of combined) {
		const summary = entry.summary.trim();
		if (!summary) {
			continue;
		}

		const duplicateIndex = deduped.findIndex((existing) =>
			historySummariesSimilar(existing.summary, summary),
		);
		if (duplicateIndex < 0) {
			deduped.push({ ...entry, summary });
			continue;
		}

		const existing = deduped[duplicateIndex]!;
		const preferIncoming =
			(typeof entry.messageNumber === "number" && !existing.messageNumber) ||
			(typeof entry.messageNumber === "number" &&
				typeof existing.messageNumber === "number" &&
				entry.messageNumber >= existing.messageNumber);
		if (preferIncoming) {
			deduped[duplicateIndex] = {
				...existing,
				...entry,
				summary,
			};
		}
	}

	deduped.sort((leftEntry, rightEntry) => {
		const leftNumber = leftEntry.messageNumber ?? 0;
		const rightNumber = rightEntry.messageNumber ?? 0;
		return rightNumber - leftNumber;
	});

	return deduped.slice(0, 3);
}

export function resolveMergedTier(left?: RelationshipTier, right?: RelationshipTier): RelationshipTier {
	const a = sanitizeRelationshipTier(left ?? "stranger");
	const b = sanitizeRelationshipTier(right ?? "stranger");
	if (a === "stranger" && b !== "stranger") return b;
	if (b === "stranger" && a !== "stranger") return a;
	const scoreA = TIER_SPECIFICITY[a] ?? 0;
	const scoreB = TIER_SPECIFICITY[b] ?? 0;
	return scoreA >= scoreB ? a : b;
}

export function simplifyRelationshipEntry(entry: RelationshipIndexEntry): RelationshipIndexEntry {
	const simplified: RelationshipIndexEntry = {
		a: entry.a,
		b: entry.b,
		tier: sanitizeRelationshipTier(entry.tier),
	};
	if (typeof entry.summary === "string" && entry.summary.trim()) {
		simplified.summary = entry.summary.trim();
	}
	if (entry.history?.length) {
		simplified.history = entry.history;
	}
	if (entry.evidence) {
		simplified.evidence = entry.evidence;
	}
	if (typeof entry.playerIntention === "string" && entry.playerIntention.trim()) {
		simplified.playerIntention = entry.playerIntention.trim();
	}
	return simplified;
}

export function mergeRelationshipEntries(
	left: RelationshipIndexEntry,
	right: RelationshipIndexEntry,
): RelationshipIndexEntry {
	const summary =
		typeof right.summary === "string" && right.summary.trim()
			? right.summary.trim()
			: typeof left.summary === "string" && left.summary.trim()
				? left.summary.trim()
				: undefined;
	const evidence = mergeEvidence(left.evidence, right.evidence);
	const tier = resolveMergedTier(left.tier, right.tier);
	const history = mergeHistory(left.history, right.history);

	return simplifyRelationshipEntry({
		a: left.a,
		b: left.b,
		tier,
		...(history?.length ? { history } : {}),
		...(summary ? { summary } : {}),
		...(evidence ? { evidence } : {}),
		...(left.playerIntention && !right.playerIntention ? { playerIntention: left.playerIntention } : {}),
		...(right.playerIntention ? { playerIntention: right.playerIntention } : {}),
	});
}

export function relationshipInvolvesPlayer(
	entry: RelationshipIndexEntry,
	playerName: string,
	playerVariants?: Set<string>,
): boolean {
	const variants = playerVariants ?? buildPlayerNameVariants(playerName);
	const aNorm = normalizeRelationshipKey(entry.a);
	const bNorm = normalizeRelationshipKey(entry.b);
	return variants.has(aNorm) || variants.has(bNorm);
}

export function filterRelationshipEntries(
	relationships: RelationshipIndexEntry[] | undefined,
	opts: {
		playerName?: string;
		playerVariants?: Set<string>;
		allowlist: Set<string>;
	},
): RelationshipIndexEntry[] {
	if (!relationships?.length) return [];

	const playerVariants =
		opts.playerName && !opts.playerVariants
			? buildPlayerNameVariants(opts.playerName)
			: opts.playerVariants;

	return relationships.filter((entry) => {
		if (!isPlausibleCharacterName(entry.a) || !isPlausibleCharacterName(entry.b)) return false;
		if (normalizeRelationshipKey(entry.a) === normalizeRelationshipKey(entry.b)) return false;

		if (opts.playerName && playerVariants) {
			const involvesPlayer = relationshipInvolvesPlayer(entry, opts.playerName, playerVariants);
			if (involvesPlayer) {
				const aNorm = normalizeRelationshipKey(entry.a);
				const other = playerVariants.has(aNorm) ? entry.b : entry.a;
				if (!canTrackRelationshipParticipant(other, opts.allowlist)) return false;
			} else {
				if (!canTrackRelationshipParticipant(entry.a, opts.allowlist)) return false;
				if (!canTrackRelationshipParticipant(entry.b, opts.allowlist)) return false;
			}
		}

		return true;
	});
}

export function reconcileRelationshipEntries(
	relationships: RelationshipIndexEntry[] | undefined,
	aliasToCanonical: Map<string, string>,
	opts?: {
		playerName?: string;
		playerAliases?: string[];
		allowlist?: Set<string>;
		indexedCharacters?: StoryIndexesV2["characters"];
		universeImportedCharacters?: string[];
	},
): RelationshipIndexEntry[] | undefined {
	if (!relationships?.length) return undefined;

	const playerVariants = opts?.playerName
		? buildResolvedPlayerNameVariants({
				playerName: opts.playerName,
				playerAliases: opts.playerAliases,
				indexedCharacters: opts?.indexedCharacters,
			})
		: undefined;

	const allowlist =
		opts?.allowlist ??
		buildCharacterAllowlist({
			playerName: opts?.playerName ?? "",
			playerAliases: opts?.playerAliases,
			indexedCharacters: opts?.indexedCharacters,
			universeImportedCharacters: opts?.universeImportedCharacters,
			existingRelationships: relationships,
		});

	const filtered = filterRelationshipEntries(relationships, {
		playerName: opts?.playerName,
		playerVariants,
		allowlist,
	});

	if (!filtered.length) return undefined;

	const byPair = new Map<string, RelationshipIndexEntry>();

	for (const entry of filtered) {
		const rawA = typeof entry.a === "string" ? entry.a.trim() : "";
		const rawB = typeof entry.b === "string" ? entry.b.trim() : "";
		if (!rawA || !rawB) continue;

		const canonicalA = opts?.playerName
			? canonicalizeRelationshipEndpoint(rawA, opts.playerName, aliasToCanonical, playerVariants)
			: resolveCanonicalCharacterName(rawA, aliasToCanonical);
		const canonicalB = opts?.playerName
			? canonicalizeRelationshipEndpoint(rawB, opts.playerName, aliasToCanonical, playerVariants)
			: resolveCanonicalCharacterName(rawB, aliasToCanonical);
		if (!canonicalA || !canonicalB) continue;
		if (normalizeRelationshipKey(canonicalA) === normalizeRelationshipKey(canonicalB)) continue;
		const keyA = normalizeRelationshipKey(canonicalA);
		const keyB = normalizeRelationshipKey(canonicalB);
		const ordered =
			keyA <= keyB
				? { a: canonicalA, b: canonicalB, ka: keyA, kb: keyB }
				: { a: canonicalB, b: canonicalA, ka: keyB, kb: keyA };
		const pairKey = `${ordered.ka}::${ordered.kb}`;

		const normalizedEntry: RelationshipIndexEntry = {
			...entry,
			a: ordered.a,
			b: ordered.b,
			tier: sanitizeRelationshipTier(entry.tier),
		};

		const existing = byPair.get(pairKey);
		byPair.set(pairKey, existing ? mergeRelationshipEntries(existing, normalizedEntry) : normalizedEntry);
	}

	const merged = Array.from(byPair.values()).map(simplifyRelationshipEntry);
	return merged.length ? merged : undefined;
}

export function findPlayerNpcRelationshipIndex(
	entries: RelationshipIndexEntry[],
	playerName: string,
	npcName: string,
): number {
	const playerNorm = normalizeRelationshipKey(playerName);
	const npcNorm = normalizeRelationshipKey(npcName);
	return entries.findIndex(
		(r) =>
			(normalizeRelationshipKey(r.a) === playerNorm && normalizeRelationshipKey(r.b) === npcNorm) ||
			(normalizeRelationshipKey(r.b) === playerNorm && normalizeRelationshipKey(r.a) === npcNorm),
	);
}
