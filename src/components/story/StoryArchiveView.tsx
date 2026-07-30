import { useEffect, useMemo, useState } from "react";
import { useStoryEngine } from "../../app/providers/StoryEngineProvider";
import { navigateToStoryMessageNumber } from "../../lib/events/storyNavigation";
import { normalizeStoryStateToV2, safeParseStoryStateData } from "../../lib/storyStateV2";
import type { RelationshipIndexEntry } from "../../types/models";
import { cn } from "../../utils/cn";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Panel";

import { RelationshipOverviewList } from "./RelationshipOverviewList";
import { filterPlayerRelationships } from "../../lib/storyRelationshipLoad";

function trimStringList(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim())
    .slice(0, maxItems);
}

function getCharacterStatusLines(character: any) {
  const bullets = trimStringList(character?.statusBullets, 4);
  if (bullets.length) {
    return bullets;
  }

  if (typeof character?.status === "string" && character.status.trim()) {
    return [character.status.trim()];
  }

  return trimStringList(character?.notes, 3);
}

async function isAndroidNativePlatform() {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}

export function StoryArchiveView({
  storyId,
  playerName,
  relationshipsRefreshKey = 0,
}: {
  storyId: string;
  playerName?: string;
  relationshipsRefreshKey?: number;
}) {
  const { fetchStoryState, getMessagesForStory, getStoryById, rebuildStatus, updateIndexesDeep, loadStoryRelationships } =
    useStoryEngine();
  const [storyStateJson, setStoryStateJson] = useState<string>("");
  const [archiveRelationships, setArchiveRelationships] = useState<RelationshipIndexEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [expandedEvidenceKeys, setExpandedEvidenceKeys] = useState<Record<string, boolean>>({});

  const storyStateData = useMemo(() => {
    if (!storyStateJson.trim()) {
      return null;
    }
    const parsed = safeParseStoryStateData(storyStateJson);
    if (!parsed) {
      return null;
    }
    return normalizeStoryStateToV2(parsed);
  }, [storyStateJson]);

  const rebuildInfo =
    rebuildStatus?.storyId === storyId && rebuildStatus.phase !== "idle" ? rebuildStatus : null;
  const isRebuilding = rebuildInfo
    ? rebuildInfo.phase === "loading" ||
      rebuildInfo.phase === "extracting" ||
      rebuildInfo.phase === "saving"
    : false;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);

    void fetchStoryState(storyId)
      .then((record) => {
        if (cancelled) return;
        setStoryStateJson(record?.stateJson ?? "");
      })
      .catch((error) => {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : "Unable to load story state.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchStoryState, storyId]);

  useEffect(() => {
    let cancelled = false;
    void loadStoryRelationships(storyId).then((relationships) => {
      if (!cancelled) setArchiveRelationships(relationships);
    });
    return () => {
      cancelled = true;
    };
  }, [loadStoryRelationships, storyId, relationshipsRefreshKey]);

  async function handleReindex(incremental: boolean) {
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await updateIndexesDeep(storyId, { incremental });
      const updated = await fetchStoryState(storyId);
      setStoryStateJson(updated?.stateJson ?? "");
      if (await isAndroidNativePlatform()) {
        setSuccessMessage("Re-index complete on Android. Archive state has been refreshed.");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to re-index.");
    }
  }

  function renderEvidencePills(evidence: number[] | undefined, key: string) {
    if (!evidence?.length) {
      return null;
    }

    const totalMessages = getMessagesForStory(storyId).length;
    const uniqueSorted = Array.from(new Set(evidence))
      .filter((value) => Number.isFinite(value) && value >= 1 && value <= totalMessages)
      .sort((a, b) => a - b);

    if (!uniqueSorted.length) {
      return null;
    }

    const expanded = expandedEvidenceKeys[key] ?? false;
    const visible = expanded ? uniqueSorted : uniqueSorted.slice(0, 10);
    const remaining = uniqueSorted.length - visible.length;

    return (
      <div className="mt-3 rounded-2xl border border-accent/15 bg-accent/5 px-3 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent-soft">
          Evidence
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {visible.map((number) => (
            <button
              key={number}
              type="button"
              className="rounded-full border border-accent/30 bg-black/20 px-2.5 py-1 text-xs font-semibold text-ink-soft transition hover:border-accent hover:bg-accent/15"
              onClick={() => navigateToStoryMessageNumber(storyId, number)}
            >
              Jump to #{number}
            </button>
          ))}
          {remaining > 0 ? (
            <button
              type="button"
              className="rounded-full border border-divider bg-white/[0.03] px-2.5 py-1 text-xs font-semibold text-ink-muted transition hover:border-accent/50 hover:bg-accent/10"
              onClick={() =>
                setExpandedEvidenceKeys((current) => ({
                  ...current,
                  [key]: true,
                }))
              }
            >
              +{remaining} more
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <Panel variant="flat" padding="lg">
        <div className="text-sm text-ink-muted">Loading archive...</div>
      </Panel>
    );
  }

  if (errorMessage) {
    return (
      <Panel variant="flat" padding="lg">
        <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
          {errorMessage}
        </div>
      </Panel>
    );
  }

  if (!storyStateData) {
    return (
      <Panel variant="flat" padding="lg" className="space-y-4">
        <div className="text-sm text-ink-muted">No indexed state available yet.</div>
        <Button variant="secondary" onClick={() => void handleReindex(false)} disabled={isRebuilding}>
          {isRebuilding ? "Re-indexing..." : "Re-index"}
        </Button>
      </Panel>
    );
  }

  const story = getStoryById(storyId);
  const totalMessages = getMessagesForStory(storyId).length;
  const indexedMessageCount =
    storyStateData.indexes?.messageCount ?? storyStateData.lastIndexedMessageCount ?? 0;
  const staleBy = Math.max(0, totalMessages - indexedMessageCount);
  const worldFacts = storyStateData.indexes?.worldFacts ?? [];
  const openThreads = storyStateData.indexes?.openThreads ?? [];
  const characters = storyStateData.indexes?.characters ? Object.values(storyStateData.indexes.characters) : [];
  const characterStates = Object.entries(storyStateData.characters ?? {});
  const locations = storyStateData.indexes?.locations ? Object.values(storyStateData.indexes.locations) : [];
  const significantMemories = (storyStateData.indexes as any)?.significantMemories ?? [];
  const premise = storyStateData.summaries?.premise?.trim() ?? "";
  const protagonistSummary = storyStateData.summaries?.protagonistSummary?.trim() ?? "";
  const currentSituation = storyStateData.summaries?.currentSituation?.trim() ?? "";
  const recentDevelopments = trimStringList(storyStateData.summaries?.recentDevelopments, 6);
  const autoIndexInterval = story?.autoIndexInterval ?? 20;
  const lastAutoDeepIndexMessageCount = storyStateData.lastAutoDeepIndexedMessageCount ?? 0;
  const messagesSinceAutoDeep = Math.max(0, totalMessages - lastAutoDeepIndexMessageCount);
  const messagesUntilAutoDeep =
    autoIndexInterval === "disabled"
      ? null
      : Math.max(0, autoIndexInterval - Math.min(messagesSinceAutoDeep, autoIndexInterval));

  return (
    <div className="space-y-4">
      <Panel variant="flat" padding="sm" className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
            Archive
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleReindex(true)}
              disabled={isRebuilding}
            >
              {isRebuilding ? "Re-indexing..." : "Update index"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleReindex(false)}
              disabled={isRebuilding}
            >
              Full reindex
            </Button>
          </div>
        </div>

        {rebuildInfo ? (
          <div className="rounded-2xl border border-white/8 bg-black/15 px-4 py-3 text-sm text-ink-muted">
            {rebuildInfo.phase === "error"
              ? rebuildInfo.error || "Rebuild failed."
              : rebuildInfo.message ||
                `Rebuilding… ${rebuildInfo.processedMessages}/${rebuildInfo.totalMessages} messages`}
          </div>
        ) : null}
        {successMessage ? (
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
            {successMessage}
          </div>
        ) : null}

        <div className="space-y-2 text-sm text-ink-muted">
          <div className="flex items-center justify-between gap-3">
            <div>Message count</div>
            <div className="text-ink-soft">{indexedMessageCount || "—"}</div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>Status</div>
            <div className={cn("text-ink-soft", staleBy ? "text-amber-200" : "")}>
              {staleBy ? `Stale (+${staleBy})` : "Up to date"}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>Auto deep index</div>
            <div className="text-ink-soft">
              {autoIndexInterval === "disabled"
                ? "Disabled"
                : messagesUntilAutoDeep === 0
                ? "Ready on next pass"
                : `In ${messagesUntilAutoDeep} message${messagesUntilAutoDeep === 1 ? "" : "s"}`}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/8 bg-black/15 px-4 py-3 text-sm text-ink-muted">
          {autoIndexInterval === "disabled"
            ? "Automatic indexing is disabled for this story."
            : `Automatic indexing runs every ${autoIndexInterval} new messages. Progress: ${Math.min(messagesSinceAutoDeep, autoIndexInterval)}/${autoIndexInterval}.`}
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2">
        {premise || protagonistSummary || currentSituation || recentDevelopments.length ? (
          <Panel variant="flat" padding="sm" className="md:col-span-2">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
              Story State
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {premise ? (
                <div className="rounded-2xl border border-divider bg-white/[0.02] px-3 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
                    Premise
                  </div>
                  <div className="mt-2 text-sm text-ink-soft">{premise}</div>
                </div>
              ) : null}
              {protagonistSummary ? (
                <div className="rounded-2xl border border-divider bg-white/[0.02] px-3 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
                    Protagonist
                  </div>
                  <div className="mt-2 text-sm text-ink-soft">{protagonistSummary}</div>
                </div>
              ) : null}
              {currentSituation ? (
                <div className="rounded-2xl border border-divider bg-white/[0.02] px-3 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
                    Current Situation
                  </div>
                  <div className="mt-2 text-sm text-ink-soft">{currentSituation}</div>
                </div>
              ) : null}
            </div>
            {recentDevelopments.length ? (
              <div className="mt-3 rounded-2xl border border-divider bg-white/[0.02] px-3 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
                  Recent Developments
                </div>
                <div className="mt-2 space-y-2">
                  {recentDevelopments.map((entry) => (
                    <div key={entry} className="text-sm text-ink-soft">
                      {entry}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </Panel>
        ) : null}

        {openThreads.length ? (
          <Panel variant="flat" padding="sm">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
              Open Threads
            </div>
            <div className="mt-3 space-y-3">
              {openThreads.map((entry, index) => (
                <div
                  key={index}
                  className="rounded-2xl border border-divider bg-white/[0.02] px-3 py-3"
                >
                  <div className="text-ink-soft">{entry.thread}</div>
                  {renderEvidencePills(entry.evidence?.messageNumbers, `thread-${index}`)}
                </div>
              ))}
            </div>
          </Panel>
        ) : null}

        {worldFacts.length ? (
          <Panel variant="flat" padding="sm">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
              World Facts
            </div>
            <div className="mt-3 space-y-3">
              {worldFacts.map((entry, index) => (
                <div
                  key={index}
                  className="rounded-2xl border border-divider bg-white/[0.02] px-3 py-3"
                >
                  <div className="text-ink-soft">{entry.fact}</div>
                  {renderEvidencePills(entry.evidence?.messageNumbers, `fact-${index}`)}
                </div>
              ))}
            </div>
          </Panel>
        ) : null}

        {characterStates.length ? (
          <Panel variant="flat" padding="sm">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
              Character Status
            </div>
            <div className="mt-3 space-y-3">
              {characterStates
                .slice()
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([name, entry]) => {
                  const statusLines = getCharacterStatusLines(entry);
                  const strengths = trimStringList((entry as any)?.strengths, 3);
                  const weaknesses = trimStringList((entry as any)?.weaknesses, 3);
                  if (!statusLines.length && !strengths.length && !weaknesses.length) {
                    return null;
                  }

                  return (
                    <div
                      key={name}
                      className="rounded-2xl border border-divider bg-white/[0.02] px-3 py-3"
                    >
                      <div className="font-semibold text-ink-soft">{name}</div>
                      <div className="mt-2 space-y-2">
                        {statusLines.map((line) => (
                          <div key={line} className="text-sm text-ink-soft">
                            {line}
                          </div>
                        ))}
                        {strengths.length ? (
                          <div className="text-xs text-emerald-200/90">
                            Strengths: {strengths.join(", ")}
                          </div>
                        ) : null}
                        {weaknesses.length ? (
                          <div className="text-xs text-amber-100/90">
                            Weaknesses: {weaknesses.join(", ")}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
            </div>
          </Panel>
        ) : null}

        {characters.length ? (
          <Panel variant="flat" padding="sm">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
              Characters
            </div>
            <div className="mt-3 space-y-3">
              {characters
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((entry) => (
                  <div
                    key={entry.name}
                    className="rounded-2xl border border-divider bg-white/[0.02] px-3 py-3"
                  >
                    <div className="font-semibold text-ink-soft">{entry.name}</div>
                    {entry.description ? (
                      <div className="mt-1 text-sm text-ink-muted">{entry.description}</div>
                    ) : null}
                    {renderEvidencePills(entry.evidence?.messageNumbers, `char-${entry.name}`)}
                  </div>
                ))}
            </div>
          </Panel>
        ) : null}

        {locations.length ? (
          <Panel variant="flat" padding="sm">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
              Locations
            </div>
            <div className="mt-3 space-y-3">
              {locations
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((entry) => (
                  <div
                    key={entry.name}
                    className="rounded-2xl border border-divider bg-white/[0.02] px-3 py-3"
                  >
                    <div className="font-semibold text-ink-soft">{entry.name}</div>
                    {entry.description ? (
                      <div className="mt-1 text-xs text-ink-muted">{entry.description}</div>
                    ) : null}
                    {renderEvidencePills(entry.evidence?.messageNumbers, `loc-${entry.name}`)}
                  </div>
                ))}
            </div>
          </Panel>
        ) : null}

        {archiveRelationships.length ? (
          <Panel variant="flat" padding="sm">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
              Relationships
            </div>
            <p className="mt-1 text-[11px] text-ink-muted">
              Overview from the story relationship index. Open the Relationships panel in the workspace for full detail and editing.
            </p>
            <div className="mt-3">
              <RelationshipOverviewList
                relationships={filterPlayerRelationships(archiveRelationships, playerName)}
                playerName={playerName}
              />
            </div>
          </Panel>
        ) : null}

        {Array.isArray(significantMemories) && significantMemories.length ? (
          <Panel variant="flat" padding="sm">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
              Significant Memories
            </div>
            <div className="mt-3 space-y-3">
              {significantMemories.map((entry: any, index: number) => (
                <div
                  key={index}
                  className="rounded-2xl border border-divider bg-white/[0.02] px-3 py-3"
                >
                  <div className="text-ink-soft">{entry?.moment ?? entry?.memory ?? entry?.fact ?? "—"}</div>
                  {renderEvidencePills(entry?.evidence?.messageNumbers, `mem-${index}`)}
                </div>
              ))}
            </div>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
