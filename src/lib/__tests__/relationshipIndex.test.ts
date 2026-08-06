import { describe, expect, it } from "vitest";
import {
	buildCharacterAllowlist,
	canTrackRelationshipParticipant,
	findPlayerNpcRelationshipIndex,
	isDeniedSpeakerLabel,
	isPlayerNameVariant,
	isPossessiveSpeakerLabel,
	makeRelationshipPairKey,
	mergeRelationshipEntries,
	reconcileRelationshipEntries,
	resolveMergedTier,
	sanitizeRelationshipTier,
	simplifyRelationshipEntry,
	stripRelationshipEndpointAnnotations,
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
		expect(merged?.[0]?.trust).toBeUndefined();
	});

	it("merges near-duplicate relationship history beats", () => {
		const merged = mergeRelationshipEntries(
			{
				a: "Jamie Potter",
				b: "Raymond Holt",
				tier: "ally",
				history: [
					{ summary: "Holt rushed back from a meeting to ensure he doesn't miss Wands at Four.", messageNumber: 5 },
				],
			},
			{
				a: "Jamie Potter",
				b: "Raymond Holt",
				tier: "ally",
				history: [
					{ summary: "Holt hurried back early from One Police Plaza to avoid missing Wands at Four.", messageNumber: 5 },
					{ summary: "Holt sanctioned Jamie's Friday magic demonstrations in the bullpen.", messageNumber: 3 },
					{ summary: "Approved Jamie's Wands at Four demonstrations.", messageNumber: 3 },
				],
			},
		);

		expect(merged.history?.length).toBeLessThanOrEqual(3);
		expect(merged.history?.length).toBe(2);
		expect(merged.history?.[0]?.summary.toLowerCase()).toContain("one police plaza");
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

	it("mergeRelationshipEntries keeps summary and drops advanced RP fields", () => {
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
		expect(merged.npcInnerLife).toBeUndefined();
		expect(merged.trust).toBeUndefined();
	});

	it("simplifyRelationshipEntry strips stats and inner life", () => {
		const simplified = simplifyRelationshipEntry({
			a: "Jamie",
			b: "Jake",
			tier: "devoted",
			summary: "Close family.",
			trust: 90,
			arc: { statusPhrase: "warm" },
			npcInnerLife: { emotionalState: "proud" },
		});
		expect(simplified).toEqual({
			a: "Jamie",
			b: "Jake",
			tier: "devoted",
			summary: "Close family.",
		});
	});

	it("collapses player name variants and removes garbage pairs from screenshot scenario", () => {
		const cleaned = reconcileRelationshipEntries(
			[
				{ a: "Jamie Mercer", b: "Jamie's", tier: "complicated" },
				{ a: "Jamie", b: "Jamie Mercer", tier: "guarded" },
				{ a: "Jamie (guarded)", b: "Jamie Mercer", tier: "guarded" },
				{
					a: "Dr. Aris",
					b: "Jamie Mercer",
					tier: "enemy",
					summary: "Jamie refused Dr. Aris's care.",
				},
			],
			new Map(),
			{
				playerName: "Jamie Mercer",
				allowlist: buildCharacterAllowlist({
					playerName: "Jamie Mercer",
					existingRelationships: [
						{ a: "Dr. Aris", b: "Jamie Mercer", tier: "enemy" },
					],
				}),
			},
		);
		expect(cleaned?.length).toBe(1);
		expect(cleaned?.[0]?.a === "Dr. Aris" || cleaned?.[0]?.b === "Dr. Aris").toBe(true);
		expect(cleaned?.[0]?.tier).toBe("enemy");
	});

	it("rejects possessive and parenthetical speaker labels", () => {
		expect(isPossessiveSpeakerLabel("Jamie's")).toBe(true);
		expect(stripRelationshipEndpointAnnotations("Jamie (guarded)")).toBe("Jamie");
		expect(isPlayerNameVariant("Jamie", "Jamie Mercer")).toBe(true);
	});

	it("canTrackRelationshipParticipant respects allowlist", () => {
		const allowlist = buildCharacterAllowlist({
			playerName: "Jamie Mercer",
			indexedCharacters: { Jake: { name: "Jake" } },
		});
		expect(canTrackRelationshipParticipant("Jake", allowlist, "Jamie Mercer")).toBe(true);
		expect(canTrackRelationshipParticipant("Sun", allowlist, "Jamie Mercer")).toBe(false);
		expect(canTrackRelationshipParticipant("Jamie", allowlist, "Jamie Mercer")).toBe(false);
	});

	it("merges James Peralta and Jamie Peralta when legal name and nickname refer to the same player", () => {
		const indexedCharacters = {
			"Jamie Peralta": {
				name: "Jamie Peralta",
				aliases: ["Jamie", "James Peralta", "James"],
			},
			"Jake Peralta": { name: "Jake Peralta" },
			"Amy Santiago": { name: "Amy Santiago" },
		};
		const allowlist = buildCharacterAllowlist({
			playerName: "James Peralta",
			playerAliases: ["Jamie"],
			indexedCharacters,
		});
		const cleaned = reconcileRelationshipEntries(
			[
				{ a: "Jake Peralta", b: "Jamie Peralta", tier: "devoted", summary: "Close father and son." },
				{ a: "James Peralta", b: "Jamie Peralta", tier: "family" },
				{ a: "Jake Peralta", b: "James Peralta", tier: "family" },
				{ a: "Amy Santiago", b: "James Peralta", tier: "family" },
			],
			new Map([
				["jamie peralta", "Jamie Peralta"],
				["jamie", "Jamie Peralta"],
				["james peralta", "Jamie Peralta"],
				["james", "Jamie Peralta"],
			]),
			{
				playerName: "James Peralta",
				playerAliases: ["Jamie"],
				allowlist,
				indexedCharacters,
			},
		);

		expect(cleaned?.some((entry) => entry.a === "James Peralta" && entry.b === "Jamie Peralta")).toBe(false);
		expect(cleaned?.some((entry) => entry.a === "Jamie Peralta" && entry.b === "James Peralta")).toBe(false);
		expect(cleaned?.filter((entry) => entry.a === "James Peralta" || entry.b === "James Peralta").length).toBe(2);
		expect(cleaned?.find((entry) => entry.b === "Jake Peralta" || entry.a === "Jake Peralta")?.tier).toBe("devoted");
	});
});
