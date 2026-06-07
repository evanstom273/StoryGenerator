import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DownloadIcon, TrashIcon } from "../../components/icons";
import { Button } from "../../components/ui/Button";
import { Panel } from "../../components/ui/Panel";
import { downloadFile } from "../../lib/download";
import { getProviderDefaultModel, getProviderModels } from "../../lib/ai/models";
import { serializeStoryExport } from "../../lib/storyExport";
import { navigateToStoryMessageNumber } from "../../lib/events/storyNavigation";
import { normalizeStoryStateToV2, safeParseStoryStateData } from "../../lib/storyStateV2";
import { useDebouncedEffect } from "../../lib/useDebouncedEffect";
import type { AIProviderType, ExportFormat } from "../../types/models";
import { cn } from "../../utils/cn";
import { useStoryEngine } from "../providers/StoryEngineProvider";
import { useUiPrefs } from "../ui/UiPrefsContext";

function createExportFilename(title: string, format: ExportFormat) {
  const sanitizedTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const suffix = format === "archive_pdf" ? "-archive" : "";
  const extension =
    format === "json"
      ? "json"
      : format === "markdown"
        ? "md"
        : format === "pdf" || format === "archive_pdf"
          ? "pdf"
          : "txt";
  return `${sanitizedTitle || "story-engine-story"}${suffix}.${extension}`;
}

export function StorySettingsDrawer({ storyId }: { storyId?: string }) {
  const navigate = useNavigate();
  const { storySettingsOpen, setStorySettingsOpen } = useUiPrefs();
  const {
    aiSettings,
    getStoryById,
    getUniverseById,
    getPlayerCharacterById,
    getMessagesForStory,
    exportStory,
    fetchStoryState,
    promoteStoryPlayerCharacter,
    updateStory,
    deleteStory,
    getStoryAIConfig,
    saveStoryAIConfig,
    updateIndexesDeep,
    rebuildStatus,
  } = useStoryEngine();

  const story = storyId ? getStoryById(storyId) : undefined;
  const universe = story ? getUniverseById(story.universeId) : undefined;
  const playerCharacter = story ? getPlayerCharacterById(story.playerCharacterId) : undefined;

  const [storyFields, setStoryFields] = useState({
    title: story?.title ?? "",
    currentSummary: story?.currentSummary ?? "",
  });
  const [isSavingStory, setIsSavingStory] = useState(false);
  const [aiProviderType, setAiProviderType] = useState<AIProviderType>(
    aiSettings?.activeProviderType ?? "openai",
  );
  const [aiModel, setAiModel] = useState(
    aiSettings?.defaultModels?.[aiSettings?.activeProviderType ?? "openai"] ??
      getProviderDefaultModel(aiSettings?.activeProviderType ?? "openai"),
  );
  const [isSavingAI, setIsSavingAI] = useState(false);
  const [isPromotingCharacter, setIsPromotingCharacter] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [storyStateData, setStoryStateData] = useState<ReturnType<typeof normalizeStoryStateToV2> | null>(
    null,
  );
  const [expandedEvidenceKeys, setExpandedEvidenceKeys] = useState<Record<string, boolean>>({});

  async function handlePromoteCharacter() {
    if (!story || !playerCharacter) {
      return;
    }

    setIsPromotingCharacter(true);
    setPageError(null);

    try {
      const promoted = await promoteStoryPlayerCharacter(story.id);
      const switchStory = window.confirm(
        "Saved to Player Characters. Switch this story to the new permanent character?",
      );
      if (switchStory) {
        await updateStory(story.id, { playerCharacterId: promoted.id });
      }
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Unable to promote character.",
      );
    } finally {
      setIsPromotingCharacter(false);
    }
  }

  useEffect(() => {
    if (!story) {
      return;
    }

    setStoryFields({
      title: story.title,
      currentSummary: story.currentSummary,
    });
  }, [story]);

  useEffect(() => {
    if (!storySettingsOpen || !story) {
      setStoryStateData(null);
      return;
    }

    let cancelled = false;
    void fetchStoryState(story.id)
      .then((record) => {
        if (cancelled) {
          return;
        }
        const parsed = record?.stateJson ? safeParseStoryStateData(record.stateJson) : null;
        setStoryStateData(normalizeStoryStateToV2(parsed));
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setStoryStateData(null);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchStoryState, story, storySettingsOpen, rebuildStatus]);

  useDebouncedEffect(
    () => {
      if (!story) {
        return;
      }

      if (
        storyFields.title === story.title &&
        storyFields.currentSummary === story.currentSummary
      ) {
        return;
      }

      if (!storyFields.title.trim()) {
        return;
      }

      void updateStory(story.id, storyFields).catch(() => {});
    },
    800,
    [story?.id, storyFields.title, storyFields.currentSummary],
  );

  useEffect(() => {
    if (!story) {
      return;
    }

    let cancelled = false;

    void getStoryAIConfig(story.id)
      .then((config) => {
        if (cancelled) {
          return;
        }

        const providerType =
          config?.providerType ?? aiSettings?.activeProviderType ?? "openai";
        const model =
          config?.model?.trim() ||
          aiSettings?.defaultModels?.[providerType]?.trim() ||
          getProviderDefaultModel(providerType);

        setAiProviderType(providerType);
        setAiModel(model);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        const providerType = aiSettings?.activeProviderType ?? "openai";
        setAiProviderType(providerType);
        setAiModel(
          aiSettings?.defaultModels?.[providerType]?.trim() ||
            getProviderDefaultModel(providerType),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [aiSettings, getStoryAIConfig, story]);

  const heading = useMemo(() => {
    if (!story || !universe || !playerCharacter) {
      return "Story Settings";
    }
    return story.title;
  }, [playerCharacter, story, universe]);

  async function handleExport(format: ExportFormat) {
    if (!story) {
      return;
    }

    const bundle = await exportStory(story.id);

    if (!bundle) {
      setPageError("Unable to assemble export data for this story.");
      return;
    }

    const { content, mimeType } = serializeStoryExport(bundle, format);
    await downloadFile(createExportFilename(story.title, format), content, mimeType);
  }

  async function handleSaveStoryDetails(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!story) {
      return;
    }

    if (!storyFields.title.trim()) {
      setPageError("Story title is required.");
      return;
    }

    setIsSavingStory(true);
    setPageError(null);

    try {
      await updateStory(story.id, storyFields);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Unable to save story details.");
    } finally {
      setIsSavingStory(false);
    }
  }

  async function handleSaveStoryAI(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!story) {
      return;
    }

    setIsSavingAI(true);
    setPageError(null);

    try {
      await saveStoryAIConfig({
        storyId: story.id,
        providerType: aiProviderType,
        model: aiModel,
      });
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Unable to save story AI settings.");
    } finally {
      setIsSavingAI(false);
    }
  }

  async function handleDeleteStory() {
    if (!story) {
      return;
    }

    const confirmed = window.confirm("Delete this story and every stored message in its timeline?");

    if (!confirmed) {
      return;
    }

    await deleteStory(story.id);
    setStorySettingsOpen(false);
    navigate("/stories");
  }

  const rebuildInfo =
    story && rebuildStatus?.storyId === story.id && rebuildStatus.phase !== "idle"
      ? rebuildStatus
      : null;
  const isRebuilding = rebuildInfo ? rebuildInfo.phase === "loading" || rebuildInfo.phase === "extracting" || rebuildInfo.phase === "saving" : false;

  async function handleReindex() {
    if (!story) {
      return;
    }

    setPageError(null);
    try {
      await updateIndexesDeep(story.id);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Unable to re-index.");
    }
  }

  function renderEvidencePills(evidence: number[] | undefined, key: string) {
    if (!story || !evidence?.length) {
      return null;
    }

    const totalMessages = getMessagesForStory(story.id).length;
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
            onClick={() => navigateToStoryMessageNumber(story.id, number)}
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

  return (
    <div
      className={cn(
        "fixed inset-0 z-[60]",
        storySettingsOpen ? "pointer-events-auto" : "pointer-events-none",
      )}
      aria-hidden={!storySettingsOpen}
    >
      <button
        type="button"
        aria-label="Close story settings"
        className={cn(
          "absolute inset-0 bg-slate-950/65 backdrop-blur-sm transition-opacity duration-200",
          storySettingsOpen ? "opacity-100" : "opacity-0",
        )}
        onClick={() => setStorySettingsOpen(false)}
      />
      <div
        className={cn(
          "absolute inset-y-0 right-0 flex w-[min(92vw,28rem)] flex-col border-l border-divider bg-app-elevated shadow-hero transition-transform duration-200",
          storySettingsOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-divider px-4 py-4">
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
              Story Settings
            </div>
            <div className="mt-1 truncate text-sm font-semibold text-ink">{heading}</div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setStorySettingsOpen(false)}>
            Close
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
          {story && universe && playerCharacter ? (
            <>
              <Panel padding="sm">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                  Story Information
                </div>
                <dl className="mt-4 space-y-3 text-sm text-ink-soft">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-muted">Universe</dt>
                    <dd className="truncate">{universe.name}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-muted">Player Character</dt>
                    <dd className="truncate">{playerCharacter.name}</dd>
                  </div>
                </dl>
              </Panel>

              {(playerCharacter.scope ?? "library") === "story" ? (
                <Panel padding="sm" className="border-dashed border-white/12 bg-white/[0.03]">
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                    Quick Character
                  </div>
                  <p className="mt-3 text-sm leading-7 text-ink-muted">
                    This story is using a story-local protagonist. You can save them into your Player Characters library.
                  </p>
                  <Button
                    className="mt-4 w-full"
                    variant="secondary"
                    onClick={() => void handlePromoteCharacter()}
                    disabled={isPromotingCharacter}
                  >
                    {isPromotingCharacter ? "Saving..." : "Promote to Library"}
                  </Button>
                </Panel>
              ) : null}

              <Panel padding="sm">
                <form className="space-y-4" onSubmit={handleSaveStoryAI}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                      Story AI
                    </div>
                    <div className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                      {aiProviderType} · {aiModel}
                    </div>
                  </div>

                  <label className="block space-y-2">
                    <div className="text-xs text-ink-muted">Provider</div>
                    <select
                      className="w-full rounded-2xl border border-divider bg-panel-muted px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-accent/60 focus:bg-panel-strong focus:ring-2 focus:ring-accent/25"
                      value={aiProviderType}
                      onChange={(event) => {
                        const nextProvider = event.target.value as AIProviderType;
                        setAiProviderType(nextProvider);
                        setAiModel(
                          aiSettings?.defaultModels?.[nextProvider]?.trim() ||
                            getProviderDefaultModel(nextProvider),
                        );
                      }}
                    >
                      <option value="openai">OpenAI</option>
                      <option value="gemini">Gemini</option>
                      <option value="openrouter">OpenRouter</option>
                    </select>
                  </label>

                  <label className="block space-y-2">
                    <div className="text-xs text-ink-muted">Model</div>
                    <select
                      className="w-full rounded-2xl border border-divider bg-panel-muted px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-accent/60 focus:bg-panel-strong focus:ring-2 focus:ring-accent/25"
                      value={aiModel}
                      onChange={(event) => setAiModel(event.target.value)}
                    >
                      {getProviderModels(aiProviderType).map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <Button type="submit" className="w-full" disabled={isSavingAI}>
                    {isSavingAI ? "Saving..." : "Save AI Settings"}
                  </Button>
                </form>
              </Panel>

              <Panel padding="sm">
                <form className="space-y-4" onSubmit={handleSaveStoryDetails}>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                    Edit Story
                  </div>
                  <label className="block space-y-2">
                    <div className="text-xs text-ink-muted">Title</div>
                    <input
                      className="w-full rounded-2xl border border-divider bg-panel-muted px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-accent/60 focus:bg-panel-strong focus:ring-2 focus:ring-accent/25"
                      value={storyFields.title}
                      onChange={(event) =>
                        setStoryFields((current) => ({ ...current, title: event.target.value }))
                      }
                    />
                  </label>
                  <label className="block space-y-2">
                    <div className="text-xs text-ink-muted">Current Summary</div>
                    <textarea
                      className="min-h-[100px] w-full resize-y rounded-2xl border border-divider bg-panel-muted px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-accent/60 focus:bg-panel-strong focus:ring-2 focus:ring-accent/25"
                      value={storyFields.currentSummary}
                      onChange={(event) =>
                        setStoryFields((current) => ({
                          ...current,
                          currentSummary: event.target.value,
                        }))
                      }
                      placeholder="Optional summary for the current state of the story."
                    />
                  </label>
                  <Button type="submit" className="w-full" disabled={isSavingStory}>
                    {isSavingStory ? "Saving..." : "Save Story"}
                  </Button>
                </form>
              </Panel>

              <Panel padding="sm">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                  Export
                </div>
                <div className="mt-4 space-y-2">
                  <Button
                    variant="secondary"
                    className="w-full justify-start rounded-2xl"
                    onClick={() => handleExport("json")}
                  >
                    <DownloadIcon className="h-4 w-4" />
                    Export JSON
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full justify-start rounded-2xl"
                    onClick={() => handleExport("markdown")}
                  >
                    <DownloadIcon className="h-4 w-4" />
                    Export Markdown
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full justify-start rounded-2xl"
                    onClick={() => handleExport("txt")}
                  >
                    <DownloadIcon className="h-4 w-4" />
                    Export TXT
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full justify-start rounded-2xl"
                    onClick={() => handleExport("pdf")}
                  >
                    <DownloadIcon className="h-4 w-4" />
                    Export PDF
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full justify-start rounded-2xl"
                    onClick={() => handleExport("archive_pdf")}
                  >
                    <DownloadIcon className="h-4 w-4" />
                    Export Archive PDF
                  </Button>
                </div>
              </Panel>

              <Panel padding="sm">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                  Index / Archive
                </div>
                <div className="mt-4 space-y-3">
                  <Button
                    variant="secondary"
                    className="w-full justify-start rounded-2xl"
                    disabled={isRebuilding}
                    onClick={handleReindex}
                  >
                    {isRebuilding ? "Re-indexing..." : "Re-index"}
                  </Button>
                  {rebuildInfo ? (
                    <div className="rounded-2xl border border-white/8 bg-black/15 px-4 py-3 text-sm text-ink-muted">
                      {rebuildInfo.phase === "error"
                        ? rebuildInfo.error || "Rebuild failed."
                        : rebuildInfo.message ||
                          `Rebuilding… ${rebuildInfo.processedMessages}/${rebuildInfo.totalMessages} messages`}
                    </div>
                  ) : null}
                  {(() => {
                    if (!story || !storyStateData) {
                      return (
                        <div className="rounded-2xl border border-white/8 bg-black/15 px-4 py-3 text-sm text-ink-muted">
                          No indexed state available yet.
                        </div>
                      );
                    }

                    const totalMessages = getMessagesForStory(story.id).length;
                    const indexedMessageCount =
                      storyStateData.indexes?.messageCount ??
                      storyStateData.lastIndexedMessageCount ??
                      0;
                    const staleBy = Math.max(0, totalMessages - indexedMessageCount);
                    const worldFacts = storyStateData.indexes?.worldFacts ?? [];
                    const openThreads = storyStateData.indexes?.openThreads ?? [];
                    const characters = storyStateData.indexes?.characters
                      ? Object.values(storyStateData.indexes.characters)
                      : [];
                    const locations = storyStateData.indexes?.locations
                      ? Object.values(storyStateData.indexes.locations)
                      : [];
                    const relationships = storyStateData.indexes?.relationships ?? [];

                    return (
                      <div className="space-y-4 rounded-2xl border border-white/8 bg-black/15 px-4 py-4 text-sm">
                        <div className="space-y-2 text-ink-muted">
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
                            <div>Indexed</div>
                            <div className="text-ink-soft">
                              {storyStateData.lastIndexedAt ? new Date(storyStateData.lastIndexedAt).toLocaleString() : "—"}
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <div>Deep indexed</div>
                            <div className="text-ink-soft">
                              {storyStateData.lastDeepIndexedAt ? new Date(storyStateData.lastDeepIndexedAt).toLocaleString() : "—"}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-5">
                          {openThreads.length ? (
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                                Open Threads
                              </div>
                              <div className="mt-3 space-y-3">
                                {openThreads.slice(0, 8).map((entry, index) => (
                                  <div key={index} className="rounded-2xl border border-divider bg-white/[0.02] px-3 py-3">
                                    <div className="text-ink-soft">{entry.thread}</div>
                                    {renderEvidencePills(entry.evidence?.messageNumbers, `thread-${index}`)}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {worldFacts.length ? (
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                                World Facts
                              </div>
                              <div className="mt-3 space-y-3">
                                {worldFacts.slice(0, 8).map((entry, index) => (
                                  <div key={index} className="rounded-2xl border border-divider bg-white/[0.02] px-3 py-3">
                                    <div className="text-ink-soft">{entry.fact}</div>
                                    {renderEvidencePills(entry.evidence?.messageNumbers, `fact-${index}`)}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {characters.length ? (
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                                Characters
                              </div>
                              <div className="mt-3 space-y-3">
                                {characters
                                  .slice(0, 12)
                                  .sort((a, b) => a.name.localeCompare(b.name))
                                  .map((entry) => (
                                    <div key={entry.name} className="rounded-2xl border border-divider bg-white/[0.02] px-3 py-3">
                                      <div className="font-semibold text-ink-soft">{entry.name}</div>
                                      {entry.description ? (
                                        <div className="mt-1 text-xs text-ink-muted">{entry.description}</div>
                                      ) : null}
                                      {renderEvidencePills(entry.evidence?.messageNumbers, `char-${entry.name}`)}
                                    </div>
                                  ))}
                              </div>
                            </div>
                          ) : null}

                          {locations.length ? (
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                                Locations
                              </div>
                              <div className="mt-3 space-y-3">
                                {locations
                                  .slice(0, 12)
                                  .sort((a, b) => a.name.localeCompare(b.name))
                                  .map((entry) => (
                                    <div key={entry.name} className="rounded-2xl border border-divider bg-white/[0.02] px-3 py-3">
                                      <div className="font-semibold text-ink-soft">{entry.name}</div>
                                      {entry.description ? (
                                        <div className="mt-1 text-xs text-ink-muted">{entry.description}</div>
                                      ) : null}
                                      {renderEvidencePills(entry.evidence?.messageNumbers, `loc-${entry.name}`)}
                                    </div>
                                  ))}
                              </div>
                            </div>
                          ) : null}

                          {relationships.length ? (
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                                Relationships
                              </div>
                              <div className="mt-3 space-y-3">
                                {relationships.slice(0, 12).map((entry, index) => (
                                  <div key={`${entry.a}-${entry.b}-${index}`} className="rounded-2xl border border-divider bg-white/[0.02] px-3 py-3">
                                    <div className="font-semibold text-ink-soft">
                                      {entry.a} ↔ {entry.b}
                                    </div>
                                    {(() => {
                                      const parts = [
                                        typeof entry.friendship === "number" ? `Friendship ${Math.round(entry.friendship)}` : null,
                                        typeof entry.trust === "number" ? `Trust ${Math.round(entry.trust)}` : null,
                                        typeof entry.respect === "number" ? `Respect ${Math.round(entry.respect)}` : null,
                                        typeof entry.loyalty === "number" ? `Loyalty ${Math.round(entry.loyalty)}` : null,
                                        typeof entry.tension === "number" ? `Tension ${Math.round(entry.tension)}` : null,
                                        typeof entry.hostility === "number" ? `Hostility ${Math.round(entry.hostility)}` : null,
                                      ].filter(Boolean);
                                      return parts.length ? (
                                        <div className="mt-1 text-xs text-ink-soft">{parts.join(" · ")}</div>
                                      ) : null;
                                    })()}
                                    {entry.summary ? (
                                      <div className="mt-1 text-xs text-ink-muted">{entry.summary}</div>
                                    ) : null}
                                    {renderEvidencePills(entry.evidence?.messageNumbers, `rel-${index}`)}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </Panel>

              <Panel padding="sm">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                  Controls
                </div>
                <div className="mt-4 grid gap-2">
                  <Button variant="ghost" className="w-full" onClick={handleDeleteStory}>
                    <TrashIcon className="h-4 w-4" />
                    Delete Story
                  </Button>
                </div>
              </Panel>
            </>
          ) : (
            <Panel padding="sm">
              <div className="text-sm text-ink-muted">Select a story to view settings.</div>
            </Panel>
          )}

          {pageError ? (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
              {pageError}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
