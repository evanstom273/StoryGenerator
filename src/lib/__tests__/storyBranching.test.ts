import { describe, expect, it } from "vitest";
import { buildBranchRecords, resolveIndexInheritanceParentId } from "../storyBranching";
import { storyMatchesFeatures } from "../librarySearch";
import type { Story, StoryChapter, StoryMessage } from "../../types/models";

const NOW = "2026-10-19T12:00:00.000Z";

const story: Story = {
	id: "s1",
	title: "The Upstate Diaz",
	universeId: "u1",
	playerCharacterId: "pc-jamie",
	currentSummary: "",
	importedCharacterIds: ["pc-theo"],
	isFavorite: true,
	createdAt: "2026-10-01T00:00:00.000Z",
	updatedAt: "2026-10-01T00:00:00.000Z",
};

const message = (id: string, seconds: number, extra: Partial<StoryMessage> = {}): StoryMessage => ({
	id,
	storyId: "s1",
	role: "assistant",
	content: id,
	timestamp: `2026-10-01T00:00:${String(seconds).padStart(2, "0")}.000Z`,
	...extra,
});

// Deliberately out of order: the cut follows timestamps, not array order.
const messages: StoryMessage[] = [
	message("m3", 3),
	message("ch1", 1, { role: "system", content: "Chapter I.", chapterBoundary: { kind: "start", label: "Chapter I" } }),
	message("m2", 2, { role: "user", speakerType: "author", authorDirective: { kind: "canon" }, content: "Jason is Jamie's father." }),
	message("ch2", 4, { role: "system", content: "Chapter II.", chapterBoundary: { kind: "start", label: "Chapter II" } }),
	message("m5", 5, { role: "user", speakerType: "author", authorDirective: { kind: "retcon" }, content: "The estate is in Vermont." }),
	message("m6", 6),
];

const chapters: StoryChapter[] = [
	{ id: "c1", storyId: "s1", label: "Chapter I", endsAtMessageId: "m3", endsAtIndex: 2, createdAt: NOW },
	{ id: "c2", storyId: "s1", label: "Chapter II", endsAtMessageId: "m6", endsAtIndex: 5, createdAt: NOW },
];

function branchAt(fromMessageId: string, state: Record<string, any> | null = null) {
	return buildBranchRecords({
		story,
		messages,
		chapters,
		state,
		fromMessageId,
		newStoryId: "s2",
		title: "  What if  ",
		now: NOW,
	});
}

describe("buildBranchRecords", () => {
	it("copies everything up to and including the chosen message with new IDs", () => {
		const branch = branchAt("m3");
		expect(branch.messages.map((m) => m.content)).toEqual(["Chapter I.", "Jason is Jamie's father.", "m3"]);
		expect(branch.messages.every((m) => m.storyId === "s2")).toBe(true);
		expect(branch.messages.some((m) => ["ch1", "m2", "m3"].includes(m.id))).toBe(false);
		expect(branch.messages.map((m) => m.timestamp)).toEqual([
			"2026-10-01T00:00:01.000Z",
			"2026-10-01T00:00:02.000Z",
			"2026-10-01T00:00:03.000Z",
		]);
	});

	it("creates a linked branch story and leaves the original record alone", () => {
		const branch = branchAt("m3");
		expect(branch.story).toMatchObject({
			id: "s2",
			title: "What if",
			parentStoryId: "s1",
			lineageKind: "branch",
			branchedFromMessageId: "m3",
			isFavorite: false,
			importedCharacterIds: ["pc-theo"],
			createdAt: NOW,
		});
		expect(story.id).toBe("s1");
	});

	it("starts at the beginning of a chapter when branched from its header", () => {
		const branch = branchAt("ch2");
		expect(branch.messages.at(-1)?.content).toBe("Chapter II.");
		expect(branch.messages.at(-1)?.chapterBoundary).toEqual({ kind: "start", label: "Chapter II" });
	});

	it("copies only chapters that end inside the branch, remapping their end message", () => {
		const atM3 = branchAt("m3");
		expect(atM3.chapters).toHaveLength(1);
		expect(atM3.chapters[0]).toMatchObject({ storyId: "s2", label: "Chapter I", endsAtIndex: 2 });
		expect(atM3.chapters[0]?.endsAtMessageId).toBe(atM3.messages[2]?.id);
		expect(atM3.chapters[0]?.id).not.toBe("c1");
		expect(branchAt("m5").chapters).toHaveLength(1);
	});

	it("rebuilds author declarations from the copied messages only", () => {
		const state = {
			authorDirectives: {
				canon: ["Jason is Jamie's father."],
				retcons: ["The estate is in Vermont."],
				hiddenSecrets: [],
				revealedSecrets: [],
				revealDirectives: [],
			},
		};
		const branch = branchAt("m3", state);
		expect(branch.state?.authorDirectives.canon).toEqual(["Jason is Jamie's father."]);
		expect(branch.state?.authorDirectives.retcons).toEqual([]);
	});

	it("remaps an identity change made before the cut and drops one made after it", () => {
		const override = (sourceMessageId: string) => ({
			playerIdentityOverride: { playerCharacterId: "pc-jamie", sourceMessageId, source: "player_turn", sceneName: "J" },
		});
		const kept = branchAt("m3", override("m2"));
		expect(kept.state?.playerIdentityOverride.sourceMessageId).toBe(kept.messages[1]?.id);
		expect(branchAt("m3", override("m6")).state?.playerIdentityOverride).toBeUndefined();
	});

	it("rejects a message that is not in the story", () => {
		expect(() => branchAt("nope")).toThrow("could not be found");
	});
});

describe("resolveIndexInheritanceParentId", () => {
	const stories: Record<string, Pick<Story, "id" | "parentStoryId" | "lineageKind">> = {
		plain: { id: "plain" },
		sequel: { id: "sequel", parentStoryId: "plain", lineageKind: "sequel" },
		branchOfPlain: { id: "branchOfPlain", parentStoryId: "plain", lineageKind: "branch" },
		branchOfSequel: { id: "branchOfSequel", parentStoryId: "sequel", lineageKind: "branch" },
		branchOfBranch: { id: "branchOfBranch", parentStoryId: "branchOfSequel", lineageKind: "branch" },
		legacy: { id: "legacy", parentStoryId: "plain" },
	};
	const resolve = (id: string) => resolveIndexInheritanceParentId(stories[id]!, async (storyId) => stories[storyId]);

	it("inherits like the sequel a branch was cut from, and never from the branch's original", async () => {
		expect(await resolve("plain")).toBeNull();
		expect(await resolve("sequel")).toBe("plain");
		expect(await resolve("branchOfPlain")).toBeNull();
		expect(await resolve("branchOfSequel")).toBe("plain");
		expect(await resolve("branchOfBranch")).toBe("plain");
		expect(await resolve("legacy")).toBe("plain");
	});
});

describe("library search lineage filters", () => {
	it("tells sequels and branches apart", () => {
		const sequel = { ...story, parentStoryId: "p", lineageKind: "sequel" as const };
		const branch = { ...story, parentStoryId: "p", lineageKind: "branch" as const };
		const legacy = { ...story, parentStoryId: "p" };
		expect(storyMatchesFeatures(sequel, "sequel")).toBe(true);
		expect(storyMatchesFeatures(legacy, "sequel")).toBe(true);
		expect(storyMatchesFeatures(branch, "sequel")).toBe(false);
		expect(storyMatchesFeatures(branch, "branch")).toBe(true);
		expect(storyMatchesFeatures(story, "branch")).toBe(false);
	});
});
