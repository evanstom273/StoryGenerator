import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { getAllFromStore } from "../../../lib/idb";
import {
  prepareProposal,
  decideProposal,
  formatActionResults,
} from "../libraryActions";
import { loadCatalog } from "../contextResolver";
import { newConversation } from "../conversationService";
import {
  setup,
  resetDatabase,
  now,
  character,
  universe,
  generator,
} from "./fixtures";
import type { LibraryAction } from "../types";

beforeEach(resetDatabase);
const create: LibraryAction = {
  kind: "character",
  operation: "create",
  summary: "Create River",
  draft: { name: "River", universeId: "who", pronouns: "she/her" },
};
async function proposalChat(actions: LibraryAction[]) {
  const env = await setup();
  const proposal = prepareProposal(actions, await loadCatalog(env.resources));
  const chat = await env.repository.save(
    {
      ...newConversation(),
      messages: [
        {
          id: "proposal-message",
          role: "assistant",
          content: "Please review",
          createdAt: now,
          proposal,
        },
      ],
    },
    null,
  );
  return { ...env, chat, proposal };
}
describe("confirmed library management", () => {
  it("does not mutate before confirmation; rejects safely; cannot execute twice", async () => {
    const { resources, chat, proposal } = await proposalChat([create]);
    expect(await resources.listPlayerCharacters()).toHaveLength(1);
    const rejected = await decideProposal(
      chat.id,
      proposal.id,
      "reject",
      chat.revision,
    );
    expect(await resources.listPlayerCharacters()).toHaveLength(1);
    await expect(
      decideProposal(chat.id, proposal.id, "accept", rejected.revision),
    ).rejects.toThrow("already");
  });
  it("creates and edits characters/universes through reviewed records without story canon side effects", async () => {
    const { resources, repository, chat, proposal } = await proposalChat([
      create,
      {
        kind: "universe",
        operation: "create",
        summary: "Create Gallifrey",
        draft: { name: "Gallifrey", description: "The citadel" },
      },
    ]);
    const canon = await Promise.all([
      getAllFromStore("storyStates"),
      getAllFromStore("stories"),
      getAllFromStore("messages"),
      getAllFromStore("storyChapters"),
    ]);
    const accepted = await decideProposal(
      chat.id,
      proposal.id,
      "accept",
      chat.revision,
    );
    expect(accepted.messages[0].proposal?.status).toBe("accepted");
    expect(accepted.messages[1].content).toContain("2 of 2");
    await expect(
      decideProposal(chat.id, proposal.id, "accept", accepted.revision),
    ).rejects.toThrow("already");
    const river = (await resources.listPlayerCharacters()).find(
      (item) => item.name === "River",
    )!;
    const gallifrey = (await resources.listUniverses()).find(
      (item) => item.name === "Gallifrey",
    )!;
    expect(river).not.toHaveProperty("role");
    const edit = prepareProposal(
      [
        {
          kind: "character",
          operation: "update",
          targetId: character.id,
          summary: "Update Jamie's library pronouns",
          draft: { pronouns: "they/them" },
        },
        {
          kind: "universe",
          operation: "update",
          targetId: gallifrey.id,
          summary: "Add a tone",
          draft: { tone: "Melancholy" },
        },
      ],
      await loadCatalog(resources),
    );
    const next = await repository.save(
      {
        ...accepted,
        messages: [
          ...accepted.messages,
          {
            id: "edit",
            role: "assistant",
            content: "Review edit",
            createdAt: now,
            proposal: edit,
          },
        ],
      },
      accepted.revision,
    );
    await decideProposal(next.id, edit.id, "accept", next.revision);
    expect((await resources.getPlayerCharacter(character.id))?.pronouns).toBe(
      "they/them",
    );
    expect((await resources.getUniverse(gallifrey.id))?.tone).toBe(
      "Melancholy",
    );
    expect(
      await Promise.all([
        getAllFromStore("storyStates"),
        getAllFromStore("stories"),
        getAllFromStore("messages"),
        getAllFromStore("storyChapters"),
      ]),
    ).toEqual(canon);
  });
  it("blocks story-linked deletion atomically and reports each action accurately", async () => {
    const { resources, chat, proposal } = await proposalChat([
      create,
      {
        kind: "character",
        operation: "delete",
        targetId: character.id,
        summary: "Delete Jamie",
      },
    ]);
    const result = await decideProposal(
      chat.id,
      proposal.id,
      "accept",
      chat.revision,
    );
    expect(
      result.messages[0].proposal?.results?.map((item) => item.status),
    ).toEqual(["not_applied", "failed"]);
    expect(result.messages[1].content).toContain("0 of 2");
    expect(result.messages[1].content).toContain("linked stories");
    expect(await resources.listPlayerCharacters()).toHaveLength(1);
  });
  it("blocks universe dependencies and changes made after proposal review", async () => {
    const { resources, chat, proposal } = await proposalChat([
      {
        kind: "universe",
        operation: "delete",
        targetId: universe.id,
        summary: "Delete Doctor Who",
      },
    ]);
    const result = await decideProposal(
      chat.id,
      proposal.id,
      "accept",
      chat.revision,
    );
    expect(result.messages[0].proposal?.status).toBe("failed");
    expect(await resources.getUniverse(universe.id)).not.toBeNull();
    const env = await proposalChat([
      {
        kind: "character",
        operation: "update",
        targetId: character.id,
        summary: "Edit Jamie",
        draft: { notes: "Changed" },
      },
    ]);
    await env.resources.savePlayerCharacter({
      ...character,
      notes: "Edited elsewhere",
    });
    const stale = await decideProposal(
      env.chat.id,
      env.proposal.id,
      "accept",
      env.chat.revision,
    );
    expect(stale.messages[1].content).toContain("changed since review");
    expect((await env.resources.getPlayerCharacter(character.id))?.notes).toBe(
      "Edited elsewhere",
    );
  });
  it("supports atomic bulk deletes of unrelated characters and universes", async () => {
    const { resources, repository } = await setup();
    await resources.saveUniverse({ ...universe, id: "unused", name: "Unused" });
    await resources.savePlayerCharacter({
      ...character,
      id: "unused-char",
      universeId: "unused",
    });
    const proposal = prepareProposal(
      [
        {
          kind: "character",
          operation: "delete",
          targetId: "unused-char",
          summary: "Delete unused character",
        },
        {
          kind: "universe",
          operation: "delete",
          targetId: "unused",
          summary: "Delete unused universe",
        },
      ],
      await loadCatalog(resources),
    );
    const chat = await repository.save(
      {
        ...newConversation(),
        messages: [
          {
            id: "p",
            role: "assistant",
            content: "Review",
            proposal,
            createdAt: now,
          },
        ],
      },
      null,
    );
    await decideProposal(chat.id, proposal.id, "accept", chat.revision);
    expect(await resources.getUniverse("unused")).toBeNull();
    expect(await resources.getPlayerCharacter("unused-char")).toBeNull();
  });
  it("validates unknown fields, library scope and IDs, rejecting all canon operations", async () => {
    const { resources } = await setup();
    const catalog = await loadCatalog(resources);
    for (const draft of [
      { ...create.draft, role: "supporting" },
      { ...create.draft, storyId: "blue" },
      { ...create.draft, universeId: "missing" },
      { ...create.draft, age: 23 },
    ]) {
      expect(() => prepareProposal([{ ...create, draft }], catalog)).toThrow();
    }
    expect(() =>
      prepareProposal([{ ...create, kind: "story" as "character" }], catalog),
    ).toThrow("Only character");
    expect(() =>
      prepareProposal(
        [
          {
            kind: "character",
            operation: "update",
            targetId: "missing",
            summary: "Unknown",
            draft: { name: "X" },
          },
        ],
        catalog,
      ),
    ).toThrow("target");
  });
  it("never presents partial success as complete success", () => {
    expect(
      formatActionResults([
        { actionId: "one", status: "applied", detail: "Created" },
        { actionId: "two", status: "failed", detail: "Blocked" },
      ]),
    ).toContain("1 of 2");
  });
  it("turns conversational mutation requests into persisted proposals, never writes on model output", async () => {
    const { service, resources } = await setup({
      ...generator,
      generate: async () => ({
        reply: "Review River's sheet below.",
        actions: [create],
      }),
    });
    const chat = await service.send(
      newConversation(),
      "Create a library character called River in Doctor Who",
    );
    expect(chat.messages[1].proposal?.status).toBe("pending");
    expect(await resources.listPlayerCharacters()).toHaveLength(1);
    const confirmed = await service.decideLibraryProposal(
      chat,
      chat.messages[1].proposal!.id,
      "accept",
    );
    expect(confirmed.messages[2].content).toContain("1 of 1");
  });
});

it("protects characters used in a story's supporting cast", async () => {
  const { resources, repository } = await setup();
  await resources.savePlayerCharacter({
    ...character,
    id: "companion",
    name: "Companion",
  });
  const story = (await resources.listStoryCatalog())[0];
  await resources.saveStory({ ...story, importedCharacterIds: ["companion"] });
  const proposal = prepareProposal(
    [
      {
        kind: "character",
        operation: "delete",
        targetId: "companion",
        summary: "Delete the companion",
      },
    ],
    await loadCatalog(resources),
  );
  const chat = await repository.save(
    {
      ...newConversation(),
      messages: [
        {
          id: "p",
          role: "assistant",
          content: "Review",
          proposal,
          createdAt: now,
        },
      ],
    },
    null,
  );
  const result = await decideProposal(
    chat.id,
    proposal.id,
    "accept",
    chat.revision,
  );
  expect(result.messages[0].proposal?.status).toBe("failed");
  expect(await resources.getPlayerCharacter("companion")).not.toBeNull();
});
