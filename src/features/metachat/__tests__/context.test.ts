import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { putInStore } from "../../../lib/idb";
import {
  resolveContext,
  CONTEXT_BUDGET,
  chapterTranscript,
  evidenceMessage,
} from "../contextResolver";
import { newConversation } from "../conversationService";
import {
  resetDatabase,
  seed,
  transcript,
  chapters,
  story,
  otherStory,
  character,
} from "./fixtures";

beforeEach(resetDatabase);
const attached = () =>
  newConversation([{ kind: "story", id: story.id, label: story.title }]);
describe("intent-aware evidence retrieval", () => {
  it("keeps Doctor Who banter minimal and never retrieves chapter/transcript content", async () => {
    const repository = await seed();
    const full = vi.spyOn(repository, "listStoryMessages");
    const chaptersRead = vi.spyOn(repository, "listStoryChapters");
    const messageRead = vi.spyOn(repository, "getStoryMessage");
    const context = await resolveContext(
      repository,
      attached(),
      "So... The Doctor, eh? 🤣",
    );
    expect(context.intent).toBe("casual");
    expect(context.text.length).toBeLessThan(CONTEXT_BUDGET.casual);
    expect(context.text).not.toContain("Keep the apology awkward");
    expect(full).not.toHaveBeenCalled();
    expect(chaptersRead).not.toHaveBeenCalled();
    expect(messageRead).not.toHaveBeenCalled();
  });
  it("grounds a reaction question in relationships, prior events and authoritative current state", async () => {
    const repository = await seed();
    const context = await resolveContext(
      repository,
      attached(),
      "Why did Jamie react like that?",
    );
    expect(context.intent).toBe("focused");
    expect(context.text).toContain("trust damaged");
    expect(context.text).toContain("broken promise");
    expect(context.text).toContain("Jamie now uses they/them pronouns");
    expect(context.text).toContain("betrayed");
    expect(context.text).toContain("Authoritative current Story State");
    expect(await repository.getPlayerCharacter(character.id)).toEqual(
      character,
    );
  });
  it("retrieves actual Chapter II including authorship, prior continuity and current state", async () => {
    const repository = await seed();
    const context = await resolveContext(
      repository,
      attached(),
      "Review Chapter II, including characterisation, continuity and Story State changes.",
    );
    expect(context.intent).toBe("review");
    expect(context.text).toContain("trust damaged");
    const chapter = context.text.split("actual transcript")[1];
    expect(chapter).toContain("apologises without a joke");
    expect(chapter).toContain("User-authored director");
    expect(chapter).toContain("AI-authored narration/NPC dialogue");
    expect(chapter).not.toContain("pockets the broken compass");
    expect(context.text).toContain("concealed the broken compass");
    expect(context.limitations.join(" ")).toContain(
      "not a historical chapter snapshot",
    );
    expect(chapterTranscript(transcript, chapters, "Chapter 2")).toEqual(
      transcript.slice(4),
    );
    expect(evidenceMessage(transcript[1])).toContain("User-authored player");
  });
  it("compares two naturally mentioned stories without blending their canon", async () => {
    const repository = await seed();
    const context = await resolveContext(
      repository,
      newConversation(),
      `Compare Jamie in ${story.title} and ${otherStory.title}.`,
    );
    expect(
      context.resources
        .filter((item) => item.kind === "story")
        .map((item) => item.id),
    ).toEqual(["blue", "home"]);
    expect(context.text).toContain("Jamie returned home and forgave");
    expect(context.text).toContain("betrayed");
    expect(context.text).toContain(
      "The Blue Box — relevant transcript excerpts",
    );
    expect(context.text).toContain(
      "The Long Way Home — relevant transcript excerpts",
    );
  });
  it("keeps the attached story when comparing it to another naturally named story", async () => {
    const repository = await seed();
    const context = await resolveContext(
      repository,
      attached(),
      "Compare this with The Long Way Home",
    );
    expect(context.text).toContain(
      "The Blue Box — relevant transcript excerpts",
    );
    expect(context.text).toContain(
      "The Long Way Home — relevant transcript excerpts",
    );
  });
  it("discovers indexed story characters while declining ambiguous resource matches", async () => {
    const repository = await seed();
    expect(
      (
        await resolveContext(
          repository,
          newConversation(),
          "Why did Jamie react like that?",
        )
      ).resources.some((item) => item.id === "blue"),
    ).toBe(true);
    await repository.saveStory({ ...otherStory, title: story.title });
    const ambiguous = await resolveContext(
      repository,
      newConversation(),
      `Review ${story.title}`,
    );
    expect(ambiguous.limitations.join(" ")).toContain("Ambiguous names");
    expect(ambiguous.text).not.toContain("betrayed");
  });
  it("reports unavailable chapters and bounded partial transcripts honestly", async () => {
    const repository = await seed();
    const missing = await resolveContext(
      repository,
      attached(),
      "Review Chapter XI",
    );
    expect(missing.limitations.join(" ")).toContain("not found");
    await putInStore("messages", {
      ...transcript[6],
      content: "Long scene. ".repeat(30000),
    });
    const huge = await resolveContext(
      repository,
      attached(),
      "Review Chapter II",
    );
    expect(huge.text.length).toBeLessThan(CONTEXT_BUDGET.review + 100);
    expect(huge.limitations.join(" ")).toContain("partial evidence");
  });
});
