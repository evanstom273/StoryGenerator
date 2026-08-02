import { describe, expect, it } from "vitest";
import {
	characterMatchesUniverses,
	getUniverseIds,
	normalizeUniverseIds,
	parseUniverseIdsParam,
} from "../universeIds";

describe("universeIds", () => {
	it("normalizes and deduplicates universe id lists", () => {
		expect(normalizeUniverseIds(["a", "b", "a", "", "b"])).toEqual(["a", "b"]);
	});

	it("reads universeIds from legacy universeId", () => {
		expect(getUniverseIds({ universeId: "u1" })).toEqual(["u1"]);
		expect(getUniverseIds({ universeId: "u1", universeIds: ["u2", "u3"] })).toEqual(["u2", "u3"]);
	});

	it("matches characters when any universe overlaps", () => {
		const character = { universeId: "u1", universeIds: ["u1", "u2"] };
		expect(characterMatchesUniverses(character, ["u2"])).toBe(true);
		expect(characterMatchesUniverses(character, ["u3"])).toBe(false);
		expect(characterMatchesUniverses(character, ["u1", "u3"])).toBe(true);
	});

	it("parses universe id query params", () => {
		expect(parseUniverseIdsParam("u1,u2,u1")).toEqual(["u1", "u2"]);
		expect(parseUniverseIdsParam("")).toEqual([]);
	});
});
