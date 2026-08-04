import { describe, expect, it } from "vitest";
import {
	ensureIndexedCharacterStatus,
	getCharacterStatusLines,
	synthesizeCharacterStatusBullets,
} from "../characterStatus";
import type { StoryStateDataV2 } from "../../types/models";

const squadState: StoryStateDataV2 = {
	updatedAt: "2026-01-01T00:00:00.000Z",
	characters: {
		"Jamie Potter": {
			statusBullets: ["Full-time detective at the 99th Precinct"],
		},
	},
	worldFacts: [],
	unresolvedThreads: [],
	indexes: {
		messageCount: 6,
		characters: {
			"Jake Peralta": { name: "Jake Peralta", description: "Energetic detective." },
			"Amy Santiago": { name: "Amy Santiago", description: "Organized detective." },
			"Captain Raymond Holt": {
				name: "Captain Raymond Holt",
				description: "Captain of the 99th Precinct.",
			},
		},
		relationships: [
			{
				a: "Jake Peralta",
				b: "Jamie Potter",
				tier: "friend",
				summary: "Jake eagerly anticipates Jamie's magical demonstrations and loves magical pranks.",
				history: [
					{
						summary: "Jake startled when Holt entered early, mistaking him for Jamie while waiting for Wands at Four.",
						messageNumber: 5,
					},
				],
			},
			{
				a: "Amy Santiago",
				b: "Jamie Potter",
				tier: "colleague",
				summary: "Amy respects Jamie as a colleague but is bothered by temporal quirks in scheduling.",
			},
		],
	},
};

describe("characterStatus", () => {
	it("synthesizes status bullets from relationship data for indexed characters", () => {
		const jakeBullets = synthesizeCharacterStatusBullets("Jake Peralta", squadState, {
			playerName: "Jamie Potter",
		});
		expect(jakeBullets.length).toBeGreaterThan(0);
		expect(jakeBullets.join(" ").toLowerCase()).toMatch(/holt|jamie|wands/);

		const amyBullets = synthesizeCharacterStatusBullets("Amy Santiago", squadState, {
			playerName: "Jamie Potter",
		});
		expect(amyBullets.length).toBeGreaterThan(0);
		expect(amyBullets.join(" ").toLowerCase()).toContain("colleague");
	});

	it("ensureIndexedCharacterStatus fills missing squad status entries", () => {
		const enriched = ensureIndexedCharacterStatus(squadState, { playerName: "Jamie Potter" });
		expect(getCharacterStatusLines(enriched.characters?.["Jake Peralta"], []).length).toBeGreaterThan(0);
		expect(getCharacterStatusLines(enriched.characters?.["Amy Santiago"], []).length).toBeGreaterThan(0);
		expect(enriched.characters?.["Jamie Potter"]?.statusBullets?.length).toBeGreaterThan(0);
	});
});
