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

export type TranscriptRepairOptions = {
	identity: PlayerTranscriptIdentity;
	latestUserMessage?: string | null;
	applyActionBeatFormatting?: boolean;
	repairSpeakerAttribution?: boolean;
};

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
