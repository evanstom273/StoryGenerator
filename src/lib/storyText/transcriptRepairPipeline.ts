import { normalizeSpeakerNamesInTranscript } from "./speakerLabels";
import { repairClockTimeColonCorruption } from "./clockTimeInProse";
import { repairNarratorBlocks } from "./narratorBlockRepair";
import { repairMalformedTranscriptFormat } from "./transcriptFormatRepair";
import {
	applyPlayerSpeakerLabelsToTranscript,
	normalizeCharacterActionBeatsInTranscript,
} from "./playerSceneName";
import type { PlayerTranscriptIdentity } from "./playerTranscriptIdentity";
import { repairMisattributedPlayerSpeakerLabels } from "./speakerAttributionRepair";
import { runTranscriptRepairSanityPass } from "./transcriptRepairSanity";
import { parseSceneBlocks } from "./parseSceneBlocks";
import { parseActionSegments } from "./parseActionSegments";
import {
	findResolvedParticipant,
	type ResolvedSceneParticipant,
} from "../sceneParticipation";

export type TranscriptRepairOptions = {
	identity: PlayerTranscriptIdentity;
	latestUserMessage?: string | null;
	applyActionBeatFormatting?: boolean;
	repairSpeakerAttribution?: boolean;
	resolvedParticipants?: readonly ResolvedSceneParticipant[] | null;
};

function preserveDialogueOnlyBlocks(
	text: string,
	participants: readonly ResolvedSceneParticipant[],
): string {
	return parseSceneBlocks(text)
		.map((block) => {
			const label = block.speakerLabel?.trim();
			if (!label || /^narrator$/i.test(label)) {
				return label ? `${label}: ${block.text}` : block.text;
			}
			const participant = findResolvedParticipant(participants, label);
			if (!participant || participant.capabilities.canPerformPhysicalActions) {
				return `${label}: ${block.text}`;
			}
			const dialogue = parseActionSegments(block.text)
				.filter((segment) => segment.type === "text")
				.map((segment) => segment.text.trim())
				.filter(Boolean)
				.join(" ");
			return dialogue ? `${label}: ${dialogue}` : `${label}: ${block.text}`;
		})
		.join("\n\n");
}

function capitalizeFirstLetter(text: string): string {
	return text.replace(/^([^a-zA-Z]*)([a-zA-Z])/, (_, prefix, letter) => prefix + letter.toUpperCase());
}

function normalizeTranscriptWhitespace(text: string): string {
	return text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

export function repairAssistantTranscript(
	text: string,
	options: TranscriptRepairOptions,
): string {
	const identity = options.identity;
	const transcriptText = identity.transcriptText ?? options.latestUserMessage ?? text;

	let normalized = capitalizeFirstLetter(
		normalizeTranscriptWhitespace(repairClockTimeColonCorruption(text)),
	);

	normalized = normalizeSpeakerNamesInTranscript(
		repairMalformedTranscriptFormat(normalized, {
			playerName: identity.legalName,
			playerSceneName: identity.sceneName,
			latestUserMessage: options.latestUserMessage,
			knownTies: identity.knownTies,
			transcriptText,
		}),
	);

	normalized = repairNarratorBlocks(normalized, {
		knownTies: identity.knownTies,
		transcriptText,
	});

	normalized = applyPlayerSpeakerLabelsToTranscript(normalized, identity);

	if (options.resolvedParticipants?.length) {
		normalized = preserveDialogueOnlyBlocks(normalized, options.resolvedParticipants);
	}

	if (options.applyActionBeatFormatting !== false) {
		normalized = normalizeCharacterActionBeatsInTranscript(normalized, {
			playerIdentity: identity,
		});
	}

	normalized = repairNarratorBlocks(normalized, {
		knownTies: identity.knownTies,
		transcriptText: normalized,
	});

	normalized = runTranscriptRepairSanityPass(normalized, identity);

	if (options.repairSpeakerAttribution !== false) {
		const speakerRepair = repairMisattributedPlayerSpeakerLabels(normalized, {
			playerName: identity.legalName,
			knownTies: identity.knownTies,
			transcriptText: normalized,
		});
		normalized = speakerRepair.text;
	}

	return normalized;
}
