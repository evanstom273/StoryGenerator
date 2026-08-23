import { isDeniedSpeakerLabel } from "../relationshipIndex";
import { repairNarratorBlocks } from "./narratorBlockRepair";
import { repairSpeakerLabelArtifacts } from "./exportCleaner";
import {
	normalizeSceneSpeakerLabel,
	resolvePlayerSceneLabelForRepairs,
} from "./speakerLabels";
import {
	analyzeMisattributedPlayerSpeakerLine,
	type PlayerSpeakerMisattributionEvidence,
} from "./playerDialogueVoice";

export type TranscriptFormatRepairOptions = {
	playerName?: string | null;
	playerSceneName?: string | null;
	latestUserMessage?: string | null;
	knownTies?: string[] | null;
	transcriptText?: string | null;
};

const RESERVED_SPEAKER_LABELS = new Set(["narrator", "director", "time", "system", "assistant"]);

function isRepairableDeniedPseudoSpeakerLabel(label: string) {
	const trimmed = label.trim();
	if (!trimmed || RESERVED_SPEAKER_LABELS.has(trimmed.toLowerCase())) {
		return false;
	}
	return isDeniedSpeakerLabel(trimmed);
}

const SPEAKER_LINE = /^([^\n:]{1,64})(:|\s[-—])\s*(.*)$/;

const MISPLACED_DIALOGUE_SPEAKER_LABEL =
	/^(She|He|They|Her|Him|His|Their|Them|It|Its|[A-Z][a-zA-Z''-]{0,30})\??:\s+/;

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
	/^(?:\*?)(?:steps|walks|turns|glances|looks|moves|crosses|places|sets|picks|reaches|leans|nods|shakes|smiles|flicks|gives|adjusts|flashes|slumps|hastily|quietly|strains|whispers|slides|slams|uncaps|lets|sets|wraps|laughs|rests|cuddles)\b/i;

const ORPHAN_PRONOUN_ACTION_LINE = /^(He|She|They)\s+(.+)$/i;

const PLAYER_THIRD_PERSON_ACTION =
	/^(?:\*+\s*)?(?:He|She|They|His|Her|Their|Them)\b/i;

const PLAYER_PARENT_CALL_DIALOGUE =
	/"(?:[^"]*\b(?:Mom|Mother|Dad|Father)\b[^"]*)"/i;

function lineLooksLikePlayerCharacterBeat(remainder: string) {
	const trimmed = remainder.trim();
	if (!trimmed) {
		return false;
	}

	if (PLAYER_THIRD_PERSON_ACTION.test(trimmed)) {
		return true;
	}

	if (PLAYER_PARENT_CALL_DIALOGUE.test(trimmed)) {
		return true;
	}

	if (/"\s*(?:Mom|Mother|Dad|Father)\b/i.test(trimmed)) {
		return true;
	}

	return false;
}

function directorNoteHintsPlayerBeat(
	latestUserMessage: string | null | undefined,
	playerLabel: string,
) {
	const note = latestUserMessage?.trim() ?? "";
	if (!note) {
		return false;
	}

	const escaped = playerLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	if (new RegExp(`\\b${escaped}\\b`, "i").test(note)) {
		return true;
	}

	return /\b(?:sprints?|stumbles?|runs?|rushes?|breath(?:ing|less)?|panics?)\b/i.test(note);
}

/** Reassign denied pseudo-speaker labels (The, Saturday, He) to the player scene name. */
export function repairDeniedPseudoSpeakerPlayerLines(
	text: string,
	options: TranscriptFormatRepairOptions = {},
) {
	const playerLabel = resolvePlayerSceneLabelForRepairs(
		options.playerName,
		options.playerSceneName,
	);
	if (!playerLabel) {
		return text;
	}

	const directorHintsPlayer = directorNoteHintsPlayerBeat(
		options.latestUserMessage,
		playerLabel,
	);

	return normalizeNewlines(text)
		.split("\n")
		.map((line) => {
			const trimmed = line.trim();
			const match = trimmed.match(SPEAKER_LINE);
			if (!match?.[1] || !match[3]) {
				return line;
			}

			const label = match[1].trim();
			const remainder = match[3].trim();
			if (!isRepairableDeniedPseudoSpeakerLabel(label)) {
				return line;
			}

			const looksLikePlayer =
				lineLooksLikePlayerCharacterBeat(remainder) || directorHintsPlayer;
			if (!looksLikePlayer) {
				return line;
			}

			return `${playerLabel}: ${remainder}`;
		})
		.join("\n");
}

/** Assign player label only to unlabeled implied-subject action lines without dialogue. */
export function repairPlayerOrphanActionLines(
	text: string,
	options: TranscriptFormatRepairOptions = {},
) {
	const playerLabel = resolvePlayerSceneLabelForRepairs(
		options.playerName,
		options.playerSceneName,
	);
	if (!playerLabel) {
		return text;
	}

	const directorHintsPlayer = directorNoteHintsPlayerBeat(
		options.latestUserMessage,
		playerLabel,
	);

	const lines = normalizeNewlines(text).split("\n");
	const output: string[] = [];

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || /^[^\n:]{1,64}:\s/.test(trimmed) || /"[^"]+"/.test(trimmed)) {
			output.push(line);
			continue;
		}

		const pronounOrphan = trimmed.match(ORPHAN_PRONOUN_ACTION_LINE);
		if (
			pronounOrphan?.[2]?.trim() &&
			(lineLooksLikePlayerCharacterBeat(trimmed) || directorHintsPlayer)
		) {
			output.push(`${playerLabel}: ${wrapAction(trimmed)}`);
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

export type SpeakerAttributionIssueKind =
	| "misattributed_player"
	| "unlabelled_dialogue";

export type SpeakerAttributionIssueEvidence =
	| PlayerSpeakerMisattributionEvidence
	| "unlabelled_quoted_dialogue";

export type SpeakerAttributionIssue = {
	kind: SpeakerAttributionIssueKind;
	line: number;
	block: number;
	currentSpeaker: string | null;
	evidence: SpeakerAttributionIssueEvidence;
	confidence: "high" | "medium";
	reason: string;
};

export type SpeakerAttributionAnalysis = {
	issues: SpeakerAttributionIssue[];
	counts: Record<SpeakerAttributionIssueKind, number> & { total: number };
	needsRewrite: boolean;
};

/**
 * Return structured, content-free evidence for every suspicious attribution.
 * Line and block numbers are one-based so diagnostics map directly to a
 * transcript without exposing its prose.
 */
export function analyzeSpeakerAttributionIssues(
	text: string,
	playerName?: string | null,
): SpeakerAttributionAnalysis {
	const issues: SpeakerAttributionIssue[] = [];
	const lines = normalizeNewlines(text).split("\n");
	let block = 0;
	let nextNonEmptyStartsBlock = true;

	for (const [lineIndex, line] of lines.entries()) {
		const trimmed = line.trim();
		if (!trimmed) {
			nextNonEmptyStartsBlock = true;
			continue;
		}

		if (nextNonEmptyStartsBlock) {
			block += 1;
			nextNonEmptyStartsBlock = false;
		}

		const lineNumber = lineIndex + 1;
		if (/"[^"]+"/.test(trimmed) && !/^[^\n:]{1,64}:\s/.test(trimmed)) {
			issues.push({
				kind: "unlabelled_dialogue",
				line: lineNumber,
				block,
				currentSpeaker: null,
				evidence: "unlabelled_quoted_dialogue",
				confidence: "high",
				reason: "quoted dialogue is missing a speaker label",
			});
		}

		if (playerName?.trim()) {
			const misattribution = analyzeMisattributedPlayerSpeakerLine(line, playerName);
			if (misattribution) {
				issues.push({
					kind: "misattributed_player",
					line: lineNumber,
					block,
					currentSpeaker: misattribution.currentSpeaker,
					evidence: misattribution.evidence,
					confidence: misattribution.confidence,
					reason: misattribution.reason,
				});
			}
		}
	}

	const misattributedPlayer = issues.filter(
		(issue) => issue.kind === "misattributed_player",
	).length;
	const unlabelledDialogue = issues.filter(
		(issue) => issue.kind === "unlabelled_dialogue",
	).length;
	return {
		issues,
		counts: {
			misattributed_player: misattributedPlayer,
			unlabelled_dialogue: unlabelledDialogue,
			total: issues.length,
		},
		needsRewrite: misattributedPlayer > 0 || unlabelledDialogue >= 2,
	};
}

export function countUnlabeledCharacterDialogueLines(text: string) {
	return analyzeSpeakerAttributionIssues(text).counts.unlabelled_dialogue;
}

export function needsSpeakerAttributionRewrite(
	text: string,
	playerName?: string | null,
) {
	return analyzeSpeakerAttributionIssues(text, playerName).needsRewrite;
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
export function repairMissingActionSubjects(
	text: string,
	options: TranscriptFormatRepairOptions = {},
) {
	const subject =
		resolvePlayerSceneLabelForRepairs(options.playerName, options.playerSceneName) ?? "She";
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
	options: TranscriptFormatRepairOptions = {},
) {
	let next = text;
	next = repairInlineSpeakerBoundaries(next);
	next = repairSpeakerLabelEmDash(next);
	next = repairMalformedNarratorLines(next);
	next = repairNarratorBlocks(next, {
		knownTies: options.knownTies,
		transcriptText: options.transcriptText ?? options.latestUserMessage,
	});
	next = repairSpeakerLabelArtifacts(next);
	next = repairDeniedPseudoSpeakerPlayerLines(next, options);
	next = repairMisplacedSpeakerLabelsInDialogue(next);
	next = repairStrayAsteriskArtifacts(next);
	next = repairSpeakerEmbeddedActions(next);
	next = repairMissingActionSubjects(next, options);
	next = repairPlayerOrphanActionLines(next, options);
	return next;
}

export function repairMalformedTranscriptFormatWithMeta(
	text: string,
	options: TranscriptFormatRepairOptions = {},
) {
	return {
		text: repairMalformedTranscriptFormat(text, options),
		strippedMisattributedPlayer: false,
	};
}
