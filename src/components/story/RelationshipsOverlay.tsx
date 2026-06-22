import { useEffect, useState } from "react";
import { Button } from "../ui/Button";
import { useStoryEngine } from "../../app/providers/StoryEngineProvider";
import { normalizeStoryStateToV2, safeParseStoryStateData } from "../../lib/storyStateV2";
import type { RelationshipHistoryEntry, RelationshipIndexEntry, RelationshipTier } from "../../types/models";
import { cn } from "../../utils/cn";

const ALL_TIERS: RelationshipTier[] = [
  "stranger", "acquaintance", "friend", "ally", "rival", "enemy", "nemesis", "lover",
];

const TIER_COLOR: Record<RelationshipTier, string> = {
  friend: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  ally: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  lover: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  stranger: "bg-white/5 text-white/38 border-white/10",
  acquaintance: "bg-white/5 text-white/48 border-white/10",
  rival: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  enemy: "bg-red-500/15 text-red-400 border-red-500/20",
  nemesis: "bg-red-500/15 text-red-400 border-red-500/20",
};

const TIER_ORDER: RelationshipTier[] = [
  "lover", "ally", "friend", "acquaintance", "stranger", "rival", "enemy", "nemesis",
];

function sortByTier(rels: RelationshipIndexEntry[]): RelationshipIndexEntry[] {
  return [...rels].sort((a, b) => {
    const ai = TIER_ORDER.indexOf(a.tier ?? "stranger");
    const bi = TIER_ORDER.indexOf(b.tier ?? "stranger");
    return ai - bi;
  });
}

function makePairKey(a: string, b: string) {
  const [x, y] = [a.toLowerCase().trim(), b.toLowerCase().trim()].sort();
  return `${x}::${y}`;
}

type Filter = "player" | "all";

interface EditState {
  tier: RelationshipTier;
  summary: string;
  history: string[];
}

function RelationshipCard({
  entry,
  onSave,
  onDelete,
}: {
  entry: RelationshipIndexEntry;
  onSave: (updated: RelationshipIndexEntry) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditState>({
    tier: entry.tier ?? "stranger",
    summary: entry.summary ?? "",
    history: entry.history?.map((h) => h.summary) ?? [],
  });
  const [confirmDelete, setConfirmDelete] = useState(false);

  function startEdit() {
    setDraft({
      tier: entry.tier ?? "stranger",
      summary: entry.summary ?? "",
      history: entry.history?.map((h) => h.summary) ?? [],
    });
    setEditing(true);
  }

  function handleSave() {
    const history: RelationshipHistoryEntry[] = draft.history
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => ({ summary: s }));
    onSave({
      ...entry,
      tier: draft.tier,
      summary: draft.summary.trim() || undefined,
      history: history.length ? history : undefined,
    });
    setEditing(false);
  }

  const colorClass = TIER_COLOR[entry.tier ?? "stranger"];

  if (editing) {
    return (
      <div className="rounded-[10px] border border-accent/30 bg-panel-muted/60 px-4 py-3 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-ink">{entry.a}</span>
          <span className="text-xs text-ink-muted">↔</span>
          <span className="font-semibold text-ink">{entry.b}</span>
        </div>

        <label className="block space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Tier</span>
          <select
            className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-1.5 text-sm text-ink outline-none"
            value={draft.tier}
            onChange={(e) => setDraft((d) => ({ ...d, tier: e.target.value as RelationshipTier }))}
          >
            {ALL_TIERS.map((t) => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Summary</span>
          <textarea
            rows={2}
            className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-1.5 text-sm text-ink outline-none resize-none"
            value={draft.summary}
            onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))}
            placeholder="1-2 sentence description of this relationship…"
          />
        </label>

        <div className="space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Key Moments (one per line)</span>
          {draft.history.map((h, i) => (
            <div key={i} className="flex gap-2">
              <input
                className="flex-1 rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-1.5 text-sm text-ink outline-none"
                value={h}
                onChange={(e) => setDraft((d) => {
                  const next = [...d.history];
                  next[i] = e.target.value;
                  return { ...d, history: next };
                })}
                placeholder={`Moment ${i + 1}…`}
              />
              <button
                type="button"
                onClick={() => setDraft((d) => ({ ...d, history: d.history.filter((_, j) => j !== i) }))}
                className="text-xs text-red-400 hover:text-red-300"
              >✕</button>
            </div>
          ))}
          {draft.history.length < 5 ? (
            <button
              type="button"
              onClick={() => setDraft((d) => ({ ...d, history: [...d.history, ""] }))}
              className="text-xs text-ink-muted hover:text-ink"
            >+ Add moment</button>
          ) : null}
        </div>

        <div className="flex gap-2">
          <Button variant="primary" size="sm" onClick={handleSave}>Save</Button>
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[10px] border border-divider/40 bg-panel-muted/40 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-ink">{entry.a}</span>
        <span className="text-xs text-ink-muted">↔</span>
        <span className="font-semibold text-ink">{entry.b}</span>
        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize", colorClass)}>
          {entry.tier ?? "stranger"}
        </span>
        <div className="ml-auto flex gap-1.5">
          <button type="button" onClick={startEdit} className="text-[11px] text-ink-muted hover:text-ink">Edit</button>
          {confirmDelete ? (
            <>
              <button type="button" onClick={onDelete} className="text-[11px] text-red-400 hover:text-red-300">Confirm</button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="text-[11px] text-ink-muted hover:text-ink">Cancel</button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="text-[11px] text-ink-muted hover:text-red-400">Delete</button>
          )}
        </div>
      </div>
      {entry.summary ? <p className="mt-1.5 text-xs text-ink-muted">{entry.summary}</p> : null}
      {Array.isArray(entry.history) && entry.history.length ? (
        <div className="mt-2 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted/50">Key Moments</p>
          {entry.history.map((h, hi) => (
            <div key={hi} className="flex items-start gap-1.5 text-xs text-ink-muted">
              <span className="mt-px shrink-0 text-[10px] text-white/25">#{hi + 1}</span>
              <span>{h.summary}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function RelationshipsOverlay(props: {
  open: boolean;
  storyId: string;
  playerName?: string;
  onClose: () => void;
}) {
  const { fetchStoryState, updateRelationshipsIndex, queueStoryIndexJob } = useStoryEngine();
  const [relationships, setRelationships] = useState<RelationshipIndexEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("player");
  const [addingNew, setAddingNew] = useState(false);
  const [newEntry, setNewEntry] = useState({ a: "", b: "", tier: "stranger" as RelationshipTier, summary: "" });

  useEffect(() => {
    if (!props.open) return;
    setLoading(true);
    fetchStoryState(props.storyId).then((state) => {
      if (!state) { setLoading(false); return; }
      const parsed = normalizeStoryStateToV2(safeParseStoryStateData(state.stateJson));
      setRelationships(parsed?.indexes?.relationships ?? []);
      setLoading(false);
    });
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [props.open, props.storyId]);

  if (!props.open) return null;

  const pcName = props.playerName?.trim().toLowerCase() ?? "";
  const filtered = filter === "player" && pcName
    ? relationships.filter((r) => r.a.trim().toLowerCase() === pcName || r.b.trim().toLowerCase() === pcName)
    : relationships;
  const sorted = sortByTier(filtered);

  async function persist(next: RelationshipIndexEntry[]) {
    setRelationships(next);
    setSaving(true);
    try {
      await updateRelationshipsIndex(props.storyId, next);
    } finally {
      setSaving(false);
    }
  }

  function handleSave(_index: number, updated: RelationshipIndexEntry) {
    const allUpdated = relationships.map((r) => {
      const rKey = makePairKey(r.a, r.b);
      const updKey = makePairKey(updated.a, updated.b);
      return rKey === updKey ? updated : r;
    });
    void persist(allUpdated);
  }

  function handleDelete(entry: RelationshipIndexEntry) {
    const key = makePairKey(entry.a, entry.b);
    void persist(relationships.filter((r) => makePairKey(r.a, r.b) !== key));
  }

  function handleAdd() {
    const a = newEntry.a.trim();
    const b = newEntry.b.trim();
    if (!a || !b) return;
    const key = makePairKey(a, b);
    if (relationships.some((r) => makePairKey(r.a, r.b) === key)) return;
    const entry: RelationshipIndexEntry = {
      a,
      b,
      tier: newEntry.tier,
      ...(newEntry.summary.trim() ? { summary: newEntry.summary.trim() } : {}),
    };
    void persist([...relationships, entry]);
    setNewEntry({ a: "", b: "", tier: "stranger", summary: "" });
    setAddingNew(false);
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await queueStoryIndexJob(props.storyId, { trigger: "manual" });
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[55] flex flex-col bg-app">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-divider/[0.3] px-4 py-3">
        <div>
          <h2 className="text-base font-bold text-ink">Relationships</h2>
          <p className="text-xs text-ink-muted">{relationships.length} indexed</p>
        </div>
        <div className="flex items-center gap-2">
          {saving ? <span className="text-xs text-ink-muted">Saving…</span> : null}
          <Button variant="ghost" size="sm" disabled={refreshing} onClick={() => void handleRefresh()}>
            {refreshing ? "Queued…" : "Refresh"}
          </Button>
          <div className="flex rounded-lg border border-divider/40 bg-panel-muted/50 p-0.5">
            {(["player", "all"] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition",
                  filter === f ? "bg-accent text-accent-foreground" : "text-ink-muted hover:text-ink",
                )}
              >
                {f === "player" ? "Mine" : "All"}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={props.onClose}>Close</Button>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {/* Add new entry */}
        {addingNew ? (
          <div className="rounded-[10px] border border-accent/30 bg-panel-muted/60 px-4 py-3 space-y-3">
            <p className="text-xs font-semibold text-ink-soft">New Relationship</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className="text-[10px] text-ink-muted">Person A</span>
                <input className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-1.5 text-sm text-ink outline-none" value={newEntry.a} onChange={(e) => setNewEntry((n) => ({ ...n, a: e.target.value }))} placeholder="Name…" />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] text-ink-muted">Person B</span>
                <input className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-1.5 text-sm text-ink outline-none" value={newEntry.b} onChange={(e) => setNewEntry((n) => ({ ...n, b: e.target.value }))} placeholder="Name…" />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-[10px] text-ink-muted">Tier</span>
              <select className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-1.5 text-sm text-ink outline-none" value={newEntry.tier} onChange={(e) => setNewEntry((n) => ({ ...n, tier: e.target.value as RelationshipTier }))}>
                {ALL_TIERS.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] text-ink-muted">Summary</span>
              <textarea rows={2} className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-1.5 text-sm text-ink outline-none resize-none" value={newEntry.summary} onChange={(e) => setNewEntry((n) => ({ ...n, summary: e.target.value }))} placeholder="Optional summary…" />
            </label>
            <div className="flex gap-2">
              <Button variant="primary" size="sm" onClick={handleAdd} disabled={!newEntry.a.trim() || !newEntry.b.trim()}>Add</Button>
              <Button variant="ghost" size="sm" onClick={() => setAddingNew(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingNew(true)}
            className="flex w-full items-center gap-2 rounded-[10px] border border-dashed border-divider/40 px-4 py-2.5 text-xs text-ink-muted hover:border-divider hover:text-ink transition"
          >
            <span className="text-base leading-none">+</span> Add relationship manually
          </button>
        )}

        {loading ? (
          <p className="text-xs text-ink-muted">Loading…</p>
        ) : sorted.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-ink-muted">
              {filter === "player" && pcName
                ? `No relationships indexed for ${props.playerName} yet.`
                : "No relationships indexed yet."}
            </p>
            <p className="text-xs text-ink-muted/60">Hit Refresh to queue a new index, or add relationships manually above.</p>
          </div>
        ) : (
          sorted.map((rel, i) => (
            <RelationshipCard
              key={`${makePairKey(rel.a, rel.b)}-${i}`}
              entry={rel}
              onSave={(updated) => handleSave(i, updated)}
              onDelete={() => handleDelete(rel)}
            />
          ))
        )}
      </div>
    </div>
  );
}
