export async function readAudioElementBytes(audio: HTMLAudioElement): Promise<Uint8Array | null> {
	if (!audio.src) {
		return null;
	}

	try {
		const response = await fetch(audio.src);
		if (!response.ok) {
			return null;
		}

		return new Uint8Array(await response.arrayBuffer());
	} catch {
		return null;
	}
}

export function createAudioBlobUrl(bytes: Uint8Array, mimeType: string): { url: string; blob: Blob } {
	const blob = new Blob([Uint8Array.from(bytes)], { type: mimeType });
	return { url: URL.createObjectURL(blob), blob };
}
