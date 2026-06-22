import { useEffect, useState } from "react";
import { Button } from "../ui/Button";
import { useStoryEngine } from "../../app/providers/StoryEngineProvider";
import { safeParseStoryStateData } from "../../lib/storyStateV2";
import {
  applyStatChange,
  defaultRpStats,
  effectiveCoreStats,
  formatGold,
  undoLastChange,
} from "../../lib/rpStats";
import type { RpConfig, RpStats, Story } from "../../types/models";
import { cn } from "../../utils/cn";

const STAT_LABELS: Record<string, string> = {
  str: "STR",
  dex: "DEX",
  con: "CON",
  int: "INT",
  wis: "WIS",
  cha: "CHA",
};

function StatBox({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  function commit() {
    const n = parseInt(draft, 10);
    if (!isNaN(n) && n !== value) onChange(n);
    setEditing(false);
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">{label}</span>
      {editing ? (
        <input
          autoFocus
          className="h-10 w-14 rounded-lg border border-accent/40 bg-panel-muted text-center text-lg font-bold text-ink outline-none"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex h-10 w-14 items-center justify-center rounded-lg border border-divider/40 bg-panel-muted text-lg font-bold text-ink transition hover:border-accent/40"
        >
          {value}
        </button>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  decimals,
  onChange,
  suffix,
  min,
}: {
  label: string;
  value: number;
  decimals?: boolean;
  onChange: (v: number) => void;
  suffix?: string;
  min?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(decimals ? value.toFixed(2) : String(value));

  useEffect(() => {
    if (!editing) setDraft(decimals ? value.toFixed(2) : String(value));
  }, [value, editing, decimals]);

  function commit() {
    const n = decimals ? parseFloat(draft) : parseInt(draft, 10);
    if (!isNaN(n) && n !== value) {
      onChange(min !== undefined ? Math.max(min, n) : n);
    }
    setEditing(false);
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-divider/40 bg-panel-muted/50 px-3 py-2">
      <span className="text-sm text-ink-soft">{label}</span>
      <div className="flex items-center gap-1.5">
        {editing ? (
          <input
            autoFocus
            className="w-24 rounded border border-accent/40 bg-panel-muted px-2 py-1 text-right text-sm font-semibold text-ink outline-none"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded border border-transparent px-2 py-1 text-right text-sm font-semibold text-ink transition hover:border-accent/30 hover:bg-panel-muted"
          >
            {decimals ? value.toFixed(2) : value}
          </button>
        )}
        {suffix ? <span className="text-xs text-ink-muted">{suffix}</span> : null}
      </div>
    </div>
  );
}

type Tab = "stats" | "hp" | "currency" | "changelog";

export function RPCharacterSheetOverlay(props: {
  open: boolean;
  story: Story;
  onClose: () => void;
}) {
  const { fetchStoryState, updateRpStats } = useStoryEngine();
  const [rpStats, setRpStats] = useState<RpStats | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("stats");
  const [saving, setSaving] = useState(false);

  const config: RpConfig = props.story.rpConfig ?? {
    currencyName: "Gold",
    currencyDecimals: false,
    maxHp: 100,
    startingGold: 0,
    coreStats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  };

  useEffect(() => {
    if (!props.open) return;
    fetchStoryState(props.story.id).then((state) => {
      if (!state) {
        setRpStats(defaultRpStats(config));
        return;
      }
      const parsed = safeParseStoryStateData(state.stateJson);
      setRpStats((parsed as any)?.rpStats ?? defaultRpStats(config));
    });
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [props.open, props.story.id]);

  if (!props.open || !rpStats) return null;

  const stats = effectiveCoreStats(rpStats, config);

  async function save(next: RpStats) {
    setRpStats(next);
    setSaving(true);
    try {
      await updateRpStats(props.story.id, next);
    } finally {
      setSaving(false);
    }
  }

  function handleStatChange(key: string, newVal: number) {
    const current = (stats as any)[key] ?? 10;
    void save(applyStatChange(rpStats!, { field: key, from: current, to: newVal, reason: "Manual edit" }));
  }

  return (
    <div className="fixed inset-0 z-[55] flex flex-col bg-app">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-divider/[0.3] px-4 py-3">
        <div>
          <h2 className="text-base font-bold text-ink">Character Sheet</h2>
          <p className="text-xs text-ink-muted">{props.story.title}</p>
        </div>
        <div className="flex items-center gap-2">
          {saving ? <span className="text-xs text-ink-muted">Saving…</span> : null}
          <Button variant="ghost" size="sm" onClick={props.onClose}>
            Close
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 gap-1 border-b border-divider/[0.3] px-4 pt-2">
        {(["stats", "hp", "currency", "changelog"] as Tab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={cn(
              "rounded-t-md px-4 py-2 text-xs font-semibold capitalize transition",
              activeTab === tab
                ? "border-b-2 border-accent text-ink"
                : "text-ink-muted hover:text-ink",
            )}
          >
            {tab === "changelog" ? "Log" : tab === "hp" ? "HP" : tab}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {activeTab === "stats" && (
          <div className="space-y-4">
            <p className="text-xs text-ink-muted">Click any value to edit it.</p>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {Object.entries(STAT_LABELS).map(([key, label]) => (
                <StatBox
                  key={key}
                  label={label}
                  value={(stats as any)[key] ?? 10}
                  onChange={(v) => handleStatChange(key, v)}
                />
              ))}
            </div>
          </div>
        )}

        {activeTab === "hp" && (
          <div className="space-y-3">
            <NumberField
              label="Current HP"
              value={rpStats.hp}
              min={0}
              onChange={(v) =>
                void save(applyStatChange(rpStats, { field: "hp", from: rpStats.hp, to: v, reason: "Manual edit" }))
              }
              suffix={`/ ${config.maxHp}`}
            />
            <div className="h-2 overflow-hidden rounded-full bg-divider/30">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.min(100, Math.max(0, (rpStats.hp / config.maxHp) * 100))}%` }}
              />
            </div>

            {Object.keys(rpStats.npcHp).length > 0 ? (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-ink-muted">NPCs</p>
                {Object.entries(rpStats.npcHp).map(([key, entry]) => (
                  <div key={key} className="space-y-1">
                    <p className="text-sm font-medium text-ink-soft">{entry.name}</p>
                    <NumberField
                      label="HP"
                      value={entry.current}
                      min={0}
                      onChange={(v) => {
                        const next: RpStats = {
                          ...rpStats,
                          npcHp: { ...rpStats.npcHp, [key]: { ...entry, current: v } },
                        };
                        void save(next);
                      }}
                      suffix={`/ ${entry.max}`}
                    />
                    <div className="h-1.5 overflow-hidden rounded-full bg-divider/30">
                      <div
                        className="h-full rounded-full bg-orange-500 transition-all"
                        style={{ width: `${Math.min(100, Math.max(0, (entry.current / entry.max) * 100))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <p className="text-xs text-ink-muted">No NPC HP tracked yet. NPCs will appear here when the AI assigns them HP.</p>
            )}
          </div>
        )}

        {activeTab === "currency" && (
          <div className="space-y-3">
            <NumberField
              label={config.currencyName}
              value={rpStats.gold}
              decimals={config.currencyDecimals}
              min={0}
              onChange={(v) =>
                void save(applyStatChange(rpStats, { field: "gold", from: rpStats.gold, to: v, reason: "Manual edit" }))
              }
            />
            <p className="text-xs text-ink-muted">
              Current balance: {formatGold(rpStats.gold, config)}
            </p>
          </div>
        )}

        {activeTab === "changelog" && (
          <div className="space-y-2">
            {rpStats.changelog.length === 0 ? (
              <p className="text-xs text-ink-muted">No changes recorded yet.</p>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void save(undoLastChange(rpStats))}
                  className="mb-2"
                >
                  Undo last change
                </Button>
                {rpStats.changelog.map((entry, i) => (
                  <div key={i} className="rounded-lg border border-divider/40 bg-panel-muted/40 px-3 py-2 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-ink-soft capitalize">{entry.field}</span>
                      <span className="text-ink-muted">
                        {entry.from} → {entry.to}
                      </span>
                    </div>
                    <p className="mt-0.5 text-ink-muted">{entry.reason}</p>
                    <p className="mt-0.5 text-white/25">{new Date(entry.ts).toLocaleTimeString()}</p>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
