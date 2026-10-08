import "fake-indexeddb/auto";
import { IDBObjectStore } from "fake-indexeddb";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setup, resetDatabase, now } from "./fixtures";
import { prepareProposal, decideProposal } from "../libraryActions";
import { loadCatalog } from "../contextResolver";
import { newConversation } from "../conversationService";

beforeEach(resetDatabase);
afterEach(() => vi.restoreAllMocks());
it("rolls back earlier writes and the action receipt if any IndexedDB write fails", async () => {
  const { resources, repository } = await setup();
  const proposal = prepareProposal(
    [
      {
        kind: "character",
        operation: "create",
        summary: "Create River",
        draft: { name: "River", universeId: "who" },
      },
      {
        kind: "universe",
        operation: "create",
        summary: "Create Skaro",
        draft: { name: "Skaro" },
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
  const put = IDBObjectStore.prototype.put;
  vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(
    function (value, key) {
      if (this.name === "universes" && value.name === "Skaro")
        throw new DOMException("Storage full", "QuotaExceededError");
      return put.call(this, value, key);
    },
  );
  await expect(
    decideProposal(chat.id, proposal.id, "accept", chat.revision),
  ).rejects.toThrow("Storage full");
  expect(await resources.listPlayerCharacters()).toHaveLength(1);
  expect(await resources.listUniverses()).toHaveLength(1);
  expect((await repository.get(chat.id))?.messages[0].proposal?.status).toBe(
    "pending",
  );
});
