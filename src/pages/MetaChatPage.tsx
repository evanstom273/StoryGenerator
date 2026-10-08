import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";
import { GLOBAL_META_CHAT_SCOPE_ID } from "../lib/metaChatScope";
import { getMetaChatReferenceSuggestions } from "../lib/metaChatReferences";
import { ArrowRightIcon, CloseIcon, MenuIcon, PlusIcon, SearchIcon } from "../components/icons";

export function MetaChatPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { stories, universes, playerCharacters, getMetaMessagesForScope, getMetaChatJobs, getMetaChatDraft, setMetaChatDraft, clearMetaChatDraft, queueMetaChatMessage, getMetaChatReferences, setMetaChatReferences } = useStoryEngine();
  const requested = params.get("story");
  const scope = requested && stories.some(s => s.id === requested) ? requested : GLOBAL_META_CHAT_SCOPE_ID;
  const story = stories.find(s => s.id === scope);
  const messages = getMetaMessagesForScope(scope);
  const references = getMetaChatReferences(scope);
  const jobs = getMetaChatJobs(scope).filter(j => j.type === "metachat_generate");
  const [draft, setDraft] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const candidates = useMemo(() => getMetaChatReferenceSuggestions({ query, stories, universes, characters: playerCharacters.filter(c => (c.scope ?? "library") === "library"), limit: 30 }), [query, stories, universes, playerCharacters]);

  useEffect(() => { setDraft(getMetaChatDraft(scope)); setDrawer(false); setPicker(false); setError(""); }, [scope, getMetaChatDraft]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [messages.length, jobs.length, scope]);

  function selectScope(id: string) { setParams(id === GLOBAL_META_CHAT_SCOPE_ID ? {} : { story: id }); setDrawer(false); }
  async function send() {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true); setError(""); setDraft("");
    try { await queueMetaChatMessage(scope, content); await clearMetaChatDraft(scope); }
    catch (e) { setDraft(content); setError(e instanceof Error ? e.message : "Unable to send message."); }
    finally { setSending(false); }
  }
  async function addReference(item: { id: string; kind: "story" | "character" | "universe"; label: string }) {
    if (!references.some(r => r.kind === item.kind && r.id === item.id)) {
      try { await setMetaChatReferences(scope, [...references, { id: item.id, kind: item.kind, label: item.label }]); }
      catch (e) { setError(e instanceof Error ? e.message : "Unable to attach reference."); }
    }
    setPicker(false); setQuery("");
  }
  const conversationItems = [{ id: GLOBAL_META_CHAT_SCOPE_ID, title: "Writing Library" }, ...stories.map(s => ({ id: s.id, title: s.title }))];
  const history = (
    <div className="flex h-full flex-col bg-app-elevated">
      <div className="flex items-center justify-between border-b border-divider p-4"><span className="text-sm font-semibold">Conversations</span><button aria-label="Close conversations" onClick={() => setDrawer(false)} className="lg:hidden"><CloseIcon /></button></div>
      <button className="mx-3 mt-3 rounded-lg border border-divider px-3 py-2 text-left text-sm text-ink-soft hover:bg-panel" onClick={() => selectScope(GLOBAL_META_CHAT_SCOPE_ID)}>+ Library discussion</button>
      <p className="px-4 pb-2 pt-5 text-[10px] font-semibold uppercase tracking-widest text-ink-muted">Story discussions</p>
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-4" aria-label="MetaChat conversations">
        {conversationItems.map(item => <button key={item.id} onClick={() => selectScope(item.id)} className={`block w-full truncate rounded-lg px-3 py-2.5 text-left text-sm ${scope === item.id ? "bg-accent/15 text-accent-soft" : "text-ink-muted hover:bg-panel"}`}>{item.title}</button>)}
      </nav>
      <p className="border-t border-divider p-3 text-[11px] leading-5 text-ink-muted">Existing library and story conversations. Independent multi-chat threads are not enabled yet.</p>
    </div>
  );
  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 min-w-0 overflow-hidden border border-divider/30 bg-app lg:h-screen">
      <aside className="hidden w-64 shrink-0 border-r border-divider lg:block">{history}</aside>
      {drawer && <div className="fixed inset-x-0 bottom-0 top-14 z-30 flex lg:hidden"><button aria-label="Close conversation drawer" className="flex-1 bg-black/70" onClick={() => setDrawer(false)} /><div className="order-first w-[min(85vw,320px)] border-r border-divider">{history}</div></div>}
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-divider px-4">
          <button aria-label="Conversation history" onClick={() => setDrawer(true)} className="rounded-lg p-2 text-ink-muted hover:bg-panel lg:hidden"><MenuIcon /></button>
          <div className="min-w-0 flex-1"><h1 className="truncate text-base font-semibold">MetaChat</h1><p className="truncate text-xs text-ink-muted">{story?.title ?? "Entire Writing Library"} · Out of canon</p></div>
          <button className="rounded-lg border border-divider px-3 py-2 text-xs text-ink-muted hover:bg-panel" onClick={() => navigate(-1)}>Back</button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {!messages.length && <div className="mx-auto max-w-md py-16 text-center"><h2 className="text-xl font-semibold">Let's talk stories.</h2><p className="mt-3 text-sm leading-6 text-ink-muted">Review your writing, discuss characters and explore ideas. MetaChat stays outside the story.</p></div>}
            {messages.map(m => <div key={m.id} className={m.role === "user" ? "ml-auto max-w-[88%] rounded-2xl bg-panel px-4 py-3 text-sm" : "rounded-2xl border border-divider/50 bg-app-elevated px-4 py-3 text-sm"}>{m.role !== "user" && <div className="mb-2 font-semibold">MetaChat</div>}<div className="prose-metachat break-words leading-7" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(m.content) as string) }} /></div>)}
            {jobs.some(j => j.status === "queued" || j.status === "running") && <p className="text-sm text-ink-muted">MetaChat is thinking…</p>}
            {jobs.filter(j => j.status === "failed").map(j => <p key={j.id} className="text-sm text-rose-300">Reply failed: {j.error ?? "Unknown error"}</p>)}
            <div ref={bottom} />
          </div>
        </div>
        <footer className="relative shrink-0 border-t border-divider bg-app px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
          <div className="mx-auto max-w-3xl">
            {error && <p role="alert" className="mb-2 text-xs text-rose-300">{error}</p>}
            {!!references.length && <div className="mb-2 flex flex-wrap gap-2">{references.map(r => <button key={r.kind + r.id} onClick={() => void setMetaChatReferences(scope, references.filter(x => x.id !== r.id || x.kind !== r.kind))} className="max-w-full truncate rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs text-accent-soft">{r.label} ×</button>)}</div>}
            {picker && <div className="absolute bottom-full left-3 right-3 mb-2 max-h-[50vh] overflow-hidden rounded-xl border border-divider bg-app-elevated shadow-hero sm:left-auto sm:w-96"><div className="flex items-center gap-2 border-b border-divider p-3"><SearchIcon className="h-4 w-4" /><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Find stories, characters, universes…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></div><div className="max-h-64 overflow-y-auto p-2">{candidates.map(c => <button key={c.kind + c.id} onClick={() => void addReference(c)} className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-panel"><span className="truncate">{c.label}</span><span className="shrink-0 text-[10px] text-ink-muted">{c.kind}</span></button>)}</div></div>}
            <div className="flex items-end gap-2">
              <button aria-label="Attach StoryEngine content" onClick={() => setPicker(!picker)} className="mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-divider hover:bg-panel"><PlusIcon /></button>
              <textarea rows={1} value={draft} onChange={e => { setDraft(e.target.value); void setMetaChatDraft(scope, e.target.value); }} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder="Talk about your stories…" className="max-h-36 min-h-11 min-w-0 flex-1 resize-y rounded-2xl border border-divider bg-panel-muted px-4 py-3 text-sm outline-none focus:border-accent/50" />
              <button aria-label="Send" disabled={!draft.trim() || sending} onClick={() => void send()} className="mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground disabled:opacity-40"><ArrowRightIcon className="h-5 w-5 -rotate-90" /></button>
            </div>
          </div>
        </footer>
      </section>
    </div>
  );
}
