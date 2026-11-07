export const DIALOGUE_QUOTE_PAIRS: Array<{ open: string; close: string }> = [
	{ open: '"', close: '"' },
	{ open: "“", close: "”" },
	{ open: "‘", close: "’" },
];

export type DialogueQuoteRegion = { kind: "quoted" | "unquoted"; text: string };

function findNextQuoteOpen(text: string, fromIndex: number) {
	let bestIndex = -1;
	let bestPair: { open: string; close: string } | null = null;

	for (const pair of DIALOGUE_QUOTE_PAIRS) {
		const index = text.indexOf(pair.open, fromIndex);
		if (index >= 0 && (bestIndex < 0 || index < bestIndex)) {
			bestIndex = index;
			bestPair = pair;
		}
	}

	if (bestIndex < 0 || !bestPair) {
		return null;
	}

	return { index: bestIndex, pair: bestPair };
}

/** Split text into quoted vs unquoted regions. Asterisks inside quoted regions are dialogue, not actions. */
export function splitDialogueQuoteRegions(text: string): DialogueQuoteRegion[] {
	const regions: DialogueQuoteRegion[] = [];
	let cursor = 0;

	while (cursor < text.length) {
		const quote = findNextQuoteOpen(text, cursor);
		if (!quote || quote.index > cursor) {
			const unquotedEnd = quote?.index ?? text.length;
			const chunk = text.slice(cursor, unquotedEnd);
			if (chunk) {
				regions.push({ kind: "unquoted", text: chunk });
			}
			cursor = unquotedEnd;
			if (!quote) {
				break;
			}
		}

		const dialogueStart = quote.index + quote.pair.open.length;
		const closeIndex = text.indexOf(quote.pair.close, dialogueStart);
		if (closeIndex < 0) {
			const dialogue = text.slice(dialogueStart).trim();
			if (dialogue) {
				regions.push({ kind: "quoted", text: dialogue });
			}
			break;
		}

		const dialogue = text.slice(dialogueStart, closeIndex);
		regions.push({ kind: "quoted", text: dialogue });
		cursor = closeIndex + quote.pair.close.length;
	}

	return regions.length ? regions : [{ kind: "unquoted", text }];
}

/** Clean malformed action markers that appear inside spoken dialogue. */
export function normalizeQuotedDialogueContent(text: string) {
	let next = text.replace(/\*\./g, "");
	next = next.replace(/\*([^*\n]+)\*/g, "$1");
	next = next.replace(/\*+$/g, "").replace(/^\*+/g, "");
	return next.replace(/\s+/g, " ").trim();
}
