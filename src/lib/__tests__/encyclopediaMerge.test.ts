import { describe, expect, it } from "vitest";
import type { StoryEncyclopedia } from "../../types/models";
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

	it("normalizes events and rules when AI returns objects instead of arrays", () => {
		const normalized = normalizeEncyclopediaDelta({
			events: {
				e1: { id: "e1", title: "Jake discovers secret", description: "First hint." },
			} as unknown as StoryEncyclopedia["events"],
			rules: {
				r1: { id: "r1", title: "No magic in school", description: "Strict policy." },
			} as unknown as StoryEncyclopedia["rules"],
		});
		expect(normalized.events?.length).toBe(1);
		expect(normalized.events?.[0]?.title).toBe("Jake discovers secret");
		expect(normalized.rules?.length).toBe(1);
		expect(normalized.rules?.[0]?.title).toBe("No magic in school");
	});

	it("merges encyclopedia entries when events and rules are objects", () => {
		const merged = mergeEncyclopediaEntries(
			{
				version: "1.0",
				events: { e1: { id: "e1", title: "First event" } } as unknown as StoryEncyclopedia["events"],
			},
			normalizeEncyclopediaDelta({
				events: [{ id: "e2", title: "Second event", messageNumber: 10 }],
			}),
		);
		expect(merged.events?.length).toBe(2);
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
