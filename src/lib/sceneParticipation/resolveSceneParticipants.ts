import type {
	PlayerCharacter,
	SceneParticipantCapabilities,
	SceneParticipantCapabilityOverride,
	StoryMessage,
	StoryStateData,
	StoryStateDataV2,
} from "../../types/models";
import { parseSceneBlocks } from "../storyText/parseSceneBlocks";
import {
	findCapabilityOverride,
	getSceneParticipantCapabilityOverrides,
	mergeParticipantCapabilities,
} from "./capabilityOverrides";
import {
	expandIdentityNames,
	identityNameMatches,
	isReservedSceneSpeaker,
	normalizeParticipantKey,
	uniqueIdentityNames,
} from "./identity";

export type SceneParticipantIdentityInput = {
	canonicalName: string;
	aliases?: readonly string[];
};

export type SceneParticipantActivityEvidence =
	| "legacy_active_participant"
	| "current_scene_state"
	| "latest_user_mention"
	| "recent_speaker_block"
	| "sole_known_non_player";

export type ResolvedSceneParticipant = {
	participantKey: string;
	canonicalName: string;
	aliases: string[];
	active: boolean;
	capabilities: SceneParticipantCapabilities;
	activityEvidence: SceneParticipantActivityEvidence[];
};

export type ResolveSceneParticipantsInput = {
	playerIdentity: SceneParticipantIdentityInput;
	importedCharacters?: Array<Pick<PlayerCharacter, "name" | "aliases">>;
	storyState?: StoryStateData | StoryStateDataV2 | null;
	recentMessages?: Array<Pick<StoryMessage, "role" | "content">>;
	latestUserMessage?: string;
	capabilityOverrides?: readonly SceneParticipantCapabilityOverride[];
};

type MutableIdentity = {
	canonicalName: string;
	aliases: Set<string>;
	evidence: Set<SceneParticipantActivityEvidence>;
};

function toPlayerIdentity(player: SceneParticipantIdentityInput): {
	canonicalName: string;
	aliases: string[];
	keys: Set<string>;
} {
	const aliases = expandIdentityNames([player.canonicalName, ...(player.aliases ?? [])]);
	return {
		canonicalName: player.canonicalName.trim(),
		aliases,
		keys: new Set(aliases.map(normalizeParticipantKey)),
	};
}

function collectIdentityCandidates(
	params: ResolveSceneParticipantsInput,
	playerKeys: Set<string>,
): MutableIdentity[] {
	const identities: MutableIdentity[] = [];

	const findIdentity = (names: string[]) => {
		const keys = new Set(names.map(normalizeParticipantKey).filter(Boolean));
		return identities.find((identity) =>
			Array.from(identity.aliases).some((alias) => keys.has(normalizeParticipantKey(alias))),
		);
	};

	const addIdentity = (
		canonicalName: string | null | undefined,
		aliases: Array<string | null | undefined> = [],
	) => {
		const names = expandIdentityNames([canonicalName, ...aliases]);
		if (!names.length || names.some((name) => playerKeys.has(normalizeParticipantKey(name)))) {
			return null;
		}

		const existing = findIdentity(names);
		if (existing) {
			for (const name of names) existing.aliases.add(name);
			return existing;
		}

		const identity: MutableIdentity = {
			canonicalName: names[0]!,
			aliases: new Set(names),
			evidence: new Set(),
		};
		identities.push(identity);
		return identity;
	};

	for (const character of params.importedCharacters ?? []) {
		addIdentity(character.name, [character.name, ...(character.aliases ?? [])]);
	}

	for (const [key, character] of Object.entries(params.storyState?.characters ?? {})) {
		addIdentity(
			character.narrativeName || character.displayName || character.canonicalName || key,
			[
				key,
				character.canonicalName,
				character.displayName,
				character.narrativeName,
				...(character.aliases ?? []),
			],
		);
	}

	for (const [key, character] of Object.entries(params.storyState?.indexes?.characters ?? {})) {
		addIdentity(character.narrativeName || character.name || key, [
			key,
			character.name,
			character.narrativeName,
			...(character.aliases ?? []),
		]);
	}

	for (const key of Object.keys(params.storyState?.npcs ?? {})) {
		addIdentity(key);
	}

	const markByName = (rawName: string, evidence: SceneParticipantActivityEvidence) => {
		if (!rawName.trim() || isReservedSceneSpeaker(rawName)) return false;
		const identity = addIdentity(rawName);
		if (identity) {
			identity.canonicalName = rawName.trim();
			identity.evidence.add(evidence);
			return true;
		}
		return false;
	};

	for (const participant of params.storyState?.scene?.activeParticipants ?? []) {
		markByName(participant, "legacy_active_participant");
	}

	const assistantMessages = (params.recentMessages ?? [])
		.filter((message) => message.role === "assistant")
		.slice(-3)
		.reverse();
	for (const message of assistantMessages) {
		let foundNonPlayerSpeaker = false;
		for (const block of parseSceneBlocks(message.content)) {
			if (block.speakerLabel) {
				foundNonPlayerSpeaker =
					markByName(block.speakerLabel, "recent_speaker_block") || foundNonPlayerSpeaker;
			}
		}
		if (foundNonPlayerSpeaker) break;
	}

	const latestUserMessage = params.latestUserMessage?.trim() ?? "";
	const currentSceneText = [
		...(params.storyState?.sceneState ?? []),
		params.storyState?.scene?.sceneSummary ?? "",
		params.storyState?.scene?.currentObjective ?? "",
	].join("\n");

	for (const identity of identities) {
		const names = Array.from(identity.aliases);
		if (latestUserMessage && identityNameMatches(latestUserMessage, names)) {
			identity.evidence.add("latest_user_mention");
		}
		if (currentSceneText && identityNameMatches(currentSceneText, names)) {
			identity.evidence.add("current_scene_state");
		}
	}

	if (!identities.some((identity) => identity.evidence.size > 0) && identities.length === 1) {
		identities[0]!.evidence.add("sole_known_non_player");
	}

	return identities;
}

function collectPlayerEvidence(
	player: { aliases: string[] },
	params: ResolveSceneParticipantsInput,
): SceneParticipantActivityEvidence[] {
	const evidence = new Set<SceneParticipantActivityEvidence>();
	for (const participant of params.storyState?.scene?.activeParticipants ?? []) {
		if (identityNameMatches(participant, player.aliases)) {
			evidence.add("legacy_active_participant");
		}
	}

	const latestUserMessage = params.latestUserMessage?.trim() ?? "";
	if (latestUserMessage && identityNameMatches(latestUserMessage, player.aliases)) {
		evidence.add("latest_user_mention");
	}

	const currentSceneText = [
		...(params.storyState?.sceneState ?? []),
		params.storyState?.scene?.sceneSummary ?? "",
		params.storyState?.scene?.currentObjective ?? "",
	].join("\n");
	if (currentSceneText && identityNameMatches(currentSceneText, player.aliases)) {
		evidence.add("current_scene_state");
	}

	const assistantMessages = (params.recentMessages ?? [])
		.filter((message) => message.role === "assistant")
		.slice(-3)
		.reverse();
	for (const message of assistantMessages) {
		for (const block of parseSceneBlocks(message.content)) {
			if (block.speakerLabel && identityNameMatches(block.speakerLabel, player.aliases)) {
				evidence.add("recent_speaker_block");
			}
		}
		if (evidence.has("recent_speaker_block")) break;
	}

	return Array.from(evidence);
}

/**
 * Sole source of participation truth. Callers must not recalculate activity,
 * dialogue eligibility, or physical-action eligibility from raw text.
 */
export function resolveSceneParticipants(
	params: ResolveSceneParticipantsInput,
): ResolvedSceneParticipant[] {
	const player = toPlayerIdentity(params.playerIdentity);
	const overrides =
		params.capabilityOverrides ?? getSceneParticipantCapabilityOverrides(params.storyState);
	const identities = collectIdentityCandidates(params, player.keys);
	const playerEvidence = collectPlayerEvidence(player, params);
	const playerOverride = findCapabilityOverride(overrides, player.aliases);
	const resolved: ResolvedSceneParticipant[] = [
		{
			participantKey: normalizeParticipantKey(player.canonicalName) || player.canonicalName,
			canonicalName: player.canonicalName,
			aliases: player.aliases,
			active: true,
			capabilities: mergeParticipantCapabilities(playerOverride?.capabilities),
			activityEvidence: playerEvidence,
		},
	];

	for (const identity of identities) {
		const aliases = uniqueIdentityNames(Array.from(identity.aliases));
		const override = findCapabilityOverride(overrides, aliases);
		const evidence = Array.from(identity.evidence);
		resolved.push({
			participantKey: normalizeParticipantKey(identity.canonicalName) || identity.canonicalName,
			canonicalName: identity.canonicalName,
			aliases,
			active: evidence.length > 0,
			capabilities: mergeParticipantCapabilities(override?.capabilities),
			activityEvidence: evidence,
		});
	}

	return resolved.sort((left, right) => {
		const leftIsPlayer = normalizeParticipantKey(left.participantKey) === player.keys.values().next().value
			|| player.keys.has(normalizeParticipantKey(left.canonicalName));
		const rightIsPlayer = player.keys.has(normalizeParticipantKey(right.canonicalName));
		if (leftIsPlayer !== rightIsPlayer) {
			return leftIsPlayer ? -1 : 1;
		}
		return left.canonicalName.localeCompare(right.canonicalName);
	});
}
