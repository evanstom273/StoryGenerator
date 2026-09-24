import { useEffect, useState, useMemo } from "react";
import { useStoryEngine } from "../../app/providers/StoryEngineProvider";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Panel";
import { Badge } from "../ui/Badge";
import { OVERLAY_BACKDROP_CLASS } from "../../app/ui/motion";
import { cn } from "../../utils/cn";
import { formatDateTime } from "../../lib/dates";
import { calculatePendingMessages } from "../../lib/storyIndexManager";
import type {
  IndexingCadence,
  StoryIndex,
  StoryIndexCharacter,
} from "../../types/models";

interface StoryIndexSectionProps {
  storyId: string;
}

export function StoryIndexSection({ storyId }: StoryIndexSectionProps) {
  const {
    storyIndexes,
    stories,
    updateStory,
    aiSettings,
    getStoryIndex,
    messages,
    updateStoryIndex,
    fullReindexStory,
    clearStoryIndex,
    rebuildStatus,
    backgroundJobs,
    getPlayerCharacterById,
  } = useStoryEngine();

  const story = useMemo(
    () => stories.find((s) => s.id === storyId),
    [stories, storyId],
  );

  const playerCharacter = useMemo(
    () => (story?.playerCharacterId && getPlayerCharacterById ? getPlayerCharacterById(story.playerCharacterId) : undefined),
    [story?.playerCharacterId, getPlayerCharacterById],
  );

  const providerIndex = useMemo(
    () => storyIndexes.find((i) => i.storyId === storyId) ?? null,
    [storyIndexes, storyId],
  );

  const [localIndex, setLocalIndex] = useState<StoryIndex | null>(null);
  const index = providerIndex ?? localIndex;

  const [openSections, setOpenSections] = useState<{
    characters: boolean;
    relationships: boolean;
    chapters: boolean;
  }>({
    characters: true,
    relationships: true,
    chapters: true,
  });

  const toggleSection = (section: "characters" | "relationships" | "chapters") => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const allExpanded = openSections.characters && openSections.relationships && openSections.chapters;

  const toggleAllSections = () => {
    const next = !allExpanded;
    setOpenSections({
      characters: next,
      relationships: next,
      chapters: next,
    });
  };
  const [confirmFullReindex, setConfirmFullReindex] = useState(false);
  const [confirmClearIndex, setConfirmClearIndex] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const currentCadence: IndexingCadence =
    story?.indexingCadence ?? aiSettings?.indexingCadence ?? "every_5_messages";

  const storyMessages = useMemo(
    () => messages.filter((m) => m.storyId === storyId),
    [messages, storyId],
  );

  const refreshIndex = async () => {
    try {
      const idx = await getStoryIndex(storyId);
      setLocalIndex(idx);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    void refreshIndex();
  }, [storyId, messages]);

  const pendingMessages = useMemo(
    () => calculatePendingMessages(storyMessages, index),
    [storyMessages, index],
  );

  const cadenceProgressText = useMemo(() => {
    const count = pendingMessages.length;
    switch (currentCadence) {
      case "every_message":
        return count > 0 ? `${count} pending (triggers after each message)` : "Triggers after each message";
      case "every_5_messages": {
        const remaining = Math.max(0, 5 - count);
        return `${count} / 5 unindexed (${remaining === 0 ? "Ready to index" : `${remaining} more until auto-index`})`;
      }
      case "every_10_messages": {
        const remaining = Math.max(0, 10 - count);
        return `${count} / 10 unindexed (${remaining === 0 ? "Ready to index" : `${remaining} more until auto-index`})`;
      }
      case "every_15_messages": {
        const remaining = Math.max(0, 15 - count);
        return `${count} / 15 unindexed (${remaining === 0 ? "Ready to index" : `${remaining} more until auto-index`})`;
      }
      case "every_20_messages": {
        const remaining = Math.max(0, 20 - count);
        return `${count} / 20 unindexed (${remaining === 0 ? "Ready to index" : `${remaining} more until auto-index`})`;
      }
      case "every_chapter":
        return `${count} pending unindexed (triggers at chapter boundary)`;
      default:
        return `${count} pending unindexed`;
    }
  }, [pendingMessages.length, currentCadence]);

  const isIndexingActive = useMemo(() => {
    if (
      rebuildStatus &&
      rebuildStatus.storyId === storyId &&
      (rebuildStatus.phase === "loading" || rebuildStatus.phase === "extracting")
    ) {
      return true;
    }
    const bgJob = backgroundJobs.find(
      (job) =>
        job.type === "story_index" &&
        job.storyId === storyId &&
        (job.status === "queued" || job.status === "running"),
    );
    return Boolean(bgJob) || isProcessing;
  }, [rebuildStatus, backgroundJobs, storyId, isProcessing]);

  const characterMap = useMemo(() => {
    const map = new Map<string, StoryIndexCharacter>();
    for (const char of index?.characters ?? []) {
      map.set(char.id, char);
    }
    return map;
  }, [index?.characters]);

  async function handleCadenceChange(nextCadence: IndexingCadence) {
    if (story) {
      await updateStory(story.id, { indexingCadence: nextCadence });
    }
  }

  async function handleUpdateIndex() {
    setActionError(null);
    setIsProcessing(true);
    try {
      const updated = await updateStoryIndex(storyId);
      setLocalIndex(updated);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update index.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleFullReindex() {
    setConfirmFullReindex(false);
    setActionError(null);
    setIsProcessing(true);
    try {
      const updated = await fullReindexStory(storyId);
      setLocalIndex(updated);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to rebuild index.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleClearIndex() {
    setConfirmClearIndex(false);
    setActionError(null);
    setIsProcessing(true);
    try {
      await clearStoryIndex(storyId);
      setLocalIndex(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to clear index.");
    } finally {
      setIsProcessing(false);
    }
  }

  const characters = index?.characters ?? [];
  const relationships = index?.relationships ?? [];
  const chapterSummaries = index?.chapterSummaries ?? [];

  return (
    <div className="space-y-4">
      {/* Overview Card */}
      <div className="rounded-[10px] border border-divider/[0.3] bg-panel-muted/40 p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-0.5">
            <div className="text-xs font-semibold text-ink">Story Index Status</div>
            <div className="text-[11px] text-ink-muted">
              {index?.updatedAt
                ? `Last indexed: ${formatDateTime(index.updatedAt)} (${index.indexedMessageCount} messages)`
                : "No index built yet for this story."}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isIndexingActive ? (
              <Badge variant="accent" className="animate-pulse">
                {rebuildStatus?.storyId === storyId && rebuildStatus.totalMessages > 0
                  ? `Indexing (${rebuildStatus.processedMessages}/${rebuildStatus.totalMessages})`
                  : "Indexing in progress…"}
              </Badge>
            ) : pendingMessages.length > 0 ? (
              <Badge variant="warning">{pendingMessages.length} pending unindexed</Badge>
            ) : (
              <Badge variant="success">Up to date</Badge>
            )}
          </div>
        </div>

        {/* Cadence Selector & Live Progress */}
        <div className="rounded-[8px] border border-divider/[0.2] bg-panel-muted/30 p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="space-y-0.5">
            <div className="font-medium text-ink">Automatic Indexing Cadence</div>
            <div className="text-[11px] text-ink-muted">{cadenceProgressText}</div>
          </div>
          <select
            className="rounded-[6px] border border-divider/60 bg-panel px-2.5 py-1 text-xs text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            value={currentCadence}
            onChange={(e) => void handleCadenceChange(e.target.value as IndexingCadence)}
            title="Configure how frequently unindexed messages trigger an automatic index update"
          >
            <option value="every_message">Every message</option>
            <option value="every_5_messages">Every 5 messages</option>
            <option value="every_10_messages">Every 10 messages</option>
            <option value="every_15_messages">Every 15 messages</option>
            <option value="every_20_messages">Every 20 messages</option>
            <option value="every_chapter">Every chapter</option>
          </select>
        </div>

        {/* Live indexing progress bar */}
        {rebuildStatus?.storyId === storyId &&
          (rebuildStatus.phase === "extracting" || rebuildStatus.phase === "loading") && (
            <div className="rounded-[8px] border border-accent/20 bg-accent/5 p-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-accent-soft font-medium">
                <span>{rebuildStatus.message || "Indexing in progress..."}</span>
                {rebuildStatus.totalMessages > 0 && (
                  <span>
                    {rebuildStatus.processedMessages} / {rebuildStatus.totalMessages} (
                    {Math.round((rebuildStatus.processedMessages / rebuildStatus.totalMessages) * 100)}%)
                  </span>
                )}
              </div>
              {rebuildStatus.totalMessages > 0 && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-muted/80">
                  <div
                    className="h-full bg-accent transition-all duration-300 rounded-full"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(
                          (rebuildStatus.processedMessages / rebuildStatus.totalMessages) * 100,
                        ),
                      )}%`,
                    }}
                  />
                </div>
              )}
            </div>
          )}

        {rebuildStatus?.storyId === storyId &&
          rebuildStatus.phase === "done" &&
          rebuildStatus.message && (
            <div className="rounded-[8px] border border-emerald-500/20 bg-emerald-500/5 p-2 text-xs text-emerald-300">
              {rebuildStatus.message}
            </div>
          )}

        {actionError && (
          <div className="rounded-[8px] border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-300">
            {actionError}
          </div>
        )}

        {/* Action Controls */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={isIndexingActive || pendingMessages.length === 0}
            onClick={handleUpdateIndex}
            title="Process pending story messages"
          >
            Update Index
          </Button>

          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={isIndexingActive}
            onClick={() => setConfirmFullReindex(true)}
            title="Rebuild entire story index from transcript"
          >
            Full Re-index
          </Button>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
            disabled={isIndexingActive || !index}
            onClick={() => setConfirmClearIndex(true)}
            title="Remove derived index without touching transcripts"
          >
            Clear Index
          </Button>
        </div>
      </div>

      {/* Collapsible Sections Header */}
      <div className="flex items-center justify-between px-1 pt-1">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink-muted">
          Indexed Narrative Memory
        </span>
        <button
          type="button"
          onClick={toggleAllSections}
          className="text-[11px] font-medium text-accent-soft hover:text-accent transition-colors"
        >
          {allExpanded ? "Collapse All" : "Expand All"}
        </button>
      </div>

      {/* Collapsible Sections */}
      <div className="space-y-3">
        {/* Characters Section */}
        <div className="rounded-[10px] border border-divider/[0.35] bg-app-elevated overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection("characters")}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-panel-muted/20"
          >
            <div className="flex items-center gap-2.5">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-accent-soft">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span className="text-xs font-semibold text-ink">Characters ({characters.length})</span>
            </div>
            <span className={cn("text-xs text-ink-muted transition-transform duration-200", openSections.characters ? "rotate-0" : "-rotate-90")}>
              ▼
            </span>
          </button>
          {openSections.characters && (
            <div className="border-t border-divider/[0.25] p-3 space-y-2.5 max-h-[380px] overflow-y-auto">
              {characters.length === 0 ? (
                <div className="py-6 text-center text-xs text-ink-muted">
                  No canonical characters indexed yet. Click "Update Index" to extract characters from the story transcript.
                </div>
              ) : (
                characters.map((char) => (
                  <div
                    key={char.id}
                    className="rounded-[8px] border border-divider/[0.25] bg-panel-muted/30 p-3 space-y-1.5 text-xs transition hover:border-divider/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-ink text-sm">{char.canonicalName}</span>
                      {char.status && (
                        <Badge variant="neutral" className="text-[10px]">
                          {char.status}
                        </Badge>
                      )}
                    </div>

                    {(char.aliases.length > 0 || char.pronouns) && (
                      <div className="text-[11px] text-ink-muted">
                        {char.aliases.length > 0 && (
                          <><span className="text-ink/60">Aliases:</span> {char.aliases.join(", ")}</>
                        )}
                        {char.aliases.length > 0 && char.pronouns ? " · " : ""}
                        {char.pronouns && (
                          <><span className="text-ink/60">Pronouns:</span> {char.pronouns}</>
                        )}
                      </div>
                    )}

                    {char.description && (
                      <div className="text-ink/90 text-[11px] leading-relaxed">
                        {char.description}
                      </div>
                    )}

                    {char.developments.length > 0 && (
                      <div className="space-y-1 pt-1 border-t border-divider/[0.15]">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                          Developments:
                        </div>
                        <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-ink/80">
                          {char.developments.map((dev, idx) => (
                            <li key={idx}>{dev}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="pt-1 text-[10px] text-ink-muted">
                      Provenance: {char.provenance.length} source message{char.provenance.length === 1 ? "" : "s"}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Relationships Section */}
        <div className="rounded-[10px] border border-divider/[0.35] bg-app-elevated overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection("relationships")}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-panel-muted/20"
          >
            <div className="flex items-center gap-2.5">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-accent-soft">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="19" y1="8" x2="19" y2="14" />
                <line x1="22" y1="11" x2="16" y2="11" />
              </svg>
              <span className="text-xs font-semibold text-ink">Relationships ({relationships.length})</span>
            </div>
            <span className={cn("text-xs text-ink-muted transition-transform duration-200", openSections.relationships ? "rotate-0" : "-rotate-90")}>
              ▼
            </span>
          </button>
          {openSections.relationships && (
            <div className="border-t border-divider/[0.25] p-3 space-y-2.5 max-h-[380px] overflow-y-auto">
              {relationships.length === 0 ? (
                <div className="py-6 text-center text-xs text-ink-muted">
                  No relationships indexed yet.
                </div>
              ) : (
                relationships.map((rel, idx) => {
                  const charA = characterMap.get(rel.characterIdA);
                  const charB = characterMap.get(rel.characterIdB);
                  // Indexed canonical names reflect the character's current story identity.
                  // Fall back to the static character sheet only when the index has no record.
                  const nameA = charA?.canonicalName ?? (rel.characterIdA === playerCharacter?.id ? playerCharacter.name : undefined) ?? rel.characterIdA;
                  const nameB = charB?.canonicalName ?? (rel.characterIdB === playerCharacter?.id ? playerCharacter.name : undefined) ?? rel.characterIdB;

                  return (
                    <div
                      key={`${rel.characterIdA}-${rel.characterIdB}-${idx}`}
                      className="rounded-[8px] border border-divider/[0.25] bg-panel-muted/30 p-3 space-y-1.5 text-xs transition hover:border-divider/50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-ink">
                          {nameA} & {nameB}
                        </span>
                        {rel.state && (
                          <Badge variant="neutral" className="text-[10px]">
                            {rel.state}
                          </Badge>
                        )}
                      </div>

                      <div className="text-ink/90 text-[11px]">{rel.nature}</div>

                      {rel.developments.length > 0 && (
                        <div className="space-y-0.5 pt-1 border-t border-divider/[0.15]">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                            Key Developments:
                          </div>
                          <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-ink/80">
                            {rel.developments.map((dev, dIdx) => (
                              <li key={dIdx}>{dev}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="pt-1 text-[10px] text-ink-muted">
                        Provenance: {rel.provenance.length} source message{rel.provenance.length === 1 ? "" : "s"}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Chapter Summaries Section */}
        <div className="rounded-[10px] border border-divider/[0.35] bg-app-elevated overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection("chapters")}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-panel-muted/20"
          >
            <div className="flex items-center gap-2.5">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-accent-soft">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              <span className="text-xs font-semibold text-ink">Chapter Summaries ({chapterSummaries.length})</span>
            </div>
            <span className={cn("text-xs text-ink-muted transition-transform duration-200", openSections.chapters ? "rotate-0" : "-rotate-90")}>
              ▼
            </span>
          </button>
          {openSections.chapters && (
            <div className="border-t border-divider/[0.25] p-3 space-y-2.5 max-h-[380px] overflow-y-auto">
              {chapterSummaries.length === 0 ? (
                <div className="py-6 text-center text-xs text-ink-muted">
                  No chapter summaries indexed yet.
                </div>
              ) : (
                chapterSummaries.map((summary) => {
                  const originStory = summary.originStoryId
                    ? stories.find((candidate) => candidate.id === summary.originStoryId)
                    : story;
                  return (
                    <div
                      key={`${summary.originStoryId ?? storyId}:${summary.chapterId}`}
                      className="rounded-[8px] border border-divider/[0.25] bg-panel-muted/30 p-3 space-y-2 text-xs transition hover:border-divider/50"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-ink text-sm">
                          {originStory?.title ? `${originStory.title} · ` : ""}{summary.chapterLabel}
                        </span>
                        <span className="text-[10px] text-ink-muted">
                          {summary.sourceMessageIds.length} message{summary.sourceMessageIds.length === 1 ? "" : "s"}
                        </span>
                      </div>

                      <p className="text-ink/90 text-[11px] leading-relaxed whitespace-pre-wrap">
                        {summary.summary}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* Full Re-index Confirmation Modal */}
      {confirmFullReindex && (
        <div
          className={cn(OVERLAY_BACKDROP_CLASS, "fixed inset-0 z-[80] flex items-center justify-center p-4")}
          onClick={() => setConfirmFullReindex(false)}
        >
          <Panel
            variant="flat"
            padding="lg"
            className="max-w-md w-full space-y-4"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-bold uppercase tracking-[0.2em] text-accent-soft">
              Confirm Full Re-index
            </div>
            <div className="text-xs text-ink/90 space-y-2 leading-relaxed">
              <p>
                This will reprocess the entire story transcript from message 1 through the current position in a staging buffer, reconstructing Characters, Relationships, and Detailed Chapter Summaries.
              </p>
              <p className="text-ink-muted">
                The existing index will only be replaced upon complete success. Your authoritative story transcript, chapters, and character sheets will remain completely untouched.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmFullReindex(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleFullReindex}>
                Proceed with Re-index
              </Button>
            </div>
          </Panel>
        </div>
      )}

      {/* Clear Index Confirmation Modal */}
      {confirmClearIndex && (
        <div
          className={cn(OVERLAY_BACKDROP_CLASS, "fixed inset-0 z-[80] flex items-center justify-center p-4")}
          onClick={() => setConfirmClearIndex(false)}
        >
          <Panel
            variant="flat"
            padding="lg"
            className="max-w-md w-full space-y-4"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-bold uppercase tracking-[0.2em] text-rose-400">
              Clear Derived Index
            </div>
            <div className="text-xs text-ink/90 space-y-2 leading-relaxed">
              <p>
                Are you sure you want to clear the derived indexing data for this story?
              </p>
              <p className="text-ink-muted">
                This removes indexed memory (characters, relationships, chapter summaries) and resets indexing progress. It will <strong>NOT</strong> delete or alter any messages, chapters, player character data, or universe data. You can re-index the story at any time.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmClearIndex(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-rose-600 hover:bg-rose-500 text-white"
                onClick={handleClearIndex}
              >
                Clear Index
              </Button>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
