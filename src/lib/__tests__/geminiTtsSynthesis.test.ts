import { describe, expect, it } from "vitest";
import { groupScriptLinesBySpeaker } from "../ai/geminiTtsSynthesis";

describe("geminiTtsSynthesis", () => {
	it("does not merge script lines across message boundaries", () => {
		const groups = groupScriptLinesBySpeaker([
			{ speaker: "Narrator", text: "The rain fell.", messageBreakAfter: true },
			{ speaker: "Narrator", text: "She waited." },
		]);

		expect(groups).toHaveLength(2);
		expect(groups[0]?.texts).toEqual(["The rain fell."]);
		expect(groups[1]?.texts).toEqual(["She waited."]);
	});

	it("merges consecutive lines from the same speaker within one message", () => {
		const groups = groupScriptLinesBySpeaker([
			{ speaker: "Narrator", text: "The alley was empty." },
			{ speaker: "Marcus", text: "We need to move." },
			{ speaker: "Narrator", text: "He ran north.", messageBreakAfter: true },
		]);

		expect(groups).toHaveLength(3);
		expect(groups[0]?.texts).toEqual(["The alley was empty."]);
		expect(groups[1]?.texts).toEqual(["We need to move."]);
		expect(groups[2]?.texts).toEqual(["He ran north."]);
	});
});
