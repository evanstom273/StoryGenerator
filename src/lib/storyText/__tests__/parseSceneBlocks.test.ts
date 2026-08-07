import { describe, expect, it } from "vitest";
import { formatNarratorBlockForDisplay, parseSceneBlocks, stripNarratorDisplayArtifacts } from "../parseSceneBlocks";

describe("parseSceneBlocks", () => {
	it("does not treat time-skip number words as speaker labels", () => {
		const text =
			"Fifteen: minutes later, the neon sign of Shaw's Bar glows warmly against the dimming Brooklyn skyline.";
		const blocks = parseSceneBlocks(text);
		expect(blocks).toHaveLength(1);
		expect(blocks[0]?.speakerLabel).toBeUndefined();
		expect(blocks[0]?.text).toContain("Fifteen: minutes later");
	});

	it("does not treat names followed by lowercase narration as speaker labels", () => {
		const text = "Amy: shifts closer on the mattress, wrapping her arms around both of them.";
		const blocks = parseSceneBlocks(text);
		expect(blocks).toHaveLength(1);
		expect(blocks[0]?.speakerLabel).toBeUndefined();
		expect(blocks[0]?.text).toBe(text);
	});

	it("still parses real inline dialogue", () => {
		const text = 'Jake: "Come on, we\'re going to be late."';
		const blocks = parseSceneBlocks(text);
		expect(blocks).toHaveLength(1);
		expect(blocks[0]?.speakerLabel).toBe("Jake");
		expect(blocks[0]?.text).toContain("Come on");
	});

	it("still parses inline character action", () => {
		const text = "Amy: *crosses her arms*";
		const blocks = parseSceneBlocks(text);
		expect(blocks).toHaveLength(1);
		expect(blocks[0]?.speakerLabel).toBe("Amy");
		expect(blocks[0]?.text).toBe("*crosses her arms*");
	});

	it("does not treat time-skip headers as speaker-only lines", () => {
		const text = "Twenty:\nminutes pass before anyone speaks again.";
		const blocks = parseSceneBlocks(text);
		expect(blocks).toHaveLength(1);
		expect(blocks[0]?.speakerLabel).toBeUndefined();
		expect(blocks[0]?.text).toContain("Twenty:");
	});

	it("keeps narrator blocks with name-led prose unattributed", () => {
		const text = "Narrator: Ed walked into the bar and looked around.";
		const blocks = parseSceneBlocks(text);
		expect(blocks).toHaveLength(1);
		expect(blocks[0]?.speakerLabel).toBeUndefined();
	});
});

describe("formatNarratorBlockForDisplay", () => {
	it("removes pronoun-led narrator pseudo-labels and asterisk markers", () => {
		const formatted = formatNarratorBlockForDisplay(
			[
				"*He narrator:*",
				"*The squad watches intently as the man stands motionless in the center of the room.*",
			].join("\n"),
		);

		expect(formatted).not.toContain("narrator");
		expect(formatted).not.toContain("*");
		expect(formatted).toContain("The squad watches intently");
	});

	it("strips narrator display artifacts from a single line", () => {
		expect(stripNarratorDisplayArtifacts("*He narrator:*")).toBe("");
	});
});
