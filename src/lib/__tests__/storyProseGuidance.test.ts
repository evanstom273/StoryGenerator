import { describe, expect, it } from "vitest";
import { formatHumanNovelistProseGuidance } from "../storyProseGuidance";

describe("formatHumanNovelistProseGuidance", () => {
	it("mandates human novelist prose and bans common AI stock phrases", () => {
		const guidance = formatHumanNovelistProseGuidance();

		expect(guidance).toContain("Write like a human novelist");
		expect(guidance).toContain("Prefer commas and full stops over em dashes");
		expect(guidance).toContain("a beat passes");
		expect(guidance).toContain("lets out a breath");
		expect(guidance).toContain("the room falls silent");
		expect(guidance).toContain("contemporary novel written by a human");
	});
});
