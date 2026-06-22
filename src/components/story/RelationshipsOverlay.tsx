import { useEffect, useState } from "react";
import { Button } from "../ui/Button";
import { useStoryEngine } from "../../app/providers/StoryEngineProvider";
import { normalizeStoryStateToV2, safeParseStoryStateData } from "../../lib/storyStateV2";
import type { RelationshipIndexEntry } from "../../types/models";
import { cn } from "../../utils/cn";

const TIER_COLOR: Record<string, string> = {
  friend: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  ally: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  lover: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  stranger: "bg-white/5 text-white/38 border-white/10",
  acquaintance: "bg-white/5 text-white/48 border-white/10",
  rival: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  enemy: "bg-red-500/15 text-red-400 border-red-500/20",
  nemesis: "bg-red-500/15 text-red-400 border-red-500/20",
};

const TIER_ORDER = ["lover", "ally", "friend", "acquaintance", "stranger", "rival", "enemy", "nemesis"];

function sortByTier(rels: RelationshipIndexEntry[]): RelationshipIndexEntry[] {
  return [...rels].sort((a, b) => {
    const ai = a.tier ? TIER_ORDER.indexOf(a.tier) : 99;
    const bi = b.tier ? TIER_ORDER.indexOf(b.tier) : 99;
    return ai - bi;
  });
}

export function RelationshipsOverlay(props: {
  open: boolean;
  storyId: string;
  playerName?: string;
  onClose: () => void;
}) {
  const { fetchStoryState } = useStoryEngine();
  const [relationships, setRelationships] = useState<RelationshipIndexEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "player">("player");

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

  return (
    <div className="fixed inset-0 z-[55] flex flex-col bg-app">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-divider/[0.3] px-4 py-3">
        <div>
          <h2 className="text-base font-bold text-ink">Relationships</h2>
          <p className="text-xs text-ink-muted">{relationships.length} indexed</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Filter toggle */}
          <div className="flex rounded-lg border border-divider/40 bg-panel-muted/50 p-0.5">
            {(["player", "all"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition capitalize",
                  filter === f ? "bg-accent text-accent-foreground" : "text-ink-muted hover:text-ink",
                )}
              >
                {f === "player" ? "My relationships" : "All"}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={props.onClose}>Close</Button>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <p className="text-xs text-ink-muted">Loading…</p>
        ) : sorted.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-ink-muted">
              {filter === "player" && pcName
                ? `No relationships indexed for ${props.playerName} yet.`
                : "No relationships indexed yet."}
            </p>
            <p className="text-xs text-ink-muted/60">Run a deep index from Story Settings → Index/Archive to populate relationships.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((rel, i) => {
              const colorClass = rel.tier ? (TIER_COLOR[rel.tier] ?? TIER_COLOR.stranger) : TIER_COLOR.stranger;
              return (
                <div key={i} className="rounded-[10px] border border-divider/40 bg-panel-muted/40 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{rel.a}</span>
                    <span className="text-xs text-ink-muted">↔</span>
                    <span className="font-semibold text-ink">{rel.b}</span>
                    {rel.tier ? (
                      <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize", colorClass)}>
                        {rel.tier}
                      </span>
                    ) : null}
                  </div>
                  {rel.summary ? (
                    <p className="mt-1.5 text-xs text-ink-muted">{rel.summary}</p>
                  ) : null}
                  {Array.isArray(rel.history) && rel.history.length ? (
                    <div className="mt-2 space-y-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted/50">Key Moments</p>
                      {rel.history.map((h, hi) => (
                        <div key={hi} className="flex items-start gap-1.5 text-xs text-ink-muted">
                          <span className="mt-px shrink-0 text-[10px] text-white/25">#{hi + 1}</span>
                          <span>{h.summary}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {(() => {
                    const metrics = [
                      typeof rel.friendship === "number" ? `Friendship ${Math.round(rel.friendship)}` : null,
                      typeof rel.trust === "number" ? `Trust ${Math.round(rel.trust)}` : null,
                      typeof rel.respect === "number" ? `Respect ${Math.round(rel.respect)}` : null,
                      typeof rel.affection === "number" ? `Affection ${Math.round(rel.affection)}` : null,
                      typeof rel.hostility === "number" ? `Hostility ${Math.round(rel.hostility)}` : null,
                      typeof rel.fear === "number" ? `Fear ${Math.round(rel.fear)}` : null,
                    ].filter(Boolean);
                    return metrics.length ? (
                      <p className="mt-1.5 text-[11px] text-white/30">{metrics.join(" · ")}</p>
                    ) : null;
                  })()}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
