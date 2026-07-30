import { describe, expect, it } from "vitest";
import {
	applyRelationshipDeltas,
	buildCharacterAllowlist,
	canTrackRelationshipParticipant,
	findPlayerNpcRelationshipIndex,
	isDeniedSpeakerLabel,
	makeRelationshipPairKey,
	mergeRelationshipEntries,
	reconcileRelationshipEntries,
	resolveMergedTier,
	sanitizeRelationshipTier,
} from "../relationshipIndex";
import type { RelationshipIndexEntry } from "../types/models";

describe("relationshipIndex", () => {
	it("rejects Sun as a denied speaker label", () => {
		expect(isDeniedSpeakerLabel("Sun")).toBe(true);
		expect(isDeniedSpeakerLabel("Jamie")).toBe(false);
	});

	it("merges duplicate pairs and keeps richer tier", () => {
		const merged = reconcileRelationshipEntries(
			[
				{ a: "Jamie", b: "Jake", tier: "confidant", trust: 70 },
				{ a: "Jake", b: "Jamie", tier: "acquaintance", summary: "They are reconnecting." },
			],
			new Map(),
			{
				playerName: "Jamie",
				allowlist: buildCharacterAllowlist({
					playerName: "Jamie",
					existingRelationships: [
						{ a: "Jamie", b: "Jake", tier: "confidant" },
					],
				}),
			},
		);
		expect(merged?.length).toBe(1);
		expect(merged?.[0]?.tier).toBe("confidant");
		expect(merged?.[0]?.summary).toBe("They are reconnecting.");
		expect(merged?.[0]?.trust).toBe(70);
	});

	it("resolveMergedTier prefers specific tiers over stranger", () => {
		expect(resolveMergedTier("stranger", "confidant")).toBe("confidant");
		expect(resolveMergedTier("mentor", "friend")).toBe("mentor");
	});

	it("findPlayerNpcRelationshipIndex matches ordered pairs", () => {
		const entries: RelationshipIndexEntry[] = [
			{ a: "Jake", b: "Jamie", tier: "family" },
			{ a: "Amy", b: "Jake", tier: "friend" },
		];
		expect(findPlayerNpcRelationshipIndex(entries, "Jamie", "Jake")).toBe(0);
		expect(findPlayerNpcRelationshipIndex(entries, "Jamie", "Amy")).toBe(-1);
	});

	it("applyRelationshipDeltas only creates allowlisted characters", () => {
		const allowlist = buildCharacterAllowlist({
			playerName: "Jamie",
			indexedCharacters: {
				Jake: { name: "Jake" },
			},
		});
		const result = applyRelationshipDeltas(
			[],
			[],
			"Jamie",
			[{ characterName: "Sun", emotionalState: "bright", howTheyDescribeYou: "n/a" }],
			[{ characterName: "Jake", statusPhrase: "close but tense" }],
			{ allowlist },
		);
		expect(result.length).toBe(1);
		expect(result[0]?.b).toBe("Jake");
	});

	it("filters invalid Sun relationships on reconcile", () => {
		const allowlist = buildCharacterAllowlist({
			playerName: "Jamie",
			indexedCharacters: { Jake: { name: "Jake" } },
		});
		const cleaned = reconcileRelationshipEntries(
			[
				{ a: "Jamie", b: "Sun", tier: "stranger" },
				{ a: "Jamie", b: "Jake", tier: "friend" },
			],
			new Map(),
			{ playerName: "Jamie", allowlist },
		);
		expect(cleaned?.length).toBe(1);
		expect(cleaned?.[0]?.a === "Jake" || cleaned?.[0]?.b === "Jake").toBe(true);
	});

	it("sanitizeRelationshipTier accepts full vocabulary", () => {
		expect(sanitizeRelationshipTier("confidant")).toBe("confidant");
		expect(sanitizeRelationshipTier("invalid")).toBe("stranger");
	});

	it("makeRelationshipPairKey is order-independent", () => {
		expect(makeRelationshipPairKey("Jamie", "Jake")).toBe(makeRelationshipPairKey("Jake", "Jamie"));
	});

	it("mergeRelationshipEntries combines inner life from both sides", () => {
		const merged = mergeRelationshipEntries(
			{
				a: "Jamie",
				b: "Jake",
				tier: "friend",
				npcInnerLife: { emotionalState: "worried" },
				trust: 60,
			},
			{
				a: "Jamie",
				b: "Jake",
				tier: "stranger",
				summary: "Updated bond.",
				npcInnerLife: { howTheyDescribeYou: "My kid." },
				trust: 65,
			},
		);
		expect(merged.tier).toBe("friend");
		expect(merged.summary).toBe("Updated bond.");
		expect(merged.npcInnerLife?.emotionalState).toBe("worried");
		expect(merged.npcInnerLife?.howTheyDescribeYou).toBe("My kid.");
		expect(merged.trust).toBe(65);
	});

	it("canTrackRelationshipParticipant respects allowlist", () => {
		const allowlist = buildCharacterAllowlist({
			playerName: "Jamie",
			indexedCharacters: { Jake: { name: "Jake" } },
		});
		expect(canTrackRelationshipParticipant("Jake", allowlist)).toBe(true);
		expect(canTrackRelationshipParticipant("Sun", allowlist)).toBe(false);
	});
});
