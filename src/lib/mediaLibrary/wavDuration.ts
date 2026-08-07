import { decodeWavToPcm16 } from "../aiDocumentGenerator/wavEncode";

export function computeWavDurationMs(wavBytes: Uint8Array): number {
	try {
		const { pcm, sampleRate } = decodeWavToPcm16(wavBytes);
		if (!sampleRate || pcm.byteLength < 2) {
			return 0;
		}
		const sampleCount = pcm.byteLength / 2;
		return Math.round((sampleCount / sampleRate) * 1000);
	} catch {
		return 0;
	}
}
