import type { PlayerCharacter, StoryStateData, StoryStateDataV2 } from "../types/models";
import {
	findPlayerStoryStateEntry,
	type EstablishedPlayerIdentity,
} from "./storyText/playerSceneName";
import {
	type EffectivePlayerIdentity,
	normalizePlayerCharacterAliases,
	resolvePlayerCharacterPreferredSceneName,
} from "./playerCharacterPrompt";

export type PlayerIdentityAuditSnapshot = {
	playerCharacter: {
		legalName: string;
		preferredName: string;
		aliases: string[];
		sheetPronouns: string;
	};
	storyState: {
		displayName: string | null;
		pronouns: string | null;
		aliases: string[];
	} | null;
	effective: EffectivePlayerIdentity;
	establishedFromTranscript: EstablishedPlayerIdentity | null;
	promptLabel: string;
};

export function buildPlayerIdentityAuditSnapshot(args: {
	playerCharacter: Pick<PlayerCharacter, "name" | "aliases" | "pronouns">;
	playerIdentity: EffectivePlayerIdentity;
	storyState?: StoryStateData | StoryStateDataV2 | null;
	establishedFromTranscript?: EstablishedPlayerIdentity | null;
}): PlayerIdentityAuditSnapshot {
	const legalName = args.playerCharacter.name.trim();
	const preferredName = resolvePlayerCharacterPreferredSceneName(args.playerCharacter);
	const storyEntry = findPlayerStoryStateEntry(args.storyState, legalName);

	return {
		playerCharacter: {
			legalName,
			preferredName,
			aliases: normalizePlayerCharacterAliases(args.playerCharacter.aliases),
			sheetPronouns: args.playerCharacter.pronouns.trim(),
		},
		storyState: storyEntry
			? {
					displayName: storyEntry.displayName?.trim() || null,
					pronouns: storyEntry.pronouns?.trim() || null,
					aliases: storyEntry.aliases ?? [],
				}
			: null,
		effective: args.playerIdentity,
		establishedFromTranscript: args.establishedFromTranscript ?? null,
		promptLabel: args.playerIdentity.sceneName,
	};
}

export function formatPlayerIdentityAuditBlock(snapshot: PlayerIdentityAuditSnapshot): string {
	return [
		"===== PLAYER IDENTITY =====",
		`Legal Name: ${snapshot.playerCharacter.legalName}`,
		`Preferred Name: ${snapshot.playerCharacter.preferredName}`,
		`Scene Name: ${snapshot.effective.sceneName}`,
		`Aliases: ${snapshot.playerCharacter.aliases.join(", ") || "(none)"}`,
		`Pronouns: ${snapshot.effective.pronouns}`,
		`Story State displayName: ${snapshot.storyState?.displayName ?? "(none)"}`,
		`Story State pronouns: ${snapshot.storyState?.pronouns ?? "(none)"}`,
		`Transcript-established sceneName: ${snapshot.establishedFromTranscript?.sceneName ?? "(none)"}`,
		`Transcript-established pronouns: ${snapshot.establishedFromTranscript?.pronouns ?? "(none)"}`,
		`Prompt Label: ${snapshot.promptLabel}`,
		`Has In-Story Transition: ${snapshot.effective.hasInStoryTransition}`,
		"===========================",
	].join("\n");
}
