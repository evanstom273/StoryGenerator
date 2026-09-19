import { describe, expect, it } from "vitest";
import {
	coercePartialStoryState,
	finalizeStoryStateForSave,
	mergeStoryIndexesIncremental,
	mergeStoryStateForIndexing,
	parseStoryStateJson,
	reconcileStoryIndexes,
} from "../storyStateV2";

describe("storyStateV2 indexing merge", () => {
	it("preserves prior world facts when incremental parse returns empty arrays", () => {
		const previous = {
			updatedAt: "2026-01-01T00:00:00.000Z",
			characters: {},
			worldFacts: ["MACUSA operates under NYPD magical dispensation"],
			unresolvedThreads: ["Who sanctioned Wands at Four?"],
			indexes: {
				messageCount: 4,
				characters: {
					"Raymond Holt": {
						name: "Raymond Holt",
						description: "Captain of the 99th Precinct.",
					},
				},
			},
		};

		const incoming = {
			updatedAt: "2026-01-02T00:00:00.000Z",
			characters: {},
			worldFacts: [],
			unresolvedThreads: [],
			indexes: {
				characters: {
					"Jake Peralta": {
						name: "Jake Peralta",
						description: "Detective in the bullpen.",
					},
				},
			},
		};

		const mergedIndexes = mergeStoryIndexesIncremental(previous.indexes, incoming.indexes, 5);
		const merged = mergeStoryStateForIndexing(previous, incoming, mergedIndexes);

		expect(merged.worldFacts).toContain("MACUSA operates under NYPD magical dispensation");
		expect(merged.unresolvedThreads).toContain("Who sanctioned Wands at Four?");
		expect(merged.indexes?.characters?.["Jake Peralta"]?.name).toBe("Jake Peralta");
		expect(merged.indexes?.characters?.["Raymond Holt"]?.name).toBe("Raymond Holt");
	});

	it("coerces partial story state without wiping indexes or rpStats", () => {
		const json = JSON.stringify({
			updatedAt: "2026-01-01T00:00:00.000Z",
			rpStats: { trust: 42 },
			indexes: {
				messageCount: 12,
				relationships: [{ a: "Jamie", b: "Holt", tier: "ally" }],
			},
			authorDirectives: { canon: ["Jamie is a wizard detective."] },
		});

		const parsed = parseStoryStateJson(json);
		expect(parsed.rpStats).toEqual({ trust: 42 });
		expect(parsed.indexes?.relationships?.[0]?.b).toBe("Holt");
		expect(coercePartialStoryState(json)?.authorDirectives).toEqual({
			canon: ["Jamie is a wizard detective."],
		});
	});

	it("replaces status bullets when incremental parse returns updated live state", () => {
		const previous = {
			updatedAt: "2026-01-01T00:00:00.000Z",
			characters: {
				"Charles Boyle": {
					canonicalName: "Charles Boyle",
					statusBullets: [
						"Leaning over his desk eagerly watching the clock",
						"Waiting for Wands at Four to begin",
					],
				},
			},
			worldFacts: [],
			unresolvedThreads: [],
		};

		const incoming = {
			updatedAt: "2026-01-02T00:00:00.000Z",
			characters: {
				"Charles Boyle": {
					canonicalName: "Charles Boyle",
					statusBullets: ["Transfigured into a plump brown hen by Jamie's Pullus spell"],
				},
			},
			worldFacts: [],
			unresolvedThreads: [],
		};

		const merged = mergeStoryStateForIndexing(previous, incoming, undefined);

		expect(merged.characters?.["Charles Boyle"]?.statusBullets).toEqual([
			"Transfigured into a plump brown hen by Jamie's Pullus spell",
		]);
	});

	it("preserves indexing attempt metadata while merging an incremental extraction", () => {
		const gap = {
			messageNumber: 9,
			code: "provider_refusal" as const,
			occurredAt: "2026-08-03T12:00:00.000Z",
		};
		const previous = {
			updatedAt: "2026-08-03T12:00:00.000Z",
			characters: {},
			worldFacts: [],
			unresolvedThreads: [],
			lastDeepIndexedMessageCount: 8,
			lastDeepIndexAttemptedMessageCount: 9,
			indexingGaps: [gap],
		};
		const incoming = {
			updatedAt: "2026-08-03T12:01:00.000Z",
			characters: {},
			worldFacts: [],
			unresolvedThreads: [],
		};

		const merged = mergeStoryStateForIndexing(previous, incoming, undefined);

		expect(merged.lastDeepIndexAttemptedMessageCount).toBe(9);
		expect(merged.indexingGaps).toEqual([gap]);
	});

	it("stamps partial deep-index progress without claiming full completion", () => {
		const finalized = JSON.parse(
			finalizeStoryStateForSave({
				parsedState: {
					updatedAt: "2026-08-03T12:00:00.000Z",
					characters: {},
					worldFacts: [],
					unresolvedThreads: [],
				},
				totalMessages: 16,
				now: "2026-08-03T12:00:00.000Z",
				mode: "deep",
				deepIndexTrigger: "auto",
				deepIndexProgress: {
					completedMessageCount: 8,
					attemptedMessageCount: 16,
					gaps: [
						{
							messageNumber: 9,
							code: "provider_refusal",
							provider: "gemini",
							occurredAt: "2026-08-03T12:00:00.000Z",
						},
					],
				},
			}),
		);

		expect(finalized.lastDeepIndexedMessageCount).toBe(8);
		expect(finalized.lastIndexedMessageCount).toBe(8);
		expect(finalized.lastDeepIndexAttemptedMessageCount).toBe(16);
		expect(finalized.lastAutoDeepIndexedMessageCount).toBe(8);
		expect(finalized.messagesSinceDeepIndexUpdate).toBe(8);
		expect(finalized.indexingGaps).toEqual([
			expect.objectContaining({ messageNumber: 9, code: "provider_refusal" }),
		]);
	});

	it("keeps full deep-index finalization backward compatible when progress is omitted", () => {
		const finalized = JSON.parse(
			finalizeStoryStateForSave({
				parsedState: {
					updatedAt: "2026-08-03T12:00:00.000Z",
					characters: {},
					worldFacts: [],
					unresolvedThreads: [],
				},
				totalMessages: 16,
				now: "2026-08-03T12:00:00.000Z",
				mode: "deep",
			}),
		);

		expect(finalized.lastDeepIndexedMessageCount).toBe(16);
		expect(finalized.lastDeepIndexAttemptedMessageCount).toBe(16);
		expect(finalized.indexingGaps).toEqual([]);
		expect(finalized.messagesSinceDeepIndexUpdate).toBe(0);
	});

	it("converges short and full character names on one stable canonical entity", () => {
		const reconciled = reconcileStoryIndexes({
			characters: {
				Amy: { name: "Amy", description: "A detective and Lyra's mother.", evidence: { messageNumbers: [1] } },
				"Amy Peralta": { name: "Amy Peralta", description: "Lyra's mother and a detective.", evidence: { messageNumbers: [2] } },
				jake: { name: "Jake", evidence: { messageNumbers: [1] } },
				" Jake ": { name: "Jake", evidence: { messageNumbers: [2] } },
			},
		}, 2);

		expect(Object.keys(reconciled?.characters ?? {})).toEqual(["Amy Peralta", "Jake"]);
		expect(reconciled?.characters?.["Amy Peralta"]?.aliases).toContain("Amy");
		expect(reconciled?.characters?.["Amy Peralta"]?.id).toMatch(/^character:/);
	});

	it("merges an explicit identity transition into the existing character-state record", () => {
		const merged = mergeStoryStateForIndexing(
			{
				updatedAt: "2026-01-01T00:00:00.000Z",
				characters: { Jamie: { canonicalName: "Jamie", pronouns: "he/him" } },
				worldFacts: [],
				unresolvedThreads: [],
			},
			{
				updatedAt: "2026-01-02T00:00:00.000Z",
				characters: {
					Lyra: { canonicalName: "Jamie", displayName: "Lyra", aliases: ["Jamie"], pronouns: "she/her" },
				},
				worldFacts: [],
				unresolvedThreads: [],
			},
			undefined,
		);

		expect(Object.keys(merged.characters ?? {})).toHaveLength(1);
		expect(Object.values(merged.characters ?? {})[0]).toMatchObject({
			canonicalName: "Jamie",
			displayName: "Lyra",
			pronouns: "she/her",
		});
	});

	it("resolves first-person family labels before relationship deduplication", () => {
		const reconciled = reconcileStoryIndexes({
			characters: {
				Jake: { name: "Jake", description: "Lyra's father.", evidence: { messageNumbers: [1] } },
				Dad: { name: "Dad", description: "The protagonist's father.", evidence: { messageNumbers: [2] } },
			},
			relationships: [
				{ a: "Lyra", b: "Dad", tier: "family", summary: "Lyra trusts her dad.", evidence: { messageNumbers: [2] } },
				{ a: "Jamie", b: "Jake", tier: "family", summary: "Jake is her father.", evidence: { messageNumbers: [1] } },
			],
		}, 2, { playerName: "Jamie", playerAliases: ["Lyra"] });

		expect(Object.keys(reconciled?.characters ?? {})).toEqual(["Jake"]);
		expect(reconciled?.characters?.Jake?.aliases).toContain("Dad");
		expect(reconciled?.relationships).toHaveLength(1);
		expect(reconciled?.relationships?.[0]).toMatchObject({ tier: "family" });
		expect(reconciled?.relationships?.[0]?.aId).toBeTruthy();
		expect(reconciled?.relationships?.[0]?.bId).toBeTruthy();
	});

	it("merges contextually equivalent location labels and remains idempotent", () => {
		const input = {
			locations: {
				Garage: {
					name: "Garage",
					description: "The converted family garage used as a private workshop and training room.",
					evidence: { messageNumbers: [4] },
				},
				"Conversion Space": {
					name: "Conversion Space",
					description: "The converted garage workshop and private training room.",
					evidence: { messageNumbers: [4] },
				},
			},
		};
		const once = reconcileStoryIndexes(input, 4);
		const twice = reconcileStoryIndexes(once, 4);

		expect(Object.keys(once?.locations ?? {})).toHaveLength(1);
		expect(twice).toEqual(once);
	});

	it("does not resurrect stale derived records during a full deep finalization", () => {
		const finalized = JSON.parse(finalizeStoryStateForSave({
			parsedState: {
				updatedAt: "2026-01-02T00:00:00.000Z",
				characters: {},
				worldFacts: [],
				unresolvedThreads: [],
				indexes: { messageCount: 1, characters: {} },
			},
			previousStateJson: JSON.stringify({
				updatedAt: "2026-01-01T00:00:00.000Z",
				characters: { Ghost: { status: "stale" } },
				worldFacts: ["Invented old fact"],
				unresolvedThreads: [],
				npcs: { Ghost: { description: "stale" } },
				rpStats: { hp: 5 },
			}),
			totalMessages: 1,
			now: "2026-01-02T00:00:00.000Z",
			mode: "deep",
		}));

		expect(finalized.characters).toEqual({});
		expect(finalized.worldFacts).toEqual([]);
		expect(finalized.npcs).toBeUndefined();
		expect(finalized.rpStats).toEqual({ hp: 5 });
	});
});
