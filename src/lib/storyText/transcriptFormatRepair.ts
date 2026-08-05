import { normalizeSceneSpeakerLabel } from "./speakerLabels";
import {
	dialogueLooksAddressedToPlayer,
	dialogueLooksLikePlayerVoice,
	extractQuotedDialogue,
	stripMisattributedPlayerSpeakerLabel,
} from "./playerDialogueVoice";

const SPEAKER_LINE = /^([^\n:]{1,64})(:|\s[-—])\s*(.*)$/;

const ORPHAN_ACTION_LINE =
	/^(?:\*([^*]+)\*|([a-z][a-zA-Z''-]*(?:\s+[a-z][a-zA-Z''-]*){0,12}))\.?$/;

const IMPLIED_SUBJECT_START =
	/^(?:\*?)(?:steps|walks|turns|glances|looks|moves|crosses|places|sets|picks|reaches|leans|nods|shakes|smiles|flicks|gives|adjusts|flashes|slumps|hastily|quietly|strains|whispers|slides|slams|uncaps|lets|sets)\b/i;

function normalizeNewlines(text: string) {
	return text.replace(/\r\n/g, "\n");
}

function wrapAction(value: string) {
	const trimmed = value.trim();
	if (!trimmed) {
		return "";
	}
	if (trimmed.startsWith("*") && trimmed.endsWith("*") && trimmed.length > 2) {
		return trimmed;
	}
	return `*${trimmed}*`;
}

function resolveOrphanSpeakerLabel(
	line: string,
	lastSpeaker: string | null,
	playerName?: string | null,
) {
	const trimmed = line.trim();
	const playerLabel = playerName?.trim() ? normalizeSceneSpeakerLabel(playerName) : null;
	const dialogue = extractQuotedDialogue(trimmed);
	const hasDialogue = dialogue.length > 0;

	if (playerLabel && hasDialogue) {
		if (dialogueLooksAddressedToPlayer(dialogue, playerName!)) {
			if (
				lastSpeaker &&
				lastSpeaker.toLowerCase() !== playerLabel.toLowerCase() &&
				lastSpeaker.toLowerCase() !== "narrator"
			) {
				return lastSpeaker;
			}
			return null;
		}

		if (!dialogueLooksLikePlayerVoice(dialogue, playerName!)) {
			if (
				lastSpeaker &&
				lastSpeaker.toLowerCase() !== playerLabel.toLowerCase() &&
				lastSpeaker.toLowerCase() !== "narrator"
			) {
				return lastSpeaker;
			}
			return null;
		}
	}

	if (!hasDialogue && playerLabel && IMPLIED_SUBJECT_START.test(trimmed)) {
		return playerLabel;
	}

	if (lastSpeaker) {
		return lastSpeaker;
	}

	if (playerLabel && !hasDialogue) {
		return playerLabel;
	}

	return null;
}

/** Remove player labels from lines that are clearly other characters talking to/about the player. */
export function repairMisattributedPlayerSpeakerLines(
	text: string,
	playerName?: string | null,
): { text: string; changed: boolean } {
	if (!playerName?.trim()) {
		return { text, changed: false };
	}

	const lines = normalizeNewlines(text).split("\n");
	let changed = false;
	const output = lines.map((line) => {
		const next = stripMisattributedPlayerSpeakerLabel(line, playerName);
		if (next !== line) {
			changed = true;
		}
		return next;
	});

	return { text: output.join("\n"), changed };
}

export function countUnlabeledCharacterDialogueLines(text: string) {
	return normalizeNewlines(text)
		.split("\n")
		.filter((line) => {
			const trimmed = line.trim();
			return trimmed && /"[^"]+"/.test(trimmed) && !/^[^\n:]{1,64}:\s/.test(trimmed);
		}).length;
}

export function needsSpeakerAttributionRewrite(text: string) {
	return countUnlabeledCharacterDialogueLines(text) >= 2;
}

/** Normalize "Name — *action*" back to "Name: *action*" when em dash was used as separator. */
export function repairSpeakerLabelEmDash(text: string) {
	const lines = normalizeNewlines(text).split("\n");

	return lines
		.map((line) => {
			const trimmed = line.trim();
			const match = trimmed.match(/^([^\n:]{1,64})\s[-—]\s+(\*[^*].*)$/);
			if (!match?.[1] || !match[2]) {
				return line;
			}

			const label = normalizeSceneSpeakerLabel(match[1].trim());
			return `${label}: ${match[2].trim()}`;
		})
		.join("\n");
}

/** Fix *Narrator: *text* and other wrapped narrator labels. */
export function repairMalformedNarratorLines(text: string) {
	const lines = normalizeNewlines(text).split("\n");

	return lines
		.map((line) => {
			const trimmed = line.trim();
			if (!trimmed) {
				return line;
			}

			const wrappedNarrator = trimmed.match(/^\*+\s*Narrator\s*(?::|\s[-—])\s*\*?\s*(.+?)\s*\*+\s*$/i);
			if (wrappedNarrator?.[1]) {
				return `Narrator: ${wrapAction(wrappedNarrator[1])}`;
			}

			const narratorOnlyWrap = trimmed.match(/^Narrator\s*(?::|\s[-—])\s*\*+\s*(.+)\*+\s*$/i);
			if (narratorOnlyWrap?.[1]) {
				return `Narrator: ${wrapAction(narratorOnlyWrap[1])}`;
			}

			return line;
		})
		.join("\n");
}

/** Remove stray *.* artifacts and empty action markers. */
export function repairStrayAsteriskArtifacts(text: string) {
	let next = text.replace(/\s*\*\.\*\s*/g, " ");
	next = next.replace(/"\s*\*\s*\.\s*\*?\s*"/g, '" "');
	next = next.replace(/\s+\*\s*\.\s*(?=\*|[A-Za-z"])/g, " ");
	return next.replace(/\n{3,}/g, "\n\n");
}

/** Split "dialogue." *action* "more" into separate speaker beats on one line. */
export function repairSpeakerEmbeddedActions(text: string) {
	const lines = normalizeNewlines(text).split("\n");

	return lines
		.map((line) => {
			const match = line.match(SPEAKER_LINE);
			if (!match?.[1] || !match[3]) {
				return line;
			}

			const label = match[1].trim();
			let remainder = match[3].trim();
			if (!remainder.includes('"') || !remainder.includes("*")) {
				return line;
			}

			remainder = remainder.replace(
				/"([^"]+)"\s+(\*[^*]+\*)\s+"([^"]+)"/g,
				(_full, left: string, action: string, right: string) =>
					`"${left}" ${action}\n${label}: "${right}"`,
			);

			remainder = remainder.replace(
				/"([^"]+)"\s+(\*[^*]+\*)(?=\s*$)/g,
				(_full, dialogue: string, action: string) => `"${dialogue}" ${action}`,
			);

			return `${label}: ${remainder}`;
		})
		.join("\n");
}

/** Fill common truncated detective references when Jake/Rosa are in scene. */
export function repairTruncatedDetectiveReferences(text: string) {
	if (!/\bJake\b/i.test(text) || !/\bRosa\b/i.test(text)) {
		return text;
	}

	let next = text;
	next = next.replace(/\bDetective intense\b/gi, "Detective Diaz's intense");
	next = next.replace(/\bDetective theatrical\b/gi, "Detective Peralta's theatrical");
	return next;
}

/** Fix "Before can take" style clauses missing the subject. */
export function repairMissingActionSubjects(text: string, playerName?: string | null) {
	const subject = playerName?.trim() ? normalizeSceneSpeakerLabel(playerName) : "She";
	return text.replace(/\bBefore can take\b/gi, `Before ${subject} can take`);
}

/** Attribute orphan implied-subject action lines to the player or previous speaker. */
export function repairOrphanActionLines(text: string, playerName?: string | null) {
	const lines = normalizeNewlines(text).split("\n");
	const output: string[] = [];
	let lastSpeaker: string | null = null;

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) {
			output.push("");
			continue;
		}

		if (trimmed === "---" || trimmed === "***") {
			output.push(trimmed);
			lastSpeaker = null;
			continue;
		}

		const speakerMatch = trimmed.match(SPEAKER_LINE);
		if (speakerMatch?.[1]) {
			lastSpeaker = normalizeSceneSpeakerLabel(speakerMatch[1].trim());
			output.push(line);
			continue;
		}

		const orphanMatch = trimmed.match(ORPHAN_ACTION_LINE);
		const looksLikeOrphanAction =
			Boolean(orphanMatch) ||
			(!trimmed.startsWith('"') &&
				!trimmed.startsWith("*Narrator") &&
				!/^Narrator\s*(?::|\s[-—])/i.test(trimmed) &&
				IMPLIED_SUBJECT_START.test(trimmed));

		if (looksLikeOrphanAction) {
			const actionText = orphanMatch?.[1] ?? orphanMatch?.[2] ?? trimmed.replace(/^\*+|\*+$/g, "");
			const speaker = resolveOrphanSpeakerLabel(trimmed, lastSpeaker, playerName);
			if (speaker && actionText.trim()) {
				output.push(`${speaker}: ${wrapAction(actionText)}`);
				lastSpeaker = speaker;
				continue;
			}
		}

		const orphanDialogue = extractQuotedDialogue(trimmed);
		if (
			orphanDialogue &&
			playerName?.trim() &&
			!trimmed.match(SPEAKER_LINE)
		) {
			const speaker = resolveOrphanSpeakerLabel(trimmed, lastSpeaker, playerName);
			if (speaker) {
				output.push(`${speaker}: ${trimmed}`);
				lastSpeaker = speaker;
				continue;
			}
		}

		output.push(line);
	}

	return output.join("\n");
}

export function repairMalformedTranscriptFormat(
	text: string,
	options: { playerName?: string | null } = {},
) {
	let next = text;
	next = repairSpeakerLabelEmDash(next);
	next = repairMalformedNarratorLines(next);
	next = repairStrayAsteriskArtifacts(next);
	next = repairSpeakerEmbeddedActions(next);
	next = repairTruncatedDetectiveReferences(next);
	next = repairMissingActionSubjects(next, options.playerName);
	next = repairMisattributedPlayerSpeakerLines(next, options.playerName).text;
	next = repairOrphanActionLines(next, options.playerName);
	return repairMisattributedPlayerSpeakerLines(next, options.playerName).text;
}

export function repairMalformedTranscriptFormatWithMeta(
	text: string,
	options: { playerName?: string | null } = {},
) {
	let next = text;
	let strippedMisattributedPlayer = false;
	next = repairSpeakerLabelEmDash(next);
	next = repairMalformedNarratorLines(next);
	next = repairStrayAsteriskArtifacts(next);
	next = repairSpeakerEmbeddedActions(next);
	next = repairTruncatedDetectiveReferences(next);
	next = repairMissingActionSubjects(next, options.playerName);
	const firstPass = repairMisattributedPlayerSpeakerLines(next, options.playerName);
	next = firstPass.text;
	strippedMisattributedPlayer ||= firstPass.changed;
	next = repairOrphanActionLines(next, options.playerName);
	const secondPass = repairMisattributedPlayerSpeakerLines(next, options.playerName);
	next = secondPass.text;
	strippedMisattributedPlayer ||= secondPass.changed;
	return { text: next, strippedMisattributedPlayer };
}
