import { describe, expect, it } from "vitest";
import { getArchiveIndexStatus } from "../archiveIndexing";
import type { StoryState } from "../../types/models";

function makeStoryState(stateJson: Record<string, unknown>): StoryState {
	return {
		id: "story-state:story-1",
		storyId: "story-1",
		stateJson: JSON.stringify({
			updatedAt: "2026-08-03T12:00:00.000Z",
			characters: {},
			worldFacts: [],
			unresolvedThreads: [],
			...stateJson,
		}),
		updatedAt: "2026-08-03T12:00:00.000Z",
	};
}

describe("getArchiveIndexStatus", () => {
	it("skips refresh when indexed message count matches current messages", () => {
		const status = getArchiveIndexStatus(
			makeStoryState({
				lastDeepIndexedAt: "2026-08-01T12:00:00.000Z",
				lastDeepIndexedMessageCount: 42,
				indexes: { messageCount: 42 },
			}),
			{ currentMessageCount: 42 },
		);

		expect(status.needsRefresh).toBe(false);
		expect(status.reason).toBe("current");
	});

	it("requires refresh when new messages exist since last index", () => {
		const status = getArchiveIndexStatus(
			makeStoryState({
				lastDeepIndexedAt: "2026-08-01T12:00:00.000Z",
				lastDeepIndexedMessageCount: 40,
				indexes: { messageCount: 40 },
			}),
			{ currentMessageCount: 45 },
		);

		expect(status.needsRefresh).toBe(true);
		expect(status.reason).toBe("new_messages");
	});

	it("requires refresh when no index exists yet", () => {
		const status = getArchiveIndexStatus(makeStoryState({}), { currentMessageCount: 10 });

		expect(status.needsRefresh).toBe(true);
		expect(status.reason).toBe("missing");
	});

	it("does not require refresh based only on index age", () => {
		const status = getArchiveIndexStatus(
			makeStoryState({
				lastDeepIndexedAt: "2020-01-01T12:00:00.000Z",
				lastDeepIndexedMessageCount: 30,
				indexes: { messageCount: 30 },
			}),
			{ currentMessageCount: 30 },
		);

		expect(status.needsRefresh).toBe(false);
	});
});
