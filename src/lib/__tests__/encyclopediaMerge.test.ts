import { describe, expect, it } from "vitest";
import { mergeEncyclopediaEntries, normalizeEncyclopediaDelta } from "../encyclopedia/encyclopediaMerge";

describe("encyclopediaMerge", () => {
	it("merges character entries by name and keeps richer fields", () => {
		const merged = mergeEncyclopediaEntries(
			normalizeEncyclopediaDelta({
				characters: {
					jamie: { id: "jamie", name: "Jamie Mercer", description: "Teen hero." },
				},
			}),
			normalizeEncyclopediaDelta({
				characters: {
					jamie_mercer: {
						id: "jamie-mercer",
						name: "Jamie Mercer",
						status: "In hospital",
						aliases: ["Jamie"],
					},
				},
			}),
		);
		const chars = Object.values(merged.characters ?? {});
		expect(chars.length).toBe(1);
		expect(chars[0]?.status).toBe("In hospital");
		expect(chars[0]?.description).toBe("Teen hero.");
		expect(chars[0]?.aliases).toContain("Jamie");
	});

	it("dedupes events by title", () => {
		const merged = mergeEncyclopediaEntries(
			{ version: "1.0", events: [{ id: "e1", title: "Jake discovers secret", description: "First hint." }] },
			{
				version: "1.0",
				events: [{ id: "e2", title: "Jake discovers secret", messageNumber: 42, chapterLabel: "Chapter XII" }],
			},
		);
		expect(merged.events?.length).toBe(1);
		expect(merged.events?.[0]?.messageNumber).toBe(42);
	});
});
