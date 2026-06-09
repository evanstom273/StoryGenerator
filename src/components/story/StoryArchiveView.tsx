import { useEffect, useMemo, useState } from "react";
import { useStoryEngine } from "../../app/providers/StoryEngineProvider";
import { navigateToStoryMessageNumber } from "../../lib/events/storyNavigation";
import { normalizeStoryStateToV2, safeParseStoryStateData } from "../../lib/storyStateV2";
import { cn } from "../../utils/cn";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Panel";

export function StoryArchiveView({ storyId }: { storyId: string }) {
  const { fetchStoryState, getMessagesForStory, rebuildStatus, updateIndexesDeep } =
    useStoryEngine();
  const [storyStateJson, setStoryStateJson] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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

  async function handleReindex() {
    setErrorMessage(null);
    try {
      await updateIndexesDeep(storyId);
      const updated = await fetchStoryState(storyId);
      setStoryStateJson(updated?.stateJson ?? "");
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
      <div className="mt-2 flex flex-wrap gap-2">
        {visible.map((number) => (
          <button
            key={number}
            type="button"
            className="rounded-full border border-divider bg-white/[0.03] px-2 py-1 text-xs font-semibold text-ink-soft transition hover:border-accent/50 hover:bg-accent/10"
            onClick={() => navigateToStoryMessageNumber(storyId, number)}
          >
            #{number}
          </button>
        ))}
        {remaining > 0 ? (
          <button
            type="button"
            className="rounded-full border border-divider bg-white/[0.03] px-2 py-1 text-xs font-semibold text-ink-muted transition hover:border-accent/50 hover:bg-accent/10"
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
    );
  }

  if (loading) {
    return (
      <Panel padding="lg">
        <div className="text-sm text-ink-muted">Loading archive...</div>
      </Panel>
    );
  }

  if (errorMessage) {
    return (
      <Panel padding="lg">
        <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
          {errorMessage}
        </div>
      </Panel>
    );
  }

  if (!storyStateData) {
    return (
      <Panel padding="lg" className="space-y-4">
        <div className="text-sm text-ink-muted">No indexed state available yet.</div>
        <Button variant="secondary" onClick={() => void handleReindex()} disabled={isRebuilding}>
          {isRebuilding ? "Re-indexing..." : "Re-index"}
        </Button>
      </Panel>
    );
  }

  const totalMessages = getMessagesForStory(storyId).length;
  const indexedMessageCount =
    storyStateData.indexes?.messageCount ?? storyStateData.lastIndexedMessageCount ?? 0;
  const staleBy = Math.max(0, totalMessages - indexedMessageCount);
  const worldFacts = storyStateData.indexes?.worldFacts ?? [];
  const openThreads = storyStateData.indexes?.openThreads ?? [];
  const characters = storyStateData.indexes?.characters ? Object.values(storyStateData.indexes.characters) : [];
  const locations = storyStateData.indexes?.locations ? Object.values(storyStateData.indexes.locations) : [];
  const relationships = storyStateData.indexes?.relationships ?? [];
  const significantMemories = (storyStateData.indexes as any)?.significantMemories ?? [];

  return (
    <div className="space-y-4">
      <Panel padding="sm" className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
            Archive
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleReindex()}
            disabled={isRebuilding}
          >
            {isRebuilding ? "Re-indexing..." : "Re-index"}
          </Button>
        </div>

        {rebuildInfo ? (
          <div className="rounded-2xl border border-white/8 bg-black/15 px-4 py-3 text-sm text-ink-muted">
            {rebuildInfo.phase === "error"
              ? rebuildInfo.error || "Rebuild failed."
              : rebuildInfo.message ||
                `Rebuilding… ${rebuildInfo.processedMessages}/${rebuildInfo.totalMessages} messages`}
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
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2">
        {openThreads.length ? (
          <Panel padding="sm">
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
          <Panel padding="sm">
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

        {characters.length ? (
          <Panel padding="sm">
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
                      <div className="mt-1 text-xs text-ink-muted">{entry.description}</div>
                    ) : null}
                    {renderEvidencePills(entry.evidence?.messageNumbers, `char-${entry.name}`)}
                  </div>
                ))}
            </div>
          </Panel>
        ) : null}

        {locations.length ? (
          <Panel padding="sm">
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

        {relationships.length ? (
          <Panel padding="sm">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
              Relationships
            </div>
            <div className="mt-3 space-y-3">
              {relationships.map((entry, index) => (
                <div
                  key={`${entry.a}-${entry.b}-${index}`}
                  className="rounded-2xl border border-divider bg-white/[0.02] px-3 py-3"
                >
                  <div className="font-semibold text-ink-soft">
                    {entry.a} ↔ {entry.b}
                  </div>
                  {entry.summary ? (
                    <div className="mt-1 text-xs text-ink-muted">{entry.summary}</div>
                  ) : null}
                  {renderEvidencePills(entry.evidence?.messageNumbers, `rel-${index}`)}
                </div>
              ))}
            </div>
          </Panel>
        ) : null}

        {Array.isArray(significantMemories) && significantMemories.length ? (
          <Panel padding="sm">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
              Significant Memories
            </div>
            <div className="mt-3 space-y-3">
              {significantMemories.map((entry: any, index: number) => (
                <div
                  key={index}
                  className="rounded-2xl border border-divider bg-white/[0.02] px-3 py-3"
                >
                  <div className="text-ink-soft">{entry?.memory ?? entry?.fact ?? "—"}</div>
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

