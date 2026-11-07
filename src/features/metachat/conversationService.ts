import { createEntityId } from "../../lib/ids";
import { classifyAIGenerationError } from "../../lib/ai/errors";
import type { ConversationRepository } from "./repository";
import {
  loadCatalog,
  resolveContext,
  type ContextRepository,
  catalogReferences,
} from "./contextResolver";
import { compactMemory } from "./memory";
import { prepareProposal, decideProposal } from "./libraryActions";
import type { ResponseGenerator } from "./responseGenerator";
import type { Attachment, ChatMessage, Conversation } from "./types";

export function newConversation(attachments: Attachment[] = []): Conversation {
  const now = new Date().toISOString();
  return {
    version: 2,
    id: createEntityId("metachat"),
    title: "New conversation",
    createdAt: now,
    updatedAt: now,
    revision: 0,
    attachments,
    messages: [],
    revisions: [],
  };
}
async function withConversationLock<T>(
  id: string,
  work: () => Promise<T>,
): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(
      `metachat:${id}`,
      { ifAvailable: true },
      (lock) => {
        if (!lock) throw new Error("This conversation is busy in another tab.");
        return work();
      },
    );
  }
  return work();
}
export class ConversationService {
  private controllers = new Map<string, AbortController>();
  private listeners = new Set<() => void>();
  constructor(
    readonly repository: ConversationRepository,
    private resources: ContextRepository,
    private generator: ResponseGenerator,
    private decide = decideProposal,
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private changed() {
    this.listeners.forEach((listener) => listener());
  }
  async initialize() {
    await this.repository.migrateLegacy();
    for (const conversation of await this.repository.list()) {
      if (
        conversation.request?.status === "pending" &&
        !this.controllers.has(conversation.id)
      ) {
        try {
          await withConversationLock(conversation.id, async () => {
            const current = await this.repository.get(conversation.id);
            if (current?.request?.status === "pending")
              await this.save({
                ...current,
                request: {
                  ...current.request,
                  status: "failed",
                  error:
                    "The previous reply was interrupted. Retry to continue.",
                },
              });
          });
        } catch {
          /* Another tab owns the request, or changed it concurrently. */
        }
      }
    }
    this.changed();
  }
  async save(conversation: Conversation, isNew = false) {
    const saved = await this.repository.save(
      { ...conversation, updatedAt: new Date().toISOString() },
      isNew ? null : conversation.revision,
    );
    this.changed();
    return saved;
  }
  async rename(conversation: Conversation, title: string) {
    if (!title.trim()) throw new Error("Conversation title cannot be empty.");
    return this.save({ ...conversation, title: title.trim().slice(0, 160) });
  }
  async remove(conversation: Conversation, confirmed: boolean) {
    if (!confirmed) throw new Error("Confirm deletion first.");
    await this.cancel(conversation.id);
    const current = await this.repository.get(conversation.id);
    if (current)
      await this.save({
        ...current,
        deletedAt: new Date().toISOString(),
        messages: [],
        revisions: [],
        attachments: [],
        memory: undefined,
        request: undefined,
      });
  }
  async setAttachments(conversation: Conversation, attachments: Attachment[]) {
    const catalog = catalogReferences(await loadCatalog(this.resources));
    const validated = attachments
      .filter(
        (item, i) =>
          attachments.findIndex(
            (other) => other.id === item.id && other.kind === item.kind,
          ) === i,
      )
      .map((item) => {
        const resource = catalog.find(
          (candidate) =>
            candidate.id === item.id && candidate.kind === item.kind,
        );
        if (!resource)
          throw new Error(
            `The attachment ${item.label} is no longer available.`,
          );
        return resource;
      });
    const next = { ...conversation, attachments: validated };
    return conversation.messages.length ? this.save(next) : next;
  }
  async cancel(id: string) {
    const controller = this.controllers.get(id);
    const current = await this.repository.get(id);
    try {
      if (current?.request?.status === "pending") {
        await this.save({
          ...current,
          request: {
            ...current.request,
            status: "cancelled",
            error: "Reply cancelled. Your message is saved.",
          },
        });
      }
    } catch (error) {
      const latest = await this.repository.get(id);
      // A reply/other cancellation may have committed while the user pressed Stop.
      if (
        latest?.request?.id === current?.request?.id &&
        latest?.request?.status === "pending"
      )
        throw error;
    } finally {
      controller?.abort();
    }
  }
  async decideLibraryProposal(
    conversation: Conversation,
    proposalId: string,
    decision: "accept" | "reject",
  ) {
    const result = await this.decide(
      conversation.id,
      proposalId,
      decision,
      conversation.revision,
    );
    this.changed();
    return result;
  }
  async send(
    conversation: Conversation,
    content: string,
    options: {
      editMessageId?: string;
      retry?: boolean;
      mode?: "chat" | "actions";
    } = {},
  ): Promise<Conversation> {
    const trimmed = content.trim();
    if (!trimmed) throw new Error("Write a message first.");
    if (trimmed.length > 40000)
      throw new Error(
        "Please split messages longer than 40,000 characters into smaller parts.",
      );
    if (this.controllers.has(conversation.id))
      throw new Error("A reply is already in progress.");
    const controller = new AbortController();
    this.controllers.set(conversation.id, controller);
    try {
      return await withConversationLock(conversation.id, async () => {
        let current = conversation;
        if (current.request?.status === "pending")
          throw new Error(
            "A reply is already in progress. Cancel or reload it first.",
          );
        const now = new Date().toISOString();
        let messages = [...current.messages];
        let user: ChatMessage;
        if (options.retry) {
          const existing = messages.find(
            (item) => item.id === current.request?.userMessageId,
          );
          if (
            !existing ||
            existing.role !== "user" ||
            messages[messages.length - 1]?.id !== existing.id
          )
            throw new Error("There is no failed reply to retry.");
          user = existing;
        } else if (options.editMessageId) {
          const index = messages.findIndex(
            (item) => item.id === options.editMessageId && item.role === "user",
          );
          if (index < 0) throw new Error("Only user messages can be edited.");
          current = {
            ...current,
            memory: undefined,
            revisions: [
              ...current.revisions,
              { editedAt: now, messages: messages.slice(index) },
            ],
          };
          user = {
            ...messages[index],
            content: trimmed,
            createdAt: now,
            attachments: current.attachments,
          };
          messages = [...messages.slice(0, index), user];
        } else {
          user = {
            id: createEntityId("meta-user"),
            role: "user",
            content: trimmed,
            createdAt: now,
            attachments: current.attachments,
          };
          messages.push(user);
        }
        const requestId = createEntityId("meta-request");
        const isNew = current.messages.length === 0;
        current = await this.save(
          {
            ...current,
            title: isNew ? trimmed.slice(0, 70) : current.title,
            messages,
            request: {
              id: requestId,
              userMessageId: user.id,
              status: "pending",
              mode: options.mode ?? current.request?.mode ?? "chat",
            },
          },
          isNew,
        );
        try {
          const signal = controller.signal;
          signal.throwIfAborted();
          const context = await resolveContext(
            this.resources,
            current,
            user.content,
          );
          const memory = await compactMemory(
            current,
            this.generator.summarize,
            signal,
          );
          const catalog = await loadCatalog(this.resources);
          const result = await this.generator.generate(
            { ...current, memory },
            context,
            catalog,
            signal,
          );
          signal.throwIfAborted();
          let proposal;
          let reply = result.reply;
          try {
            proposal = result.actions.length
              ? prepareProposal(result.actions, catalog)
              : undefined;
          } catch (error) {
            reply += `\n\nI couldn't prepare those library changes: ${error instanceof Error ? error.message : String(error)} No changes have been made.`;
          }
          const latest = await this.repository.get(current.id);
          if (
            !latest ||
            latest.deletedAt ||
            latest.request?.id !== requestId ||
            latest.request.status !== "pending"
          )
            return latest ?? current;
          return await this.save({
            ...latest,
            memory,
            request: undefined,
            messages: [
              ...latest.messages,
              {
                id: createEntityId("meta-assistant"),
                role: "assistant",
                content: reply,
                createdAt: new Date().toISOString(),
                proposal,
              },
            ],
          });
        } catch (error) {
          const latest = await this.repository.get(current.id);
          if (
            !latest ||
            latest.deletedAt ||
            latest.request?.id !== requestId ||
            latest.request.status !== "pending"
          )
            return latest ?? current;
          return await this.save({
            ...latest,
            request: {
              ...latest.request,
              status: controller.signal.aborted ? "cancelled" : "failed",
              error: controller.signal.aborted
                ? "Reply cancelled. Your message is saved."
                : classifyAIGenerationError(error).message,
            },
          });
        }
      });
    } finally {
      this.controllers.delete(conversation.id);
      this.changed();
    }
  }
}
