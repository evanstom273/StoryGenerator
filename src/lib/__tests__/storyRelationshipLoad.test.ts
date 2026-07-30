import { describe, expect, it } from "vitest";
import {
	reconcileRelationshipsFromStateJson,
	relationshipCounterparty,
	relationshipsSnapshotChanged,
} from "../storyRelationshipLoad";

describe("storyRelationshipLoad", () => {
	it("detects pair-key changes even when length matches", () => {
		const before = [
			{ a: "Jamie Mercer", b: "Jamie's", tier: "complicated" },
			{ a: "Dr. Aris", b: "Jamie Mercer", tier: "enemy" },
		];
		const after = [{ a: "Dr. Aris", b: "Jamie Mercer", tier: "enemy" }];
		expect(relationshipsSnapshotChanged(before, after)).toBe(true);
	});

	it("reconciles garbage Jamie rows from stored state json", () => {
		const stateJson = JSON.stringify({
			updatedAt: "2026-01-01T00:00:00.000Z",
			characters: {},
			worldFacts: [],
			unresolvedThreads: [],
			indexes: {
				relationships: [
					{ a: "Jamie Mercer", b: "Jamie's", tier: "complicated" },
					{ a: "Jamie", b: "Jamie Mercer", tier: "guarded" },
					{ a: "Jamie (guarded)", b: "Jamie Mercer", tier: "guarded" },
					{ a: "Dr. Aris", b: "Jamie Mercer", tier: "enemy", summary: "Refused care." },
				],
			},
		});
		const { relationships, changed } = reconcileRelationshipsFromStateJson(stateJson, {
			playerName: "Jamie Mercer",
			messageCount: 10,
		});
		expect(changed).toBe(true);
		expect(relationships.length).toBe(1);
		expect(relationshipCounterparty(relationships[0]!, "Jamie Mercer")).toBe("Dr. Aris");
	});
});
