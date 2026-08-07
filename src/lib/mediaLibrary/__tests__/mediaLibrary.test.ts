import { describe, expect, it } from "vitest";
import { encodePcm16ToWav } from "../../aiDocumentGenerator/wavEncode";
import { computeWavDurationMs } from "../wavDuration";
import { formatDurationMs } from "../format";

describe("mediaLibrary wavDuration", () => {
	it("computes duration from a mono wav buffer", () => {
		const pcm = new Uint8Array(24000 * 2 * 2);
		const wav = new Uint8Array(encodePcm16ToWav(pcm, 24000, 1));
		expect(computeWavDurationMs(wav)).toBe(2000);
	});
});

describe("mediaLibrary format", () => {
	it("formats short and long durations", () => {
		expect(formatDurationMs(65_000)).toBe("1:05");
		expect(formatDurationMs(3_661_000)).toBe("1:01:01");
	});
});
