import { normalizeSceneSpeakerLabel } from "../storyText/speakerLabels";

export function normalizeParticipantKey(value: string | null | undefined): string {
	return (value ?? "")
		.normalize("NFKC")
		.trim()
		.toLocaleLowerCase()
		.replace(/[’‘]/g, "'")
		.replace(/\s+/g, " ");
}

export function uniqueIdentityNames(values: Array<string | null | undefined>): string[] {
	const names: string[] = [];
	const seen = new Set<string>();

	for (const value of values) {
		const trimmed = value?.trim();
		const key = normalizeParticipantKey(trimmed);
		if (!trimmed || !key || seen.has(key)) {
			continue;
		}
		seen.add(key);
		names.push(trimmed);
	}

	return names;
}

export function expandIdentityNames(values: Array<string | null | undefined>): string[] {
	const raw = uniqueIdentityNames(values);
	return uniqueIdentityNames([
		...raw,
		...raw.map((name) => normalizeSceneSpeakerLabel(name)),
	]);
}

export function identityNameMatches(text: string, names: string[]): boolean {
	const normalizedText = normalizeParticipantKey(text);
	return names.some((name) => {
		const key = normalizeParticipantKey(name);
		if (!key) return false;
		const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "iu").test(
			normalizedText,
		);
	});
}

export function isReservedSceneSpeaker(value: string): boolean {
	return /^(?:narrator|director|author|system|continue|player)$/i.test(value.trim());
}
