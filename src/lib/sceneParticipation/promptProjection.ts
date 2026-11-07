import { normalizeParticipantKey } from "./identity";

type PromptIdentity = {
	canonicalName: string;
	aliases: string[];
};
import {
	deriveParticipationModeLabel,
	participantIsDialogueEligible,
	participantIsPhysicalActionEligible,
} from "./predicates";
import type { ResolvedSceneParticipant } from "./resolveSceneParticipants";

function formatIdentity(identity: Pick<ResolvedSceneParticipant, "canonicalName" | "aliases"> | PromptIdentity): string {
	const aliases = identity.aliases.filter(
		(alias) => normalizeParticipantKey(alias) !== normalizeParticipantKey(identity.canonicalName),
	);
	return aliases.length
		? `${identity.canonicalName} (aliases: ${aliases.join(", ")})`
		: identity.canonicalName;
}

function formatCapabilityConstraint(participant: ResolvedSceneParticipant): string {
	const capabilities = participant.capabilities;
	const parts: string[] = [];
	if (participantIsDialogueEligible(participant)) {
		parts.push("may speak");
	} else {
		parts.push("must not speak");
	}
	if (participantIsPhysicalActionEligible(participant)) {
		parts.push("may perform physical actions");
	} else {
		parts.push("must not perform physical actions");
	}
	if (capabilities.canBeAddressed) {
		parts.push("may be addressed");
	}
	if (capabilities.canBePhysicallyInteractedWith) {
		parts.push("may be physically interacted with");
	} else {
		parts.push("must not be physically interacted with");
	}
	return `${formatIdentity(participant)} [${deriveParticipationModeLabel(capabilities)}: ${parts.join("; ")}]`;
}

export function projectResolvedParticipantsToSpeakerRegistry(
	participants: readonly ResolvedSceneParticipant[],
	player: PromptIdentity,
): {
	player: PromptIdentity;
	eligibleNonPlayerSpeakers: Array<{
		canonicalName: string;
		aliases: string[];
		evidence: string[];
	}>;
} {
	const playerKey = normalizeParticipantKey(player.canonicalName);
	const playerAliases = new Set(player.aliases.map(normalizeParticipantKey));
	const eligibleNonPlayerSpeakers = participants
		.filter((participant) => {
			if (normalizeParticipantKey(participant.canonicalName) === playerKey) {
				return false;
			}
			if (participant.aliases.some((alias) => playerAliases.has(normalizeParticipantKey(alias)))) {
				return false;
			}
			return participant.active && participant.capabilities.canSpeak;
		})
		.map((participant) => ({
			canonicalName: participant.canonicalName,
			aliases: participant.aliases,
			evidence: [...participant.activityEvidence],
		}))
		.sort((left, right) => left.canonicalName.localeCompare(right.canonicalName));

	return {
		player: {
			canonicalName: player.canonicalName.trim(),
			aliases: player.aliases,
		},
		eligibleNonPlayerSpeakers,
	};
}

export function formatResolvedParticipationPrompt(
	participants: readonly ResolvedSceneParticipant[],
	player: PromptIdentity,
	allowDirectedPlayerControl: boolean,
): string {
	const playerKey = normalizeParticipantKey(player.canonicalName);
	const active = participants.filter(
		(participant) =>
			participant.active &&
			normalizeParticipantKey(participant.canonicalName) !== playerKey,
	);
	const eligible = active.length
		? active.map(formatCapabilityConstraint).join("; ")
		: "none established with enough current-scene evidence";

	const dialogueOnly = active.filter(
		(participant) =>
			participant.capabilities.canSpeak && !participant.capabilities.canPerformPhysicalActions,
	);
	const physical = active.filter((participant) => participant.capabilities.canPerformPhysicalActions);

	return [
		"Active participation registry (apply this semantically, not just syntactically):",
		`- Player character: ${formatIdentity(player)}.`,
		allowDirectedPlayerControl
			? "- This directed turn may control the player character, but every Name: block must still belong to the person acting and speaking in it."
			: "- Never emit a player-character Name: block on this turn; other characters may address or physically interact with the player only when their resolved capabilities allow it.",
		`- Non-player participants established in the current scene: ${eligible}.`,
		dialogueOnly.length
			? `- Dialogue-only participants (${dialogueOnly.map((participant) => participant.canonicalName).join(", ")}): emit Name: "Dialogue." blocks. Do not invent physical action beats or bodily presence for them.`
			: "",
		physical.length
			? `- Participants allowed to act physically (${physical.map((participant) => participant.canonicalName).join(", ")}): a Name: header may include *action* beats and quoted dialogue.`
			: "- No established non-player participant may perform physical actions in this scene.",
		`- A block that looks at, touches, names, or addresses ${player.canonicalName} as another person cannot also be owned by ${player.canonicalName}. Label it with the actual established actor/speaker.`,
		"- Never invent a speaker from pronouns alone. If ownership is unclear, use Narrator: for neutral prose or omit the uncertain beat.",
	]
		.filter(Boolean)
		.join("\n");
}
