import type { SceneParticipantCapabilities } from "../../types/models";
import type { ResolvedSceneParticipant } from "./resolveSceneParticipants";
import { normalizeParticipantKey } from "./identity";

export function participantCanSpeak(participant: ResolvedSceneParticipant): boolean {
	return participant.capabilities.canSpeak;
}

export function participantCanPerformPhysicalActions(
	participant: ResolvedSceneParticipant,
): boolean {
	return participant.capabilities.canPerformPhysicalActions;
}

export function participantCanBeAddressed(participant: ResolvedSceneParticipant): boolean {
	return participant.capabilities.canBeAddressed;
}

export function participantCanBePhysicallyInteractedWith(
	participant: ResolvedSceneParticipant,
): boolean {
	return participant.capabilities.canBePhysicallyInteractedWith;
}

export function participantIsDialogueEligible(participant: ResolvedSceneParticipant): boolean {
	return participant.active && participant.capabilities.canSpeak;
}

export function participantIsPhysicalActionEligible(
	participant: ResolvedSceneParticipant,
): boolean {
	return participant.active && participant.capabilities.canPerformPhysicalActions;
}

export function findResolvedParticipant(
	participants: readonly ResolvedSceneParticipant[],
	name: string | null | undefined,
): ResolvedSceneParticipant | null {
	const key = normalizeParticipantKey(name);
	if (!key) {
		return null;
	}
	return (
		participants.find(
			(participant) =>
				normalizeParticipantKey(participant.participantKey) === key ||
				normalizeParticipantKey(participant.canonicalName) === key ||
				participant.aliases.some((alias) => normalizeParticipantKey(alias) === key),
		) ?? null
	);
}

export function deriveParticipationModeLabel(
	capabilities: SceneParticipantCapabilities,
): string {
	const physical =
		capabilities.canPerformPhysicalActions && capabilities.canBePhysicallyInteractedWith;
	const spoken = capabilities.canSpeak && capabilities.canBeAddressed;
	if (spoken && physical) {
		return "physical";
	}
	if (spoken && !physical) {
		return "dialogue";
	}
	if (!spoken && physical) {
		return "physical-only";
	}
	return "present";
}
