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

/** First-person speech strongly suggests the labeled speaker is talking. */
export function dialogueHasFirstPersonVoice(dialogue: string) {
	return /\b(?:I|I'm|I've|I'd|I'll|my|myself|me)\b/i.test(dialogue.trim());
}

/** The player is referenced in third person — someone else is speaking. */
export function dialogueReferencesPlayerInThirdPerson(dialogue: string, playerName: string) {
	const trimmed = dialogue.trim();
	if (!trimmed) {
		return false;
	}

	const variants = getPlayerNameVariants(playerName);
	for (const variant of variants) {
		const escaped = escapeRegex(variant);
		if (new RegExp(`(?:^|[\\s—-])${escaped}\\s+is\\b`, "i").test(trimmed)) {
			return true;
		}
		if (new RegExp(`\\b${escaped}\\s+is\\b`, "i").test(trimmed)) {
			return true;
		}
		if (new RegExp(`\\b${escaped}\\s+(?:Stare|stare|glare)\\b`, "i").test(trimmed)) {
			return true;
		}
	}

	if (!dialogueHasFirstPersonVoice(trimmed) && /\b(?:she|her)\b/i.test(trimmed)) {
		if (/\b(?:was|were|slipped|thought|handled|is|are)\b/i.test(trimmed)) {
			return true;
		}
	}

	return false;
}

/** Dialogue uses second-person address aimed at the player. */
export function dialogueAddressesPlayerBySecondPerson(dialogue: string) {
	const trimmed = dialogue.trim();
	if (!trimmed || !/\byou\b/i.test(trimmed)) {
		return false;
	}

	if (/\byou\s+(?:two|three|four|five|all|both|guys|folks|officers|detectives)\b/i.test(trimmed)) {
		return false;
	}

	if (/\b(?:missed|see|glad|welcome)\s+you\b/i.test(trimmed)) {
		return true;
	}

	return /\byou\b.{0,48}\b(?:were|are|was|slipped|thought|looked|handled|came|did)\b/i.test(trimmed);
}

/** Dialogue uses a player name variant as the addressee — not titles like Captain. */
export function dialogueAddressesPlayerByName(dialogue: string, playerName: string) {
	const trimmed = dialogue.trim();
	if (!trimmed) {
		return false;
	}

	const variants = getPlayerNameVariants(playerName);
	const pattern = playerVariantPattern(variants);
	if (!pattern) {
		return false;
	}

	if (new RegExp(`,\\s*(?:${pattern})\\b`, "i").test(trimmed)) {
		return true;
	}

	if (new RegExp(`\\b(?:hey|hi|hello)\\s+(?:${pattern})\\b`, "i").test(trimmed)) {
		return true;
	}

	if (
		/\b(?:missed|see|glad|welcome)\s+you\b/i.test(trimmed) &&
		variants.some((variant) => new RegExp(`\\b${escapeRegex(variant)}\\b`, "i").test(trimmed))
	) {
		return true;
	}

	if (
		/\byou\b/i.test(trimmed) &&
		!/\byou\s+(?:two|three|four|five|all|both|guys|folks|officers|detectives)\b/i.test(trimmed) &&
		/\byou\b.{0,48}\b(?:were|are|was|slipped|thought|looked|handled|came|did)\b/i.test(trimmed)
	) {
		return variants.some((variant) => new RegExp(`,\\s*${escapeRegex(variant)}\\b`, "i").test(trimmed));
	}

	return false;
}

/** @deprecated use dialogueAddressesPlayerByName or dialogueReferencesPlayerInThirdPerson */
export function dialogueLooksAddressedToPlayer(dialogue: string, playerName: string) {
	return (
		dialogueAddressesPlayerByName(dialogue, playerName) ||
		dialogueAddressesPlayerBySecondPerson(dialogue) ||
		dialogueReferencesPlayerInThirdPerson(dialogue, playerName)
	);
}

export function dialogueLooksLikePlayerVoice(dialogue: string, _playerName?: string) {
	return dialogueHasFirstPersonVoice(dialogue);
}

export function speakerLineLooksLikeMisattributedPlayer(line: string, playerName: string) {
	const trimmed = line.trim();
	const speakerMatch = trimmed.match(/^([^\n:]{1,64}):\s*(.*)$/);
	if (!speakerMatch?.[1] || !speakerMatch[2]) {
		return false;
	}

	const speaker = normalizeSceneSpeakerLabel(speakerMatch[1].trim());
	const playerVariants = new Set(
		getPlayerNameVariants(playerName).map((variant) =>
			normalizeSceneSpeakerLabel(variant).toLowerCase(),
		),
	);
	if (!playerVariants.has(speaker.toLowerCase())) {
		return false;
	}

	const dialogue = extractQuotedDialogue(speakerMatch[2]);
	if (!dialogue) {
		return false;
	}

	if (dialogueReferencesPlayerInThirdPerson(dialogue, playerName)) {
		return true;
	}

	if (dialogueAddressesPlayerByName(dialogue, playerName)) {
		return true;
	}

	if (dialogueAddressesPlayerBySecondPerson(dialogue)) {
		return true;
	}

	if (!dialogueHasFirstPersonVoice(dialogue)) {
		const properSubject = dialogue.match(/\b([A-Z][a-zA-Z''-]+)\s+(?:is|was|are|were)\b/);
		if (properSubject?.[1]) {
			const subject = normalizeSceneSpeakerLabel(properSubject[1]).toLowerCase();
			if (!playerVariants.has(subject)) {
				return true;
			}
		}
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

export function countMisattributedPlayerSpeakerLines(text: string, playerName?: string | null) {
	if (!playerName?.trim()) {
		return 0;
	}

	return text
		.replace(/\r\n/g, "\n")
		.split("\n")
		.filter((line) => speakerLineLooksLikeMisattributedPlayer(line, playerName)).length;
}
