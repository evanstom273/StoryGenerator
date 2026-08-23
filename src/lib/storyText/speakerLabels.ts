import { splitDialogueQuoteRegions } from "./dialogueQuoteRegions";
import { findSpeakerColonIndex } from "./clockTimeInProse";

const RESERVED_SPEAKER_LABELS = new Set(["narrator", "director", "time"]);

const SPEAKER_TITLE_PREFIX =
	/^(?:Dr|Mr|Mrs|Ms|Miss|Lt|Lt\.|Capt|Captain|Detective|Sergeant|Commander|Professor|Prof)\.?\s+/i;

/** Strip quoted or parenthetical nicknames: Rebecca "Becca" Alvarez -> Rebecca Alvarez */
export function stripEmbeddedNicknameQuotes(value: string) {
	let next = value.replace(/["“”'‘’]([^"“”'‘’]+)["“”'‘’]/g, " $1 ");
	next = next.replace(/\s*\(([^)]+)\)\s*/g, " $1 ");
	return next.replace(/\s+/g, " ").trim();
}

/** Prefer the in-scene player label (e.g. Jamie) over the legal name (James). */
export function resolvePlayerSceneLabelForRepairs(
	playerName?: string | null,
	playerSceneName?: string | null,
): string | null {
	const scene = playerSceneName?.trim();
	if (scene) {
		return normalizeSceneSpeakerLabel(scene);
	}

	const trimmed = playerName?.trim() ?? "";
	if (!trimmed) {
		return null;
	}

	const parenMatch = trimmed.match(/^([^(]+?)(?:\s*\(([^)]+)\))?$/);
	if (parenMatch?.[2]) {
		const legalLabel = normalizeSceneSpeakerLabel(parenMatch[1].trim());
		for (const alias of parenMatch[2].split(/,\s*/)) {
			const candidate = normalizeSceneSpeakerLabel(alias.trim());
			if (candidate && candidate.toLowerCase() !== legalLabel.toLowerCase()) {
				return candidate;
			}
		}
	}

	return normalizeSceneSpeakerLabel(trimmed);
}

/** Reduce a speaker label to the short scene name (first name). */
export function normalizeSceneSpeakerLabel(label: string): string {
	const trimmed = label.trim();
	if (!trimmed) {
		return trimmed;
	}

	const lower = trimmed.toLowerCase();
	if (RESERVED_SPEAKER_LABELS.has(lower)) {
		return lower === "narrator" ? "Narrator" : trimmed;
	}

	const possessiveMatch = trimmed.match(/^(.+)(['']s)$/i);
	if (possessiveMatch?.[1]) {
		return `${normalizeSceneSpeakerLabel(possessiveMatch[1])}${possessiveMatch[2]}`;
	}

	const withoutNicknames = stripEmbeddedNicknameQuotes(trimmed);
	const withoutTitle = withoutNicknames.replace(SPEAKER_TITLE_PREFIX, "").trim();
	const words = (withoutTitle || withoutNicknames).split(/\s+/).filter(Boolean);
	return words[0] ?? trimmed;
}

const EMBEDDED_NICKNAME_NAME =
	/\b([A-Z][a-zA-Z''-]*)\s+["“”'‘’][^"“”'‘’]+["“”'‘’](?:\s+[A-Z][a-zA-Z''-]*)*\b/g;

/** Collapse First "Nick" Last name mentions to the first name in prose. */
export function normalizeEmbeddedNicknameMentions(text: string) {
	return text.replace(EMBEDDED_NICKNAME_NAME, "$1");
}

const FULL_NAME_IN_PROSE =
	/\b([A-Z][a-zA-Z''-]*)\s+([A-Z][a-zA-Z''-]*)\b/g;

const PRONOUN_FIRST_WORDS = new Set([
	"He",
	"She",
	"They",
	"Him",
	"Her",
	"Them",
	"His",
	"Their",
	"It",
	"Its",
]);

const NOT_A_NAME_SECOND_WORD = new Set([
	"Room",
	"Street",
	"Avenue",
	"Boulevard",
	"Road",
	"Lane",
	"Drive",
	"Court",
	"Place",
	"Park",
	"Square",
	"High",
	"School",
	"Hospital",
	"Station",
	"Building",
	"Tower",
	"Bridge",
	"River",
	"Lake",
	"Bay",
	"City",
	"County",
	"State",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
	"Sunday",
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
]);

/** Collapse simple two-word full names in prose to first name only. */
export function normalizeFullNameMentions(text: string) {
	return text.replace(FULL_NAME_IN_PROSE, (match, first, second) => {
		if (PRONOUN_FIRST_WORDS.has(first) || PRONOUN_FIRST_WORDS.has(second)) {
			return match;
		}
		if (NOT_A_NAME_SECOND_WORD.has(second)) {
			return match;
		}
		return first;
	});
}

const EMBEDDED_NICKNAME_QUOTE_IN_PROSE =
	/\b([A-Z][a-zA-Z''-]*)\s+["“”'‘’][^"“”'‘’]+["“”'‘’]\s+([A-Z][a-zA-Z''-]*)\b/g;

function collapseEmbeddedNicknameQuotesBeforeDialogueSplit(text: string) {
	return text.replace(EMBEDDED_NICKNAME_QUOTE_IN_PROSE, "$1 $2");
}

function normalizeProseMentions(text: string) {
	const withoutNicknameQuotes = collapseEmbeddedNicknameQuotesBeforeDialogueSplit(text);
	let rebuilt = "";
	for (const region of splitDialogueQuoteRegions(withoutNicknameQuotes)) {
		if (region.kind === "quoted") {
			rebuilt += `"${region.text}"`;
			continue;
		}
		rebuilt += normalizeFullNameMentions(normalizeEmbeddedNicknameMentions(region.text));
	}
	return rebuilt;
}

export function normalizeSpeakerNamesInTranscript(text: string) {
	const lines = text.replace(/\r\n/g, "\n").split("\n");

	return lines
		.map((line) => {
			const colonIndex = findSpeakerColonIndex(line);
			if (colonIndex === null) {
				return normalizeProseMentions(line);
			}

			const label = line.slice(0, colonIndex).trim();
			const remainder = line.slice(colonIndex + 1).trim();
			const normalizedLabel = normalizeSceneSpeakerLabel(label);
			const normalizedRemainder = normalizeProseMentions(remainder);

			return `${normalizedLabel}: ${normalizedRemainder}`;
		})
		.join("\n");
}
