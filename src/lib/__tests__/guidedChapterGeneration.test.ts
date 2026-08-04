import { describe, expect, it } from "vitest";
import { canGenerateGuidedChaptersAtWorkspace, isStoryEligibleForGuidedGeneration } from "../guidedChapterGeneration/eligibility";
import { normalizeGuidedChapterPlan } from "../guidedChapterGeneration/planGeneration";
import { parseSceneOverviews, resolveScenesForChapter, shouldStageDirectorBeatForScene } from "../guidedChapterGeneration/parsePlanText";
import {
	buildGuidedChapterContinuityLedger,
	formatGuidedChapterContinuityNotes,
} from "../guidedChapterGeneration/guidedChapterContinuity";
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

	it("parses director beats from JSON without leaking raw JSON into staging", async () => {
		const { generateDirectorBeat } = await import("../guidedChapterGeneration/directorBeat");
		const provider = {
			generateResponse: async () => ({
				content: '{"directorBeat":"*Kelly steps onto the shuttle deck.*"}',
			}),
		};

		const beat = await generateDirectorBeat({
			provider: provider as never,
			apiKey: "test",
			model: "test",
			chapterLabel: "Chapter I",
			chapterOverview: "Arrival",
			sceneIndex: 1,
			sceneCount: 1,
			playerName: "Kelly",
		});

		expect(beat).toBe("*Kelly steps onto the shuttle deck.*");
	});

	it("falls back to scene plan when director beat JSON is unusable", async () => {
		const { generateDirectorBeat } = await import("../guidedChapterGeneration/directorBeat");
		let calls = 0;
		const provider = {
			generateResponse: async () => {
				calls += 1;
				return { content: '{"directorBeat":""}' };
			},
		};

		const beat = await generateDirectorBeat({
			provider: provider as never,
			apiKey: "test",
			model: "test",
			chapterLabel: "Chapter I",
			chapterOverview: "Arrival",
			sceneOverview: "Jamie meets Cmdr Grayson (Kelly) in her office.",
			sceneIndex: 1,
			sceneCount: 2,
			playerName: "Jamie",
		});

		expect(calls).toBe(2);
		expect(beat).toBe("*Jamie meets Cmdr Grayson (Kelly) in her office.*");
	});

	it("extracts director beats from malformed JSON without leaking braces", async () => {
		const { generateDirectorBeat } = await import("../guidedChapterGeneration/directorBeat");
		const provider = {
			generateResponse: async () => ({
				content: '{"directorBeat":"*Kelly opens the door.*"',
			}),
		};

		const beat = await generateDirectorBeat({
			provider: provider as never,
			apiKey: "test",
			model: "test",
			chapterLabel: "Chapter I",
			chapterOverview: "Arrival",
			sceneIndex: 1,
			sceneCount: 1,
			playerName: "Kelly",
		});

		expect(beat).toBe("*Kelly opens the door.*");
	});

	it("parses Scene I / Scene II blocks from chapter overview", () => {
		const overview =
			"Scene I: Jamie meets Cmdr Grayson (Kelly) in her office.\nScene II: Jamie tours the bridge with Malloy.";
		const scenes = parseSceneOverviews(overview);
		expect(scenes).toEqual([
			"Jamie meets Cmdr Grayson (Kelly) in her office.",
			"Jamie tours the bridge with Malloy.",
		]);
		const resolved = resolveScenesForChapter(overview, 3);
		expect(resolved.sceneCount).toBe(2);
		expect(resolved.scenes[0]).toContain("Kelly");
	});

	it("stages a director beat only for the first scene when no Scene headers exist", () => {
		const overview = "Jamie arrives aboard and settles into the crew rhythm.";
		expect(shouldStageDirectorBeatForScene(overview, 0)).toBe(true);
		expect(shouldStageDirectorBeatForScene(overview, 1)).toBe(false);
	});

	it("stages director beats for each parsed Scene block", () => {
		const overview =
			"Scene I: Jamie meets Kelly.\nScene II: Jamie tours the bridge.";
		expect(shouldStageDirectorBeatForScene(overview, 0)).toBe(true);
		expect(shouldStageDirectorBeatForScene(overview, 1)).toBe(true);
	});

	it("builds a continuity ledger that locks the first docking bay assignment", () => {
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
			{
				id: "m2",
				storyId: "s1",
				role: "assistant",
				content:
					"Alara Kitan: \"I'll meet him at docking bay two when his shuttle arrives and set the expectations from minute one.\"",
				timestamp: "2026-01-01T00:01:00.000Z",
			},
			{
				id: "m3",
				storyId: "s1",
				role: "assistant",
				content:
					"Alara Kitan: \"I'll head down to Docking Bay Four now. The shuttle Gryphon is on final approach.\"",
				timestamp: "2026-01-01T00:02:00.000Z",
			},
		];

		const ledger = buildGuidedChapterContinuityLedger(messages);
		expect(ledger.some((entry) => entry.includes("Authoritative arrival docking bay: Docking Bay 2"))).toBe(
			true,
		);
		expect(ledger.some((entry) => entry.includes("Shuttle(s) named: Gryphon"))).toBe(true);

		const notes = formatGuidedChapterContinuityNotes(messages);
		expect(notes).toContain("do not contradict");
	});

	it("lets a senior officer assignment override the docking bay in continuity notes", () => {
		const messages: StoryMessage[] = [
			{
				id: "m1",
				storyId: "s1",
				role: "assistant",
				content: "Alara Kitan: \"I'll meet him at docking bay two when his shuttle arrives.\"",
				timestamp: "2026-01-01T00:01:00.000Z",
			},
			{
				id: "m2",
				storyId: "s1",
				role: "assistant",
				content:
					"Ed Mercer: \"Gryphon is lining up for Docking Bay Four. Alara, he's officially in your hands now.\"",
				timestamp: "2026-01-01T00:02:00.000Z",
			},
		];

		const ledger = buildGuidedChapterContinuityLedger(messages);
		expect(ledger[0]).toContain("Authoritative arrival docking bay: Docking Bay 4");
	});
});
