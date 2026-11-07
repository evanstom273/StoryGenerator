import { describe, expect, it, vi } from "vitest";
import { resolveStoryThinkingLevel, withStoryThinkingLevel } from "../ai/storyThinking";
import type { AIProvider } from "../ai/types";

function fakeProvider() {
	const generateResponse = vi.fn().mockResolvedValue({ content: "ok" });
	const provider: AIProvider = {
		validateConnection: vi.fn(),
		generateResponse,
		generateSummary: vi.fn(),
	};
	return { provider, generateResponse };
}

describe("resolveStoryThinkingLevel", () => {
	it("prefers the story override, then Settings, then auto", () => {
		expect(resolveStoryThinkingLevel({ thinkingLevel: "high" }, { thinkingLevel: "low" })).toBe("high");
		expect(resolveStoryThinkingLevel({}, { thinkingLevel: "low" })).toBe("low");
		expect(resolveStoryThinkingLevel(null, null)).toBe("auto");
	});
});

describe("withStoryThinkingLevel", () => {
	const base = { apiKey: "k", model: "gemini-3.6-flash", messages: [] };

	it("overrides thinking on streamed Gemini story calls only", async () => {
		const { provider, generateResponse } = fakeProvider();
		const wrapped = withStoryThinkingLevel(provider, "gemini", "high");

		await wrapped.generateResponse({ ...base, onChunk: vi.fn() });
		await wrapped.generateResponse({ ...base, thinking: { thinkingLevel: "minimal" } });

		expect(generateResponse.mock.calls[0]?.[0].thinking).toEqual({ thinkingLevel: "high" });
		expect(generateResponse.mock.calls[1]?.[0].thinking).toEqual({ thinkingLevel: "minimal" });
	});

	it("leaves the provider alone on auto or non-Gemini providers", () => {
		const { provider } = fakeProvider();
		expect(withStoryThinkingLevel(provider, "gemini", "auto")).toBe(provider);
		expect(withStoryThinkingLevel(provider, "openai", "high")).toBe(provider);
	});
});
