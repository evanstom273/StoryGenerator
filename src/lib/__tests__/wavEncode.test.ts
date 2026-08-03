import { describe, expect, it } from "vitest";
import {
	createSilencePcm16,
	normalizePcm16Loudness,
} from "../aiDocumentGenerator/wavEncode";

function writePcm16Sample(pcm: Uint8Array, index: number, value: number) {
	const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
	view.setInt16(index * 2, value, true);
}

function readPcm16Sample(pcm: Uint8Array, index: number) {
	const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
	return view.getInt16(index * 2, true);
}

describe("wavEncode pcm helpers", () => {
	it("creates silence with the expected sample count", () => {
		const silence = createSilencePcm16(500, 24000);
		expect(silence.byteLength).toBe(24000);
		expect(readPcm16Sample(silence, 0)).toBe(0);
		expect(readPcm16Sample(silence, 11999)).toBe(0);
	});

	it("normalizes quiet and loud pcm chunks toward a shared target", () => {
		const quiet = new Uint8Array(4);
		writePcm16Sample(quiet, 0, 1000);
		writePcm16Sample(quiet, 1, -1000);

		const loud = new Uint8Array(4);
		writePcm16Sample(loud, 0, 20000);
		writePcm16Sample(loud, 1, -20000);

		const normalizedQuiet = normalizePcm16Loudness(quiet, 4000);
		const normalizedLoud = normalizePcm16Loudness(loud, 4000);

		expect(Math.abs(readPcm16Sample(normalizedQuiet, 0))).toBeGreaterThan(3000);
		expect(Math.abs(readPcm16Sample(normalizedLoud, 0))).toBeLessThan(22000);
		expect(Math.abs(readPcm16Sample(normalizedLoud, 0))).toBeGreaterThan(
			Math.abs(readPcm16Sample(normalizedQuiet, 0)) * 0.5,
		);
	});
});
