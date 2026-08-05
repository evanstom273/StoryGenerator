import { normalizeSceneSpeakerLabel } from "./speakerLabels";

function escapeRegex(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function getPlayerNameVariants(playerName: string) {
	const trimmed = playerName.trim();
	if (!trimmed) {
		return [];
	}

	const tokens = trimmed.split(/\s+/).filter(Boolean);
	const firstToken = tokens[0] ?? "";
	const lastToken = tokens.length > 1 ? tokens[tokens.length - 1] : "";
	const variants = new Set<string>();
	variants.add(trimmed);
	if (firstToken.length >= 2) {
		variants.add(firstToken);
	}
	if (lastToken.length >= 2) {
		variants.add(lastToken);
	}

	for (const match of trimmed.matchAll(/"([^"]{2,64})"/g)) {
		const value = match[1]?.trim() ?? "";
		if (value) {
			variants.add(value);
		}
	}

	for (const match of trimmed.matchAll(/\(([^)]{2,64})\)/g)) {
		const value = match[1]?.trim() ?? "";
		if (value) {
			variants.add(value);
		}
	}

	return Array.from(variants);
}

export function extractQuotedDialogue(line: string) {
	return Array.from(line.matchAll(/"([^"]+)"/g))
		.map((match) => match[1]?.trim() ?? "")
		.filter(Boolean)
		.join(" ");
}

function playerVariantPattern(variants: string[]) {
	return variants
		.filter((variant) => variant.length >= 2)
		.map((variant) => escapeRegex(variant))
		.join("|");
}

/** Dialogue clearly spoken to the player, not by them. */
export function dialogueLooksAddressedToPlayer(dialogue: string, playerName: string) {
	const trimmed = dialogue.trim();
	if (!trimmed) {
		return false;
	}

	const variants = getPlayerNameVariants(playerName);
	const pattern = playerVariantPattern(variants);
	if (!pattern) {
		return false;
	}

	if (/\b(?:missed|see|glad|welcome|need|want|tell|asked|called)\s+you\b/i.test(trimmed)) {
		return true;
	}

	if (
		/\byou\b/i.test(trimmed) &&
		!/\byou\s+(?:two|three|four|five|all|both|guys|folks|officers|detectives)\b/i.test(trimmed) &&
		/\byou\b.{0,48}\b(?:were|are|was|slipped|thought|looked|handled|came|did)\b/i.test(trimmed)
	) {
		return true;
	}

	if (/\b(?:is|are)\s+(?:finally\s+)?back\b/i.test(trimmed) && !/\b(?:I'm|I am|we're|we are)\b/i.test(trimmed)) {
		return true;
	}

	const firstName = normalizeSceneSpeakerLabel(playerName);
	const vocativeMatch = trimmed.match(/,\s*([A-Z][a-zA-Z''-]+)\b[.!?"]?\s*$/);
	if (vocativeMatch?.[1]) {
		const vocative = vocativeMatch[1];
		if (vocative.toLowerCase() !== firstName.toLowerCase() || /\byou\b/i.test(trimmed)) {
			return true;
		}
	}

	const surname = variants.length > 1 ? variants[variants.length - 1] : "";
	if (surname && new RegExp(`\\b${escapeRegex(surname)}\\s+(?:Stare|stare|glare)\\b`, "i").test(trimmed)) {
		return true;
	}

	if (new RegExp(`,\\s*(?:${pattern})\\b`, "i").test(trimmed)) {
		return true;
	}

	if (new RegExp(`\\b(?:hey|hi|hello|so|well|look),?\\s+(?:${pattern})\\b`, "i").test(trimmed)) {
		return true;
	}

	for (const variant of variants) {
		const escaped = escapeRegex(variant);
		if (new RegExp(`\\b${escaped}\\s+is\\b`, "i").test(trimmed)) {
			return true;
		}
		if (new RegExp(`\\b${escaped}\\b`, "i").test(trimmed) && /\b(?:she|her|they|them)\b/i.test(trimmed)) {
			return true;
		}
	}

	return false;
}

/** Dialogue in the player's own voice (first-person experience, not third-person self-reference). */
export function dialogueLooksLikePlayerVoice(dialogue: string, playerName: string) {
	const trimmed = dialogue.trim();
	if (!trimmed) {
		return false;
	}

	if (!/\b(?:I|I'm|I've|I'd|I'll|my|myself|me)\b/i.test(trimmed)) {
		return false;
	}

	return !dialogueLooksAddressedToPlayer(trimmed, playerName);
}

export function speakerLineLooksLikeMisattributedPlayer(line: string, playerName: string) {
	const trimmed = line.trim();
	const speakerMatch = trimmed.match(/^([^\n:]{1,64}):\s*(.*)$/);
	if (!speakerMatch?.[1] || !speakerMatch[2]) {
		return false;
	}

	const speaker = normalizeSceneSpeakerLabel(speakerMatch[1].trim());
	const playerLabel = normalizeSceneSpeakerLabel(playerName);
	if (speaker.toLowerCase() !== playerLabel.toLowerCase()) {
		return false;
	}

	const dialogue = extractQuotedDialogue(speakerMatch[2]);
	if (!dialogue) {
		return false;
	}

	if (dialogueLooksLikePlayerVoice(dialogue, playerName)) {
		return false;
	}

	if (dialogueLooksAddressedToPlayer(dialogue, playerName)) {
		return true;
	}

	if (/\b(?:she|her)\b/i.test(dialogue) && /\b(?:was|were|thought|slipped|handled)\b/i.test(dialogue)) {
		return true;
	}

	return false;
}

export function stripMisattributedPlayerSpeakerLabel(line: string, playerName: string) {
	if (!speakerLineLooksLikeMisattributedPlayer(line, playerName)) {
		return line;
	}

	const remainder = line.trim().replace(/^[^\n:]{1,64}:\s*/, "");
	return remainder.trim();
}
