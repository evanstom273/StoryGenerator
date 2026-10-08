import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";
import type { MetaChatReference, MetaChatLibraryAction, PlayerCharacterDraft, UniverseDraft } from "../types/models";
import { getMetaChatReferenceSuggestions } from "../lib/metaChatReferences";
import { ArrowRightIcon, CloseIcon, MenuIcon, PlusIcon, SearchIcon } from "../components/icons";

export function MetaChatPage() {

  const [params, setParams] = useSearchParams();
  const { stories, universes, playerCharacters, metaChatConversations, createMetaChatConversation, renameMetaChatConversation, deleteMetaChatConversation, planMetaChatLibraryActions,
    createPlayerCharacter, updatePlayerCharacter, deletePlayerCharacter, createUniverse, updateUniverse, deleteUniverse, getMetaMessagesForScope, getMetaChatJobs, getMetaChatDraft, setMetaChatDraft, clearMetaChatDraft, queueMetaChatMessage, editMetaChatMessage, getMetaChatReferences, setMetaChatReferences } = useStoryEngine();
  const location = useLocation();
  const requested = params.get("chat");
  const conversation = metaChatConversations.find(item => item.id === requested);
  const scope = conversation?.id ?? "";
  const [initialReferences, setInitialReferences] = useState<MetaChatReference[]>(() => {
    const id = (location.state as { initialStoryId?: string } | null)?.initialStoryId;
    const story = stories.find(item => item.id === id);
    return story ? [{ id: story.id, kind: "story", label: story.title }] : [];
  });
  const messages = scope ? getMetaMessagesForScope(scope) : [];
  const jobs = getMetaChatJobs(scope).filter(j => j.type === "metachat_generate");
  const [draft, setDraft] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [proposedActions, setProposedActions] = useState<MetaChatLibraryAction[]>([]);
  const [planning, setPlanning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const element = composerRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 144)}px`;
    element.style.overflowY = element.scrollHeight > 144 ? "auto" : "hidden";
  }, [draft, scope]);
  const candidates = useMemo(() => getMetaChatReferenceSuggestions({ query, stories, universes, characters: playerCharacters.filter(c => (c.scope ?? "library") === "library"), limit: 30 }), [query, stories, universes, playerCharacters]);

  useEffect(() => { setDraft(scope ? getMetaChatDraft(scope) : ""); setDrawer(false); setPicker(false); setError(""); }, [scope, getMetaChatDraft]);
  useEffect(() => { if (!drawer) bottom.current?.parentElement?.parentElement?.scrollTo({ top: bottom.current.parentElement.parentElement.scrollHeight }); }, [messages.length, jobs.length, scope, drawer]);

  function selectScope(id: string) { setParams(id ? { chat: id } : {}); setDrawer(false); setMenuId(null); }
  function newChat() { selectScope(""); setInitialReferences([]); setDraft(""); }
  async function renameChat(id: string) {
    const item = metaChatConversations.find(c => c.id === id);
    const title = window.prompt("Rename conversation", item?.title ?? "");
    if (title?.trim()) await renameMetaChatConversation(id, title);
    setMenuId(null);
  }
  async function deleteChat(id: string) {
    if (!window.confirm("Delete this conversation permanently?")) return;
    await deleteMetaChatConversation(id);
    if (scope === id) newChat();
    setMenuId(null);
  }
  async function send() {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true); setError(""); setDraft("");
    try {
      const id = scope || (await createMetaChatConversation(initialReferences)).id;
      if (!scope) setParams({ chat: id }, { replace: true });
      await queueMetaChatMessage(id, content);
      await clearMetaChatDraft(id);
    }
    catch (e) { setDraft(content); setError(e instanceof Error ? e.message : "Unable to send message."); }
    finally { setSending(false); }
  }
  async function resendEdited() {
    if (!editingId || !editDraft.trim() || savingEdit) return;
    setSavingEdit(true); setError("");
    try {
      await editMetaChatMessage(scope, editingId, editDraft);
      setEditingId(null); setEditDraft("");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to edit message."); }
    finally { setSavingEdit(false); }
  }
  async function addReference(item: { id: string; kind: "story" | "character" | "universe"; label: string }) {
    if (!references.some(r => r.kind === item.kind && r.id === item.id)) {
      try { if (scope) await setMetaChatReferences(scope, [...references, { id: item.id, kind: item.kind, label: item.label }]); else setInitialReferences([...references, { id: item.id, kind: item.kind, label: item.label }]); }
      catch (e) { setError(e instanceof Error ? e.message : "Unable to attach reference."); }
    }
    setPicker(false); setQuery("");
  }
  async function planActions() {
    if (!draft.trim() || planning) return;
    setPlanning(true); setError("");
    try {
      const proposed = await planMetaChatLibraryActions(scope, draft);
      if (!proposed.length) throw new Error("No safe library actions could be prepared. Clarify which characters or universes you mean.");
      setProposedActions(proposed);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not prepare actions."); }
    finally { setPlanning(false); }
  }
  async function applyActions() {
    if (!proposedActions.length || applying) return;
    if (!window.confirm("Apply these " + proposedActions.length + " library changes? Deletions cannot be undone.")) return;
    setApplying(true); setError("");
    let completed = 0;
    try {
      for (const action of proposedActions) {
        if (action.kind === "character") {
          const existing = playerCharacters.find(item => item.id === action.targetId);
          if (action.operation === "delete") {
            if (!existing) throw new Error("Character no longer exists.");
            const result = await deletePlayerCharacter(existing.id);
            if (!result.ok) throw new Error(result.reason ?? "Character deletion blocked.");
          } else {
            const draftData = { ...(existing ?? {}), ...(action.draft ?? {}), scope: "library" } as PlayerCharacterDraft;
            if (!draftData.name || !draftData.universeId || !universes.some(u => u.id === draftData.universeId)) throw new Error("Character needs a valid name and universe.");
            if (action.operation === "create") await createPlayerCharacter(draftData);
            else if (existing) await updatePlayerCharacter(existing.id, draftData);
            else throw new Error("Character no longer exists.");
          }
        } else {
          const existing = universes.find(item => item.id === action.targetId);
          if (action.operation === "delete") {
            if (!existing) throw new Error("Universe no longer exists.");
            const result = await deleteUniverse(existing.id);
            if (!result.ok) throw new Error(result.reason ?? "Universe deletion blocked.");
          } else {
            const draftData = { ...(existing ?? {}), ...(action.draft ?? {}) } as UniverseDraft;
            if (!draftData.name) throw new Error("Universe name is required.");
            if (action.operation === "create") await createUniverse(draftData);
            else if (existing) await updateUniverse(existing.id, draftData);
            else throw new Error("Universe no longer exists.");
          }
        }
        completed += 1;
      }
      setProposedActions([]);
      setError(completed + " library action(s) completed.");
    } catch (cause) {
      setProposedActions(proposedActions.slice(completed));
      setError(completed + " applied before error: " + (cause instanceof Error ? cause.message : "Unknown error."));
    } finally { setApplying(false); }
  }
  const conversationItems = metaChatConversations;
  const history = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-app-elevated">
      <div className="flex items-center justify-between border-b border-divider p-4"><span className="text-sm font-semibold">Conversations</span><button aria-label="Close conversations" onClick={() => setDrawer(false)} className="lg:hidden"><CloseIcon /></button></div>
      <button className="mx-3 mt-3 rounded-lg border border-divider px-3 py-2 text-left text-sm text-ink-soft hover:bg-panel" onClick={newChat}>+ New chat</button>
      <p className="px-4 pb-2 pt-5 text-[10px] font-semibold uppercase tracking-widest text-ink-muted">Your chats</p>
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-2 pb-4" aria-label="MetaChat conversations">
        {!conversationItems.length && <p className="px-3 py-4 text-xs text-ink-muted">No conversations yet.</p>}
        {conversationItems.map(item => <div key={item.id} className="relative flex min-w-0 items-center rounded-lg hover:bg-panel">
          <button onClick={() => selectScope(item.id)} className={`min-w-0 flex-1 truncate px-3 py-2.5 text-left text-sm ${scope === item.id ? "text-accent-soft" : "text-ink-muted"}`}>{item.title}</button>
          <button aria-label={`Options for ${item.title}`} onClick={() => setMenuId(menuId === item.id ? null : item.id)} className="shrink-0 px-2 text-ink-muted">•••</button>
          {menuId === item.id && <div className="absolute right-0 top-full z-20 w-32 rounded-lg border border-divider bg-app-elevated p-1 shadow-hero">
            <button onClick={() => void renameChat(item.id)} className="block w-full p-2 text-left text-xs">Rename</button>
            <button onClick={() => void deleteChat(item.id)} className="block w-full p-2 text-left text-xs text-rose-300">Delete</button>
          </div>}
        </div>)}
      </nav>

    </div>
  );
  return (
    <div className="flex h-[calc(100dvh-3.5rem)] w-full max-w-full min-h-0 min-w-0 overflow-hidden bg-app">
      <aside className="hidden w-64 shrink-0 border-r border-divider lg:block">{history}</aside>
      {drawer && <div className="fixed inset-x-0 bottom-0 top-14 z-30 flex h-[calc(100dvh-3.5rem)] overflow-hidden overscroll-none lg:hidden"><button aria-label="Close conversation drawer" className="flex-1 bg-black/70" onClick={() => setDrawer(false)} /><div className="order-first h-full min-h-0 w-[min(85vw,320px)] overflow-hidden border-r border-divider">{history}</div></div>}
      <section className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <button aria-label="Conversation history" title="Conversations" onClick={() => setDrawer(true)} className="absolute left-3 top-[4.25rem] z-10 flex h-9 w-9 items-center justify-center rounded-full border border-divider bg-app-elevated text-ink-muted shadow-lg hover:bg-panel lg:hidden"><MenuIcon className="h-4 w-4" /></button>
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {!messages.length && <div className="mx-auto max-w-md py-16 text-center"><h2 className="text-xl font-semibold">Let's talk stories.</h2><p className="mt-3 text-sm leading-6 text-ink-muted">Review your writing, discuss characters and explore ideas. MetaChat stays outside the story.</p></div>}
            {messages.map(m => <div key={m.id} className={m.role === "user" ? "ml-auto max-w-[88%] rounded-2xl bg-panel px-4 py-3 text-sm" : "rounded-2xl border border-divider/50 bg-app-elevated px-4 py-3 text-sm"}>
              {m.role !== "user" && <div className="mb-2 font-semibold">MetaChat</div>}
              {editingId === m.id ? (
                <div className="space-y-2">
                  <textarea autoFocus value={editDraft} onChange={e => setEditDraft(e.target.value)} rows={3} className="w-full resize-y rounded-lg border border-divider bg-app px-3 py-2 text-sm outline-none focus:border-accent" />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditingId(null)} className="rounded-lg px-3 py-2 text-xs text-ink-muted">Cancel</button>
                    <button disabled={savingEdit || !editDraft.trim()} onClick={() => void resendEdited()} className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground disabled:opacity-50">Save & resend</button>
                  </div>
                </div>
              ) : <>
                <div className="prose-metachat break-words leading-7" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(m.content) as string) }} />
                {m.role === "user" && <button aria-label="Edit message" onClick={() => { setEditingId(m.id); setEditDraft(m.content); }} className="mt-2 text-xs text-ink-muted underline-offset-2 hover:text-ink hover:underline">Edit</button>}
              </>}
            </div>)}
            {jobs.some(j => j.status === "queued" || j.status === "running") && <p className="text-sm text-ink-muted">MetaChat is thinking…</p>}
            {jobs.filter(j => j.status === "failed").map(j => <p key={j.id} className="text-sm text-rose-300">Reply failed: {j.error ?? "Unknown error"}</p>)}
            <div ref={bottom} />
          </div>
        </div>
        <footer className="relative shrink-0 border-t border-divider bg-app px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
          <div className="mx-auto max-w-3xl">
            {!!proposedActions.length && <div className="mb-3 max-h-56 overflow-y-auto rounded-xl border border-divider bg-app-elevated p-3">
              <p className="mb-2 text-xs font-semibold">Review proposed library changes</p>
              {proposedActions.map((action, index) => <div key={index} className="border-t border-divider py-2 text-xs">
                <span className="font-semibold capitalize">{action.operation} {action.kind}</span>: {action.summary}
                {action.draft && <details className="mt-1"><summary className="cursor-pointer text-ink-muted">Inspect fields</summary><pre className="max-h-36 overflow-auto whitespace-pre-wrap break-words text-[10px]">{JSON.stringify(action.draft, null, 2)}</pre></details>}
              </div>)}
              <div className="mt-2 flex gap-2"><button onClick={() => setProposedActions([])} className="rounded-lg border border-divider px-3 py-2 text-xs">Cancel</button><button disabled={applying} onClick={() => void applyActions()} className="rounded-lg bg-accent px-3 py-2 text-xs text-accent-foreground disabled:opacity-50">{applying ? "Applying…" : "Confirm changes"}</button></div>
            </div>
            {error && <p role="alert" className="mb-2 text-xs text-rose-300">{error}</p>}
            {!!references.length && <div className="mb-2 flex flex-wrap gap-2">{references.map(r => <button key={r.kind + r.id} onClick={() => { const next = references.filter(x => x.id !== r.id || x.kind !== r.kind); if (scope) void setMetaChatReferences(scope, next); else setInitialReferences(next); }} className="max-w-full truncate rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs text-accent-soft">{r.label} ×</button>)}</div>}
            {picker && <div className="absolute bottom-full left-3 right-3 mb-2 max-h-[50vh] overflow-hidden rounded-xl border border-divider bg-app-elevated shadow-hero sm:left-auto sm:w-96"><div className="flex items-center gap-2 border-b border-divider p-3"><SearchIcon className="h-4 w-4" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find stories, characters, universes…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></div><div className="max-h-64 overflow-y-auto p-2">{candidates.map(c => <button key={c.kind + c.id} onClick={() => void addReference(c)} className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-panel"><span className="truncate">{c.label}</span><span className="shrink-0 text-[10px] text-ink-muted">{c.kind}</span></button>)}</div></div>}
            <div className="flex items-end gap-2">
              <button aria-label="Attach StoryEngine content" onClick={() => setPicker(!picker)} className="mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-divider hover:bg-panel"><PlusIcon /></button>
              <textarea ref={composerRef} rows={1} value={draft} onChange={e => { setDraft(e.target.value); if (scope) void setMetaChatDraft(scope, e.target.value); }} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder="Talk about your stories…" className="max-h-36 min-h-11 min-w-0 flex-1 resize-none overflow-y-hidden rounded-2xl border border-divider bg-panel-muted px-4 py-3 text-sm outline-none focus:border-accent/50" />
              <button aria-label="Prepare character or universe actions" title="Prepare library actions" disabled={!draft.trim() || planning} onClick={() => void planActions()} className="mb-1 shrink-0 rounded-lg border border-divider px-2 py-3 text-[10px] text-ink-muted disabled:opacity-40">{planning ? "…" : "Actions"}</button>
              <button aria-label="Send" disabled={!draft.trim() || sending} onClick={() => void send()} className="mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground disabled:opacity-40"><ArrowRightIcon className="h-5 w-5 -rotate-90" /></button>
            </div>
          </div>
        </footer>
      </section>
    </div>
  );
}
