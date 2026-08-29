import type { PlayerCharacter, StoryMessage, StoryStateData, StoryStateDataV2 } from "../../types/models";
import {
	formatResolvedParticipationPrompt,
	projectResolvedParticipantsToSpeakerRegistry,
	resolveSceneParticipants,
	type ResolvedSceneParticipant,
} from "../sceneParticipation";
import type { AIChatMessage } from "./types";

export interface SceneSpeakerIdentity {
	canonicalName: string;
	aliases: string[];
}

export interface ActiveSceneSpeakerIdentity extends SceneSpeakerIdentity {
	evidence: string[];
}

export interface ActiveSceneSpeakerRegistry {
	player: SceneSpeakerIdentity;
	eligibleNonPlayerSpeakers: ActiveSceneSpeakerIdentity[];
}

type RegistryMessage = Pick<StoryMessage, "role" | "content">;

export function projectSceneSpeakerRegistry(
	participants: readonly ResolvedSceneParticipant[],
	player: SceneSpeakerIdentity,
): ActiveSceneSpeakerRegistry {
	return projectResolvedParticipantsToSpeakerRegistry(participants, player);
}

/**
 * Adapter over resolveSceneParticipants(). Do not add independent participation
 * inference here. Raw activeParticipants are read only inside the resolver.
 */
export function buildActiveSceneSpeakerRegistry(params: {
	player: SceneSpeakerIdentity;
	storyState?: StoryStateData | StoryStateDataV2 | null;
	importedCharacters?: Array<Pick<PlayerCharacter, "name" | "aliases">>;
	recentMessages?: RegistryMessage[];
	latestUserMessage?: string;
	resolvedParticipants?: readonly ResolvedSceneParticipant[];
}): ActiveSceneSpeakerRegistry {
	const participants =
		params.resolvedParticipants ??
		resolveSceneParticipants({
			playerIdentity: params.player,
			importedCharacters: params.importedCharacters,
			storyState: params.storyState,
			recentMessages: params.recentMessages,
			latestUserMessage: params.latestUserMessage,
		});
	return projectSceneSpeakerRegistry(participants, params.player);
}

export function formatSceneSpeakerRegistryPrompt(
	registry: ActiveSceneSpeakerRegistry,
	allowDirectedPlayerControl: boolean,
	resolvedParticipants?: readonly ResolvedSceneParticipant[],
): string {
	if (resolvedParticipants?.length) {
		return formatResolvedParticipationPrompt(
			resolvedParticipants,
			registry.player,
			allowDirectedPlayerControl,
		);
	}

	return formatResolvedParticipationPrompt(
		[
			{
				participantKey: registry.player.canonicalName,
				canonicalName: registry.player.canonicalName,
				aliases: registry.player.aliases,
				active: true,
				capabilities: {
					canSpeak: true,
					canPerformPhysicalActions: true,
					canBeAddressed: true,
					canBePhysicallyInteractedWith: true,
				},
				activityEvidence: [],
			},
			...registry.eligibleNonPlayerSpeakers.map((speaker) => ({
				participantKey: speaker.canonicalName,
				canonicalName: speaker.canonicalName,
				aliases: speaker.aliases,
				active: true,
				capabilities: {
					canSpeak: true,
					canPerformPhysicalActions: true,
					canBeAddressed: true,
					canBePhysicallyInteractedWith: true,
				},
				activityEvidence: speaker.evidence as ResolvedSceneParticipant["activityEvidence"],
			})),
		],
		registry.player,
		allowDirectedPlayerControl,
	);
}

/** Insert the registry immediately before the live user turn so it cannot be buried in history. */
export function injectSceneSpeakerRegistry(
	messages: AIChatMessage[],
	registry: ActiveSceneSpeakerRegistry,
	allowDirectedPlayerControl: boolean,
	resolvedParticipants?: readonly ResolvedSceneParticipant[],
): AIChatMessage[] {
	const note: AIChatMessage = {
		role: "system",
		content: formatSceneSpeakerRegistryPrompt(
			registry,
			allowDirectedPlayerControl,
			resolvedParticipants,
		),
	};
	let lastUserIndex = -1;
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		if (messages[index]?.role === "user") {
			lastUserIndex = index;
			break;
		}
	}
	if (lastUserIndex < 0) return [...messages, note];
	return [...messages.slice(0, lastUserIndex), note, ...messages.slice(lastUserIndex)];
}
