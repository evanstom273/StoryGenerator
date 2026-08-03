import { describe, expect, it } from "vitest";
import { computeGeminiTtsCacheDigest } from "../ai/geminiTtsCache";
import type { SpeechSynthesisPlan } from "../storyText/messageSpeechText";

const samplePlan: SpeechSynthesisPlan = {
	text: "Hello world.",
	scriptLines: [{ speaker: "Narrator", text: "Hello world." }],
	speakers: [{ name: "Narrator", voice: "iapetus" }],
	multiSpeaker: false,
};

describe("geminiTtsCache", () => {
	it("returns stable digests for the same synthesis input", async () => {
		const first = await computeGeminiTtsCacheDigest("msg-1", samplePlan, "gemini-2.5-flash-preview-tts");
		const second = await computeGeminiTtsCacheDigest("msg-1", samplePlan, "gemini-2.5-flash-preview-tts");
		expect(first).toBe(second);
	});

	it("changes digest when message text or model changes", async () => {
		const base = await computeGeminiTtsCacheDigest("msg-1", samplePlan, "gemini-2.5-flash-preview-tts");
		const otherText = await computeGeminiTtsCacheDigest("msg-1", {
			...samplePlan,
			text: "Different line.",
		}, "gemini-2.5-flash-preview-tts");
		const otherModel = await computeGeminiTtsCacheDigest(
			"msg-1",
			samplePlan,
			"gemini-3.1-flash-tts-preview",
		);

		expect(otherText).not.toBe(base);
		expect(otherModel).not.toBe(base);
	});
});
