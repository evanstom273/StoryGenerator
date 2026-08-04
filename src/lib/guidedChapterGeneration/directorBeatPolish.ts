const RANK_PREFIX_RE =
	/\b(?:Lt\.?\s*Commander|Lieutenant\s+Commander|Commander|Captain|Capt\.?|Lt\.?|Dr\.?|Ens\.?|Chief|Cmdr\.?|Col\.?)\s+/gi;

const FULL_NAME_RE = /\b([A-Z][a-z]+)\s+([A-Z][a-z]+)\b/g;

const INCOMPLETE_ENDING_RE =
	/\b(?:Capt|Cmdr|Lt|Dr|Col|Ens|Lieutenant|Commander|Captain|Commander)\.\s*$/i;

const MAX_DIRECTOR_BEAT_WORDS = 28;

export function normalizeDirectorBeatCastNames(text: string): string {
	let result = text.replace(RANK_PREFIX_RE, "");
	result = result.replace(FULL_NAME_RE, (_match, firstName: string) => firstName);
	return result.replace(/\s+/g, " ").trim();
}

export function polishDirectorBeatPunctuation(text: string): string {
	let result = text.trim();
	result = result.replace(/[,;]+\s*\.\s*$/g, ".");
	result = result.replace(/[,;]+\s*$/g, ".");
	result = result.replace(/\s+\.\s*$/g, ".");
	result = result.replace(/\.{2,}/g, ".");
	if (result && !/[.!?]$/.test(result)) {
		result = `${result}.`;
	}
	return result;
}

export function isIncompleteDirectorBeat(text: string): boolean {
	const inner = text.replace(/^\*+|\*+$/g, "").trim();
	if (!inner) {
		return true;
	}

	if (/^[a-z]/.test(inner)) {
		return true;
	}

	if (INCOMPLETE_ENDING_RE.test(inner)) {
		return true;
	}

	if (/,\.\s*$/.test(inner) || /,\s*$/.test(inner)) {
		return true;
	}

	const withoutTerminalPunct = inner.replace(/[.!?]+\s*$/g, "").trim();
	const lastToken = withoutTerminalPunct.split(/\s+/).pop() ?? "";
	if (lastToken.length <= 2) {
		return true;
	}

	if (/ [a-z]$/i.test(withoutTerminalPunct)) {
		return true;
	}

	const wordCount = inner.split(/\s+/).filter(Boolean).length;
	if (wordCount > MAX_DIRECTOR_BEAT_WORDS + 8) {
		return true;
	}

	if (inner.length > 50 && !/[.!?]$/.test(inner)) {
		return true;
	}

	return false;
}

export function enforceDirectorBeatWordLimit(text: string): string {
	const inner = text.replace(/^\*+|\*+$/g, "").trim();
	const words = inner.split(/\s+/).filter(Boolean);
	if (words.length <= MAX_DIRECTOR_BEAT_WORDS) {
		return inner;
	}

	const clipped = words.slice(0, MAX_DIRECTOR_BEAT_WORDS).join(" ");
	return polishDirectorBeatPunctuation(clipped.replace(/[,;:]?\s*$/, ""));
}

export function polishDirectorBeatStaging(value: string): string | null {
	const trimmed = value.trim();
	if (!trimmed) {
		return null;
	}

	let inner = trimmed.replace(/^\*+|\*+$/g, "").trim();
	inner = normalizeDirectorBeatCastNames(inner);
	inner = enforceDirectorBeatWordLimit(inner);
	inner = inner.replace(/[,;]+\s*\.\s*$/g, ".").replace(/[,;]+\s*$/g, "");

	if (isIncompleteDirectorBeat(inner)) {
		return null;
	}

	inner = polishDirectorBeatPunctuation(inner);

	return `*${inner}*`;
}
