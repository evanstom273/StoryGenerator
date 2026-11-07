import { afterEach, describe, expect, it } from "vitest";
import {
	resetLearnedGeminiThinkingSupport,
	resolveGeminiMinimalThinkingSettings,
	resolveGeminiStoryThinkingSettings,
	resolveGeminiThinkingFallback,
	resolveGeminiThinkingForPreference,
} from "../ai/geminiThinking";

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

describe("Gemini 3.8 Flash thinking", () => {
	it("never sends minimal, which the model rejects", () => {
		expect(resolveGeminiMinimalThinkingSettings("gemini-3.8-flash")).toEqual({ thinkingLevel: "low" });
		expect(resolveGeminiThinkingForPreference("gemini-3.8-flash", "minimal", "story")).toEqual({
			thinkingLevel: "low",
		});
	});
});

describe("resolveGeminiThinkingForPreference", () => {
	it("keeps task defaults on auto", () => {
		expect(resolveGeminiThinkingForPreference("gemini-3.6-flash", "auto", "story")).toEqual({ thinkingLevel: "low" });
		expect(resolveGeminiThinkingForPreference("gemini-3.6-flash", undefined, "default")).toBeUndefined();
	});

	it("passes explicit levels to Gemini 3 models", () => {
		expect(resolveGeminiThinkingForPreference("gemini-3.6-flash", "high", "story")).toEqual({ thinkingLevel: "high" });
		expect(resolveGeminiThinkingForPreference("gemini-3.6-flash", "minimal", "story")).toEqual({
			thinkingLevel: "minimal",
		});
		expect(resolveGeminiThinkingForPreference("gemini-3.1-pro-preview", "minimal", "story")).toEqual({
			thinkingLevel: "low",
		});
	});

	it("maps levels to thinking budgets on Gemini 2.5", () => {
		expect(resolveGeminiThinkingForPreference("gemini-2.5-flash", "medium", "story")).toEqual({ thinkingBudget: 8192 });
		expect(resolveGeminiThinkingForPreference("gemini-2.5-flash", "minimal", "story")).toEqual({ thinkingBudget: 0 });
	});
});

describe("resolveGeminiThinkingFallback", () => {
	afterEach(() => resetLearnedGeminiThinkingSupport());

	it("steps through levels and finally drops the thinking config", () => {
		const reject = (level: string) => new Error(`Thinking level ${level.toUpperCase()} is not supported for this model.`);
		expect(resolveGeminiThinkingFallback("gemini-x", { thinkingLevel: "medium" }, reject("medium"))).toEqual({
			thinking: { thinkingLevel: "high" },
		});
		expect(resolveGeminiThinkingFallback("gemini-x", { thinkingLevel: "high" }, reject("high"))).toEqual({
			thinking: undefined,
		});
		expect(resolveGeminiThinkingFallback("gemini-x", undefined, reject("high"))).toBeNull();
	});
});
