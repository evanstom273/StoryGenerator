import { describe, expect, it } from "vitest";
import { encodePcm16ToWav } from "../../aiDocumentGenerator/wavEncode";
import { transcodeWavToOpus } from "../transcodeToOpus";

describe("transcodeToOpus", () => {
	it("skips long audio instead of encoding in real time", async () => {
		const sampleRate = 24_000;
		const seconds = 120;
		const pcm = new Uint8Array(sampleRate * seconds * 2);
		const wav = new Uint8Array(encodePcm16ToWav(pcm, sampleRate, 1));

		const result = await transcodeWavToOpus(wav);
		expect(result).toBeNull();
	});
});
