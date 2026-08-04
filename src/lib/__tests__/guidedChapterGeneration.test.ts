import { describe, expect, it } from "vitest";
import { canGenerateGuidedChaptersAtWorkspace, isStoryEligibleForGuidedGeneration } from "../guidedChapterGeneration/eligibility";
import { normalizeGuidedChapterPlan } from "../guidedChapterGeneration/planGeneration";
import { getGuidedChapterProgressPercent } from "../guidedChapterGeneration/guidedGenerationProgress";
import type { Story, StoryChapter, StoryMessage } from "../../types/models";

describe("guidedChapterGeneration", () => {
	it("normalizes chapter plans with fallback labels", () => {
		const plan = normalizeGuidedChapterPlan(
			{
				overallDirection: "Escalate the rivalry",
				chapters: [
					{ overview: "Opening confrontation", scenesPerChapter: 12 },
					{ label: "Chapter II", overview: "Aftermath", scenesPerChapter: 0 },
				],
			},
			["Chapter I", "Chapter II"],
		);

		expect(plan).not.toBeNull();
		expect(plan?.overallDirection).toBe("Escalate the rivalry");
		expect(plan?.chapters[0]?.label).toBe("Chapter I");
		expect(plan?.chapters[0]?.scenesPerChapter).toBe(10);
		expect(plan?.chapters[1]?.scenesPerChapter).toBe(1);
	});

	it("blocks workspace generation while a chapter is still open", () => {
		const messages: StoryMessage[] = [
			{
				id: "m1",
				storyId: "s1",
				role: "system",
				content: "Chapter I.",
				timestamp: "2026-01-01T00:00:00.000Z",
				speakerType: "system",
				chapterBoundary: { kind: "start", label: "Chapter I" },
			},
		];
		const chapters: StoryChapter[] = [];

		expect(canGenerateGuidedChaptersAtWorkspace(messages, chapters)).toEqual({
			ok: false,
			reason: "Finish or end the current chapter before generating new chapters.",
		});
	});

	it("allows eligible stories for guided generation", () => {
		const story: Story = {
			id: "s1",
			title: "Test",
			universeId: "u1",
			playerCharacterId: "p1",
			currentSummary: "",
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		};

		expect(isStoryEligibleForGuidedGeneration(story)).toBe(true);
		expect(isStoryEligibleForGuidedGeneration({ ...story, isArchived: true })).toBe(false);
	});

	it("computes guided progress percent from chapter statuses", () => {
		const percent = getGuidedChapterProgressPercent({
			storyId: "s1",
			phase: "generating",
			currentChapter: 2,
			totalChapters: 4,
			chapters: [
				{ label: "Chapter I", status: "done" },
				{ label: "Chapter II", status: "active" },
				{ label: "Chapter III", status: "pending" },
				{ label: "Chapter IV", status: "pending" },
			],
		});

		expect(percent).toBeGreaterThan(25);
		expect(percent).toBeLessThan(75);
	});
});
