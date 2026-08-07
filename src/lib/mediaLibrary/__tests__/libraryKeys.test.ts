import { describe, expect, it } from "vitest";
import {
	buildMediaAssetPlayId,
	buildStoryAudiobookLibraryKey,
	buildStoryChapterLibraryKey,
	parseChapterPlayId,
	parseMediaAssetPlayId,
} from "../libraryKeys";

describe("mediaLibrary libraryKeys", () => {
	it("builds stable story library keys", () => {
		expect(buildStoryAudiobookLibraryKey("story-1")).toBe("story_audiobook:story-1");
		expect(buildStoryChapterLibraryKey("story-1", "msg-1")).toBe("story_chapter:story-1:msg-1");
	});

	it("parses playback ids", () => {
		expect(parseMediaAssetPlayId("media:asset-1")).toBe("asset-1");
		expect(parseChapterPlayId("chapter-msg-1")).toBe("msg-1");
		expect(buildMediaAssetPlayId("asset-1")).toBe("media:asset-1");
	});
});
