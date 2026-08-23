import type { PlayerCharacter, StoryStateData, StoryStateDataV2 } from "../../types/models";
import type { CharacterTtsGenderMap } from "../ai/characterTtsVoices";
import {
	getPlayerCharacterNameVariants,
	normalizePlayerCharacterKnownTies,
} from "../playerCharacterPrompt";
import type { EffectivePlayerIdentity } from "../playerCharacterPrompt";
import { getPlayerNameVariants } from "./playerDialogueVoice";
import { normalizeSceneSpeakerLabel } from "./speakerLabels";

export type PlayerTranscriptIdentity = {
	legalName: string;
	sceneName: string;
	pronouns?: string | null;
	aliases: string[];
	characterGenders?: CharacterTtsGenderMap | null;
	knownTies?: string[] | null;
	transcriptText?: string | null;
};

function addSpeakerLabelVariant(target: Set<string>, value?: string | null) {
	const trimmed = value?.trim();
	if (!trimmed) {
		return;
	}
	target.add(normalizeSceneSpeakerLabel(trimmed).toLowerCase());
}

export function collectPlayerSpeakerLabels(identity: PlayerTranscriptIdentity): Set<string> {
	const labels = new Set<string>();
	addSpeakerLabelVariant(labels, identity.legalName);
	addSpeakerLabelVariant(labels, identity.sceneName);
	for (const alias of identity.aliases) {
		addSpeakerLabelVariant(labels, alias);
	}
	for (const variant of getPlayerNameVariants(identity.legalName)) {
		addSpeakerLabelVariant(labels, variant);
	}
	return labels;
}

export function speakerLabelRefersToPlayer(
	label: string,
	identity: PlayerTranscriptIdentity,
): boolean {
	const normalized = normalizeSceneSpeakerLabel(label.trim()).toLowerCase();
	if (!normalized) {
		return false;
	}
	return collectPlayerSpeakerLabels(identity).has(normalized);
}

export function buildPlayerTranscriptIdentity(args: {
	character: Pick<PlayerCharacter, "name" | "aliases" | "knownTies">;
	playerIdentity: Pick<EffectivePlayerIdentity, "legalName" | "sceneName" | "pronouns">;
	characterGenders?: CharacterTtsGenderMap | null;
	transcriptText?: string | null;
}): PlayerTranscriptIdentity {
	const aliases = new Set<string>();
	for (const alias of getPlayerCharacterNameVariants(args.character)) {
		if (alias.trim()) {
			aliases.add(alias.trim());
		}
	}
	for (const alias of getPlayerNameVariants(args.playerIdentity.legalName)) {
		if (alias.trim()) {
			aliases.add(alias.trim());
		}
	}
	aliases.add(args.playerIdentity.sceneName.trim());
	aliases.add(args.playerIdentity.legalName.trim());

	return {
		legalName: args.playerIdentity.legalName.trim(),
		sceneName: args.playerIdentity.sceneName.trim(),
		pronouns: args.playerIdentity.pronouns?.trim() || null,
		aliases: Array.from(aliases),
		characterGenders: args.characterGenders ?? null,
		knownTies: normalizePlayerCharacterKnownTies(args.character.knownTies),
		transcriptText: args.transcriptText ?? null,
	};
}

export function buildPlayerTranscriptIdentityFromArgs(args: {
	playerName?: string | null;
	playerSceneName?: string | null;
	playerPronouns?: string | null;
	characterGenders?: CharacterTtsGenderMap | null;
	aliases?: string[] | null;
	knownTies?: string[] | null;
	transcriptText?: string | null;
}): PlayerTranscriptIdentity {
	const legalName = args.playerName?.trim() ?? "";
	const sceneName = args.playerSceneName?.trim() || legalName;
	const aliases = new Set<string>();
	for (const alias of args.aliases ?? []) {
		if (alias.trim()) {
			aliases.add(alias.trim());
		}
	}
	for (const variant of getPlayerNameVariants(legalName)) {
		if (variant.trim()) {
			aliases.add(variant.trim());
		}
	}
	if (sceneName) {
		aliases.add(sceneName);
	}
	if (legalName) {
		aliases.add(legalName);
	}

	return {
		legalName,
		sceneName,
		pronouns: args.playerPronouns?.trim() || null,
		aliases: Array.from(aliases),
		characterGenders: args.characterGenders ?? null,
		knownTies: args.knownTies ?? null,
		transcriptText: args.transcriptText ?? null,
	};
}

export function buildPlayerTranscriptIdentityFromStoryContext(args: {
	character: Pick<PlayerCharacter, "name" | "aliases" | "knownTies">;
	playerIdentity: EffectivePlayerIdentity;
	storyState?: StoryStateData | StoryStateDataV2 | null;
	characterGenders?: CharacterTtsGenderMap | null;
	transcriptText?: string | null;
}): PlayerTranscriptIdentity {
	const identity = buildPlayerTranscriptIdentity({
		character: args.character,
		playerIdentity: args.playerIdentity,
		characterGenders: args.characterGenders,
		transcriptText: args.transcriptText,
	});

	if (args.storyState?.characters) {
		for (const [key, entry] of Object.entries(args.storyState.characters)) {
			if (key.trim()) {
				identity.aliases.push(key.trim());
			}
			if (entry?.canonicalName?.trim()) {
				identity.aliases.push(entry.canonicalName.trim());
			}
			for (const alias of entry?.aliases ?? []) {
				if (alias.trim()) {
					identity.aliases.push(alias.trim());
				}
			}
		}
		identity.aliases = Array.from(new Set(identity.aliases));
	}

	return identity;
}
