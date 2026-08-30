import { describe, expect, it } from "vitest";
import { parseStoryStateData } from "../../ai/storyStateExtractor";
import {
	mergeStoryStateForIndexing,
	normalizeStoryStateToV2,
	createSequelStoryStateData,
} from "../../storyStateV2";
import {
	applyLiveSceneCapabilityOverrides,
	getSceneParticipantCapabilityOverrides,
} from "../index";
import { detectDirectorIntent, parseParticipantCapabilityDirective } from "../../storyText/directorIntent";

const override = {
	participantKey: "Rosa",
	capabilities: {
		canSpeak: true,
		canPerformPhysicalActions: false,
		canBeAddressed: true,
		canBePhysicallyInteractedWith: false,
	},
	source: "director_instruction" as const,
};

function stateWithOverride() {
	return normalizeStoryStateToV2({
		updatedAt: "2026-01-01T00:00:00.000Z",
		characters: {},
		worldFacts: [],
		unresolvedThreads: [],
		scene: {
			currentLocation: "Apartment",
			participantCapabilityOverrides: [override],
		},
	});
}

describe("indexing and memory cannot create capability overrides", () => {
	it("strips invented overrides from extracted indexing JSON", () => {
		const parsed = parseStoryStateData(
			JSON.stringify({
				updatedAt: "2026-01-02T00:00:00.000Z",
				characters: {},
				worldFacts: [],
				unresolvedThreads: [],
				scene: {
					currentLocation: "Apartment",
					participantCapabilityOverrides: [
						{
							participantKey: "Rosa",
							capabilities: { canSpeak: true, canPerformPhysicalActions: false },
							source: "live_scene_state",
						},
					],
				},
			}),
		);

		expect(parsed?.scene?.participantCapabilityOverrides).toBeUndefined();
	});

	it("preserves existing overrides through indexing merge and ignores invented incoming ones", () => {
		const previous = stateWithOverride();
		const incoming = normalizeStoryStateToV2({
			updatedAt: "2026-01-02T00:00:00.000Z",
			characters: {},
			worldFacts: [],
			unresolvedThreads: [],
			scene: {
				currentLocation: "Apartment kitchen",
				participantCapabilityOverrides: [
					{
						participantKey: "Amy",
						capabilities: { canSpeak: false },
						source: "live_scene_state",
					},
				],
			},
		});

		const merged = mergeStoryStateForIndexing(previous, incoming, incoming.indexes);
		expect(getSceneParticipantCapabilityOverrides(merged)).toEqual([override]);
		expect(merged.scene?.currentLocation).toBe("Apartment kitchen");
	});

	it("does not create an override from dialogue-only transcript extraction", () => {
		const parsed = parseStoryStateData(
			JSON.stringify({
				updatedAt: "2026-01-02T00:00:00.000Z",
				characters: { Rosa: { status: 'Speaking: "Stay on the line."' } },
				worldFacts: [],
				unresolvedThreads: [],
				sceneState: ["Rosa is talking to Rebecca by phone."],
				summaries: { currentSituation: "Rosa called from another location." },
			}),
		);

		expect(getSceneParticipantCapabilityOverrides(parsed)).toEqual([]);
	});

	it("does not create an override from narrative memory text", () => {
		const previous = normalizeStoryStateToV2({
			updatedAt: "2026-01-01T00:00:00.000Z",
			characters: {},
			worldFacts: [],
			unresolvedThreads: [],
		});
		const incoming = normalizeStoryStateToV2({
			updatedAt: "2026-01-02T00:00:00.000Z",
			characters: {},
			worldFacts: [],
			unresolvedThreads: [],
			significantMemories: ["Rosa sounded far away and could not touch anyone."],
			sceneState: ["A remote conversation continues."],
		});

		const merged = mergeStoryStateForIndexing(previous, incoming, incoming.indexes);
		expect(getSceneParticipantCapabilityOverrides(merged)).toEqual([]);
	});

	it("keeps existing overrides unchanged when memory is rebuilt over narrative text", () => {
		const previous = stateWithOverride();
		const incoming = normalizeStoryStateToV2({
			updatedAt: "2026-01-02T00:00:00.000Z",
			characters: {},
			worldFacts: [],
			unresolvedThreads: [],
			significantMemories: ["Rosa stayed on the phone for the whole scene."],
		});

		const merged = mergeStoryStateForIndexing(previous, incoming, incoming.indexes);
		expect(getSceneParticipantCapabilityOverrides(merged)).toEqual([override]);
	});

	it("clears overrides when a sequel replaces the current scene", () => {
		const sequel = createSequelStoryStateData({
			sourceState: stateWithOverride(),
			sourceSummary: "A later chapter.",
			now: "2026-01-03T00:00:00.000Z",
		});
		expect(sequel.scene).toBeUndefined();
		expect(getSceneParticipantCapabilityOverrides(sequel)).toEqual([]);
	});
});

describe("explicit Director participation syntax", () => {
	it("creates an override from an explicit /participate directive", () => {
		const intent = detectDirectorIntent(
			"/participate Rosa canSpeak=true canPerformPhysicalActions=false canBeAddressed=true canBePhysicallyInteractedWith=false",
		);
		expect(intent?.participantCapabilityOverrides).toEqual([
			{
				participantKey: "Rosa",
				capabilities: {
					canSpeak: true,
					canPerformPhysicalActions: false,
					canBeAddressed: true,
					canBePhysicallyInteractedWith: false,
				},
				source: "director_instruction",
			},
		]);
	});

	it("ignores ambiguous free text that sounds remote or absent", () => {
		expect(parseParticipantCapabilityDirective("Rosa sounds remote and cannot touch anyone.")).toBeNull();
		expect(detectDirectorIntent("Keep Rosa on the phone for this scene.")).toBeNull();
		expect(detectDirectorIntent("She is not physically here.")).toBeNull();
	});
});

describe("live scene-state updates", () => {
	it("requires a participant key and at least one explicit capability", () => {
		const created = applyLiveSceneCapabilityOverrides(
			{
				updatedAt: "2026-01-01T00:00:00.000Z",
				characters: {},
				worldFacts: [],
				unresolvedThreads: [],
			},
			[{ participantKey: "Rosa", capabilities: { canSpeak: true } }],
		);
		expect(getSceneParticipantCapabilityOverrides(created)).toHaveLength(1);

		const ignored = applyLiveSceneCapabilityOverrides(created, [
			{ participantKey: "   ", capabilities: { canSpeak: false } },
		]);
		expect(getSceneParticipantCapabilityOverrides(ignored)).toHaveLength(1);
	});
});
