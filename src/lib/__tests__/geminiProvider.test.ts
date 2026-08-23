import { describe, expect, it } from "vitest";
import {
	extractGeminiGenerateContentResponse,
	extractGeminiResponseText,
} from "../ai/geminiProvider";

describe("extractGeminiResponseText", () => {
	it("prefers non-thought parts", () => {
		expect(
			extractGeminiResponseText([
				{ text: "Narrator: *The room is quiet.*", thought: false },
				{ text: "planning notes", thought: true },
			]),
		).toBe("Narrator: *The room is quiet.*");
	});

	it("falls back to thought parts when visible output is empty", () => {
		expect(
			extractGeminiResponseText([
				{ text: "Narrator: *The room is quiet.*", thought: true },
			]),
		).toBe("Narrator: *The room is quiet.*");
	});
});

describe("extractGeminiGenerateContentResponse", () => {
	it("captures finishReason and blockReason metadata", () => {
		expect(
			extractGeminiGenerateContentResponse({
				candidates: [
					{
						finishReason: "STOP",
						content: {
							parts: [{ text: "Narrator: *The room is quiet.*" }],
						},
					},
				],
				promptFeedback: { blockReason: "SAFETY" },
			}),
		).toEqual({
			text: "Narrator: *The room is quiet.*",
			finishReason: "STOP",
			blockReason: "SAFETY",
		});
	});
});
