import { describe, expect, it } from "vitest";
import {
	coercePartialStoryState,
	mergeStoryIndexesIncremental,
	mergeStoryStateForIndexing,
	parseStoryStateJson,
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
});
