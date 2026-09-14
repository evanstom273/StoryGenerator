import { describe, expect, it } from "vitest";
import { buildCanonicalTranscriptFingerprint, getArchiveIndexStatus } from "../archiveIndexing";
import type { StoryState } from "../../types/models";

const FINGERPRINT = "sha256:canonical-transcript";

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
				lastDeepIndexedTranscriptFingerprint: FINGERPRINT,
				indexes: { messageCount: 42 },
			}),
			{ currentMessageCount: 42, currentMessageFingerprint: FINGERPRINT },
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

	it("does not treat the lightweight index message count as deep-index completion", () => {
		const status = getArchiveIndexStatus(
			makeStoryState({
				lastDeepIndexedAt: "2026-08-01T12:00:00.000Z",
				lastDeepIndexedMessageCount: 8,
				indexes: { messageCount: 16 },
			}),
			{ currentMessageCount: 16 },
		);

		expect(status.indexedMessageCount).toBe(8);
		expect(status.needsRefresh).toBe(true);
		expect(status.reason).toBe("new_messages");
	});

	it("reports a partial index whenever a provider-refusal gap is recorded", () => {
		const status = getArchiveIndexStatus(
			makeStoryState({
				lastDeepIndexedAt: "2026-08-01T12:00:00.000Z",
				lastDeepIndexedMessageCount: 8,
				lastDeepIndexAttemptedMessageCount: 16,
				indexingGaps: [
					{
						messageNumber: 9,
						code: "provider_refusal",
						provider: "gemini",
						stage: "prompt",
						occurredAt: "2026-08-03T12:00:00.000Z",
					},
				],
				indexes: { messageCount: 16 },
			}),
			{ currentMessageCount: 16 },
		);

		expect(status.indexedMessageCount).toBe(8);
		expect(status.attemptedMessageCount).toBe(16);
		expect(status.indexingGaps).toHaveLength(1);
		expect(status.needsRefresh).toBe(true);
		expect(status.isFresh).toBe(false);
		expect(status.reason).toBe("partial");
	});

	it("requires a fingerprint for indexes created before canonical transcript hashing", () => {
		const status = getArchiveIndexStatus(
			makeStoryState({
				lastIndexedAt: "2026-08-01T12:00:00.000Z",
				lastIndexedMessageCount: 12,
				indexes: { messageCount: 16 },
			}),
			{ currentMessageCount: 12, currentMessageFingerprint: FINGERPRINT },
		);

		expect(status.indexedMessageCount).toBe(12);
		expect(status.attemptedMessageCount).toBe(12);
		expect(status.reason).toBe("fingerprint_missing");
		expect(status.needsRefresh).toBe(true);
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
				lastDeepIndexedTranscriptFingerprint: FINGERPRINT,
				indexes: { messageCount: 30 },
			}),
			{ currentMessageCount: 30, currentMessageFingerprint: FINGERPRINT },
		);

		expect(status.needsRefresh).toBe(false);
	});

	it("requires refresh when same-count content changes", () => {
		const status = getArchiveIndexStatus(
			makeStoryState({
				lastDeepIndexedAt: "2026-08-01T12:00:00.000Z",
				lastDeepIndexedMessageCount: 1,
				lastDeepIndexedTranscriptFingerprint: FINGERPRINT,
			}),
			{ currentMessageCount: 1, currentMessageFingerprint: "sha256:edited-content" },
		);
		expect(status.needsRefresh).toBe(true);
		expect(status.reason).toBe("content_mismatch");
	});

	it("hashes message identity, revision, and content", async () => {
		const message = {
			id: "message-1",
			storyId: "story-1",
			role: "assistant" as const,
			timestamp: "2026-08-01T12:00:00.000Z",
			revision: 1,
			content: "Original content",
		};
		const original = await buildCanonicalTranscriptFingerprint([message]);
		const changedContent = await buildCanonicalTranscriptFingerprint([{ ...message, content: "Edited content" }]);
		const changedRevision = await buildCanonicalTranscriptFingerprint([{ ...message, revision: 2 }]);
		expect(original).not.toBe(changedContent);
		expect(original).not.toBe(changedRevision);
		expect(original).toMatch(/^sha256:[a-f0-9]{64}$/);
	});
});
