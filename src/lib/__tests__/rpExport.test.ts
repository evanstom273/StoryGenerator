import { describe, expect, it } from "vitest";
import type { StoryMessage } from "../../types/models";
import {
	buildRpExportMarkdown,
	buildRpExportPdf,
	buildRpExportText,
	type RpExportData,
} from "../rpExport";

function makeRpExportData(): RpExportData {
	const messages: StoryMessage[] = [
		{
			id: "narrator",
			storyId: "story-1",
			role: "assistant",
			content: "Narrator: *The room falls silent.*",
			timestamp: "2026-08-01T12:00:00.000Z",
			speakerType: "narrator",
		},
		{
			id: "plain-narrator",
			storyId: "story-1",
			role: "assistant",
			content: "Narrator: the room settles again.",
			timestamp: "2026-08-01T12:01:00.000Z",
			speakerType: "narrator",
		},
		{
			id: "rosa",
			storyId: "story-1",
			role: "assistant",
			content: 'Rosa: *She stands.* "Jamie?"',
			timestamp: "2026-08-01T12:02:00.000Z",
			speakerType: "narrator",
		},
	];

	return {
		storyTitle: "Narrator regression",
		exportedAt: "2026-08-01T12:03:00.000Z",
		rpStats: { hp: 10, gold: 0, npcHp: {}, eventLog: [], changelog: [] },
		rpConfig: { maxHp: 10, currencyName: "Gold" },
		messages,
	} as unknown as RpExportData;
}

describe("RP story transcript exports", () => {
	it("omits narrator labels and preserves named character labels in Markdown, TXT, and PDF", async () => {
		const data = makeRpExportData();
		const markdown = buildRpExportMarkdown(data);
		const text = buildRpExportText(data);
		const pdf = await (await buildRpExportPdf(data)).text();

		for (const output of [markdown, text, pdf]) {
			expect(output).not.toContain("Narrator:");
			expect(output.match(/The room falls silent\./g)).toHaveLength(1);
			expect(output.match(/the room settles again\./g)).toHaveLength(1);
			expect(output).toContain("Rosa");
			expect(output).toContain("Jamie?");
		}
		expect(markdown).toContain("**Rosa:**");
		expect(text).toContain("Rosa:");
		const messages = data.messages;
		expect(messages[0]?.content).toBe("Narrator: *The room falls silent.*");
	});
});
