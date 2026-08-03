import { describe, expect, it } from "vitest";
import { computeGeminiTtsCacheDigest } from "../ai/geminiTtsCache";
import { buildGeminiTtsSynthesisSignature } from "../ai/geminiTtsSynthesis";
import type { SpeechSynthesisPlan } from "../storyText/messageSpeechText";

const samplePlan: SpeechSynthesisPlan = {
	text: "Hello world.",
	scriptLines: [{ speaker: "Narrator", text: "Hello world." }],
	speakers: [{ name: "Narrator", voice: "Iapetus" }],
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
			scriptLines: [{ speaker: "Narrator", text: "Different line." }],
		}, "gemini-2.5-flash-preview-tts");
		const otherModel = await computeGeminiTtsCacheDigest(
			"msg-1",
			samplePlan,
			"gemini-3.1-flash-tts-preview",
		);

		expect(otherText).not.toBe(base);
		expect(otherModel).not.toBe(base);
	});

	it("changes digest when assigned character voices change", async () => {
		const maleVoicePlan: SpeechSynthesisPlan = {
			text: "Jake Peralta: spins a pen on his desk.",
			scriptLines: [{ speaker: "Jake Peralta", text: "spins a pen on his desk." }],
			speakers: [
				{ name: "Narrator", voice: "Iapetus" },
				{ name: "Jake Peralta", voice: "Charon" },
			],
			multiSpeaker: true,
		};
		const femaleVoicePlan: SpeechSynthesisPlan = {
			...maleVoicePlan,
			speakers: [
				{ name: "Narrator", voice: "Iapetus" },
				{ name: "Jake Peralta", voice: "Aoede" },
			],
		};

		expect(buildGeminiTtsSynthesisSignature(maleVoicePlan)).not.toBe(
			buildGeminiTtsSynthesisSignature(femaleVoicePlan),
		);

		const maleDigest = await computeGeminiTtsCacheDigest(
			"chapter-1",
			maleVoicePlan,
			"gemini-2.5-flash-preview-tts",
		);
		const femaleDigest = await computeGeminiTtsCacheDigest(
			"chapter-1",
			femaleVoicePlan,
			"gemini-2.5-flash-preview-tts",
		);
		expect(femaleDigest).not.toBe(maleDigest);
	});
});
