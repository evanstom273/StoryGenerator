import { describe, expect, it } from "vitest";
import { resolveGeminiMinimalThinkingSettings, resolveGeminiStoryThinkingSettings } from "../ai/geminiThinking";

describe("resolveGeminiMinimalThinkingSettings", () => {
	it("uses thinkingLevel low for Gemini 3.1 Pro", () => {
		expect(resolveGeminiMinimalThinkingSettings("gemini-3.1-pro-preview")).toEqual({
			thinkingLevel: "low",
		});
	});

	it("uses thinkingLevel minimal for Gemini 3.6 Flash", () => {
		expect(resolveGeminiMinimalThinkingSettings("gemini-3.6-flash")).toEqual({
			thinkingLevel: "minimal",
		});
	});

	it("uses thinkingLevel low for Gemini 3.6 Flash story generation", () => {
		expect(resolveGeminiStoryThinkingSettings("gemini-3.6-flash")).toEqual({
			thinkingLevel: "low",
		});
	});

	it("uses minimum thinking budget for Gemini 2.5 Pro", () => {
		expect(resolveGeminiMinimalThinkingSettings("gemini-2.5-pro")).toEqual({
			thinkingBudget: 128,
		});
	});

	it("disables thinking for Gemini 2.5 Flash", () => {
		expect(resolveGeminiMinimalThinkingSettings("gemini-2.5-flash")).toEqual({
			thinkingBudget: 0,
		});
	});
});
