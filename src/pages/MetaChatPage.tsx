import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";
import { getMetaChatReferenceSuggestions } from "../lib/metaChatReferences";
import type { MetaChatReference } from "../types/models";
import { ArrowRightIcon, CloseIcon, MenuIcon, PlusIcon, SearchIcon } from "../components/icons";

/**
 * MetaChat presentation shell.
 *
 * Deliberately has no connection to the retired MetaChat message, AI, job,
 * conversation persistence or library mutation APIs.
 * All data in this component is temporary view state.
 */
export function MetaChatPage() {
  const location = useLocation();
  const { stories, universes, playerCharacters } = useStoryEngine();
  const [drawer, setDrawer] = useState(false);
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [references, setReferences] = useState<MetaChatReference[]>(() => {
    const id = (location.state as { initialStoryId?: string } | null)?.initialStoryId;
    const story = stories.find(item => item.id === id);
    return story ? [{ id: story.id, kind: "story", label: story.title }] : [];
  });
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const candidates = useMemo(() => getMetaChatReferenceSuggestions({
    query,
    stories,
    universes,
    characters: playerCharacters.filter(character => (character.scope ?? "library") === "library"),
    limit: 30,
  }), [query, stories, universes, playerCharacters]);

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
    return () => { document.body.style.overflow = previous; };
  }, [drawer]);

  const history = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-app-elevated">
      <div className="flex shrink-0 items-center justify-between border-b border-divider p-4">
        <span className="text-sm font-semibold">Conversations</span>
        <button type="button" aria-label="Close conversations" onClick={() => setDrawer(false)} className="lg:hidden"><CloseIcon /></button>
      </div>
      <button type="button" onClick={() => { setDraft(""); setReferences([]); setPicker(false); setDrawer(false); }} className="mx-3 mt-3 shrink-0 rounded-lg border border-divider px-3 py-2 text-left text-sm text-ink-soft hover:bg-panel">+ New chat</button>
      <p className="px-4 pb-2 pt-5 text-[10px] font-semibold uppercase tracking-widest text-ink-muted">Your chats</p>
      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-4" aria-label="MetaChat conversations">
        <p className="px-3 py-4 text-xs text-ink-muted">No conversations yet. Conversation history will return with the new backend.</p>
      </nav>
    </div>
  );

  return (
    <div className="flex h-full w-full max-w-full min-h-0 min-w-0 overflow-hidden bg-app">
      <aside className="hidden w-64 shrink-0 overflow-hidden border-r border-divider lg:block">{history}</aside>
      {drawer && <div className="fixed inset-x-0 bottom-0 top-14 z-30 flex h-[calc(100dvh-3.5rem)] overflow-hidden overscroll-none lg:hidden">
        <div className="order-first h-full min-h-0 w-[min(85vw,320px)] overflow-hidden border-r border-divider">{history}</div>
        <button type="button" aria-label="Close conversation drawer" className="min-w-0 flex-1 bg-black/70" onClick={() => setDrawer(false)} />
      </div>}
      <section className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <button type="button" aria-label="Conversation history" onClick={() => setDrawer(true)} className="absolute left-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-divider bg-app-elevated text-ink-muted shadow-lg hover:bg-panel lg:hidden"><MenuIcon className="h-4 w-4" /></button>
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pb-6 pt-14 lg:pt-6">
          <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-4">
            <div className="mx-auto max-w-md py-16 text-center">
              <h2 className="text-xl font-semibold">MetaChat</h2>
              <p className="mt-3 text-sm leading-6 text-ink-muted">The new MetaChat backend is being rebuilt. This interface is a shell for now; sending messages and library actions are unavailable.</p>
            </div>
          </div>
        </div>
        <footer className="relative w-full min-w-0 shrink-0 border-t border-divider bg-app px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
          <div className="mx-auto w-full max-w-3xl min-w-0">
            {!!references.length && <div className="mb-2 flex max-w-full flex-wrap gap-2">
              {references.map(reference => <button type="button" key={reference.kind + reference.id} title="Remove attachment" onClick={() => setReferences(current => current.filter(item => item.id !== reference.id || item.kind !== reference.kind))} className="max-w-full truncate rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs text-accent-soft">{reference.label} ×</button>)}
            </div>}
            {picker && <div className="absolute bottom-full left-3 right-3 z-20 mb-2 max-h-[50dvh] overflow-hidden rounded-xl border border-divider bg-app-elevated shadow-hero sm:left-auto sm:w-96">
              <div className="flex items-center gap-2 border-b border-divider p-3">
                <SearchIcon className="h-4 w-4 text-ink-muted" />
                <input aria-label="Search attachments" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find stories, characters, universes…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
                <button type="button" aria-label="Close attachments" onClick={() => setPicker(false)}><CloseIcon className="h-4 w-4" /></button>
              </div>
              <div className="max-h-64 overflow-y-auto overscroll-contain p-2">
                {candidates.map(candidate => <button type="button" key={candidate.kind + candidate.id} onClick={() => { setReferences(current => current.some(item => item.kind === candidate.kind && item.id === candidate.id) ? current : [...current, candidate]); setPicker(false); setQuery(""); }} className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-panel"><span className="min-w-0 truncate">{candidate.label}</span><span className="shrink-0 text-[10px] text-ink-muted">{candidate.kind}</span></button>)}
              </div>
            </div>}
            <div className="flex min-w-0 items-end gap-2">
              <button type="button" aria-label="Attach StoryEngine content" aria-expanded={picker} onClick={() => setPicker(!picker)} className="mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-divider hover:bg-panel"><PlusIcon /></button>
              <textarea ref={composerRef} rows={1} value={draft} onChange={event => setDraft(event.target.value)} placeholder="Talk about your stories…" aria-label="MetaChat message (backend unavailable)" className="max-h-36 min-h-11 min-w-0 flex-1 resize-none overflow-y-hidden rounded-2xl border border-divider bg-panel-muted px-4 py-3 text-sm outline-none focus:border-accent/50" />
              <button type="button" disabled title="Library actions unavailable until backend rebuild" className="mb-1 shrink-0 rounded-lg border border-divider px-2 py-3 text-[10px] text-ink-muted opacity-40">Actions</button>
              <button type="button" disabled aria-label="Send unavailable until backend rebuild" title="Send unavailable until backend rebuild" className="mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground opacity-40"><ArrowRightIcon className="h-5 w-5 -rotate-90" /></button>
            </div>
          </div>
        </footer>
      </section>
    </div>
  );
}
