import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAllFromStore, putInStore } from "../../../lib/idb";
import { createConversationRepository } from "../repository";
import { ConversationService, newConversation } from "../conversationService";
import { generator, resetDatabase, setup, now, story } from "./fixtures";
import type { Conversation } from "../types";

beforeEach(resetDatabase);
describe("independent persistent conversations", () => {
  it("opens empty without creating history merely because stories exist", async () => {
    const { repository } = await setup();
    const draft = newConversation([
      { kind: "story", id: "blue", label: "The Blue Box" },
    ]);
    expect(draft.messages).toEqual([]);
    expect(draft.id).not.toBe("blue");
    expect(draft).not.toHaveProperty("storyId");
    expect(await repository.list()).toEqual([]);
  });
  it("persists multiple chats for one story, cross-story attachments, rename and confirmed delete after reload", async () => {
    const { repository, resources, service } = await setup();
    let first = await service.send(
      newConversation(),
      "So... The Doctor, eh? 🤣",
    );
    first = await service.setAttachments(first, [
      { kind: "story", id: "blue", label: "Blue" },
      { kind: "story", id: "home", label: "Home" },
      { kind: "character", id: "jamie", label: "Jamie" },
      { kind: "universe", id: "who", label: "Who" },
    ]);
    expect(first.attachments).toHaveLength(4);
    first = await service.setAttachments(first, first.attachments.slice(1));
    expect(first.attachments).toHaveLength(3);
    const second = await service.send(
      newConversation([{ kind: "story", id: "home", label: "Home" }]),
      "Hello",
    );
    expect(first.id).not.toBe(second.id);
    const reloaded = new ConversationService(
      createConversationRepository(),
      resources,
      generator,
    );
    await reloaded.initialize();
    expect((await reloaded.repository.get(first.id))?.messages).toHaveLength(2);
    first = await reloaded.rename(first, "Doctor discussion");
    expect((await repository.list())[0].title).toBe("Doctor discussion");
    await expect(reloaded.remove(first, false)).rejects.toThrow("Confirm");
    await reloaded.remove(first, true);
    expect(await repository.list()).toHaveLength(1);
  });
  it("copies legacy story/global/conversation records idempotently without deleting originals", async () => {
    const { repository, resources } = await setup();
    await resources.saveMetaChatConversation({
      id: "old-chat",
      title: "An older chat",
      createdAt: now,
      updatedAt: now,
    });
    await resources.saveMetaChatConversation({
      id: "unused",
      title: "Never started",
      createdAt: now,
      updatedAt: now,
    });
    for (const scope of [
      "blue",
      "__story_engine_global_metachat__",
      "old-chat",
    ]) {
      await resources.saveStoryMetaMessage({
        id: `legacy-${scope}`,
        storyId: scope,
        role: "user",
        content: "Keep this discussion",
        timestamp: now,
      });
    }
    await repository.migrateLegacy();
    await repository.migrateLegacy();
    expect(await repository.list()).toHaveLength(3);
    expect(await resources.listAllStoryMetaMessages()).toHaveLength(3);
    expect(await resources.listMetaChatConversations()).toHaveLength(2);
    const imported = (await repository.list()).find(
      (item) => item.migratedFrom === "blue",
    )!;
    expect(imported.attachments[0].id).toBe("blue");
    await resources.deleteStory("blue");
    expect((await repository.get(imported.id))?.messages).toHaveLength(1);
    expect(await resources.listAllStoryMetaMessages()).toHaveLength(3);
    await repository.save({ ...imported, deletedAt: now }, imported.revision);
    await repository.migrateLegacy();
    expect(await repository.list()).toHaveLength(2);
  });
  it("backs up both migrated and legacy history, preserving chats when importing older backups", async () => {
    const { resources, service, repository } = await setup();
    const chat = await service.send(newConversation(), "Remember this");
    const backup = await resources.exportWorkspaceBackup();
    expect(backup.data.metaChatThreads?.[0].id).toBe(chat.id);
    delete backup.data.metaChatThreads;
    await resources.importWorkspaceBackup(backup, { mode: "replace" });
    expect(await repository.list()).toHaveLength(1);
    const complete = await resources.exportWorkspaceBackup();
    await resources.clearWorkspace();
    expect(await repository.list()).toEqual([]);
    await resources.importWorkspaceBackup(complete);
    expect((await repository.list())[0].messages).toHaveLength(2);
  });
});

describe("safe turns and editing", () => {
  it("saves failures without duplicate turns, and retries the original message", async () => {
    const generate = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network unavailable"))
      .mockResolvedValue({ reply: "Recovered", actions: [] });
    const { service, repository } = await setup({ ...generator, generate });
    let chat = await service.send(newConversation(), "Hello");
    expect(chat.messages).toHaveLength(1);
    expect(chat.request?.status).toBe("failed");
    expect((await repository.get(chat.id))?.messages).toHaveLength(1);
    chat = await service.send(chat, "Hello", { retry: true });
    expect(chat.messages.map((item) => item.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(chat.request).toBeUndefined();
  });
  it("edits from the selected turn and excludes superseded responses and summaries", async () => {
    const generate = vi.fn(generator.generate);
    const { service } = await setup({ ...generator, generate });
    let chat = await service.send(newConversation(), "The Doctor was right");
    chat = await service.send(chat, "I agree");
    chat = await service.save({
      ...chat,
      memory: {
        throughMessageId: chat.messages[1].id,
        summary: "SUPERSEDED AGREEMENT",
      },
    });
    chat = await service.send(chat, "Actually, the Doctor was wrong", {
      editMessageId: chat.messages[0].id,
    });
    expect(chat.messages).toHaveLength(2);
    expect(chat.revisions[0].messages).toHaveLength(4);
    const input = generate.mock.calls[2][0];
    expect(JSON.stringify(input.messages)).not.toContain("I agree");
    expect(input.memory).toBeUndefined();
    expect(chat.messages[0].content).toContain("wrong");
  });
  it("recovers interrupted requests after restart and rejects stale concurrent writes", async () => {
    const { repository, service } = await setup();
    const draft = newConversation();
    const pending: Conversation = {
      ...draft,
      messages: [{ id: "u", role: "user", content: "Hello", createdAt: now }],
      request: {
        id: "interrupted",
        userMessageId: "u",
        status: "pending",
        mode: "chat",
      },
    };
    await repository.save(pending, null);
    await service.initialize();
    const recovered = (await repository.get(draft.id))!;
    expect(recovered.request?.status).toBe("failed");
    expect(recovered.request?.error).toContain("interrupted");
    await expect(repository.save(pending, 0)).rejects.toThrow("another tab");
    expect(
      await service.send(recovered, "Hello", { retry: true }),
    ).toMatchObject({ request: undefined });
  });
  it("cancels safely and prevents double sends without accepting late provider output", async () => {
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const { service, repository } = await setup({
      ...generator,
      generate: async () => {
        entered();
        await wait;
        return { reply: "Late reply", actions: [] };
      },
    });
    const draft = newConversation();
    const pending = service.send(draft, "Hello");
    await started;
    await expect(service.send(draft, "Hello")).rejects.toThrow("progress");
    await service.cancel(draft.id);
    release();
    const cancelled = await pending;
    expect(cancelled.request?.status).toBe("cancelled");
    expect((await repository.get(draft.id))?.messages).toHaveLength(1);
  });
  it("persists cancellation from another service and ignores the late response", async () => {
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const { service, resources, repository } = await setup({
      ...generator,
      generate: async () => {
        entered();
        await waiting;
        return { reply: "Too late", actions: [] };
      },
    });
    const chat = newConversation();
    const pending = service.send(chat, "Hello");
    await started;
    const otherTab = new ConversationService(repository, resources, generator);
    await otherTab.cancel(chat.id);
    release();
    const result = await pending;
    expect(result.request?.status).toBe("cancelled");
    expect(result.messages).toHaveLength(1);
  });
  it("keeps story canon byte-for-byte unchanged during a conversation", async () => {
    const { service } = await setup();
    const before = await Promise.all([
      getAllFromStore("messages"),
      getAllFromStore("storyStates"),
      getAllFromStore("storyChapters"),
      getAllFromStore("stories"),
    ]);
    await service.send(
      newConversation([{ kind: "story", id: story.id, label: story.title }]),
      "Review Chapter II",
    );
    expect(
      await Promise.all([
        getAllFromStore("messages"),
        getAllFromStore("storyStates"),
        getAllFromStore("storyChapters"),
        getAllFromStore("stories"),
      ]),
    ).toEqual(before);
  });
});
