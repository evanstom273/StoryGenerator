import { describe, expect, it } from "vitest";
import {
	createMetaChatExportFilename,
	createStoryExportFilename,
	formatLocalExportTimestamp,
} from "../exportFilename";

describe("exportFilename", () => {
	it("formats local wall-clock timestamps for filenames", () => {
		const stamp = formatLocalExportTimestamp(new Date(2026, 7, 4, 17, 8));
		expect(stamp).toBe("2026-08-04-1708");
	});

	it("includes archive suffix and timestamp for markdown exports", () => {
		const filename = createStoryExportFilename(
			"Wizard Detective Chronicles",
			"markdown",
			new Date(2026, 7, 4, 17, 8),
		);
		expect(filename).toBe("wizard-detective-chronicles-archive-2026-08-04-1708.md");
	});

	it("includes timestamp for meta chat exports", () => {
		const filename = createMetaChatExportFilename(
			"My Story",
			"json",
			new Date(2026, 0, 15, 9, 30),
		);
		expect(filename).toBe("my-story-meta-chat-2026-01-15-0930.json");
	});
});
