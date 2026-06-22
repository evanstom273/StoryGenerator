import { useEffect, useState } from "react";
import { Button } from "../ui/Button";
import { useStoryEngine } from "../../app/providers/StoryEngineProvider";
import { safeParseStoryStateData } from "../../lib/storyStateV2";
import {
  applyStatChange,
  DEFAULT_RP_CONFIG,
  defaultRpStats,
  effectiveCoreStats,
  formatGold,
  undoLastChange,
} from "../../lib/rpStats";
import {
  buildRpExportJson,
  buildRpExportMarkdown,
  buildRpExportText,
  buildRpExportPdf,
  type RpExportData,
} from "../../lib/rpExport";
import { downloadFile } from "../../lib/download";
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

type Tab = "stats" | "hp" | "currency" | "changelog" | "config" | "export";

export function RPCharacterSheetOverlay(props: {
  open: boolean;
  story: Story;
  onClose: () => void;
}) {
  const { fetchStoryState, updateRpStats, updateStory, messages: allMessages } = useStoryEngine();
  const [rpStats, setRpStats] = useState<RpStats | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("stats");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<"json" | "md" | "txt" | "pdf" | null>(null);
  const [rpEnabled, setRpEnabled] = useState(props.story.rpMode ?? false);
  const [togglingRp, setTogglingRp] = useState(false);
  const [configDraft, setConfigDraft] = useState<RpConfig>(props.story.rpConfig ?? DEFAULT_RP_CONFIG);

  useEffect(() => {
    setRpEnabled(props.story.rpMode ?? false);
    setConfigDraft(props.story.rpConfig ?? DEFAULT_RP_CONFIG);
  }, [props.story.rpMode, props.story.rpConfig]);

  const config: RpConfig = props.story.rpConfig ?? DEFAULT_RP_CONFIG;

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

  if (!props.open) return null;

  const stats = rpStats ? effectiveCoreStats(rpStats, config) : config.coreStats;

  async function save(next: RpStats) {
    setRpStats(next);
    setSaving(true);
    try {
      await updateRpStats(props.story.id, next);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleRp(enabled: boolean) {
    setRpEnabled(enabled);
    setTogglingRp(true);
    try {
      await updateStory(props.story.id, { rpMode: enabled, rpConfig: enabled ? configDraft : props.story.rpConfig });
      if (enabled && !rpStats) {
        setRpStats(defaultRpStats(configDraft));
      }
    } finally {
      setTogglingRp(false);
    }
  }

  async function handleSaveConfig() {
    setSaving(true);
    try {
      await updateStory(props.story.id, { rpConfig: configDraft });
    } finally {
      setSaving(false);
    }
  }

  function handleStatChange(key: string, newVal: number) {
    if (!rpStats) return;
    const current = (stats as any)[key] ?? 10;
    void save(applyStatChange(rpStats, { field: key, from: current, to: newVal, reason: "Manual edit" }));
  }

  async function handleExport(format: "json" | "md" | "txt" | "pdf") {
    if (!rpStats) return;
    setExporting(format);
    try {
      const storyMessages = allMessages.filter(
        (m) => m.storyId === props.story.id && m.role !== "system",
      );
      const exportData: RpExportData = {
        storyTitle: props.story.title,
        exportedAt: new Date().toISOString(),
        rpStats,
        rpConfig: config,
        messages: storyMessages,
      };
      const safe = props.story.title.replace(/[^a-zA-Z0-9_-]/g, "_");
      if (format === "json") {
        await downloadFile(`${safe}-rp-export.json`, buildRpExportJson(exportData), "application/json");
      } else if (format === "md") {
        await downloadFile(`${safe}-rp-export.md`, buildRpExportMarkdown(exportData), "text/markdown");
      } else if (format === "txt") {
        await downloadFile(`${safe}-rp-export.txt`, buildRpExportText(exportData), "text/plain");
      } else {
        const blob = await buildRpExportPdf(exportData);
        await downloadFile(`${safe}-rp-export.pdf`, blob, "application/pdf");
      }
    } finally {
      setExporting(null);
    }
  }

  const tabs: { id: Tab; label: string }[] = rpEnabled
    ? [
        { id: "stats", label: "Stats" },
        { id: "hp", label: "HP" },
        { id: "currency", label: config.currencyName || "Currency" },
        { id: "changelog", label: "Log" },
        { id: "config", label: "Config" },
        { id: "export", label: "Export" },
      ]
    : [{ id: "config", label: "Config" }];

  return (
    <div className="fixed inset-0 z-[55] flex flex-col bg-app">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-divider/[0.3] px-4 py-3">
        <div>
          <h2 className="text-base font-bold text-ink">Character Sheet</h2>
          <p className="text-xs text-ink-muted">{props.story.title}</p>
        </div>
        <div className="flex items-center gap-3">
          {saving || togglingRp ? <span className="text-xs text-ink-muted">Saving…</span> : null}
          {/* RP Mode toggle */}
          <label className="flex cursor-pointer items-center gap-2">
            <span className="text-xs text-ink-muted">RP Mode</span>
            <button
              type="button"
              role="switch"
              aria-checked={rpEnabled}
              disabled={togglingRp}
              onClick={() => void handleToggleRp(!rpEnabled)}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                rpEnabled ? "bg-accent" : "bg-divider/60",
              )}
            >
              <span
                className={cn(
                  "pointer-events-none my-0.5 ml-0.5 inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
                  rpEnabled ? "translate-x-4" : "translate-x-0",
                )}
              />
            </button>
          </label>
          <Button variant="ghost" size="sm" onClick={props.onClose}>
            Close
          </Button>
        </div>
      </div>

      {!rpEnabled ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm text-ink-muted">RP Mode is off for this story.</p>
          <p className="text-xs text-ink-muted/60">Enable it above to track HP, currency, and core stats. The AI will suggest changes during play.</p>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex shrink-0 gap-1 border-b border-divider/[0.3] px-4 pt-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "rounded-t-md px-4 py-2 text-xs font-semibold transition",
                  activeTab === tab.id
                    ? "border-b-2 border-accent text-ink"
                    : "text-ink-muted hover:text-ink",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Body */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {activeTab === "stats" && rpStats && (
              <div className="space-y-4">
                <p className="text-xs text-ink-muted">Click any value to edit.</p>
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

            {activeTab === "hp" && rpStats && (
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
                  <p className="text-xs text-ink-muted">No NPC HP tracked yet. NPCs appear here when the AI assigns them HP.</p>
                )}
              </div>
            )}

            {activeTab === "currency" && rpStats && (
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
                <p className="text-xs text-ink-muted">Balance: {formatGold(rpStats.gold, config)}</p>
              </div>
            )}

            {activeTab === "changelog" && rpStats && (
              <div className="space-y-2">
                {rpStats.changelog.length === 0 ? (
                  <p className="text-xs text-ink-muted">No changes recorded yet.</p>
                ) : (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => void save(undoLastChange(rpStats))} className="mb-2">
                      Undo last change
                    </Button>
                    {rpStats.changelog.map((entry, i) => (
                      <div key={i} className="rounded-lg border border-divider/40 bg-panel-muted/40 px-3 py-2 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold capitalize text-ink-soft">{entry.field}</span>
                          <span className="text-ink-muted">{entry.from} → {entry.to}</span>
                        </div>
                        <p className="mt-0.5 text-ink-muted">{entry.reason}</p>
                        <p className="mt-0.5 text-white/25">{new Date(entry.ts).toLocaleTimeString()}</p>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            {activeTab === "export" && rpStats && (
              <div className="space-y-4">
                <p className="text-xs text-ink-muted">
                  Download a snapshot of your character sheet, stat changelog, NPC HP, and the full story transcript.
                </p>
                <div className="space-y-2">
                  {(
                    [
                      { fmt: "json", label: "JSON", desc: "Structured data — import or process elsewhere" },
                      { fmt: "md", label: "Markdown", desc: "Human-readable with tables and headers" },
                      { fmt: "txt", label: "Plain Text", desc: "Simple text file, no markup" },
                      { fmt: "pdf", label: "PDF", desc: "Formatted document for printing or sharing" },
                    ] as const
                  ).map(({ fmt, label, desc }) => (
                    <div
                      key={fmt}
                      className="flex items-center justify-between gap-3 rounded-lg border border-divider/40 bg-panel-muted/40 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-semibold text-ink">{label}</p>
                        <p className="text-xs text-ink-muted">{desc}</p>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={exporting !== null}
                        onClick={() => void handleExport(fmt)}
                      >
                        {exporting === fmt ? "…" : "Download"}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "config" && (
              <div className="space-y-3">
                <label className="block space-y-1">
                  <span className="text-xs text-ink-muted">Currency name</span>
                  <input
                    className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-2 text-sm text-ink outline-none transition focus:border-accent/[0.4]"
                    value={configDraft.currencyName}
                    onChange={(e) => setConfigDraft((c) => ({ ...c, currencyName: e.target.value }))}
                    placeholder="Gold"
                  />
                </label>

                <label className="flex items-center justify-between gap-3">
                  <span className="text-xs text-ink-muted">Allow decimal amounts (e.g. $1.50)</span>
                  <select
                    className="rounded-[8px] border border-divider bg-panel-muted/50 px-2 py-1.5 text-sm text-ink outline-none"
                    value={configDraft.currencyDecimals ? "yes" : "no"}
                    onChange={(e) => setConfigDraft((c) => ({ ...c, currencyDecimals: e.target.value === "yes" }))}
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-xs text-ink-muted">Max HP</span>
                  <input
                    type="number"
                    min={1}
                    className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-2 text-sm text-ink outline-none transition focus:border-accent/[0.4]"
                    value={configDraft.maxHp}
                    onChange={(e) => setConfigDraft((c) => ({ ...c, maxHp: Math.max(1, parseInt(e.target.value) || 1) }))}
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs text-ink-muted">Starting {configDraft.currencyName || "Gold"}</span>
                  <input
                    type="number"
                    min={0}
                    step={configDraft.currencyDecimals ? 0.01 : 1}
                    className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-2 text-sm text-ink outline-none transition focus:border-accent/[0.4]"
                    value={configDraft.startingGold}
                    onChange={(e) => setConfigDraft((c) => ({ ...c, startingGold: Math.max(0, parseFloat(e.target.value) || 0) }))}
                  />
                </label>

                <div className="space-y-2">
                  <p className="text-xs text-ink-muted">Starting core stats</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(["str", "dex", "con", "int", "wis", "cha"] as const).map((stat) => (
                      <label key={stat} className="block space-y-0.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">{stat}</span>
                        <input
                          type="number"
                          min={1}
                          max={30}
                          className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-2 py-1.5 text-center text-sm text-ink outline-none transition focus:border-accent/[0.4]"
                          value={configDraft.coreStats[stat]}
                          onChange={(e) => setConfigDraft((c) => ({ ...c, coreStats: { ...c.coreStats, [stat]: Math.max(1, parseInt(e.target.value) || 1) } }))}
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <Button variant="primary" size="sm" className="w-full" disabled={saving} onClick={() => void handleSaveConfig()}>
                  {saving ? "Saving…" : "Save Config"}
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
