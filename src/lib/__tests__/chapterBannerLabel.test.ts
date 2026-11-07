import { describe, expect, it } from "vitest";
import { getNextChapterBannerLabel } from "../ai/chapterBannerLabel";

describe("getNextChapterBannerLabel", () => {
	it("increments roman chapter labels", () => {
		expect(getNextChapterBannerLabel("Chapter I")).toBe("Chapter II");
		expect(getNextChapterBannerLabel("Chapter II")).toBe("Chapter III");
	});

	it("increments numeric chapter labels", () => {
		expect(getNextChapterBannerLabel("Chapter 1")).toBe("Chapter 2");
		expect(getNextChapterBannerLabel("chapter 3")).toBe("Chapter 4");
	});

	it("does not double-prefix chapter labels", () => {
		expect(getNextChapterBannerLabel("Chapter II")).toBe("Chapter III");
		expect(getNextChapterBannerLabel("Chapter II")).not.toBe("Chapter Chapter II");
	});
});
