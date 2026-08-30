import type { PlayerCharacter, StoryMessage, StoryStateData, StoryStateDataV2 } from "../../types/models";
import type { SemanticSpeakerIdentity } from "../storyText/semanticSpeakerResolver";
import type { EffectivePlayerIdentity } from "../playerCharacterPrompt";
import { projectResolvedParticipantsToSpeakerRegistry } from "./promptProjection";
import { resolveSceneParticipants, type ResolvedSceneParticipant } from "./resolveSceneParticipants";

export type GenerationPlayerIdentity = {
	canonicalName: string;
	aliases: string[];
};

export function buildGenerationPlayerIdentity(
	playerCharacter: Pick<PlayerCharacter, "name" | "aliases">,
	playerIdentity: Pick<EffectivePlayerIdentity, "legalName" | "sceneName">,
): GenerationPlayerIdentity {
	return {
		canonicalName: playerIdentity.sceneName,
		aliases: [
			playerCharacter.name,
			...(playerCharacter.aliases ?? []),
			playerIdentity.legalName,
			playerIdentity.sceneName,
		],
	};
}

export function resolveStoryGenerationParticipants(params: {
	playerCharacter: Pick<PlayerCharacter, "name" | "aliases">;
	playerIdentity: Pick<EffectivePlayerIdentity, "legalName" | "sceneName">;
	storyState?: StoryStateData | StoryStateDataV2 | null;
	importedCharacters?: Array<Pick<PlayerCharacter, "name" | "aliases">>;
	recentMessages?: Array<Pick<StoryMessage, "role" | "content">>;
	latestUserMessage?: string;
}): {
	player: GenerationPlayerIdentity;
	participants: ResolvedSceneParticipant[];
	speakerRegistry: ReturnType<typeof projectResolvedParticipantsToSpeakerRegistry>;
} {
	const player = buildGenerationPlayerIdentity(params.playerCharacter, params.playerIdentity);
	const participants = resolveSceneParticipants({
		playerIdentity: player,
		importedCharacters: params.importedCharacters,
		storyState: params.storyState,
		recentMessages: params.recentMessages,
		latestUserMessage: params.latestUserMessage,
	});
	return {
		player,
		participants,
		speakerRegistry: projectResolvedParticipantsToSpeakerRegistry(participants, player),
	};
}

export function toSemanticSpeakerIdentities(
	participants: readonly ResolvedSceneParticipant[],
	playerKey?: string,
): SemanticSpeakerIdentity[] {
	const normalizedPlayer = playerKey?.trim().toLocaleLowerCase();
	return participants
		.filter((participant) => {
			if (!participant.active || !participant.capabilities.canSpeak) {
				return false;
			}
			if (
				normalizedPlayer &&
				participant.canonicalName.trim().toLocaleLowerCase() === normalizedPlayer
			) {
				return false;
			}
			return true;
		})
		.map((participant) => ({
			name: participant.canonicalName,
			aliases: participant.aliases,
			capabilities: {
				canSpeak: participant.capabilities.canSpeak,
				canPerformPhysicalActions: participant.capabilities.canPerformPhysicalActions,
			},
		}));
}
