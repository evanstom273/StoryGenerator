import { splitDialogueQuoteRegions } from "./dialogueQuoteRegions";
import { normalizeSceneSpeakerLabel } from "./speakerLabels";

export interface SemanticSpeakerIdentity {
	id?: string;
	name: string;
	aliases?: readonly string[];
}

export type SemanticSpeakerEvidenceKind =
	| "named-player-action-target"
	| "dialogue-second-person-address"
	| "dialogue-imperative-address"
	| "dialogue-player-vocative";

export interface SemanticSpeakerEvidence {
	kind: SemanticSpeakerEvidenceKind;
	match: string;
}

export type SemanticSpeakerResolutionReason =
	| "reassigned-single-eligible-speaker"
	| "ambiguous-eligible-speakers"
	| "no-eligible-speaker"
	| "insufficient-semantic-evidence";

export interface SemanticSpeakerResolutionDiagnostic {
	blockIndex: number;
	lineNumber: number;
	originalSpeakerLabel: string;
	replacementSpeakerLabel?: string;
	decision: "reassigned" | "unchanged";
	reason: SemanticSpeakerResolutionReason;
	eligibleAlternativeSpeakers: string[];
	evidence: SemanticSpeakerEvidence[];
}

export interface SemanticSpeakerResolutionChange {
	blockIndex: number;
	lineNumber: number;
	originalSpeakerLabel: string;
	replacementSpeakerLabel: string;
	labelStart: number;
	labelEnd: number;
	evidence: SemanticSpeakerEvidence[];
}

export interface ResolveSemanticSpeakerAttributionInput {
	text: string;
	player: SemanticSpeakerIdentity;
	/** All characters who may own generated blocks in this scene. The player may be included. */
	eligibleSpeakers: readonly SemanticSpeakerIdentity[];
}

export interface SemanticSpeakerResolutionResult {
	text: string;
	changed: boolean;
	changes: SemanticSpeakerResolutionChange[];
	diagnostics: SemanticSpeakerResolutionDiagnostic[];
}

interface ParsedSpeakerHeader {
	blockIndex: number;
	lineNumber: number;
	start: number;
	labelStart: number;
	labelEnd: number;
	colonEnd: number;
	label: string;
}

interface TextLineRange {
	start: number;
	contentStart: number;
	contentEnd: number;
	nextStart: number;
	lineNumber: number;
}

interface TextContentRange {
	start: number;
	end: number;
	lastLineIndex: number;
}

const UNLABELLED_SPEAKER = "(unlabelled)";

function normalizeIdentityValue(value: string) {
	return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function identityAliases(identity: SemanticSpeakerIdentity) {
	const aliases = new Set<string>();
	const values = [identity.name, ...(identity.aliases ?? [])];

	for (const value of values) {
		const normalized = normalizeIdentityValue(value);
		if (normalized) {
			aliases.add(normalized);
		}

		const sceneName = normalizeIdentityValue(normalizeSceneSpeakerLabel(value));
		if (sceneName) {
			aliases.add(sceneName);
		}
	}

	return aliases;
}

function identitiesMatch(left: SemanticSpeakerIdentity, right: SemanticSpeakerIdentity) {
	if (left.id && right.id) {
		return normalizeIdentityValue(left.id) === normalizeIdentityValue(right.id);
	}

	const leftAliases = identityAliases(left);
	return Array.from(identityAliases(right)).some((alias) => leftAliases.has(alias));
}

function uniqueNonPlayerSpeakers(
	player: SemanticSpeakerIdentity,
	eligibleSpeakers: readonly SemanticSpeakerIdentity[],
) {
	const unique = new Map<string, SemanticSpeakerIdentity>();

	for (const speaker of eligibleSpeakers) {
		if (!speaker.name.trim() || identitiesMatch(player, speaker)) {
			continue;
		}

		const normalizedName = normalizeIdentityValue(speaker.name);
		if (normalizedName === "narrator" || normalizedName === "director") {
			continue;
		}

		const key = speaker.id
			? `id:${normalizeIdentityValue(speaker.id)}`
			: `name:${normalizedName}`;
		if (!unique.has(key)) {
			unique.set(key, speaker);
		}
	}

	return Array.from(unique.values());
}

const NON_NAME_HEADER_WORDS = new Set([
	"a",
	"an",
	"and",
	"as",
	"at",
	"before",
	"but",
	"chapter",
	"finally",
	"he",
	"her",
	"his",
	"i",
	"it",
	"later",
	"meanwhile",
	"note",
	"now",
	"scene",
	"she",
	"suddenly",
	"the",
	"their",
	"they",
	"time",
	"we",
	"when",
	"while",
	"you",
]);

function isPlausibleSpeakerLabel(label: string, knownLabels: ReadonlySet<string>) {
	const normalized = normalizeIdentityValue(label);
	if (knownLabels.has(normalized) || normalized === "narrator") {
		return true;
	}
	if (!normalized || /[,()[\]{}*]/.test(label) || /['\u2019]s$/i.test(label)) {
		return false;
	}

	const words = label.trim().split(/\s+/);
	if (words.length > 4 || NON_NAME_HEADER_WORDS.has(normalizeIdentityValue(words[0] ?? ""))) {
		return false;
	}

	return words.every((word) => /^(?:\p{Lu}[\p{L}\p{M}'\u2019.-]*|\d+)$/u.test(word));
}

function parseSpeakerHeaders(text: string, knownLabels: ReadonlySet<string>) {
	const headers: ParsedSpeakerHeader[] = [];
	const headerPattern = /^([ \t]*)([^:\r\n]{1,80})(:)[^\r\n]*/gm;

	for (const match of text.matchAll(headerPattern)) {
		const matchStart = match.index;
		if (matchStart === undefined) {
			continue;
		}

		const indentation = match[1] ?? "";
		const rawLabel = match[2] ?? "";
		const label = rawLabel.trim();
		if (!label || !isPlausibleSpeakerLabel(label, knownLabels)) {
			continue;
		}

		const trailingWhitespaceLength = rawLabel.length - rawLabel.trimEnd().length;
		const labelStart = matchStart + indentation.length;
		const labelEnd = labelStart + rawLabel.length - trailingWhitespaceLength;
		const lineNumber = 1 + (text.slice(0, matchStart).match(/\n/g)?.length ?? 0);

		headers.push({
			blockIndex: headers.length,
			lineNumber,
			start: matchStart,
			labelStart,
			labelEnd,
			colonEnd: matchStart + indentation.length + rawLabel.length + 1,
			label,
		});
	}

	return headers;
}

function parseTextLines(text: string): TextLineRange[] {
	const lines: TextLineRange[] = [];
	let start = 0;
	let lineNumber = 1;

	while (start < text.length) {
		const newlineIndex = text.indexOf("\n", start);
		const nextStart = newlineIndex === -1 ? text.length : newlineIndex + 1;
		let contentEnd = newlineIndex === -1 ? text.length : newlineIndex;
		if (contentEnd > start && text[contentEnd - 1] === "\r") {
			contentEnd -= 1;
		}

		const lineText = text.slice(start, contentEnd);
		const indentationLength = lineText.match(/^[ \t]*/)?.[0].length ?? 0;
		lines.push({
			start,
			contentStart: start + indentationLength,
			contentEnd,
			nextStart,
			lineNumber,
		});

		if (newlineIndex === -1) {
			break;
		}
		start = nextStart;
		lineNumber += 1;
	}

	return lines;
}

function findLineIndexAtOffset(lines: readonly TextLineRange[], offset: number) {
	return lines.findIndex((line) => offset >= line.start && offset <= line.contentEnd);
}

function isBlankLine(text: string, line: TextLineRange) {
	return text.slice(line.start, line.contentEnd).trim().length === 0;
}

function firstHeaderInRange(
	headers: readonly ParsedSpeakerHeader[],
	start: number,
	end: number,
) {
	return headers.find((header) => header.start >= start && header.start < end);
}

/**
 * Limit semantic evidence to the actual labelled block. Inline blocks end with
 * their physical line. Header-only blocks may consume the following paragraph,
 * but never cross a blank line or another plausible speaker header.
 */
function findHeaderContentRange(
	text: string,
	header: ParsedSpeakerHeader,
	headers: readonly ParsedSpeakerHeader[],
	lines: readonly TextLineRange[],
): TextContentRange | null {
	const headerLineIndex = findLineIndexAtOffset(lines, header.start);
	const headerLine = lines[headerLineIndex];
	if (!headerLine) {
		return null;
	}

	const inlineContent = text.slice(header.colonEnd, headerLine.contentEnd);
	if (inlineContent.trim()) {
		const nextHeader = firstHeaderInRange(headers, header.colonEnd, headerLine.contentEnd);
		return {
			start: header.colonEnd,
			end: nextHeader?.start ?? headerLine.contentEnd,
			lastLineIndex: headerLineIndex,
		};
	}

	const firstBodyLineIndex = headerLineIndex + 1;
	const firstBodyLine = lines[firstBodyLineIndex];
	if (!firstBodyLine || isBlankLine(text, firstBodyLine)) {
		return null;
	}

	const headerAtBodyStart = firstHeaderInRange(
		headers,
		firstBodyLine.start,
		firstBodyLine.nextStart,
	);
	if (headerAtBodyStart) {
		return null;
	}

	let lastLineIndex = firstBodyLineIndex;
	let end = firstBodyLine.contentEnd;
	for (let index = firstBodyLineIndex + 1; index < lines.length; index += 1) {
		const line = lines[index]!;
		if (isBlankLine(text, line)) {
			break;
		}
		const nextHeader = firstHeaderInRange(headers, line.start, line.nextStart);
		if (nextHeader) {
			break;
		}
		lastLineIndex = index;
		end = line.contentEnd;
	}

	return {
		start: firstBodyLine.contentStart,
		end,
		lastLineIndex,
	};
}

function findImmediatelyFollowingUnlabelledBlock(
	text: string,
	precedingBlock: TextContentRange,
	headers: readonly ParsedSpeakerHeader[],
	lines: readonly TextLineRange[],
): (TextContentRange & { lineNumber: number }) | null {
	let firstLineIndex = precedingBlock.lastLineIndex + 1;
	while (firstLineIndex < lines.length && isBlankLine(text, lines[firstLineIndex]!)) {
		firstLineIndex += 1;
	}

	const firstLine = lines[firstLineIndex];
	if (!firstLine) {
		return null;
	}

	if (firstHeaderInRange(headers, firstLine.start, firstLine.nextStart)) {
		return null;
	}

	let lastLineIndex = firstLineIndex;
	let end = firstLine.contentEnd;
	for (let index = firstLineIndex + 1; index < lines.length; index += 1) {
		const line = lines[index]!;
		if (isBlankLine(text, line)) {
			break;
		}
		if (firstHeaderInRange(headers, line.start, line.nextStart)) {
			break;
		}
		lastLineIndex = index;
		end = line.contentEnd;
	}

	return {
		start: firstLine.contentStart,
		end,
		lastLineIndex,
		lineNumber: firstLine.lineNumber,
	};
}

function escapeRegex(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function aliasPattern(aliases: ReadonlySet<string>) {
	return Array.from(aliases)
		.filter((alias) => alias.length >= 2)
		.sort((left, right) => right.length - left.length)
		.map(escapeRegex)
		.join("|");
}

function findNamedPlayerActionTarget(actionText: string, playerAliases: ReadonlySet<string>) {
	const aliases = aliasPattern(playerAliases);
	if (!aliases) {
		return null;
	}

	const playerReference = `(?:${aliases})(?:\\s*['\u2019]s)?`;
	const directTargetVerb =
		"(?:grip(?:s|ped|ping)?|grab(?:s|bed|bing)?|touch(?:es|ed|ing)?|hold(?:s|ing)?|held|" +
		"stroke(?:s|d|ing)?|trace(?:s|d|ing)?|watch(?:es|ed|ing)?|stud(?:y|ies|ied|ying)|" +
		"kiss(?:es|ed|ing)?|caress(?:es|ed|ing)?|press(?:es|ed|ing)?|pull(?:s|ed|ing)?|" +
		"push(?:es|ed|ing)?|guide(?:s|d|ing)?|pin(?:s|ned|ning)?|cup(?:s|ped|ping)?|" +
		"clutch(?:es|ed|ing)?|seiz(?:e|es|ed|ing))";
	const targetPreposition =
		"(?:at|toward(?:s)?|against|around|onto|over|along|across|into|inside|between|near|beside|behind|under)";
	const patterns = [
		new RegExp(`\\b${directTargetVerb}\\s+(?:directly\\s+)?${playerReference}\\b`, "i"),
		new RegExp(`\\b${targetPreposition}\\s+(?:the\\s+)?${playerReference}\\b`, "i"),
	];

	for (const pattern of patterns) {
		const match = actionText.match(pattern);
		if (match?.[0]) {
			return match[0];
		}
	}

	return null;
}

function findDialogueAddressEvidence(
	dialogueRegions: readonly string[],
	playerAliases: ReadonlySet<string>,
) {
	const evidence: SemanticSpeakerEvidence[] = [];
	const aliases = aliasPattern(playerAliases);
	const secondPerson = /\b(?:you|your|yours|yourself|yourselves)\b|\byou['\u2019](?:re|ve|ll|d)\b/i;
	const imperative =
		/^\s*(?:(?:then|now|just|please|okay|ok|well)\b[\s,:-]*)*(?:do\s+not|don['\u2019]t|never|stop|bring|come|take|give|put|move|get|show|tell|let|keep|hold|touch|kiss|turn|stay|wait|sit|stand|lie|kneel|open|close|go|use|listen)\b/i;
	const vocative = aliases
		? new RegExp(`^\\s*(?:hey\\s+)?(?:${aliases})\\s*[,!?:]`, "i")
		: null;

	for (const dialogue of dialogueRegions) {
		const secondPersonMatch = dialogue.match(secondPerson)?.[0];
		if (secondPersonMatch) {
			evidence.push({ kind: "dialogue-second-person-address", match: secondPersonMatch });
		}

		const imperativeMatch = dialogue.match(imperative)?.[0]?.trim();
		if (imperativeMatch) {
			evidence.push({ kind: "dialogue-imperative-address", match: imperativeMatch });
		}

		const vocativeMatch = vocative ? dialogue.match(vocative)?.[0]?.trim() : undefined;
		if (vocativeMatch) {
			evidence.push({ kind: "dialogue-player-vocative", match: vocativeMatch });
		}
	}

	return evidence;
}

function collectSpeakerContradictionEvidence(
	blockText: string,
	playerAliases: ReadonlySet<string>,
) {
	const regions = splitDialogueQuoteRegions(blockText);
	const actionText = regions
		.filter((region) => region.kind === "unquoted")
		.map((region) => region.text)
		.join(" ");
	const dialogueRegions = regions
		.filter((region) => region.kind === "quoted")
		.map((region) => region.text);
	const actionTargetMatch = findNamedPlayerActionTarget(actionText, playerAliases);
	const dialogueEvidence = findDialogueAddressEvidence(dialogueRegions, playerAliases);
	const evidence: SemanticSpeakerEvidence[] = actionTargetMatch
		? [{ kind: "named-player-action-target", match: actionTargetMatch }, ...dialogueEvidence]
		: dialogueEvidence;
	const firstPersonVoice =
		/\b(?:i|me|my|mine|myself)\b|\bi['\u2019](?:m|ve|d|ll)\b/i;
	const hasConflictingFirstPersonEvidence = [actionText, ...dialogueRegions].some((region) =>
		firstPersonVoice.test(region),
	);

	return {
		evidence,
		hasDirectPlayerTargetEvidence: Boolean(actionTargetMatch),
		hasIndependentEvidence: Boolean(actionTargetMatch) && dialogueEvidence.length > 0,
		hasConflictingFirstPersonEvidence,
	};
}

function evidenceSupportsReassignment(
	evidence: ReturnType<typeof collectSpeakerContradictionEvidence>,
	alternativeSpeakerCount: number,
	hasUnregisteredSpeakerHeader: boolean,
) {
	if (evidence.hasIndependentEvidence) {
		return true;
	}

	return (
		alternativeSpeakerCount === 1 &&
		!hasUnregisteredSpeakerHeader &&
		evidence.hasDirectPlayerTargetEvidence &&
		!evidence.hasConflictingFirstPersonEvidence
	);
}

/**
 * Repair a player-labelled block, or an unlabelled block immediately after a
 * genuine player block, when its action explicitly targets the player and one
 * non-player speaker is the sole eligible owner. Independent dialogue-address
 * evidence is normally required; a direct named-player target can stand alone
 * only in a single-NPC scene without conflicting first-person voice. Existing
 * labels are replaced in place; orphan repairs insert only the missing label
 * and leave all other bytes untouched.
 */
export function resolveSemanticSpeakerAttribution({
	text,
	player,
	eligibleSpeakers,
}: ResolveSemanticSpeakerAttributionInput): SemanticSpeakerResolutionResult {
	const playerAliases = identityAliases(player);
	const alternativeSpeakers = uniqueNonPlayerSpeakers(player, eligibleSpeakers);
	const knownLabels = new Set<string>(["narrator"]);

	for (const alias of playerAliases) {
		knownLabels.add(alias);
	}
	for (const speaker of eligibleSpeakers) {
		for (const alias of identityAliases(speaker)) {
			knownLabels.add(alias);
		}
	}

	const headers = parseSpeakerHeaders(text, knownLabels);
	const lines = parseTextLines(text);
	const registeredSpeakerAliases = new Set<string>(["narrator", "director", ...playerAliases]);
	for (const speaker of alternativeSpeakers) {
		for (const alias of identityAliases(speaker)) {
			registeredSpeakerAliases.add(alias);
		}
	}
	const hasUnregisteredSpeakerHeader = headers.some(
		(header) => !registeredSpeakerAliases.has(normalizeIdentityValue(header.label)),
	);
	const diagnostics: SemanticSpeakerResolutionDiagnostic[] = [];
	const changes: SemanticSpeakerResolutionChange[] = [];
	const reassignedPlayerHeaderStarts = new Set<number>();
	const eligibleAlternativeSpeakers = alternativeSpeakers.map((speaker) => speaker.name);

	for (let index = 0; index < headers.length; index += 1) {
		const header = headers[index]!;
		if (!playerAliases.has(normalizeIdentityValue(header.label))) {
			continue;
		}

		const contentRange = findHeaderContentRange(text, header, headers, lines);
		const contradiction = collectSpeakerContradictionEvidence(
			contentRange ? text.slice(contentRange.start, contentRange.end) : "",
			playerAliases,
		);
		const { evidence, hasIndependentEvidence } = contradiction;
		const supportsReassignment = evidenceSupportsReassignment(
			contradiction,
			alternativeSpeakers.length,
			hasUnregisteredSpeakerHeader,
		);

		let reason: SemanticSpeakerResolutionReason = "insufficient-semantic-evidence";
		if (hasIndependentEvidence && alternativeSpeakers.length === 0) {
			reason = "no-eligible-speaker";
		} else if (hasIndependentEvidence && alternativeSpeakers.length > 1) {
			reason = "ambiguous-eligible-speakers";
		} else if (supportsReassignment) {
			const replacementSpeakerLabel = alternativeSpeakers[0]!.name.trim();
			reason = "reassigned-single-eligible-speaker";
			changes.push({
				blockIndex: header.blockIndex,
				lineNumber: header.lineNumber,
				originalSpeakerLabel: header.label,
				replacementSpeakerLabel,
				labelStart: header.labelStart,
				labelEnd: header.labelEnd,
				evidence,
			});
			reassignedPlayerHeaderStarts.add(header.start);
			diagnostics.push({
				blockIndex: header.blockIndex,
				lineNumber: header.lineNumber,
				originalSpeakerLabel: header.label,
				replacementSpeakerLabel,
				decision: "reassigned",
				reason,
				eligibleAlternativeSpeakers,
				evidence,
			});
			continue;
		}

		diagnostics.push({
			blockIndex: header.blockIndex,
			lineNumber: header.lineNumber,
			originalSpeakerLabel: header.label,
			decision: "unchanged",
			reason,
			eligibleAlternativeSpeakers,
			evidence,
		});
	}

	let orphanBlockIndex = headers.length;
	for (const header of headers) {
		if (
			!playerAliases.has(normalizeIdentityValue(header.label)) ||
			reassignedPlayerHeaderStarts.has(header.start)
		) {
			continue;
		}

		const playerBlock = findHeaderContentRange(text, header, headers, lines);
		if (!playerBlock || !text.slice(playerBlock.start, playerBlock.end).trim()) {
			continue;
		}

		const orphanBlock = findImmediatelyFollowingUnlabelledBlock(
			text,
			playerBlock,
			headers,
			lines,
		);
		if (!orphanBlock) {
			continue;
		}

		const contradiction = collectSpeakerContradictionEvidence(
			text.slice(orphanBlock.start, orphanBlock.end),
			playerAliases,
		);
		const { evidence, hasIndependentEvidence } = contradiction;
		const supportsReassignment = evidenceSupportsReassignment(
			contradiction,
			alternativeSpeakers.length,
			hasUnregisteredSpeakerHeader,
		);
		let reason: SemanticSpeakerResolutionReason = "insufficient-semantic-evidence";

		if (hasIndependentEvidence && alternativeSpeakers.length === 0) {
			reason = "no-eligible-speaker";
		} else if (hasIndependentEvidence && alternativeSpeakers.length > 1) {
			reason = "ambiguous-eligible-speakers";
		} else if (supportsReassignment) {
			const replacementSpeakerLabel = alternativeSpeakers[0]!.name.trim();
			reason = "reassigned-single-eligible-speaker";
			changes.push({
				blockIndex: orphanBlockIndex,
				lineNumber: orphanBlock.lineNumber,
				originalSpeakerLabel: UNLABELLED_SPEAKER,
				replacementSpeakerLabel,
				labelStart: orphanBlock.start,
				labelEnd: orphanBlock.start,
				evidence,
			});
			diagnostics.push({
				blockIndex: orphanBlockIndex,
				lineNumber: orphanBlock.lineNumber,
				originalSpeakerLabel: UNLABELLED_SPEAKER,
				replacementSpeakerLabel,
				decision: "reassigned",
				reason,
				eligibleAlternativeSpeakers,
				evidence,
			});
			orphanBlockIndex += 1;
			continue;
		}

		diagnostics.push({
			blockIndex: orphanBlockIndex,
			lineNumber: orphanBlock.lineNumber,
			originalSpeakerLabel: UNLABELLED_SPEAKER,
			decision: "unchanged",
			reason,
			eligibleAlternativeSpeakers,
			evidence,
		});
		orphanBlockIndex += 1;
	}

	let resolvedText = text;
	for (const change of [...changes].sort((left, right) => right.labelStart - left.labelStart)) {
		const replacement =
			change.labelStart === change.labelEnd
				? `${change.replacementSpeakerLabel}: `
				: change.replacementSpeakerLabel;
		resolvedText =
			resolvedText.slice(0, change.labelStart) +
			replacement +
			resolvedText.slice(change.labelEnd);
	}

	return {
		text: resolvedText,
		changed: changes.length > 0,
		changes,
		diagnostics,
	};
}
