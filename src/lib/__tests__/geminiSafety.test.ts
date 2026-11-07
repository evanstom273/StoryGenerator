import { describe, expect, it } from "vitest";
import { resolveGeminiMatureFictionSafetySettings } from "../ai/geminiSafety";

describe("resolveGeminiMatureFictionSafetySettings", () => {
	it("uses OFF for Gemini 3.x sexually explicit filtering", () => {
		expect(resolveGeminiMatureFictionSafetySettings("gemini-3.6-flash")).toEqual([
			{ category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "OFF" },
		]);
	});

	it("uses BLOCK_NONE for older Gemini models", () => {
		expect(resolveGeminiMatureFictionSafetySettings("gemini-2.5-flash")).toEqual([
			{ category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
		]);
	});
});
