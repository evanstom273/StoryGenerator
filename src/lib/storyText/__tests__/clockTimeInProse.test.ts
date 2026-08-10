import { describe, expect, it } from "vitest";
import {
	findSpeakerColonIndex,
	isClockTimeColonAt,
	looksLikeClockTimeFragment,
	repairClockTimeColonCorruption,
} from "../clockTimeInProse";
import { formatNarratorBlockForDisplay, parseSceneBlocks } from "../parseSceneBlocks";
import { normalizeCharacterActionBeatsInTranscript } from "../playerSceneName";
import { normalizeTranscriptForDisplay, sanitizeMessageForDisplay } from "../transcriptSanitizer";

describe("clockTimeInProse", () => {
	it("detects clock colons in prose", () => {
		expect(isClockTimeColonAt("By 11:30 AM", "By 11:30 AM".indexOf(":"))).toBe(true);
		expect(isClockTimeColonAt("By 11: 30 AM", "By 11: 30 AM".indexOf(":"))).toBe(true);
		expect(isClockTimeColonAt("Jake: hello", "Jake: hello".indexOf(":"))).toBe(false);
	});

	it("finds speaker colons but skips clock times", () => {
		expect(findSpeakerColonIndex("By 11:30 AM, the squad arrives.")).toBeNull();
		expect(findSpeakerColonIndex("Jake: Come on.")).toBe(4);
	});

	it("repairs corrupted clock-time speaker splits", () => {
		expect(repairClockTimeColonCorruption("By 11: They 30 AM, the room quiets.")).toBe(
			"By 11:30 AM, the room quiets.",
		);
		expect(repairClockTimeColonCorruption("By 11: 30 AM, the room quiets.")).toBe(
			"By 11:30 AM, the room quiets.",
		);
	});

	it("recognizes clock fragments", () => {
		expect(looksLikeClockTimeFragment("30 AM")).toBe(true);
		expect(looksLikeClockTimeFragment("11:30 AM")).toBe(true);
		expect(looksLikeClockTimeFragment("minutes later")).toBe(false);
	});
});

describe("clock time transcript rendering", () => {
	it("does not treat clock times as speaker labels", () => {
		const text = "Narrator: By 11:30 AM, the precinct is already buzzing.";
		const blocks = parseSceneBlocks(text);
		expect(blocks).toHaveLength(1);
		expect(blocks[0]?.speakerLabel).toBeUndefined();
		expect(blocks[0]?.text).toContain("11:30 AM");
	});

	it("does not inject pronouns into clock-time remainders", () => {
		const normalized = normalizeCharacterActionBeatsInTranscript(
			"Narrator: By 11: 30 AM, the precinct is already buzzing.",
		);
		expect(normalized).toContain("11: 30 AM");
		expect(normalized).not.toContain("They 30 AM");
	});

	it("repairs corrupted clock times for display", () => {
		const display = normalizeTranscriptForDisplay("By 11: They 30 AM, the room quiets.");
		expect(display).toContain("11:30 AM");
		expect(display).not.toContain("They 30 AM");
	});

	it("formats narrator blocks with clock times intact", () => {
		const formatted = formatNarratorBlockForDisplay("By 11: They 30 AM, the room quiets.");
		expect(formatted).toContain("11:30 AM");
		expect(formatted).not.toContain("They 30 AM");
	});

	it("sanitizes stored assistant messages for display without pronoun corruption", () => {
		const sanitized = sanitizeMessageForDisplay({
			message: {
				id: "msg-1",
				storyId: "story-1",
				role: "assistant",
				content: "Narrator: By 11: They 30 AM, the room quiets.",
				timestamp: "2026-01-01T00:00:00.000Z",
			},
		});
		expect(sanitized).toContain("11:30 AM");
		expect(sanitized).not.toContain("They 30 AM");
	});
});
