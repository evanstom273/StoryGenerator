import { findSpeakerColonIndex } from "./clockTimeInProse";
import { collectEstablishedCharacterNames } from "./narratorBlockRepair";
import {
	getPlayerNameVariants,
	speakerLineLooksLikeMisattributedPlayer,
} from "./playerDialogueVoice";
import { normalizeSceneSpeakerLabel } from "./speakerLabels";

function escapeRegex(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeNewlines(text: string) {
	return text.replace(/\r\n/g, "\n");
}

function collectNonPlayerEstablishedNames(args: {
	playerName: string;
	knownTies?: string[] | null;
	transcriptText: string;
}) {
	const playerVariants = new Set(
		getPlayerNameVariants(args.playerName).map((variant) => variant.toLowerCase()),
	);
	const established = collectEstablishedCharacterNames({
		knownTies: args.knownTies,
		transcriptText: args.transcriptText,
	});

	return established.filter((name) => !playerVariants.has(name.toLowerCase()));
}

function collectMentionedNames(text: string, candidates: string[]) {
	const mentioned: string[] = [];

	for (const name of candidates) {
		if (new RegExp(`\\b${escapeRegex(name)}(?:'s)?\\b`, "i").test(text)) {
			mentioned.push(name);
		}
	}

	return mentioned;
}

function inferCorrectSpeakerForMisattributedLine(args: {
	line: string;
	playerName: string;
	knownTies?: string[] | null;
	transcriptText: string;
}): string | null {
	const nonPlayerNames = collectNonPlayerEstablishedNames({
		playerName: args.playerName,
		knownTies: args.knownTies,
		transcriptText: args.transcriptText,
	});
	if (!nonPlayerNames.length) {
		return null;
	}

	const mentioned = collectMentionedNames(args.line, nonPlayerNames);
	if (mentioned.length === 1) {
		return mentioned[0] ?? null;
	}
	if (mentioned.length > 1) {
		return null;
	}

	if (nonPlayerNames.length === 1) {
		return nonPlayerNames[0] ?? null;
	}

	return null;
}

function reassignSpeakerLabel(line: string, newSpeaker: string) {
	const trimmed = line.trim();
	const colonIndex = findSpeakerColonIndex(trimmed);
	if (colonIndex === null) {
		return line;
	}

	const remainder = trimmed.slice(colonIndex + 1).trim();
	return `${normalizeSceneSpeakerLabel(newSpeaker)}: ${remainder}`;
}

export function repairMisattributedPlayerSpeakerLabels(
	text: string,
	args: {
		playerName: string;
		knownTies?: string[] | null;
		transcriptText?: string | null;
	},
): { text: string; repaired: boolean; repairedCount: number } {
	const playerName = args.playerName.trim();
	if (!playerName) {
		return { text, repaired: false, repairedCount: 0 };
	}

	const transcriptText = args.transcriptText ?? text;
	const lines = normalizeNewlines(text).split("\n");
	let repairedCount = 0;

	const repairedLines = lines.map((line) => {
		if (!speakerLineLooksLikeMisattributedPlayer(line, playerName)) {
			return line;
		}

		const targetSpeaker = inferCorrectSpeakerForMisattributedLine({
			line,
			playerName,
			knownTies: args.knownTies,
			transcriptText,
		});
		if (!targetSpeaker) {
			return line;
		}

		repairedCount += 1;
		return reassignSpeakerLabel(line, targetSpeaker);
	});

	return {
		text: repairedLines.join("\n"),
		repaired: repairedCount > 0,
		repairedCount,
	};
}
