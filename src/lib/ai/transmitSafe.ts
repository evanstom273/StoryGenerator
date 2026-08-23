export type TransmitSafeSeverity = "none" | "low" | "medium" | "high";

export type TransmitSafeResult = {
	transmitText: string;
	wasModified: boolean;
	notes: string[];
	severity: TransmitSafeSeverity;
};

function applyReplace(
	text: string,
	opts: {
		pattern: RegExp;
		replace: string | ((match: string, ...args: any[]) => string);
		note: string;
	},
) {
	if (!opts.pattern.test(text)) {
		return { text, changed: false, note: undefined as string | undefined };
	}

	const next = text.replace(opts.pattern, opts.replace as any);
	return {
		text: next,
		changed: next !== text,
		note: next !== text ? opts.note : undefined,
	};
}

function maskDirectInsults(text: string) {
	const notes: string[] = [];
	let next = text;

	const whiny = applyReplace(next, {
		pattern: /\bwhiny\s+bitch\b/gi,
		replace: "whiny [insult]",
		note: "masked_insult:whiny_bitch",
	});
	if (whiny.changed) {
		next = whiny.text;
		if (whiny.note) {
			notes.push(whiny.note);
		}
	}

	const standaloneBitch = next.replace(/\bbitch\b/gi, (match, offset: number, full: string) => {
		const windowStart = Math.max(0, offset - 24);
		const before = full.slice(windowStart, offset);
		if (/\b(you|youre|you're|u|he|she|they|that|this)\b/i.test(before)) {
			notes.push("masked_insult:bitch");
			return "[insult]";
		}
		return match;
	});
	if (standaloneBitch !== next) {
		next = standaloneBitch;
	}

	return { text: next, notes };
}

function softenPainLanguage(text: string) {
	const notes: string[] = [];
	let next = text;

	const rules: Array<{
		pattern: RegExp;
		replace: string | ((...args: any[]) => string);
		note: string;
	}> = [
		{ pattern: /\bin\s+agony\b/gi, replace: "in severe discomfort", note: "soften_pain:agony" },
		{ pattern: /\bin\s+pain\b/gi, replace: "injured and struggling", note: "soften_pain:in_pain" },
		{ pattern: /\bmy\s+([a-z]+(?:\s+[a-z]+){0,2})\s+hurts\b/gi, replace: "my $1 is badly injured", note: "soften_pain:hurts" },
		{ pattern: /\bmy\s+([a-z]+(?:\s+[a-z]+){0,2})\s+is\s+hurting\b/gi, replace: "my $1 is badly injured", note: "soften_pain:is_hurting" },
		{ pattern: /\bmy\s+([a-z]+(?:\s+[a-z]+){0,2})\s+killing\s+me\b/gi, replace: "my $1 hurting badly", note: "soften_pain:killing_me" },
	];

	for (const rule of rules) {
		const applied = applyReplace(next, rule);
		if (applied.changed) {
			next = applied.text;
			notes.push(rule.note);
		}
	}

	return { text: next, notes };
}

export function makeTransmitSafe(
	text: string,
	opts?: {
		allowPainSoftening?: boolean;
	},
): TransmitSafeResult {
	let transmitText = text;
	const notes: string[] = [];

	const insult = maskDirectInsults(transmitText);
	transmitText = insult.text;
	notes.push(...insult.notes);

	if (opts?.allowPainSoftening) {
		const pain = softenPainLanguage(transmitText);
		transmitText = pain.text;
		notes.push(...pain.notes);
	}

	const wasModified = transmitText !== text;
	const severity: TransmitSafeSeverity = !wasModified
		? "none"
		: notes.some((note) => note.startsWith("masked_insult"))
			? "high"
			: "medium";

	return { transmitText, wasModified, notes, severity };
}

export function buildTransmitSafeSystemNote(result: TransmitSafeResult) {
	if (!result.wasModified) {
		return "";
	}

	return [
		"Transmit-safe note:",
		"The user's original message is preserved in the transcript exactly as typed.",
		"For this provider request only, some high-risk tokens were replaced to reduce false safety refusals.",
		"If you see [insult], treat it as a strong but non-graphic insult and respond naturally without repeating slurs verbatim.",
	].join("\n");
}
