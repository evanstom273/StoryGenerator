import { describe, expect, it } from "vitest";
import { getAIModelForRole } from "../ai/models";
import type { AISettings } from "../../types/models";

const settings: AISettings = {
	id: "ai-settings",
	activeProviderType: "openai",
	apiKeys: {},
	defaultModels: { openai: "gpt-4o", gemini: "gemini-2.5-flash" },
	metachatModels: { openai: "gpt-5-mini" },
	indexingModels: { gemini: "gemini-3.1-pro-preview" },
	creationModels: { openai: "gpt-5" },
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("getAIModelForRole", () => {
	it("returns role-specific models when configured", () => {
		expect(getAIModelForRole(settings, "openai", "story")).toBe("gpt-4o");
		expect(getAIModelForRole(settings, "openai", "metachat")).toBe("gpt-5-mini");
		expect(getAIModelForRole(settings, "gemini", "indexing")).toBe("gemini-3.1-pro-preview");
		expect(getAIModelForRole(settings, "openai", "creation")).toBe("gpt-5");
	});

	it("falls back to the story model when a role model is unset", () => {
		expect(getAIModelForRole(settings, "gemini", "metachat")).toBe("gemini-2.5-flash");
	});
});
