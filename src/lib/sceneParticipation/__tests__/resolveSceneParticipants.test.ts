import { describe, expect, it } from "vitest";
import {
	applyDirectorIntentToStoryState,
	applyLiveSceneCapabilityOverrides,
	clearSceneParticipantCapabilityOverrides,
	getSceneParticipantCapabilityOverrides,
	replaceCurrentSceneState,
	resolveSceneParticipants,
	resolveStoryGenerationParticipants,
	toSemanticSpeakerIdentities,
} from "../index";

const PLAYER = {
	canonicalName: "Rebecca",
	aliases: ["Rebecca", "Becca"],
};

describe("resolveSceneParticipants", () => {
	it("resolves legacy active participants to physical defaults", () => {
		const participants = resolveSceneParticipants({
			playerIdentity: PLAYER,
			storyState: {
				updatedAt: "2026-01-01T00:00:00.000Z",
				characters: {
					rebecca: { canonicalName: "Rebecca", aliases: ["Becca"] },
					rosa: { canonicalName: "Rosa Diaz", narrativeName: "Rosa" },
				},
				worldFacts: [],
				unresolvedThreads: [],
				scene: { activeParticipants: ["Becca", "Rosa"] },
			},
		});

		const rosa = participants.find((participant) => participant.canonicalName === "Rosa");
		expect(rosa).toMatchObject({
			active: true,
			activityEvidence: ["legacy_active_participant"],
			capabilities: {
				canSpeak: true,
				canPerformPhysicalActions: true,
				canBeAddressed: true,
				canBePhysicallyInteractedWith: true,
			},
		});
	});

	it("lets explicit overrides supersede compatibility defaults", () => {
		const participants = resolveSceneParticipants({
			playerIdentity: PLAYER,
			storyState: {
				updatedAt: "2026-01-01T00:00:00.000Z",
				characters: {
					rosa: { canonicalName: "Rosa Diaz", narrativeName: "Rosa" },
				},
				worldFacts: [],
				unresolvedThreads: [],
				scene: {
					activeParticipants: ["Rosa"],
					participantCapabilityOverrides: [
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
					],
				},
			},
		});

		expect(participants.find((participant) => participant.canonicalName === "Rosa")?.capabilities).toEqual({
			canSpeak: true,
			canPerformPhysicalActions: false,
			canBeAddressed: true,
			canBePhysicallyInteractedWith: false,
		});
	});

	it("keeps dialogue-only participants active through named conversational contributions", () => {
		const participants = resolveSceneParticipants({
			playerIdentity: PLAYER,
			recentMessages: [
				{ role: "assistant", content: 'Rosa: "Stay on the line."' },
			],
			latestUserMessage: "Rosa, can you hear me?",
			capabilityOverrides: [
				{
					participantKey: "Rosa",
					capabilities: { canPerformPhysicalActions: false, canBePhysicallyInteractedWith: false },
					source: "live_scene_state",
				},
			],
		});

		const rosa = participants.find((participant) => participant.canonicalName === "Rosa");
		expect(rosa?.active).toBe(true);
		expect(rosa?.activityEvidence).toEqual(
			expect.arrayContaining(["recent_speaker_block", "latest_user_mention"]),
		);
		expect(rosa?.capabilities.canSpeak).toBe(true);
		expect(rosa?.capabilities.canPerformPhysicalActions).toBe(false);
	});

	it("keeps imported characters as inactive candidates until evidenced", () => {
		const participants = resolveSceneParticipants({
			playerIdentity: PLAYER,
			importedCharacters: [
				{ name: "Rosa", aliases: [] },
				{ name: "Amy", aliases: [] },
			],
		});

		expect(
			participants
				.filter((participant) => participant.canonicalName !== "Rebecca")
				.map((participant) => ({ name: participant.canonicalName, active: participant.active })),
		).toEqual(
			expect.arrayContaining([
				{ name: "Amy", active: false },
				{ name: "Rosa", active: false },
			]),
		);
	});

	it("activates the sole known non-player only as a last resort", () => {
		const participants = resolveSceneParticipants({
			playerIdentity: PLAYER,
			importedCharacters: [{ name: "Rosa", aliases: [] }],
		});

		expect(participants.find((participant) => participant.canonicalName === "Rosa")?.activityEvidence).toContain(
			"sole_known_non_player",
		);
	});

	it("centralizes alias collisions onto one resolved identity", () => {
		const participants = resolveSceneParticipants({
			playerIdentity: PLAYER,
			storyState: {
				updatedAt: "2026-01-01T00:00:00.000Z",
				characters: {
					rosa: { canonicalName: "Rosa Diaz", narrativeName: "Rosa", aliases: ["Diaz"] },
				},
				npcs: { Diaz: { role: "detective" } },
				worldFacts: [],
				unresolvedThreads: [],
				scene: { activeParticipants: ["Diaz"] },
			},
		});

		const nonPlayer = participants.filter((participant) => participant.canonicalName !== "Rebecca");
		expect(nonPlayer).toHaveLength(1);
		expect(nonPlayer[0]?.aliases).toEqual(expect.arrayContaining(["Rosa", "Diaz", "Rosa Diaz"]));
		expect(nonPlayer[0]?.active).toBe(true);
	});
});

describe("override lifecycle", () => {
	it("creates overrides only from structured live scene-state updates", () => {
		const next = applyLiveSceneCapabilityOverrides(
			{
				updatedAt: "2026-01-01T00:00:00.000Z",
				characters: {},
				worldFacts: [],
				unresolvedThreads: [],
			},
			[
				{
					participantKey: "Rosa",
					capabilities: { canSpeak: true, canPerformPhysicalActions: false },
				},
			],
		);

		expect(getSceneParticipantCapabilityOverrides(next)).toEqual([
			{
				participantKey: "Rosa",
				capabilities: { canSpeak: true, canPerformPhysicalActions: false },
				source: "live_scene_state",
			},
		]);
	});

	it("creates overrides only from structured Director instructions", () => {
		const next = applyDirectorIntentToStoryState(
			{
				updatedAt: "2026-01-01T00:00:00.000Z",
				characters: {},
				worldFacts: [],
				unresolvedThreads: [],
			},
			{
				participantCapabilityOverrides: [
					{
						participantKey: "Rosa",
						capabilities: { canBeAddressed: true, canBePhysicallyInteractedWith: false },
						source: "director_instruction",
					},
				],
			},
		);

		expect(getSceneParticipantCapabilityOverrides(next)[0]).toMatchObject({
			participantKey: "Rosa",
			source: "director_instruction",
		});
	});

	it("clears overrides deterministically on scene replacement", () => {
		const withOverride = applyLiveSceneCapabilityOverrides(
			{
				updatedAt: "2026-01-01T00:00:00.000Z",
				characters: {},
				worldFacts: [],
				unresolvedThreads: [],
				scene: { currentLocation: "Apartment" },
			},
			[{ participantKey: "Rosa", capabilities: { canSpeak: true } }],
		);

		const replaced = replaceCurrentSceneState(withOverride, {
			currentLocation: "Precinct",
			sceneSummary: "A new scene.",
		});
		expect(replaced.scene?.participantCapabilityOverrides).toBeUndefined();
		expect(replaced.scene?.currentLocation).toBe("Precinct");

		const cleared = clearSceneParticipantCapabilityOverrides(withOverride);
		expect(cleared.scene?.participantCapabilityOverrides).toBeUndefined();
	});
});

describe("consumer projections share one resolver result", () => {
	it("projects registry and semantic identities from the same participants", () => {
		const resolved = resolveStoryGenerationParticipants({
			playerCharacter: { name: "Rebecca Alvarez", aliases: ["Becca"] },
			playerIdentity: { legalName: "Rebecca Alvarez", sceneName: "Rebecca" },
			storyState: {
				updatedAt: "2026-01-01T00:00:00.000Z",
				characters: { rosa: { canonicalName: "Rosa Diaz", narrativeName: "Rosa" } },
				worldFacts: [],
				unresolvedThreads: [],
				scene: {
					activeParticipants: ["Rosa"],
					participantCapabilityOverrides: [
						{
							participantKey: "Rosa",
							capabilities: { canPerformPhysicalActions: false },
							source: "director_instruction",
						},
					],
				},
			},
		});

		expect(resolved.speakerRegistry.eligibleNonPlayerSpeakers.map((speaker) => speaker.canonicalName)).toEqual([
			"Rosa",
		]);
		expect(
			toSemanticSpeakerIdentities(resolved.participants, resolved.player.canonicalName).map(
				(speaker) => speaker.name,
			),
		).toEqual(["Rosa"]);
		expect(resolved.participants.find((participant) => participant.canonicalName === "Rosa")?.capabilities).toEqual(
			expect.objectContaining({ canSpeak: true, canPerformPhysicalActions: false }),
		);
	});
});
