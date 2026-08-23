import { describe, expect, it } from "vitest";
import { extractGeminiResponseText } from "../ai/geminiProvider";

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
