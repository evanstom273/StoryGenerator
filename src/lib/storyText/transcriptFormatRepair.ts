import { repairSpeakerLabelArtifacts } from "./exportCleaner";
import { normalizeSceneSpeakerLabel } from "./speakerLabels";
import { countMisattributedPlayerSpeakerLines } from "./playerDialogueVoice";

const MISPLACED_DIALOGUE_SPEAKER_LABEL =
	/^(She|He|They|Her|Him|His|Their|Them|It|Its|[A-Z][a-zA-Z''-]{0,30})\??:\s+/;

const SPEAKER_LINE = /^([^\n:]{1,64})(:|\s[-—])\s*(.*)$/;

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

/** Split run-on lines where multiple speaker headers appear on one physical line. */
export function repairInlineSpeakerBoundaries(text: string) {
	return normalizeNewlines(text).replace(
		/([.!?…*])\s+((?:[A-Z][a-zA-Z''-]{0,30}|Narrator)):\s+/g,
		(full, punct, name, offset, source) => {
			const before = source.slice(Math.max(0, offset - 48), offset);
			if (/["“”'‘’][^"“”'‘’]*$/.test(before)) {
				return full;
			}
			return `${punct}\n\n${name}: `;
		},
	);
}

const ORPHAN_ACTION_LINE =
	/^(?:\*([^*]+)\*|([a-z][a-zA-Z''-]*(?:\s+[a-z][a-zA-Z''-]*){0,12}))\.?$/;

const IMPLIED_SUBJECT_START =
	/^(?:\*?)(?:steps|walks|turns|glances|looks|moves|crosses|places|sets|picks|reaches|leans|nods|shakes|smiles|flicks|gives|adjusts|flashes|slumps|hastily|quietly|strains|whispers|slides|slams|uncaps|lets|sets)\b/i;

/** Assign player label only to unlabeled implied-subject action lines without dialogue. */
export function repairPlayerOrphanActionLines(text: string, playerName?: string | null) {
	const playerLabel = playerName?.trim() ? normalizeSceneSpeakerLabel(playerName) : null;
	if (!playerLabel) {
		return text;
	}

	const lines = normalizeNewlines(text).split("\n");
	const output: string[] = [];

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || /^[^\n:]{1,64}:\s/.test(trimmed) || /"[^"]+"/.test(trimmed)) {
			output.push(line);
			continue;
		}

		const orphanMatch = trimmed.match(ORPHAN_ACTION_LINE);
		const actionText = orphanMatch?.[1] ?? orphanMatch?.[2] ?? trimmed.replace(/^\*+|\*+$/g, "");
		if (
			actionText.trim() &&
			IMPLIED_SUBJECT_START.test(actionText.replace(/^\*+|\*+$/g, ""))
		) {
			output.push(`${playerLabel}: ${wrapAction(actionText)}`);
			continue;
		}

		output.push(line);
	}

	return output.join("\n");
}

export function countUnlabeledCharacterDialogueLines(text: string) {
	return normalizeNewlines(text)
		.split("\n")
		.filter((line) => {
			const trimmed = line.trim();
			return trimmed && /"[^"]+"/.test(trimmed) && !/^[^\n:]{1,64}:\s/.test(trimmed);
		}).length;
}

export function needsSpeakerAttributionRewrite(
	text: string,
	playerName?: string | null,
) {
	if (countUnlabeledCharacterDialogueLines(text) >= 2) {
		return true;
	}

	return countMisattributedPlayerSpeakerLines(text, playerName) > 0;
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

/** Fix "Before can take" style clauses missing the subject. */
export function repairMissingActionSubjects(text: string, playerName?: string | null) {
	const subject = playerName?.trim() ? normalizeSceneSpeakerLabel(playerName) : "She";
	return text.replace(/\bBefore can take\b/gi, `Before ${subject} can take`);
}

/** Remove speaker labels the model accidentally placed inside quoted dialogue. */
export function repairMisplacedSpeakerLabelsInDialogue(text: string) {
	return normalizeNewlines(text).replace(/"([^"]+)"/g, (full, inner: string) => {
		let next = inner.trim();
		next = next.replace(/^([A-Z][a-zA-Z''-]{0,30})\?:\s+/, "$1, ");
		next = next.replace(MISPLACED_DIALOGUE_SPEAKER_LABEL, "");
		return next === inner.trim() ? full : `"${next}"`;
	});
}

export function repairMalformedTranscriptFormat(
	text: string,
	options: { playerName?: string | null } = {},
) {
	let next = text;
	next = repairInlineSpeakerBoundaries(next);
	next = repairSpeakerLabelEmDash(next);
	next = repairMalformedNarratorLines(next);
	next = repairMisplacedSpeakerLabelsInDialogue(next);
	next = repairStrayAsteriskArtifacts(next);
	next = repairSpeakerEmbeddedActions(next);
	next = repairMissingActionSubjects(next, options.playerName);
	next = repairPlayerOrphanActionLines(next, options.playerName);
	next = repairSpeakerLabelArtifacts(next);
	return next;
}

export function repairMalformedTranscriptFormatWithMeta(
	text: string,
	options: { playerName?: string | null } = {},
) {
	return {
		text: repairMalformedTranscriptFormat(text, options),
		strippedMisattributedPlayer: false,
	};
}
