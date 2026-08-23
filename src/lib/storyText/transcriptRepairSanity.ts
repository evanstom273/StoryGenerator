import { normalizeCharacterActionBeatsInTranscript } from "./playerSceneName";
import type { PlayerTranscriptIdentity } from "./playerTranscriptIdentity";
import { speakerLabelRefersToPlayer } from "./playerTranscriptIdentity";
import { findSpeakerColonIndex } from "./clockTimeInProse";
import { resolveSubjectPronoun } from "./playerSceneName";

const PLAYER_BEAT_PRONOUN_MISMATCH =
	/^(He|She|They)\s+(?:(?:[a-z]+ly)\s+)?(?:[a-z]+s)\b/i;

const KNOWN_BEAT_GARBAGE = /\b(?:gentlies|smile,s)\b/i;

function lineHasPlayerBeatCorruption(line: string, identity: PlayerTranscriptIdentity) {
	const colonIndex = findSpeakerColonIndex(line);
	if (colonIndex === null) {
		return false;
	}

	const label = line.slice(0, colonIndex).trim();
	if (!speakerLabelRefersToPlayer(label, identity)) {
		return false;
	}

	const remainder = line.slice(colonIndex + 1);
	if (!remainder.includes("*")) {
		return false;
	}

	if (KNOWN_BEAT_GARBAGE.test(remainder)) {
		return true;
	}

	const expected = identity.pronouns ? resolveSubjectPronoun(identity.pronouns) : null;
	if (!expected) {
		return false;
	}

	const beatMatch = remainder.match(/\*([^*]+)\*/);
	if (!beatMatch?.[1]) {
		return false;
	}

	const beat = beatMatch[1].trim();
	if (PLAYER_BEAT_PRONOUN_MISMATCH.test(beat)) {
		const leading = beat.match(/^(He|She|They)\b/i)?.[1];
		if (leading && leading.toLowerCase() !== expected.toLowerCase()) {
			return true;
		}
	}

	return false;
}

export function transcriptNeedsRepairSanityPass(
	text: string,
	identity: PlayerTranscriptIdentity,
): boolean {
	return text
		.replace(/\r\n/g, "\n")
		.split("\n")
		.some((line) => lineHasPlayerBeatCorruption(line, identity));
}

export function runTranscriptRepairSanityPass(
	text: string,
	identity: PlayerTranscriptIdentity,
): string {
	if (!transcriptNeedsRepairSanityPass(text, identity)) {
		return text;
	}

	return normalizeCharacterActionBeatsInTranscript(text, {
		playerIdentity: identity,
		forcePlayerPronouns: true,
	});
}
