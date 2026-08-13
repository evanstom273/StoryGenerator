import { describe, expect, it } from "vitest";
import { estimatePromptTokens, estimateTokensFromText } from "../ai/indexingDiagnostics";

describe("indexingDiagnostics", () => {
	it("estimates tokens from text using a character heuristic", () => {
		expect(estimateTokensFromText("")).toBe(0);
		expect(estimateTokensFromText("abcd")).toBe(1);
		expect(estimateTokensFromText("a".repeat(8))).toBe(2);
	});

	it("sums prompt message tokens", () => {
		expect(
			estimatePromptTokens([
				{ role: "system", content: "a".repeat(40) },
				{ role: "user", content: "b".repeat(20) },
			]),
		).toBe(15);
	});
});
