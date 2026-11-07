const ROMAN_VALUES: Array<[string, number]> = [
	["M", 1000],
	["CM", 900],
	["D", 500],
	["CD", 400],
	["C", 100],
	["XC", 90],
	["L", 50],
	["XL", 40],
	["X", 10],
	["IX", 9],
	["V", 5],
	["IV", 4],
	["I", 1],
];

export function romanToInt(roman: string): number | null {
	const upper = roman.toUpperCase();
	let index = 0;
	let value = 0;

	while (index < upper.length) {
		let matched = false;
		for (const [symbol, amount] of ROMAN_VALUES) {
			if (upper.startsWith(symbol, index)) {
				value += amount;
				index += symbol.length;
				matched = true;
				break;
			}
		}
		if (!matched) {
			return null;
		}
	}

	return value;
}

export function intToRoman(value: number): string | null {
	if (!Number.isFinite(value) || value <= 0 || value > 3999) {
		return null;
	}

	let remaining = value;
	let result = "";

	for (const [symbol, amount] of ROMAN_VALUES) {
		while (remaining >= amount) {
			result += symbol;
			remaining -= amount;
		}
	}

	return result;
}

export function getNextChapterBannerLabel(label: string) {
	const trimmed = label.trim();
	const romanMatch = trimmed.match(/^chapter\s+([IVXLCDM]+)$/i);
	if (romanMatch?.[1]) {
		const current = romanToInt(romanMatch[1]);
		if (current !== null) {
			const next = intToRoman(current + 1);
			if (next) {
				return `Chapter ${next}`;
			}
		}
	}

	const numericMatch = trimmed.match(/^chapter\s+(\d+)$/i);
	if (numericMatch?.[1]) {
		const next = Number.parseInt(numericMatch[1], 10) + 1;
		if (Number.isFinite(next)) {
			return `Chapter ${next}`;
		}
	}

	const looseNumericMatch = trimmed.match(/chapter\s+(\d+)/i);
	if (looseNumericMatch?.[1]) {
		const next = Number.parseInt(looseNumericMatch[1], 10) + 1;
		if (Number.isFinite(next)) {
			return `Chapter ${next}`;
		}
	}

	if (/^chapter\s+/i.test(trimmed)) {
		return trimmed;
	}

	return `Chapter ${trimmed}`;
}
