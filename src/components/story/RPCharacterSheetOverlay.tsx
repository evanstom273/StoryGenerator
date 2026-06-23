import { useEffect, useState } from "react";
import { Button } from "../ui/Button";
import { useStoryEngine } from "../../app/providers/StoryEngineProvider";
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
import { createAIProvider } from "../../lib/ai/providerFactory";
import { getProviderDefaultModel } from "../../lib/ai/models";
import type { RpCalendarConfig, RpConfig, RpRecurringEvent, RpRecurringFrequency, RpStats, RpTimeState, Story } from "../../types/models";
import { computeInitialNextDue, formatTime, formatTimeShort } from "../../lib/rpTime";
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

type Tab = "profile" | "stats" | "hp" | "currency" | "eventlog" | "time" | "changelog" | "config";

function formatEventSchedule(event: RpRecurringEvent): string {
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  if (event.frequency === "weekly") {
    const day = event.dayOfWeek != null ? DOW[event.dayOfWeek] ?? "Mon" : "week";
    return `Every ${day}`;
  }
  if (event.frequency === "monthly") {
    return event.dayOfMonth != null ? `Monthly on the ${event.dayOfMonth}` : "Monthly";
  }
  if (event.frequency === "annually") {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const m = event.month != null ? (months[(event.month - 1) % 12] ?? "") : "";
    const d = event.dayOfMonth != null ? ` ${event.dayOfMonth}` : "";
    return `Annually on ${m}${d}`.trim();
  }
  return event.frequency;
}

export function RPCharacterSheetOverlay(props: {
  open: boolean;
  story: Story;
  onClose: () => void;
  refreshKey?: number;
  onGoldChange?: (gold: number) => void;
  universeLore?: string;
}) {
  const { fetchStoryState, updateRpStats, updateStory, messages: allMessages, getPlayerCharacterById, aiSettings } = useStoryEngine();
  const playerCharacter = getPlayerCharacterById(props.story.playerCharacterId);
  const [rpStats, setRpStats] = useState<RpStats | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<"json" | "md" | "txt" | "pdf" | null>(null);
  const [rpEnabled, setRpEnabled] = useState(props.story.rpMode ?? false);
  const [togglingRp, setTogglingRp] = useState(false);
  const [configDraft, setConfigDraft] = useState<RpConfig>(props.story.rpConfig ?? DEFAULT_RP_CONFIG);
  const [suggestingGold, setSuggestingGold] = useState(false);
  const [suggestGoldError, setSuggestGoldError] = useState<string | null>(null);

  // Time tab state
  const [timeDraft, setTimeDraft] = useState({ year: "", month: "", day: "", hour: "", minute: "" });
  const [savingTime, setSavingTime] = useState(false);
  const [calDraft, setCalDraft] = useState({ yearSuffix: "", monthNames: "", weekdayNames: "" });
  const [newEventDraft, setNewEventDraft] = useState<{
    label: string;
    amount: string;
    frequency: RpRecurringFrequency;
    dayOfWeek: number;
    dayOfMonth: number;
    month: number;
  } | null>(null);

  useEffect(() => {
    setRpEnabled(props.story.rpMode ?? false);
    setConfigDraft(props.story.rpConfig ?? DEFAULT_RP_CONFIG);
  }, [props.story.rpMode, props.story.rpConfig]);

  useEffect(() => {
    if (activeTab !== "time") return;
    const t = rpStats?.timeState;
    if (t) {
      setTimeDraft({ year: String(t.year), month: String(t.month), day: String(t.day), hour: String(t.hour), minute: String(t.minute) });
    } else {
      const now = new Date();
      setTimeDraft({ year: String(now.getFullYear()), month: String(now.getMonth() + 1), day: String(now.getDate()), hour: String(now.getHours()), minute: String(now.getMinutes()) });
    }
  }, [activeTab, rpStats?.timeState]);

  useEffect(() => {
    if (activeTab !== "time") return;
    setCalDraft({
      yearSuffix: configDraft.calendarConfig?.yearSuffix ?? "",
      monthNames: configDraft.calendarConfig?.monthNames?.join(", ") ?? "",
      weekdayNames: configDraft.calendarConfig?.weekdayNames?.join(", ") ?? "",
    });
  }, [activeTab, configDraft.calendarConfig]);

  const config: RpConfig = props.story.rpConfig ?? DEFAULT_RP_CONFIG;

  useEffect(() => {
    if (!props.open) return;
    fetchStoryState(props.story.id).then((state) => {
      if (!state) {
        setRpStats(defaultRpStats(config));
        return;
      }
      // Read rpStats directly from raw JSON — safeParseStoryStateData requires full
      // Story State V2 structure which new stories won't have yet, causing loss of
      // saved timeState and other rpStats fields on re-fetch.
      let savedRpStats: RpStats | null = null;
      try {
        const raw = JSON.parse(state.stateJson) as unknown;
        if (raw && typeof raw === "object" && "rpStats" in raw && raw.rpStats && typeof raw.rpStats === "object") {
          savedRpStats = raw.rpStats as RpStats;
        }
      } catch {}
      setRpStats(savedRpStats ?? defaultRpStats(config));
    });
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [props.open, props.story.id, props.refreshKey]);

  if (!props.open) return null;

  const stats = rpStats ? effectiveCoreStats(rpStats, config) : config.coreStats;

  async function save(next: RpStats) {
    setRpStats(next);
    setSaving(true);
    try {
      await updateRpStats(props.story.id, next);
      props.onGoldChange?.(next.gold);
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
      if (enabled && !rpStats?.timeState) {
        setActiveTab("time");
      }
    } finally {
      setTogglingRp(false);
    }
  }

  async function handleSaveConfig() {
    setSaving(true);
    try {
      await updateStory(props.story.id, { rpConfig: configDraft });
      if (rpStats && configDraft.startingGold !== config.startingGold) {
        await save({ ...rpStats, gold: configDraft.startingGold });
      }
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
        playerCharacter,
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

  async function suggestStartingGold() {
    if (!playerCharacter || !aiSettings) return;
    setSuggestingGold(true);
    setSuggestGoldError(null);
    try {
      const providerType = aiSettings.activeProviderType;
      const apiKey = aiSettings.apiKeys?.[providerType]?.trim() ?? "";
      const model = getProviderDefaultModel(providerType);
      if (!apiKey) { setSuggestGoldError("No API key configured"); return; }
      const provider = createAIProvider(providerType);
      const profileText = [
        playerCharacter.name ? `Name: ${playerCharacter.name}` : "",
        playerCharacter.age ? `Age: ${playerCharacter.age}` : "",
        playerCharacter.species ? `Species: ${playerCharacter.species}` : "",
        playerCharacter.background ? `Background: ${playerCharacter.background}` : "",
        playerCharacter.goals ? `Goals: ${playerCharacter.goals}` : "",
        playerCharacter.notes ? `Notes: ${playerCharacter.notes}` : "",
      ].filter(Boolean).join("\n");
      const settingContext = props.universeLore
        ? `Setting/universe: ${props.universeLore.slice(0, 300)}`
        : "";
      const prompt = `You are a narrative roleplay assistant. Estimate a realistic starting financial balance for this character in ${config.currencyName || "gold"}.

${settingContext ? `${settingContext}\n\n` : ""}This is their CURRENT LIQUID BALANCE — cash on hand or in a bank account — not net worth or total assets. Scale appropriately for the setting era:
- Modern (${config.currencyName}): young child $5–20, teenager $20–150, college student $50–500, adult $500–5,000, wealthy $5,000+
- Fantasy gold: peasant 1–10 gp, artisan 20–100 gp, merchant 100–500 gp, noble 500+ gp
- Historical coin: laborer 1–5, tradesperson 10–50, merchant 50–200
- Sci-fi credits: worker 50–200, professional 200–1,000, wealthy 1,000+

Use the setting, the character's age, background, and circumstances to pick a specific, believable number. Reply with a SINGLE INTEGER ONLY — no explanation, no currency symbol, no text, no decimal point.

Character:
${profileText}`;
      const result = await provider.generateResponse({
        apiKey,
        model,
        messages: [{ role: "user", content: prompt }],
      });
      const suggested = parseFloat(result.content.replace(/[^0-9.]/g, ""));
      if (!isNaN(suggested) && suggested >= 0) {
        setConfigDraft((c) => ({ ...c, startingGold: config.currencyDecimals ? suggested : Math.round(suggested) }));
      } else {
        setSuggestGoldError("Could not parse suggestion");
      }
    } catch {
      setSuggestGoldError("AI request failed");
    } finally {
      setSuggestingGold(false);
    }
  }

  async function handleSaveTime() {
    if (!rpStats) return;
    const year = parseInt(timeDraft.year) || 2024;
    const month = Math.max(1, Math.min(12, parseInt(timeDraft.month) || 1));
    const day = Math.max(1, Math.min(31, parseInt(timeDraft.day) || 1));
    const hour = Math.max(0, Math.min(23, parseInt(timeDraft.hour) || 0));
    const minute = Math.max(0, Math.min(59, parseInt(timeDraft.minute) || 0));
    const storyDay = rpStats.timeState?.storyDay ?? 1;
    const newTimeState: RpTimeState = { year, month, day, hour, minute, storyDay };
    setSavingTime(true);
    try {
      await save({ ...rpStats, timeState: newTimeState });
    } finally {
      setSavingTime(false);
    }
  }

  async function handleSaveCalendar() {
    const yearSuffix = calDraft.yearSuffix.trim() || undefined;
    const monthNames = calDraft.monthNames.trim()
      ? calDraft.monthNames.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 12)
      : undefined;
    const weekdayNames = calDraft.weekdayNames.trim()
      ? calDraft.weekdayNames.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 7)
      : undefined;
    const calendarConfig: RpCalendarConfig | undefined = (yearSuffix || monthNames || weekdayNames)
      ? { yearSuffix, monthNames, weekdayNames }
      : undefined;
    const newConfig: RpConfig = { ...configDraft, calendarConfig };
    setConfigDraft(newConfig);
    setSaving(true);
    try {
      await updateStory(props.story.id, { rpConfig: newConfig });
    } finally {
      setSaving(false);
    }
  }

  function handleAddRecurringEvent() {
    if (!newEventDraft) return;
    const label = newEventDraft.label.trim();
    const amount = parseFloat(newEventDraft.amount) || 0;
    if (!label) return;
    const { frequency, dayOfWeek, dayOfMonth, month } = newEventDraft;
    const nextDue: RpTimeState = rpStats?.timeState
      ? computeInitialNextDue(rpStats.timeState, frequency, dayOfWeek, dayOfMonth)
      : { year: 2024, month: 1, day: 1, hour: 0, minute: 0, storyDay: 1 };
    const event: RpRecurringEvent = {
      id: `evt_${Date.now()}`,
      label,
      amount,
      frequency,
      ...(frequency === "weekly" ? { dayOfWeek } : {}),
      ...(frequency === "monthly" ? { dayOfMonth } : {}),
      ...(frequency === "annually" ? { dayOfMonth, month } : {}),
      nextDue,
    };
    const newConfig: RpConfig = {
      ...configDraft,
      recurringEvents: [...(configDraft.recurringEvents ?? []), event],
    };
    setConfigDraft(newConfig);
    setNewEventDraft(null);
    void updateStory(props.story.id, { rpConfig: newConfig });
  }

  function handleRemoveRecurringEvent(id: string) {
    const newConfig: RpConfig = {
      ...configDraft,
      recurringEvents: (configDraft.recurringEvents ?? []).filter((e) => e.id !== id),
    };
    setConfigDraft(newConfig);
    void updateStory(props.story.id, { rpConfig: newConfig });
  }

  const tabs: { id: Tab; label: string }[] = rpEnabled
    ? [
        { id: "profile", label: "Profile" },
        { id: "stats", label: "Stats" },
        { id: "hp", label: "HP" },
        { id: "currency", label: config.currencyName || "Currency" },
        { id: "eventlog", label: "Events" },
        { id: "time", label: "Time" },
        { id: "changelog", label: "Log" },
        { id: "config", label: "Settings" },
      ]
    : [{ id: "config", label: "Settings" }];

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
          <div className="flex shrink-0 overflow-x-auto border-b border-divider/[0.3] px-2 pt-2 scrollbar-none">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-t-md px-3 py-2 text-xs font-semibold transition",
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
            {activeTab === "profile" && (
              <div className="space-y-4">
                {!playerCharacter ? (
                  <p className="text-xs text-ink-muted">Character not found.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border border-divider/40 bg-panel-muted/40 px-4 py-3">
                      {[
                        ["Name", playerCharacter.name],
                        ["Age", playerCharacter.age],
                        ["Species", playerCharacter.species],
                        ["Gender", playerCharacter.gender],
                        ["Pronouns", playerCharacter.pronouns],
                      ].filter(([, v]) => v?.trim()).map(([label, val]) => (
                        <div key={label}>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">{label}</p>
                          <p className="text-sm text-ink">{val}</p>
                        </div>
                      ))}
                    </div>
                    {[
                      ["Appearance", playerCharacter.appearance],
                      ["Personality", playerCharacter.personality],
                      ["Background", playerCharacter.background],
                      ["Goals", playerCharacter.goals],
                      ["Notes", playerCharacter.notes],
                    ].filter(([, v]) => (v as string)?.trim()).map(([label, val]) => (
                      <div key={label as string} className="space-y-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">{label}</p>
                        <p className="whitespace-pre-wrap text-sm text-ink">{val as string}</p>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

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
                    void save(applyStatChange(rpStats, { field: "gold", from: rpStats.gold, to: v, reason: "Manual edit", storyTime: rpStats.timeState, transactionType: "adjustment" }))
                  }
                />
                <p className="text-xs text-ink-muted">Balance: {formatGold(rpStats.gold, config)}</p>
                {rpStats.changelog.some((e) => e.field === "gold") && (
                  <div className="space-y-1 border-t border-divider/40 pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Transaction History</p>
                    <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-2 border-b border-divider/40 pb-1 text-[10px] uppercase tracking-wider text-ink-muted">
                      <span>Time</span><span>Description</span><span>Amount</span><span>Balance</span>
                    </div>
                    {rpStats.changelog.filter((e) => e.field === "gold").map((e, i) => {
                      const delta = e.to - e.from;
                      const typeLabel = e.transactionType ?? (delta >= 0 ? "income" : "expense");
                      const typeColors: Record<string, string> = {
                        income: "text-emerald-400",
                        expense: "text-red-400",
                        adjustment: "text-blue-400",
                        recurring: "text-purple-400",
                      };
                      const timeStr = e.storyTime
                        ? formatTimeShort(e.storyTime, configDraft)
                        : new Date(e.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                      return (
                        <div key={i} className="grid grid-cols-[auto_1fr_auto_auto] gap-x-2 items-baseline border-b border-divider/20 py-1 text-xs">
                          <span className="shrink-0 text-ink-muted">{timeStr}</span>
                          <span className="truncate text-ink">{e.reason}</span>
                          <span className={cn("shrink-0 font-mono", typeColors[typeLabel] ?? "text-ink-muted")}>
                            {delta >= 0 ? "+" : ""}{config.currencyDecimals ? delta.toFixed(2) : String(Math.round(delta))}
                          </span>
                          <span className="shrink-0 font-mono text-ink-muted">{formatGold(e.to, configDraft)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === "eventlog" && rpStats && (
              <div className="space-y-2">
                {!rpStats.eventLog || rpStats.eventLog.length === 0 ? (
                  <p className="text-xs text-ink-muted">No RP events recorded yet.</p>
                ) : (
                  <>
                    {rpStats.eventLog.map((entry, i) => {
                      const age = Date.now() - entry.ts;
                      const relTime =
                        age < 60_000
                          ? "just now"
                          : age < 3_600_000
                          ? `${Math.floor(age / 60_000)}m ago`
                          : age < 86_400_000
                          ? `${Math.floor(age / 3_600_000)}h ago`
                          : `${Math.floor(age / 86_400_000)}d ago`;
                      return (
                        <div key={i} className="rounded-lg border border-divider/40 bg-panel-muted/40 px-3 py-2 text-xs">
                          <p className="text-ink">{entry.summary}</p>
                          <p className="mt-0.5 text-white/25">{relTime}</p>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}

            {activeTab === "time" && (
              <div className="space-y-4">
                {/* Current time display */}
                <div className="rounded-lg border border-divider/40 bg-panel-muted/40 px-4 py-3 text-center">
                  {rpStats?.timeState ? (
                    <>
                      <p className="text-base font-semibold text-ink">{formatTime(rpStats.timeState, config)}</p>
                      <p className="mt-0.5 text-xs text-ink-muted">In-story time</p>
                    </>
                  ) : (
                    <p className="text-sm text-ink-muted">Story clock not set — set a starting date and time below.</p>
                  )}
                </div>

                {/* Set date/time form */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                    {rpStats?.timeState ? "Override Date & Time" : "Set Starting Date & Time"}
                  </p>
                  <div className="grid grid-cols-5 gap-2">
                    {(["year", "month", "day", "hour", "minute"] as const).map((field) => (
                      <label key={field} className="space-y-0.5">
                        <span className="block text-[10px] uppercase tracking-wider text-ink-muted">{field}</span>
                        <input
                          type="number"
                          className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-1.5 py-1.5 text-center text-sm text-ink outline-none transition focus:border-accent/[0.4]"
                          value={timeDraft[field]}
                          onChange={(e) => setTimeDraft((d) => ({ ...d, [field]: e.target.value }))}
                          min={field === "year" ? 1 : field === "hour" ? 0 : field === "minute" ? 0 : 1}
                          max={field === "month" ? 12 : field === "day" ? 31 : field === "hour" ? 23 : field === "minute" ? 59 : undefined}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => {
                      const now = new Date();
                      setTimeDraft({ year: String(now.getFullYear()), month: String(now.getMonth() + 1), day: String(now.getDate()), hour: String(now.getHours()), minute: String(now.getMinutes()) });
                    }}>
                      Now
                    </Button>
                    <Button variant="primary" size="sm" disabled={savingTime || !rpStats} onClick={() => void handleSaveTime()}>
                      {savingTime ? "Saving…" : "Set Time"}
                    </Button>
                  </div>
                </div>

                {/* Calendar config */}
                <div className="space-y-2 border-t border-divider/40 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Calendar</p>
                  <label className="block space-y-1">
                    <span className="text-xs text-ink-muted">Year suffix (e.g. CE, 3E, BBY)</span>
                    <input
                      className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-2 text-sm text-ink outline-none transition focus:border-accent/[0.4]"
                      placeholder="Leave blank for none"
                      value={calDraft.yearSuffix}
                      onChange={(e) => setCalDraft((d) => ({ ...d, yearSuffix: e.target.value }))}
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs text-ink-muted">Month names (comma-separated, 12 names)</span>
                    <input
                      className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-2 text-sm text-ink outline-none transition focus:border-accent/[0.4]"
                      placeholder="January, February, … (leave blank for default)"
                      value={calDraft.monthNames}
                      onChange={(e) => setCalDraft((d) => ({ ...d, monthNames: e.target.value }))}
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs text-ink-muted">Weekday names (comma-separated, 7 starting Sunday)</span>
                    <input
                      className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-2 text-sm text-ink outline-none transition focus:border-accent/[0.4]"
                      placeholder="Sunday, Monday, … (leave blank for default)"
                      value={calDraft.weekdayNames}
                      onChange={(e) => setCalDraft((d) => ({ ...d, weekdayNames: e.target.value }))}
                    />
                  </label>
                  <Button variant="primary" size="sm" disabled={saving} onClick={() => void handleSaveCalendar()}>
                    {saving ? "Saving…" : "Save Calendar"}
                  </Button>
                </div>

                {/* Recurring events */}
                <div className="space-y-2 border-t border-divider/40 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Recurring Events</p>
                  <p className="text-xs text-ink-muted">Rent, paycheck, or any recurring income/expense. Triggers automatically as story time passes.</p>
                  {(configDraft.recurringEvents ?? []).length === 0 ? (
                    <p className="text-xs text-ink-muted/60">No recurring events configured.</p>
                  ) : (
                    <div className="space-y-1">
                      {(configDraft.recurringEvents ?? []).map((event) => (
                        <div key={event.id} className="flex items-center justify-between gap-2 rounded-lg border border-divider/40 bg-panel-muted/40 px-3 py-2 text-xs">
                          <div className="min-w-0">
                            <span className="font-semibold text-ink">{event.label}</span>
                            <span className={cn("ml-2", event.amount >= 0 ? "text-emerald-400" : "text-red-400")}>
                              {event.amount >= 0 ? "+" : ""}{event.amount} {configDraft.currencyName}
                            </span>
                            <span className="ml-2 text-ink-muted">{formatEventSchedule(event)}</span>
                          </div>
                          <button type="button" className="shrink-0 text-ink-muted transition hover:text-red-400" onClick={() => handleRemoveRecurringEvent(event.id)}>
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {newEventDraft ? (
                    <div className="space-y-2 rounded-lg border border-accent/20 bg-accent/5 px-3 py-3">
                      <label className="block space-y-0.5">
                        <span className="text-[10px] uppercase tracking-wider text-ink-muted">Label</span>
                        <input className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-2 py-1.5 text-sm text-ink outline-none transition focus:border-accent/[0.4]" placeholder="Rent, Paycheck…" value={newEventDraft.label} onChange={(e) => setNewEventDraft((d) => d ? { ...d, label: e.target.value } : d)} />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="space-y-0.5">
                          <span className="text-[10px] uppercase tracking-wider text-ink-muted">Amount</span>
                          <input type="number" className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-2 py-1.5 text-sm text-ink outline-none transition focus:border-accent/[0.4]" placeholder="-500" value={newEventDraft.amount} onChange={(e) => setNewEventDraft((d) => d ? { ...d, amount: e.target.value } : d)} />
                        </label>
                        <label className="space-y-0.5">
                          <span className="text-[10px] uppercase tracking-wider text-ink-muted">Frequency</span>
                          <select className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-2 py-1.5 text-sm text-ink outline-none transition focus:border-accent/[0.4]" value={newEventDraft.frequency} onChange={(e) => setNewEventDraft((d) => d ? { ...d, frequency: e.target.value as RpRecurringFrequency } : d)}>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                            <option value="annually">Annually</option>
                          </select>
                        </label>
                      </div>
                      {newEventDraft.frequency === "weekly" && (
                        <label className="block space-y-0.5">
                          <span className="text-[10px] uppercase tracking-wider text-ink-muted">Day of week</span>
                          <select className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-2 py-1.5 text-sm text-ink outline-none transition focus:border-accent/[0.4]" value={newEventDraft.dayOfWeek} onChange={(e) => setNewEventDraft((d) => d ? { ...d, dayOfWeek: Number(e.target.value) } : d)}>
                            {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((n, i) => (
                              <option key={i} value={i}>{n}</option>
                            ))}
                          </select>
                        </label>
                      )}
                      {newEventDraft.frequency === "monthly" && (
                        <label className="block space-y-0.5">
                          <span className="text-[10px] uppercase tracking-wider text-ink-muted">Day of month</span>
                          <input type="number" min={1} max={31} className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-2 py-1.5 text-sm text-ink outline-none transition focus:border-accent/[0.4]" value={newEventDraft.dayOfMonth} onChange={(e) => setNewEventDraft((d) => d ? { ...d, dayOfMonth: Number(e.target.value) } : d)} />
                        </label>
                      )}
                      {newEventDraft.frequency === "annually" && (
                        <div className="grid grid-cols-2 gap-2">
                          <label className="space-y-0.5">
                            <span className="text-[10px] uppercase tracking-wider text-ink-muted">Month</span>
                            <select className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-2 py-1.5 text-sm text-ink outline-none transition focus:border-accent/[0.4]" value={newEventDraft.month} onChange={(e) => setNewEventDraft((d) => d ? { ...d, month: Number(e.target.value) } : d)}>
                              {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((n, i) => (
                                <option key={i} value={i + 1}>{n}</option>
                              ))}
                            </select>
                          </label>
                          <label className="space-y-0.5">
                            <span className="text-[10px] uppercase tracking-wider text-ink-muted">Day</span>
                            <input type="number" min={1} max={31} className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-2 py-1.5 text-sm text-ink outline-none transition focus:border-accent/[0.4]" value={newEventDraft.dayOfMonth} onChange={(e) => setNewEventDraft((d) => d ? { ...d, dayOfMonth: Number(e.target.value) } : d)} />
                          </label>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button variant="primary" size="sm" onClick={handleAddRecurringEvent}>Add</Button>
                        <Button variant="ghost" size="sm" onClick={() => setNewEventDraft(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {!rpStats?.timeState && (
                        <p className="text-xs text-amber-400">Set the story clock first — recurring events need a starting date to schedule correctly.</p>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => setNewEventDraft({ label: "", amount: "", frequency: "weekly", dayOfWeek: 1, dayOfMonth: 1, month: 1 })}>
                        + Add Recurring Event
                      </Button>
                    </>
                  )}
                </div>
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

                <div className="space-y-1">
                  <span className="text-xs text-ink-muted">Starting {configDraft.currencyName || "Gold"}</span>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={0}
                      step={configDraft.currencyDecimals ? 0.01 : 1}
                      className="min-w-0 flex-1 rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-2 text-sm text-ink outline-none transition focus:border-accent/[0.4]"
                      value={configDraft.startingGold}
                      onChange={(e) => setConfigDraft((c) => ({ ...c, startingGold: Math.max(0, parseFloat(e.target.value) || 0) }))}
                    />
                    {playerCharacter && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={suggestingGold}
                        onClick={() => void suggestStartingGold()}
                        title="Suggest from character profile"
                      >
                        {suggestingGold ? "…" : "Suggest"}
                      </Button>
                    )}
                  </div>
                  {suggestGoldError && <p className="text-xs text-red-400">{suggestGoldError}</p>}
                </div>

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

                <div className="border-t border-divider/40 pt-3 space-y-3">
                  <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider">Currency &amp; Debt</p>
                  <label className="flex items-center justify-between gap-3">
                    <span className="text-xs text-ink-muted">Allow debt (negative balance)</span>
                    <select
                      className="rounded-[8px] border border-divider bg-panel-muted/50 px-2 py-1.5 text-sm text-ink outline-none"
                      value={configDraft.allowDebt ? "yes" : "no"}
                      onChange={(e) => setConfigDraft((c) => ({ ...c, allowDebt: e.target.value === "yes" }))}
                    >
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </label>

                  {configDraft.allowDebt && (
                    <label className="block space-y-1">
                      <span className="text-xs text-ink-muted">Credit limit (0 = unlimited debt)</span>
                      <input
                        type="number"
                        min={0}
                        step={configDraft.currencyDecimals ? 0.01 : 1}
                        className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-2 text-sm text-ink outline-none transition focus:border-accent/[0.4]"
                        value={configDraft.creditLimit ?? 0}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value) || 0;
                          setConfigDraft((c) => ({ ...c, creditLimit: v === 0 ? null : v }));
                        }}
                      />
                    </label>
                  )}
                </div>

                <Button variant="primary" size="sm" className="w-full" disabled={saving} onClick={() => void handleSaveConfig()}>
                  {saving ? "Saving…" : "Save Config"}
                </Button>

                {rpStats && (
                  <div className="border-t border-divider/40 pt-3 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Export</p>
                    <p className="text-xs text-ink-muted">Download a snapshot of your character sheet and story transcript.</p>
                    {(
                      [
                        { fmt: "json", label: "JSON", desc: "Structured data" },
                        { fmt: "md", label: "Markdown", desc: "Tables and headers" },
                        { fmt: "txt", label: "Plain Text", desc: "Simple text file" },
                        { fmt: "pdf", label: "PDF", desc: "Formatted document" },
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
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
