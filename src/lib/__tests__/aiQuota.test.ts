import { describe, expect, it } from "vitest";
import { fetchAIQuotaSnapshot } from "../ai/quota";

describe("ai quota", () => {
	it("returns a helpful message when no API key is configured", async () => {
		const snapshot = await fetchAIQuotaSnapshot("openrouter", "openai/gpt-4", "");
		expect(snapshot.available).toBe(false);
		expect(snapshot.error).toMatch(/add an api key/i);
	});

	it("returns guidance for non-OpenRouter providers", async () => {
		const snapshot = await fetchAIQuotaSnapshot("openai", "gpt-4.1", "sk-test");
		expect(snapshot.available).toBe(false);
		expect(snapshot.error).toMatch(/openrouter only/i);
	});
});
