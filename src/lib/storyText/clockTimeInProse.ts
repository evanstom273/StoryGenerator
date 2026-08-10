const CLOCK_TIME_SUFFIX = /^\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?\b/;

/** True when `:` at `colonIndex` separates hours and minutes (e.g. 11:30 AM). */
export function isClockTimeColonAt(text: string, colonIndex: number): boolean {
	if (colonIndex < 0 || colonIndex >= text.length || text[colonIndex] !== ":") {
		return false;
	}

	const before = text.slice(0, colonIndex);
	const after = text.slice(colonIndex + 1);
	if (!/(\d{1,2})$/.test(before)) {
		return false;
	}

	const trimmedAfter = after.trimStart();
	return CLOCK_TIME_SUFFIX.test(trimmedAfter);
}

export function findSpeakerColonIndex(line: string): number | null {
	for (let index = 0; index < line.length; index += 1) {
		if (line[index] !== ":") {
			continue;
		}
		if (isClockTimeColonAt(line, index)) {
			continue;
		}
		return index;
	}

	return null;
}

export function looksLikeClockTimeFragment(text: string): boolean {
	const trimmed = text.trim();
	if (!trimmed) {
		return false;
	}

	return /^\d{1,2}:\d{2}(?:\s*(?:AM|PM|am|pm))?\b/.test(trimmed)
		|| /^\d{2}\s*(?:AM|PM|am|pm)\b/i.test(trimmed);
}

/** Repair transcript text corrupted when clock colons were treated as speaker labels. */
export function repairClockTimeColonCorruption(text: string): string {
	let next = text.replace(/\r\n/g, "\n");

	next = next.replace(
		/\b(\d{1,2}):\s*(?:He|She|They)\s+(\d{2}(?:\s*(?:AM|PM|am|pm))?)/gi,
		(_, hour: string, rest: string) => `${hour}:${rest}`,
	);

	next = next.replace(
		/^(\d{1,2}):\s*\n\s*(?:He|She|They)\s+(\d{2}(?:\s*(?:AM|PM|am|pm))?)/gim,
		(_, hour: string, rest: string) => `${hour}:${rest}`,
	);

	next = next.replace(
		/\bBy\s+(\d{1,2}):\s*(?:He|She|They)\s+(\d{2}(?:\s*(?:AM|PM|am|pm))?)/gi,
		(_, hour: string, rest: string) => `By ${hour}:${rest}`,
	);

	next = next.replace(
		/\b(\d{1,2}):\s+(\d{2}(\s*(?:AM|PM|am|pm))?)\b/g,
		(_, hour: string, rest: string) => `${hour}:${rest}`,
	);

	next = next.replace(
		/\bBy\s+(\d{1,2}):\s*\n\s*(\d{2}(\s*(?:AM|PM|am|pm))?)\b/gi,
		(_, hour: string, rest: string) => `By ${hour}:${rest}`,
	);

	return next;
}
