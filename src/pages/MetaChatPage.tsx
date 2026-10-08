import { LibraryActionReview } from "../features/metachat/LibraryActionReview";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";
import { getMetaChatReferenceSuggestions } from "../lib/metaChatReferences";
import type { Attachment, Conversation } from "../features/metachat/types";
import { useMetaChat } from "../features/metachat/MetaChatProvider";
import { newConversation } from "../features/metachat/conversationService";
import { MarkdownText } from "../components/ui/MarkdownText";
import {
  ArrowRightIcon,
  CloseIcon,
  MenuIcon,
  PlusIcon,
  SearchIcon,
} from "../components/icons";

export function MetaChatPage() {
  const location = useLocation();
  const { stories, universes, playerCharacters, refreshLibrary } =
    useStoryEngine();
  const {
    service,
    conversations,
    loading,
    error: storageError,
  } = useMetaChat();
  const [drawer, setDrawer] = useState(false);
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [workspace, setWorkspace] = useState<Conversation>(() => {
    const id = (location.state as { initialStoryId?: string } | null)
      ?.initialStoryId;
    const story = stories.find((item) => item.id === id);
    return newConversation(
      story ? [{ id: story.id, kind: "story", label: story.title }] : [],
    );
  });
  const conversation =
    conversations.find((item) => item.id === workspace.id) ?? workspace;
  const references = conversation.attachments;
  const busy = conversation.request?.status === "pending";
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Conversation | null>(null);
  const [renaming, setRenaming] = useState<Conversation | null>(null);
  const [title, setTitle] = useState("");
  const transcriptRef = useRef<HTMLDivElement>(null);
  const currentId = useRef(workspace.id);
  currentId.current = workspace.id;
  function report(cause: unknown) {
    setError(cause instanceof Error ? cause.message : String(cause));
  }
  function choose(next: Conversation) {
    setWorkspace(next);
    setDraft("");
    setEditing(null);
    setError(null);
    setPicker(false);
    setDrawer(false);
  }
  async function setReferences(next: Attachment[]) {
    try {
      const result = await service.setAttachments(conversation, next);
      if (currentId.current === result.id) setWorkspace(result);
    } catch (cause) {
      report(cause);
    }
  }
  async function send(mode: "chat" | "actions" = "chat", retry = false) {
    if (busy || working) return;
    setWorking(true);
    setError(null);
    const text = retry
      ? (conversation.messages.find(
          (item) => item.id === conversation.request?.userMessageId,
        )?.content ?? "")
      : draft;
    try {
      const result = await service.send(conversation, text, {
        editMessageId: editing ?? undefined,
        retry,
        mode,
      });
      if (currentId.current === result.id) {
        setWorkspace(result);
        setDraft("");
        setEditing(null);
      }
    } catch (cause) {
      report(cause);
    } finally {
      setWorking(false);
    }
  }
  async function decide(proposalId: string, decision: "accept" | "reject") {
    setWorking(true);
    setError(null);
    try {
      const result = await service.decideLibraryProposal(
        conversation,
        proposalId,
        decision,
      );
      if (currentId.current === result.id) setWorkspace(result);
      await refreshLibrary();
    } catch (cause) {
      report(cause);
    } finally {
      setWorking(false);
    }
  }
  useEffect(() => {
    const element = transcriptRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [conversation.id, conversation.messages.length, busy]);
  useEffect(() => {
    // Reconcile workspace imports/clears performed while this page was closed.
    void service.initialize().catch(report);
  }, [service]);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const candidates = useMemo(
    () =>
      getMetaChatReferenceSuggestions({
        query,
        stories,
        universes,
        characters: playerCharacters.filter(
          (character) => (character.scope ?? "library") === "library",
        ),
        limit: 30,
      }),
    [query, stories, universes, playerCharacters],
  );

  useEffect(() => {
    const element = composerRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = Math.min(element.scrollHeight, 144) + "px";
    element.style.overflowY = element.scrollHeight > 144 ? "auto" : "hidden";
  }, [draft]);

  useEffect(() => {
    if (!drawer) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawer]);

  const history = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-app-elevated">
      <div className="flex shrink-0 items-center justify-between border-b border-divider p-4">
        <span className="text-sm font-semibold">Conversations</span>
        <button
          type="button"
          aria-label="Close conversations"
          onClick={() => setDrawer(false)}
          className="lg:hidden"
        >
          <CloseIcon />
        </button>
      </div>
      <button
        type="button"
        onClick={() => {
          choose(newConversation());
        }}
        className="mx-3 mt-3 shrink-0 rounded-lg border border-divider px-3 py-2 text-left text-sm text-ink-soft hover:bg-panel"
      >
        + New chat
      </button>
      <p className="px-4 pb-2 pt-5 text-[10px] font-semibold uppercase tracking-widest text-ink-muted">
        Your chats
      </p>
      <nav
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-4"
        aria-label="MetaChat conversations"
      >
        {!conversations.length && (
          <p className="px-3 py-4 text-xs text-ink-muted">
            {loading ? "Loading conversations…" : "No conversations yet."}
          </p>
        )}
        {conversations.map((item) => (
          <div
            key={item.id}
            className={`mb-1 min-w-0 rounded-lg p-2 ${item.id === conversation.id ? "bg-panel" : "hover:bg-panel"}`}
          >
            <button
              type="button"
              onClick={() => choose(item)}
              aria-current={item.id === conversation.id ? "page" : undefined}
              className="w-full truncate text-left text-sm"
            >
              {item.title}
            </button>
            <div className="mt-1 flex items-center gap-3 text-[10px] text-ink-muted">
              <time className="mr-auto" dateTime={item.updatedAt}>
                {new Date(item.updatedAt).toLocaleDateString()}
              </time>
              <button
                type="button"
                aria-label={`Rename ${item.title}`}
                onClick={() => {
                  setRenaming(item);
                  setTitle(item.title);
                }}
              >
                Rename
              </button>
              <button
                type="button"
                aria-label={`Delete ${item.title}`}
                onClick={() => setDeleting(item)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </nav>
    </div>
  );

  return (
    <div className="flex h-full w-full max-w-full min-h-0 min-w-0 overflow-hidden bg-app">
      {(deleting || renaming) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={deleting ? "Delete conversation" : "Rename conversation"}
        >
          <div className="w-full max-w-md min-w-0 rounded-xl border border-divider bg-app-elevated p-5">
            <p className="mb-4 text-sm [overflow-wrap:anywhere]">
              {deleting
                ? `Delete “${deleting.title}”? Its conversation history will be removed.`
                : "Rename conversation"}
            </p>
            {renaming && (
              <input
                aria-label="Conversation name"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="mb-4 w-full rounded border border-divider bg-panel p-2 text-sm"
              />
            )}
            {error && (
              <p role="alert" className="mb-3 text-sm text-red-400">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-3 text-sm">
              <button
                type="button"
                onClick={() => {
                  setDeleting(null);
                  setRenaming(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={working}
                className="rounded-lg bg-accent px-3 py-2 text-accent-foreground"
                onClick={() => {
                  setWorking(true);
                  void (async () => {
                    try {
                      if (deleting) {
                        await service.remove(deleting, true);
                        if (workspace.id === deleting.id)
                          choose(newConversation());
                        setDeleting(null);
                      }
                      if (renaming) {
                        await service.rename(renaming, title);
                        setRenaming(null);
                      }
                    } catch (cause) {
                      report(cause);
                    } finally {
                      setWorking(false);
                    }
                  })();
                }}
              >
                {deleting ? "Delete conversation" : "Save name"}
              </button>
            </div>
          </div>
        </div>
      )}
      <aside className="hidden w-64 shrink-0 overflow-hidden border-r border-divider lg:block">
        {history}
      </aside>
      {drawer && (
        <div className="fixed inset-x-0 bottom-0 top-14 z-30 flex h-[calc(100dvh-3.5rem)] overflow-hidden overscroll-none lg:hidden">
          <div className="order-first h-full min-h-0 w-[min(85vw,320px)] overflow-hidden border-r border-divider">
            {history}
          </div>
          <button
            type="button"
            aria-label="Close conversation drawer"
            className="min-w-0 flex-1 bg-black/70"
            onClick={() => setDrawer(false)}
          />
        </div>
      )}
      <section className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <button
          type="button"
          aria-label="Conversation history"
          onClick={() => setDrawer(true)}
          className="absolute left-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-divider bg-app-elevated text-ink-muted shadow-lg hover:bg-panel lg:hidden"
        >
          <MenuIcon className="h-4 w-4" />
        </button>
        <div
          ref={transcriptRef}
          role="log"
          aria-label="MetaChat messages"
          className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pb-6 pt-14 lg:pt-6"
        >
          <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-4">
            {!conversation.messages.length && (
              <div className="mx-auto max-w-md py-16 text-center">
                <h2 className="text-xl font-semibold">MetaChat</h2>
                <p className="mt-3 text-sm leading-6 text-ink-muted">
                  A place to talk about your stories, characters and worlds.
                  Attach something, or just start talking.
                </p>
              </div>
            )}
            {conversation.messages.map((message) => (
              <article
                key={message.id}
                aria-label={`${message.role} message`}
                className={`min-w-0 max-w-full [overflow-wrap:anywhere] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "ml-auto w-fit bg-accent/10" : "w-full bg-panel-muted"}`}
              >
                {message.role === "user" ? (
                  <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                    {message.content}
                  </p>
                ) : (
                  <MarkdownText
                    text={message.content}
                    className="prose-metachat"
                  />
                )}
                {message.role === "user" && (
                  <button
                    type="button"
                    disabled={busy || working}
                    onClick={() => {
                      setEditing(message.id);
                      setDraft(message.content);
                      composerRef.current?.focus();
                    }}
                    className="mt-2 text-xs text-ink-muted disabled:opacity-40"
                  >
                    Edit and resend
                  </button>
                )}
                {message.proposal && (
                  <div
                    className="mt-3 min-w-0 rounded-lg border border-divider p-3"
                    aria-label="Library action proposal"
                  >
                    <p className="text-xs font-semibold">
                      Library changes · {message.proposal.status}
                    </p>
                    {message.proposal.actions.map((action) => (
                      <LibraryActionReview
                        key={action.id}
                        action={action}
                        universes={universes}
                        pending={message.proposal!.status === "pending"}
                      />
                    ))}
                    {message.proposal.status === "pending" && (
                      <div className="mt-3 flex gap-3">
                        <button
                          type="button"
                          disabled={busy || working}
                          onClick={() =>
                            void decide(message.proposal!.id, "accept")
                          }
                          className="rounded-lg bg-accent px-3 py-2 text-xs text-accent-foreground disabled:opacity-40"
                        >
                          Confirm changes
                        </button>
                        <button
                          type="button"
                          disabled={busy || working}
                          onClick={() =>
                            void decide(message.proposal!.id, "reject")
                          }
                          className="rounded-lg border border-divider px-3 py-2 text-xs"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </article>
            ))}
            {busy && (
              <p role="status" className="text-sm text-ink-muted">
                Thinking…
              </p>
            )}
            {conversation.request &&
              conversation.request.status !== "pending" && (
                <div
                  role="alert"
                  className="rounded-lg border border-divider p-3 text-sm"
                >
                  <p>{conversation.request.error}</p>
                  <button
                    type="button"
                    disabled={working}
                    onClick={() => void send(conversation.request?.mode, true)}
                    className="mt-2 text-accent-soft"
                  >
                    Retry reply
                  </button>
                </div>
              )}
            {(error || storageError) && (
              <p role="alert" className="text-sm text-red-400">
                {error ?? storageError}
              </p>
            )}
            {!!conversation.revisions.length && (
              <details className="min-w-0 text-xs text-ink-muted">
                <summary>Previous message versions</summary>
                {conversation.revisions.map((revision, i) => (
                  <div key={i} className="mt-3">
                    <time>{new Date(revision.editedAt).toLocaleString()}</time>
                    {revision.messages.map((message) => (
                      <p
                        key={message.id}
                        className="mt-2 whitespace-pre-wrap [overflow-wrap:anywhere]"
                      >
                        {message.role}: {message.content}
                      </p>
                    ))}
                  </div>
                ))}
              </details>
            )}
          </div>
        </div>
        <footer className="relative w-full min-w-0 shrink-0 border-t border-divider bg-app px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
          <div className="mx-auto w-full max-w-3xl min-w-0">
            {!!references.length && (
              <div className="mb-2 flex max-h-24 max-w-full flex-wrap gap-2 overflow-y-auto overscroll-contain">
                {references.map((reference) => (
                  <button
                    type="button"
                    key={reference.kind + reference.id}
                    title="Remove attachment"
                    onClick={() =>
                      void setReferences(
                        references.filter(
                          (item) =>
                            item.id !== reference.id ||
                            item.kind !== reference.kind,
                        ),
                      )
                    }
                    className="max-w-full truncate rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs text-accent-soft"
                  >
                    {reference.label} ×
                  </button>
                ))}
              </div>
            )}
            {picker && (
              <div className="absolute bottom-full left-3 right-3 z-20 mb-2 max-h-[50dvh] overflow-hidden rounded-xl border border-divider bg-app-elevated shadow-hero sm:left-auto sm:w-96">
                <div className="flex items-center gap-2 border-b border-divider p-3">
                  <SearchIcon className="h-4 w-4 text-ink-muted" />
                  <input
                    aria-label="Search attachments"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Find stories, characters, universes…"
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  />
                  <button
                    type="button"
                    aria-label="Close attachments"
                    onClick={() => setPicker(false)}
                  >
                    <CloseIcon className="h-4 w-4" />
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto overscroll-contain p-2">
                  {candidates.map((candidate) => (
                    <button
                      type="button"
                      key={candidate.kind + candidate.id}
                      aria-label={`${candidate.label} ${candidate.kind}`}
                      onClick={() => {
                        void setReferences(
                          references.some(
                            (item) =>
                              item.kind === candidate.kind &&
                              item.id === candidate.id,
                          )
                            ? references
                            : [...references, candidate],
                        );
                        setPicker(false);
                        setQuery("");
                      }}
                      className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-panel"
                    >
                      <span className="min-w-0 truncate">
                        {candidate.label}
                      </span>
                      <span className="shrink-0 text-[10px] text-ink-muted">
                        {candidate.kind}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {editing && (
              <div className="mb-2 flex gap-3 text-xs text-ink-muted">
                <span>
                  Editing a previous message. Later replies will be replaced.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setDraft("");
                  }}
                >
                  Cancel edit
                </button>
              </div>
            )}
            <div className="flex min-w-0 items-end gap-2">
              <button
                type="button"
                aria-label="Attach StoryEngine content"
                aria-expanded={picker}
                onClick={() => setPicker(!picker)}
                className="mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-divider hover:bg-panel"
              >
                <PlusIcon />
              </button>
              <textarea
                ref={composerRef}
                disabled={busy || working}
                rows={1}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Talk about your stories…"
                aria-label="MetaChat message"
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    void send();
                  }
                }}
                className="max-h-36 min-h-11 min-w-0 flex-1 resize-none overflow-y-hidden rounded-2xl border border-divider bg-panel-muted px-4 py-3 text-sm outline-none focus:border-accent/50"
              />
              <button
                type="button"
                disabled={!draft.trim() || busy || working || loading}
                title="Propose library changes from your message"
                onClick={() => void send("actions")}
                className="mb-1 shrink-0 rounded-lg border border-divider px-2 py-3 text-[10px] text-ink-muted disabled:opacity-40"
              >
                Actions
              </button>
              {busy ? (
                <button
                  type="button"
                  onClick={() => {
                    void service.cancel(conversation.id).catch(report);
                  }}
                  aria-label="Stop reply"
                  className="mb-1 h-10 shrink-0 rounded-full border border-divider px-3 text-xs"
                >
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!draft.trim() || working || loading}
                  aria-label={
                    editing ? "Resend edited message" : "Send message"
                  }
                  onClick={() => void send()}
                  className="mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground disabled:opacity-40"
                >
                  <ArrowRightIcon className="h-5 w-5 -rotate-90" />
                </button>
              )}
            </div>
          </div>
        </footer>
      </section>
    </div>
  );
}
