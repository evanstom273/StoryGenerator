import type { PlayerCharacter, PlayerCharacterDraft, StoryMessage, StoryStateData, StoryStateDataV2 } from "../types/models";
import { isDeniedSpeakerLabel } from "./relationshipIndex";
import { safeParseStoryStateData } from "./storyStateV2";
import {
	findPlayerStoryStateEntry,
	inferPlayerPronounsFromDirectorNotes,
	inferPlayerPronounsFromMessages,
	inferPlayerSceneNameFromMessages,
	detectEstablishedPlayerIdentityFromMessages,
} from "./storyText/playerSceneName";

/** Scene names must be real character labels, never narration tokens or pseudo-speakers. */
export function isValidPlayerSceneName(name: string | null | undefined): boolean {
	const trimmed = name?.trim() ?? "";
	if (!trimmed || trimmed.length < 2) {
		return false;
	}
	if (!/^[A-Z]/.test(trimmed)) {
		return false;
	}
	return !isDeniedSpeakerLabel(trimmed);
}

function resolveExplicitPlayerSceneRenameFromMessages(
	messages: StoryMessage[],
	legalName: string,
	sheetPreferred: string,
): string | null {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		const content = message.content.replace(/\r\n/g, "\n");
		const chosenName = extractChosenNameCandidateFromContent(
			content,
			legalName,
			sheetPreferred,
		);
		if (chosenName) {
			return chosenName;
		}
	}
	return null;
}

function extractChosenNameCandidateFromContent(
	content: string,
	legalName: string,
	sheetPreferredName: string,
): string | null {
	const patterns = [
		/"([A-Z][a-z]+)\.{0,3}\s*that['']?s my\.{0,3}\s*name/i,
		/\bmy name is\s+"?([A-Z][a-z]+)"?/i,
		/\bcall me\s+"?([A-Z][a-z]+)"?/i,
		/\bIt suits you so perfectly,\s+([A-Z][a-z]+)\b/i,
		/\bIt'?s beautiful\.?\s*It suits you so perfectly,\s+([A-Z][a-z]+)\b/i,
	];

	for (const pattern of patterns) {
		const match = content.match(pattern);
		const candidate = match?.[1]?.trim();
		if (!candidate) {
			continue;
		}
		if (candidate.toLowerCase() === legalName.trim().toLowerCase()) {
			continue;
		}
		if (candidate.toLowerCase() === sheetPreferredName.trim().toLowerCase()) {
			continue;
		}
		if (!isValidPlayerSceneName(candidate)) {
			continue;
		}
		return candidate;
	}

	return null;
}

export function normalizePlayerCharacterAliases(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const seen = new Set<string>();
	const aliases: string[] = [];

	for (const item of value) {
		if (typeof item !== "string") {
			continue;
		}

		const trimmed = item.trim();
		if (!trimmed) {
			continue;
		}

		const key = trimmed.toLowerCase();
		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		aliases.push(trimmed);

		if (aliases.length >= 24) {
			break;
		}
	}

	return aliases;
}

export function normalizePlayerCharacterKnownTies(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const seen = new Set<string>();
	const knownTies: string[] = [];

	for (const item of value) {
		if (typeof item !== "string") {
			continue;
		}

		const trimmed = item.trim();
		if (!trimmed) {
			continue;
		}

		const key = trimmed.toLowerCase();
		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		knownTies.push(trimmed);

		if (knownTies.length >= 16) {
			break;
		}
	}

	return knownTies;
}

export function formatPlayerCharacterKnownTiesForPrompt(
	character: Pick<PlayerCharacter, "knownTies">,
): string | null {
	const knownTies = normalizePlayerCharacterKnownTies(character.knownTies);
	if (!knownTies.length) {
		return null;
	}

	return `Known ties: ${knownTies.join("; ")}`;
}

export function formatCharacterKnownTiesConstraint(
	draft?: Partial<Pick<PlayerCharacterDraft, "knownTies">>,
): string | null {
	const knownTies = normalizePlayerCharacterKnownTies(draft?.knownTies);
	if (!knownTies.length) {
		return null;
	}

	return [
		"Known ties (only these canon characters may be referenced by name):",
		...knownTies.map((tie) => `- ${tie}`),
	].join("\n");
}

export function formatAntiCanonSprawlGuidance(hasKnownTies: boolean): string {
	return [
		"Universe canon characters:",
		"- Imported lore may describe a large cast. Do not reference every famous character from the setting.",
		"- Do not assume the player character knows, works with, or is related to the main ensemble unless listed in Known ties or clearly implied by the Character Concept.",
		"- Prefer original hooks, everyday life, and off-screen connections over roping in the full main cast.",
		hasKnownTies
			? "- Only the Known ties listed above may be named. Do not add extra canon characters beyond those ties and any people explicitly named in the Character Concept."
			: "- No Known ties were specified. Do not name-drop major canon characters unless the Character Concept explicitly names them (for example, parents or mentors).",
	].join("\n");
}

export function resolvePlayerCharacterPreferredSceneName(
	character: Pick<PlayerCharacter, "name" | "aliases">,
): string {
	const name = character.name.trim();
	const aliases = normalizePlayerCharacterAliases(character.aliases).filter(
		(alias) => alias.toLowerCase() !== name.toLowerCase(),
	);

	if (aliases[0]) {
		return aliases[0];
	}

	const tokens = name.split(/\s+/).filter(Boolean);
	if (tokens.length > 1) {
		return tokens[0] ?? name;
	}

	return name;
}

export function resolvePlayerCharacterSceneName(
	character: Pick<PlayerCharacter, "name" | "aliases">,
	opts?: {
		storyState?: StoryStateData | StoryStateDataV2 | null;
		recentMessages?: StoryMessage[];
	},
): string {
	const legalName = character.name.trim();
	const sheetPreferred = resolvePlayerCharacterPreferredSceneName(character);

	const storyEntry = findPlayerStoryStateEntry(opts?.storyState, legalName);
	const storyDisplayName = storyEntry?.displayName?.trim();
	if (
		storyDisplayName &&
		isValidPlayerSceneName(storyDisplayName) &&
		storyDisplayName.toLowerCase() !== legalName.toLowerCase()
	) {
		return storyDisplayName;
	}

	const storyAliases = normalizePlayerCharacterAliases(storyEntry?.aliases).filter(
		(alias) => alias.toLowerCase() !== legalName.toLowerCase(),
	);
	if (storyAliases.length) {
		const firstValidAlias = storyAliases.find((alias) => isValidPlayerSceneName(alias));
		if (firstValidAlias) {
			return firstValidAlias;
		}
	}

	if (opts?.recentMessages?.length) {
		const explicitRename = resolveExplicitPlayerSceneRenameFromMessages(
			opts.recentMessages,
			legalName,
			sheetPreferred,
		);
		if (explicitRename) {
			return explicitRename;
		}
	}

	const inferredFromMessages = opts?.recentMessages?.length
		? inferPlayerSceneNameFromMessages(opts.recentMessages, legalName)
		: null;
	if (inferredFromMessages && isValidPlayerSceneName(inferredFromMessages)) {
		return inferredFromMessages;
	}

	return sheetPreferred;
}

export interface EffectivePlayerIdentity {
	sceneName: string;
	pronouns: string;
	legalName: string;
	hasInStoryTransition: boolean;
}

export function resolveEffectivePlayerPronouns(
	character: Pick<PlayerCharacter, "name" | "aliases" | "pronouns">,
	opts?: {
		storyState?: StoryStateData | StoryStateDataV2 | null;
		recentMessages?: StoryMessage[];
		sceneName?: string;
	},
): string {
	const sheetPronouns = character.pronouns.trim();
	const sheetPreferred = resolvePlayerCharacterPreferredSceneName(character);
	const sceneName =
		opts?.sceneName?.trim() ||
		resolvePlayerCharacterSceneName(character, {
			storyState: opts?.storyState,
			recentMessages: opts?.recentMessages,
		});

	const storyEntry = findPlayerStoryStateEntry(opts?.storyState, character.name.trim());
	const storyPronouns = storyEntry?.pronouns?.trim();
	if (storyPronouns) {
		return storyPronouns;
	}

	const establishedIdentity = opts?.recentMessages?.length
		? detectEstablishedPlayerIdentityFromMessages(
				opts.recentMessages,
				character.name.trim(),
				sheetPreferred,
			)
		: null;
	if (establishedIdentity?.pronouns?.trim()) {
		return establishedIdentity.pronouns.trim();
	}

	const fromDirectorNotes = opts?.recentMessages?.length
		? inferPlayerPronounsFromDirectorNotes(opts.recentMessages)
		: null;
	if (fromDirectorNotes) {
		return fromDirectorNotes;
	}

	const fromMessages = opts?.recentMessages?.length
		? inferPlayerPronounsFromMessages(opts.recentMessages, character.name.trim(), sceneName)
		: null;
	if (fromMessages) {
		return fromMessages;
	}

	return sheetPronouns;
}

export function resolveEffectivePlayerIdentity(
	character: Pick<PlayerCharacter, "name" | "aliases" | "pronouns">,
	opts?: {
		storyState?: StoryStateData | StoryStateDataV2 | null;
		recentMessages?: StoryMessage[];
	},
): EffectivePlayerIdentity {
	const legalName = character.name.trim();
	const sheetPreferred = resolvePlayerCharacterPreferredSceneName(character);
	const storyEntry = findPlayerStoryStateEntry(opts?.storyState, legalName);

	let sceneName = resolvePlayerCharacterSceneName(character, {
		storyState: opts?.storyState,
		recentMessages: opts?.recentMessages,
	});

	const establishedIdentity = opts?.recentMessages?.length
		? detectEstablishedPlayerIdentityFromMessages(
				opts.recentMessages,
				legalName,
				sheetPreferred,
			)
		: null;
	if (
		establishedIdentity?.sceneName?.trim() &&
		isValidPlayerSceneName(establishedIdentity.sceneName)
	) {
		sceneName = establishedIdentity.sceneName.trim();
	}

	const pronouns = resolveEffectivePlayerPronouns(character, {
		storyState: opts?.storyState,
		recentMessages: opts?.recentMessages,
		sceneName,
	});

	const hasNameTransition = sceneName.toLowerCase() !== sheetPreferred.toLowerCase();
	const hasPronounTransition =
		!!character.pronouns.trim() &&
		!!pronouns &&
		pronouns.toLowerCase() !== character.pronouns.trim().toLowerCase();
	const hasStoryStateIdentity =
		(!!storyEntry?.displayName?.trim() && isValidPlayerSceneName(storyEntry.displayName)) ||
		!!storyEntry?.pronouns?.trim();

	return {
		sceneName,
		pronouns,
		legalName,
		hasInStoryTransition: hasNameTransition || hasPronounTransition || hasStoryStateIdentity,
	};
}

export function resolvePlayerCharacterSceneNameFromStateJson(
	character: Pick<PlayerCharacter, "name" | "aliases">,
	storyStateJson?: string | null,
	recentMessages?: StoryMessage[],
): string {
	const parsed = storyStateJson?.trim() ? safeParseStoryStateData(storyStateJson) : null;
	return resolvePlayerCharacterSceneName(character, {
		storyState: parsed,
		recentMessages,
	});
}

export function getPlayerCharacterNameVariants(
	character: Pick<PlayerCharacter, "name" | "aliases">,
): string[] {
	const name = character.name.trim();
	const variants = new Set<string>();

	if (name) {
		variants.add(name);
	}

	for (const alias of normalizePlayerCharacterAliases(character.aliases)) {
		variants.add(alias);
	}

	const tokens = name.split(/\s+/).filter(Boolean);
	const firstToken = tokens[0] ?? "";
	const lastToken = tokens.length > 1 ? tokens[tokens.length - 1] : "";

	if (firstToken.length >= 2) {
		variants.add(firstToken);
	}
	if (lastToken.length >= 2) {
		variants.add(lastToken);
	}

	return Array.from(variants);
}

export function buildPlayerNameForValidation(
	character: Pick<PlayerCharacter, "name" | "aliases">,
	storyStateJson?: string | null,
): string {
	const base = character.name.trim();
	const aliases = new Set<string>();

	for (const alias of normalizePlayerCharacterAliases(character.aliases)) {
		if (alias.toLowerCase() !== base.toLowerCase()) {
			aliases.add(alias);
		}
	}

	const json = storyStateJson?.trim() ?? "";
	if (base && json) {
		const parsed = safeParseStoryStateData(json);
		if (parsed) {
			const candidates = Object.entries(parsed.characters ?? {});
			const match = candidates.find(([key, entry]) => {
				if (key === base) return true;
				if (!entry) return false;
				if (entry.canonicalName === base) return true;
				if (entry.displayName === base) return true;
				if (entry.aliases?.includes(base)) return true;
				return false;
			});

			if (match) {
				const [key, entry] = match;
				if (key && key.toLowerCase() !== base.toLowerCase()) {
					aliases.add(key);
				}
				if (entry?.displayName && entry.displayName.toLowerCase() !== base.toLowerCase()) {
					aliases.add(entry.displayName);
				}
				for (const alias of entry?.aliases ?? []) {
					if (alias && alias.toLowerCase() !== base.toLowerCase()) {
						aliases.add(alias);
					}
				}
			}
		}
	}

	const aliasText = Array.from(aliases).slice(0, 6).join(", ");
	return aliasText ? `${base} (${aliasText})` : base;
}

export function formatPlayerCharacterPronounAndNamingRules(
	character: Pick<PlayerCharacter, "name" | "aliases" | "pronouns">,
	sceneNameOverride?: string,
	pronounOverride?: string,
): string {
	const preferredName = sceneNameOverride?.trim() || resolvePlayerCharacterPreferredSceneName(character);
	const legalName = character.name.trim();
	const pronouns = pronounOverride?.trim() || character.pronouns.trim();
	const usesDifferentPreferredName = preferredName.toLowerCase() !== legalName.toLowerCase();
	const usesDifferentPronouns =
		!!pronounOverride?.trim() &&
		!!character.pronouns.trim() &&
		pronounOverride.trim().toLowerCase() !== character.pronouns.trim().toLowerCase();

	return [
		"Player identity rules (mandatory):",
		usesDifferentPreferredName
			? `- Preferred name for speaker headers and third-person narration: "${preferredName}". Do NOT use the full legal name "${legalName}" in speaker headers or casual narration unless the scene is explicitly formal or a character who does not know them well addresses them.`
			: `- Preferred name for speaker headers and third-person narration: "${preferredName}".`,
		usesDifferentPronouns
			? `- In-story identity transition: the transcript has established current pronouns ${pronouns}. Use these instead of the character sheet default (${character.pronouns.trim()}).`
			: "",
		pronouns
			? `- Player pronouns: ${pronouns}. These are authoritative. NEVER infer pronouns from name, gender field, or stereotypes. Use only these pronouns when referring to the player character in narration.`
			: "- Player pronouns were not specified. Do not assume he/him or she/her from name or gender.",
		pronouns.includes("they")
			? `- Use they/them/their forms in narration for ${preferredName}. Never write he/him/his or she/her/hers for this character.`
			: pronouns.includes("she")
				? `- Use she/her/hers forms in narration for ${preferredName}. Never write he/him/his for this character.`
				: pronouns.includes("he")
					? `- Use he/him/his forms in narration for ${preferredName}. Never write she/her/hers for this character.`
					: "",
	]
		.filter(Boolean)
		.join("\n");
}

export function formatPlayerCharacterIdentityForPrompt(
	character: Pick<
		PlayerCharacter,
		"name" | "aliases" | "pronouns" | "gender" | "species" | "age"
	>,
	sceneNameOverride?: string,
	pronounOverride?: string,
): string {
	const preferredName = sceneNameOverride?.trim() || resolvePlayerCharacterPreferredSceneName(character);
	const legalName = character.name.trim();
	const pronouns = pronounOverride?.trim() || character.pronouns.trim();
	const aliases = normalizePlayerCharacterAliases(character.aliases).filter(
		(alias) => alias.toLowerCase() !== legalName.toLowerCase(),
	);
	const otherAliases = aliases.filter(
		(alias) => alias.toLowerCase() !== preferredName.toLowerCase(),
	);
	const hasInStoryTransition =
		(!!sceneNameOverride?.trim() &&
			sceneNameOverride.trim().toLowerCase() !== resolvePlayerCharacterPreferredSceneName(character).toLowerCase()) ||
		(!!pronounOverride?.trim() &&
			!!character.pronouns.trim() &&
			pronounOverride.trim().toLowerCase() !== character.pronouns.trim().toLowerCase());

	return [
		hasInStoryTransition
			? `Player Character (current in-story identity): ${preferredName}${pronouns ? ` (${pronouns})` : ""}`
			: `Player Character (preferred scene name): ${preferredName}`,
		hasInStoryTransition
			? "In-story identity transitions override the character sheet defaults below when writing new scenes."
			: "",
		preferredName.toLowerCase() !== legalName.toLowerCase()
			? `Legal/full name: ${legalName}`
			: "",
		otherAliases.length ? `Also known as: ${otherAliases.join(", ")}` : "",
		character.age.trim() ? `Player Age: ${character.age.trim()}` : "",
		character.gender.trim() ? `Player Gender: ${character.gender.trim()}` : "",
		character.species?.trim() ? `Player Species: ${character.species.trim()}` : "",
		pronouns ? `Player Pronouns: ${pronouns}` : "",
		formatPlayerCharacterPronounAndNamingRules(character, preferredName, pronouns),
	]
		.filter(Boolean)
		.join("\n");
}

export function formatPlayerCharacterOwnershipRulesForRewrite(
	character: Pick<
		PlayerCharacter,
		"name" | "aliases" | "pronouns" | "gender" | "species" | "age"
	>,
	allowDirectedPlayerControl: boolean,
	sceneNameOverride?: string,
	pronounOverride?: string,
): string {
	const preferredName = sceneNameOverride?.trim() || resolvePlayerCharacterPreferredSceneName(character);
	const pronouns = pronounOverride?.trim() || character.pronouns.trim();

	return [
		`The player character is: ${preferredName}.`,
		`Player character pronouns: ${pronouns || "unspecified"}. Gender: ${character.gender.trim() || "unspecified"}. Species: ${(character.species ?? "").trim() || "unspecified"}. Age: ${character.age.trim() || "unspecified"}.`,
		formatPlayerCharacterPronounAndNamingRules(character, preferredName, pronouns),
		allowDirectedPlayerControl
			? "- Because this was triggered by a Director note, player-character dialogue/actions are allowed in this one rewrite when required by the direction."
			: "- Never write dialogue/actions/thoughts/decisions for the player character.",
		allowDirectedPlayerControl
			? "- Use the preferred scene name in any player-character speaker header."
			: "- Never include a speaker header for the player character.",
	]
		.filter(Boolean)
		.join("\n");
}

export function formatPlayerCharacterAliasesForPrompt(
	character: Pick<PlayerCharacter, "name" | "aliases">,
): string | null {
	const name = character.name.trim();
	const aliases = normalizePlayerCharacterAliases(character.aliases).filter(
		(alias) => alias.toLowerCase() !== name.toLowerCase(),
	);

	if (!aliases.length) {
		return null;
	}

	return `Also known as: ${aliases.join(", ")}`;
}

export function formatCharacterConceptAliasesConstraint(
	draft?: Partial<Pick<PlayerCharacterDraft, "name" | "aliases">>,
): string | null {
	const name = draft?.name?.trim() ?? "";
	const aliases = normalizePlayerCharacterAliases(draft?.aliases).filter(
		(alias) => !name || alias.toLowerCase() !== name.toLowerCase(),
	);

	if (!aliases.length) {
		return null;
	}

	return [
		`Also known as (recognition names only): ${aliases.join(", ")}`,
		"Aliases are alternate names the character may be called in the story. They are ambiguous — for example, \"Static\" could be a content-creator handle, a hacktivist alias, a stage name, a furry persona, a nickname, or something else entirely.",
		"Do not assume a secret identity, criminal activity, or specific profession from alias text alone. Only mention an alias if it fits the concept you chose independently.",
	].join("\n");
}

const CHARACTER_CONCEPT_CONSTRAINT_FIELDS = [
	"name",
	"age",
	"gender",
	"species",
	"pronouns",
	"appearance",
	"personality",
	"background",
	"notes",
] as const;

export function buildCharacterConceptConstraintsFromDraft(
	draft?: Partial<PlayerCharacterDraft>,
): Partial<Record<(typeof CHARACTER_CONCEPT_CONSTRAINT_FIELDS)[number] | "aliases", string>> {
	if (!draft) {
		return {};
	}

	const constraints: Partial<
		Record<(typeof CHARACTER_CONCEPT_CONSTRAINT_FIELDS)[number] | "aliases", string>
	> = {};

	for (const key of CHARACTER_CONCEPT_CONSTRAINT_FIELDS) {
		const value = draft[key];
		if (typeof value === "string" && value.trim()) {
			constraints[key] = value.trim();
		}
	}

	return constraints;
}
