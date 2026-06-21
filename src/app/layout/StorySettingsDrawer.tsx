import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DownloadIcon, TrashIcon } from "../../components/icons";
import { Button } from "../../components/ui/Button";
import { Panel } from "../../components/ui/Panel";
import { downloadFile } from "../../lib/download";
import { getProviderDefaultModel, getProviderModels } from "../../lib/ai/models";
import { serializeStoryExport } from "../../lib/storyExport";
import { buildStorySupportBundleZip } from "../../lib/supportBundle";
import { navigateToStoryMessageNumber } from "../../lib/events/storyNavigation";
import { normalizeStoryStateToV2, safeParseStoryStateData } from "../../lib/storyStateV2";
import { useDebouncedEffect } from "../../lib/useDebouncedEffect";
import type { AIProviderType, AutoIndexInterval, AutoIndexMode, ExportFormat } from "../../types/models";
import { cn } from "../../utils/cn";
import { useStoryEngine } from "../providers/StoryEngineProvider";
import { useTheme } from "../theming/ThemeContext";
import { themes } from "../theming/themes";
import { useUiPrefs } from "../ui/UiPrefsContext";

const ARCHIVE_PDF_DEBUG_URL = "http://127.0.0.1:7777/event";
const ARCHIVE_PDF_DEBUG_SESSION = "archive-pdf-no-op";

function reportArchivePdfDebug(args: {
  hypothesisId: string;
  location: string;
  msg: string;
  data?: Record<string, unknown>;
}) {
  // #region debug-point archive-pdf-no-op:report
  void fetch(ARCHIVE_PDF_DEBUG_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: ARCHIVE_PDF_DEBUG_SESSION,
      runId: "pre-fix",
      hypothesisId: args.hypothesisId,
      location: args.location,
      msg: `[DEBUG] ${args.msg}`,
      data: args.data,
      ts: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

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

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-[10px] border border-divider/[0.35] bg-app-elevated">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5"
      >
        <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">
          {title}
        </span>
        <svg
          className={cn(
            "shrink-0 text-white/30 transition-transform duration-150",
            open ? "rotate-0" : "-rotate-90",
          )}
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <div className="border-t border-divider/[0.25] px-4 pb-4 pt-3.5">{children}</div>
      ) : null}
    </div>
  );
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
    getChaptersForStory,
    exportStory,
    fetchStoryState,
    promoteStoryPlayerCharacter,
    cleanupDuplicatePlayerCharacters,
    updateStory,
    deleteStory,
    getStoryAIConfig,
    saveStoryAIConfig,
    queueStoryIndexJob,
    cancelBackgroundJob,
    backgroundJobs,
    dismissJobNotice,
    jobNotice,
    rebuildStatus,
  } = useStoryEngine();

  const story = storyId ? getStoryById(storyId) : undefined;
  const universe = story ? getUniverseById(story.universeId) : undefined;
  const playerCharacter = story ? getPlayerCharacterById(story.playerCharacterId) : undefined;

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [storyFields, setStoryFields] = useState({
    title: story?.title ?? "",
    currentSummary: story?.currentSummary ?? "",
    matureFictionMode: story?.matureFictionMode ?? false,
    autoIndexMode: (story?.autoIndexMode ??
      (story?.autoIndexInterval === "disabled" ? "disabled" : "messages")) as AutoIndexMode,
    autoIndexInterval: (story?.autoIndexInterval ?? 20) as AutoIndexInterval,
  });
  const { themeKey, setThemeKey } = useTheme();
  const [isExportingSupportBundle, setIsExportingSupportBundle] = useState(false);
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
  const [isCleanupConfirmOpen, setIsCleanupConfirmOpen] = useState(false);
  const [isCleaningDuplicates, setIsCleaningDuplicates] = useState(false);
  const [cleanupSummary, setCleanupSummary] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageNotice, setPageNotice] = useState<string | null>(null);
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
    setPageNotice(null);
    setCleanupSummary(null);

    try {
      await promoteStoryPlayerCharacter(story.id);
      window.alert("Saved to Player Characters.");
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Unable to promote character.",
      );
    } finally {
      setIsPromotingCharacter(false);
    }
  }

  async function handleCleanupDuplicates() {
    setIsCleaningDuplicates(true);
    setPageError(null);
    setPageNotice(null);
    setCleanupSummary(null);

    try {
      const result = await cleanupDuplicatePlayerCharacters();
      const summary = `Merged ${result.mergedDuplicates} duplicates; updated ${result.updatedStories} stories.`;
      setCleanupSummary(summary);
      window.alert(summary);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Unable to cleanup duplicates.");
    } finally {
      setIsCleaningDuplicates(false);
      setIsCleanupConfirmOpen(false);
    }
  }

  useEffect(() => {
    if (!story) {
      return;
    }

    setStoryFields({
      title: story.title,
      currentSummary: story.currentSummary,
      matureFictionMode: story.matureFictionMode ?? false,
      autoIndexMode: (story.autoIndexMode ??
        (story.autoIndexInterval === "disabled" ? "disabled" : "messages")) as AutoIndexMode,
      autoIndexInterval: (story.autoIndexInterval ?? 20) as AutoIndexInterval,
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
        storyFields.currentSummary === story.currentSummary &&
        storyFields.matureFictionMode === (story.matureFictionMode ?? false) &&
        storyFields.autoIndexMode ===
          ((story.autoIndexMode ??
            (story.autoIndexInterval === "disabled" ? "disabled" : "messages")) as AutoIndexMode) &&
        storyFields.autoIndexInterval === (story.autoIndexInterval ?? 20)
      ) {
        return;
      }

      if (!storyFields.title.trim()) {
        return;
      }

      void updateStory(story.id, storyFields).catch(() => {});
    },
    800,
    [
      story?.id,
      storyFields.title,
      storyFields.currentSummary,
      storyFields.matureFictionMode,
      storyFields.autoIndexMode,
      storyFields.autoIndexInterval,
    ],
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

  function revealStatus() {
    window.setTimeout(() => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }, 0);
  }

  function showNotice(value: string | null) {
    setPageNotice(value);
    if (value) {
      revealStatus();
    }
  }

  function showError(value: string | null) {
    setPageError(value);
    if (value) {
      revealStatus();
    }
  }

  async function handleExport(format: ExportFormat) {
    if (!story) {
      return;
    }

    showError(null);
    showNotice(null);

    try {
      // #region debug-point archive-pdf-no-op:export-start
      reportArchivePdfDebug({
        hypothesisId: "A",
        location: "StorySettingsDrawer.tsx:handleExport:start",
        msg: "export clicked",
        data: {
          storyId: story.id,
          format,
        },
      });
      // #endregion
      if (format === "archive_pdf") {
        showNotice("Generating PDF…");
      }

      const bundle = await exportStory(story.id, {
        refreshArchiveIfStale: format === "archive_pdf",
      });
      // #region debug-point archive-pdf-no-op:bundle
      reportArchivePdfDebug({
        hypothesisId: "B",
        location: "StorySettingsDrawer.tsx:handleExport:exportStory",
        msg: "export bundle assembled",
        data: {
          ok: Boolean(bundle),
          messageCount: bundle?.messages?.length ?? null,
        },
      });
      // #endregion

      if (!bundle) {
        showError("Unable to assemble export data for this story.");
        return;
      }

      const { content, mimeType } = serializeStoryExport(bundle, format);
      // #region debug-point archive-pdf-no-op:serialized
      reportArchivePdfDebug({
        hypothesisId: "C",
        location: "StorySettingsDrawer.tsx:handleExport:serializeStoryExport",
        msg: "export serialized",
        data: {
          format,
          mimeType,
          contentType: typeof content,
          byteLength:
            content instanceof Uint8Array
              ? content.byteLength
              : content instanceof ArrayBuffer
                ? content.byteLength
                : null,
        },
      });
      // #endregion
      await downloadFile(createExportFilename(story.title, format), content, mimeType);
      // #region debug-point archive-pdf-no-op:download-ok
      reportArchivePdfDebug({
        hypothesisId: "D",
        location: "StorySettingsDrawer.tsx:handleExport:downloadFile",
        msg: "downloadFile resolved",
        data: { format },
      });
      // #endregion
    } catch (error) {
      // #region debug-point archive-pdf-no-op:export-error
      reportArchivePdfDebug({
        hypothesisId: "E",
        location: "StorySettingsDrawer.tsx:handleExport:catch",
        msg: "export failed",
        data: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      // #endregion
      showError(error instanceof Error ? error.message : "Unable to export.");
    } finally {
      showNotice(null);
    }
  }

  async function handleExportSupportBundle() {
    if (!story) {
      return;
    }

    setIsExportingSupportBundle(true);
    setPageError(null);
    setPageNotice("Updating archive…");

    try {
      setPageNotice("Generating support bundle…");
      const bundle = await exportStory(story.id, { refreshArchiveIfStale: true });

      if (!bundle) {
        setPageError("Unable to assemble export data for this story.");
        return;
      }

      const zip = await buildStorySupportBundleZip(bundle);
      await downloadFile(zip.filename, zip.content, zip.mimeType);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Unable to export support bundle.");
    } finally {
      setIsExportingSupportBundle(false);
      setPageNotice(null);
    }
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
  const storyJobs = story
    ? backgroundJobs.filter((job) => job.storyId === story.id)
    : [];

  async function handleReindex() {
    if (!story) {
      return;
    }

    setPageError(null);
    setPageNotice(null);
    try {
      const result = await queueStoryIndexJob(story.id, { trigger: "manual" });
      if (result.duplicate) {
        setPageNotice("Indexing already running for this story.");
      } else if (await isAndroidNativePlatform()) {
        setPageNotice("Indexing queued on Android. You can leave the story while it runs.");
      } else {
        setPageNotice("Indexing queued in the background.");
      }
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

  function renderArchiveDropdown(args: {
    title: string;
    defaultOpen?: boolean;
    countLabel?: string;
    children: React.ReactNode;
  }) {
    return (
      <details
        open={args.defaultOpen}
        className="rounded-[9px] border border-divider/[0.4] bg-panel-muted/40 px-3 py-3"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft marker:content-none">
          <span>{args.title}</span>
          {args.countLabel ? <span className="text-[11px] text-ink-muted">{args.countLabel}</span> : null}
        </summary>
        <div className="mt-3">{args.children}</div>
      </details>
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
          "absolute inset-0 bg-app/80 backdrop-blur-sm transition-opacity duration-200",
          storySettingsOpen ? "opacity-100" : "opacity-0",
        )}
        onClick={() => setStorySettingsOpen(false)}
      />
      <div
        className={cn(
          "absolute inset-y-0 right-0 flex w-[min(92vw,28rem)] flex-col border-l border-divider/[0.4] bg-app shadow-2xl transition-transform duration-200",
          storySettingsOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-divider/[0.3] px-4 py-3.5">
          <div className="min-w-0">
            <div className="truncate text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">
              Story Settings
            </div>
            <div className="mt-1 truncate text-sm font-semibold text-ink">{heading}</div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setStorySettingsOpen(false)}>
            Close
          </Button>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-auto p-3.5">
          {story && universe && playerCharacter ? (
            <>
              <CollapsibleSection title="Story Information" defaultOpen>
                <dl className="space-y-2.5 text-sm text-ink-soft">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-muted">Universe</dt>
                    <dd className="truncate">{universe.name}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-muted">Player Character</dt>
                    <dd className="truncate">{playerCharacter.name}</dd>
                  </div>
                </dl>
              </CollapsibleSection>

              {(playerCharacter.scope ?? "library") === "story" ? (
                <CollapsibleSection title="Quick Character" defaultOpen>
                  <p className="text-[13px] leading-6 text-ink-muted">
                    This story is using a story-local protagonist. You can save them into your Player Characters library.
                  </p>
                  <Button
                    className="mt-3 w-full"
                    variant="secondary"
                    onClick={() => void handlePromoteCharacter()}
                    disabled={isPromotingCharacter}
                  >
                    {isPromotingCharacter ? "Saving..." : "Promote to Library"}
                  </Button>
                </CollapsibleSection>
              ) : null}

              <CollapsibleSection title="Story AI" defaultOpen>
                <form className="space-y-3" onSubmit={handleSaveStoryAI}>
                  <div className="mb-1 text-xs uppercase tracking-[0.18em] text-ink-muted">
                    {aiProviderType} · {aiModel}
                  </div>

                  <label className="block space-y-2">
                    <div className="text-xs text-ink-muted">Provider</div>
                    <select
                      className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-accent/[0.4] focus:ring-2 focus:ring-accent/[0.15]"
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
                      className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-accent/[0.4] focus:ring-2 focus:ring-accent/[0.15]"
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
              </CollapsibleSection>

              <CollapsibleSection title="Edit Story">
                <form className="space-y-3" onSubmit={handleSaveStoryDetails}>
                  <label className="block space-y-2">
                    <div className="text-xs text-ink-muted">Title</div>
                    <input
                      className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-accent/[0.4] focus:ring-2 focus:ring-accent/[0.15]"
                      value={storyFields.title}
                      onChange={(event) =>
                        setStoryFields((current) => ({ ...current, title: event.target.value }))
                      }
                    />
                  </label>
                  <label className="block space-y-2">
                    <div className="text-xs text-ink-muted">Current Summary</div>
                    <textarea
                      className="min-h-[100px] w-full resize-y rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-accent/[0.4] focus:ring-2 focus:ring-accent/[0.15]"
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
              </CollapsibleSection>

              <CollapsibleSection title="Theme">
                <label className="block space-y-2">
                  <div className="text-xs text-ink-muted">Theme</div>
                  <select
                    className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-accent/[0.4] focus:ring-2 focus:ring-accent/[0.15]"
                    value={themeKey}
                    onChange={(event) => setThemeKey(event.target.value as any)}
                  >
                    {Object.keys(themes).map((key) => (
                      <option key={key} value={key}>
                        {key}
                      </option>
                    ))}
                  </select>
                </label>
              </CollapsibleSection>

              <CollapsibleSection title="Automatic Indexing">
                <div className="space-y-3">
                  <label className="block space-y-2">
                    <div className="text-xs text-ink-muted">Indexing mode</div>
                    <select
                      className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-accent/[0.4] focus:ring-2 focus:ring-accent/[0.15]"
                      value={storyFields.autoIndexMode}
                      onChange={(event) =>
                        setStoryFields((current) => ({
                          ...current,
                          autoIndexMode: event.target.value as AutoIndexMode,
                          autoIndexInterval:
                            event.target.value === "disabled"
                              ? "disabled"
                              : current.autoIndexInterval === "disabled"
                                ? 20
                                : current.autoIndexInterval,
                        }))
                      }
                    >
                      <option value="disabled">Disabled</option>
                      <option value="messages">Every N messages</option>
                      <option value="chapter">After every chapter</option>
                    </select>
                  </label>
                  {storyFields.autoIndexMode === "messages" ? (
                    <label className="block space-y-2">
                      <div className="text-xs text-ink-muted">Interval</div>
                      <select
                        className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-accent/[0.4] focus:ring-2 focus:ring-accent/[0.15]"
                        value={storyFields.autoIndexInterval === "disabled" ? 20 : storyFields.autoIndexInterval}
                        onChange={(event) =>
                          setStoryFields((current) => ({
                            ...current,
                            autoIndexInterval: Number(event.target.value) as AutoIndexInterval,
                          }))
                        }
                      >
                        <option value={5}>Every 5 messages</option>
                        <option value={10}>Every 10 messages</option>
                        <option value={15}>Every 15 messages</option>
                        <option value={20}>Every 20 messages</option>
                      </select>
                    </label>
                  ) : null}
                  <div className="rounded-[8px] border border-divider/[0.4] bg-panel-muted/50 px-3.5 py-3 text-sm text-ink-muted">
                    {storyFields.autoIndexMode === "disabled"
                      ? "Automatic indexing is disabled. Manual re-index still works."
                      : storyFields.autoIndexMode === "chapter"
                        ? "Automatic indexing runs after every chapter end."
                        : `Automatic indexing runs every ${storyFields.autoIndexInterval === "disabled" ? 20 : storyFields.autoIndexInterval} messages (manual re-index does not affect this schedule).`}
                  </div>
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Content Mode">
                <div className="space-y-3">
                  <label className="block space-y-2">
                    <div className="text-xs text-ink-muted">Mature fiction (non-graphic)</div>
                    <select
                      className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-accent/[0.4] focus:ring-2 focus:ring-accent/[0.15]"
                      value={storyFields.matureFictionMode ? "on" : "off"}
                      onChange={(event) =>
                        setStoryFields((current) => ({
                          ...current,
                          matureFictionMode: event.target.value === "on",
                        }))
                      }
                    >
                      <option value="off">Off</option>
                      <option value="on">On</option>
                    </select>
                  </label>
                  <div className="rounded-[8px] border border-divider/[0.4] bg-panel-muted/50 px-3.5 py-3 text-sm text-ink-muted">
                    When enabled, prompts and transmit-safe retries are tuned for serious fiction: injury aftermath, trauma, grief, and recovery are treated as legitimate narrative context (still non-graphic, still no harmful instructions).
                  </div>
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Export">
                <div className="space-y-2">
                  <Button
                    variant="secondary"
                    className="w-full justify-start rounded-[8px]"
                    onClick={() => handleExport("json")}
                  >
                    <DownloadIcon className="h-4 w-4" />
                    Export JSON
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full justify-start rounded-[8px]"
                    onClick={() => void handleExportSupportBundle()}
                    disabled={isExportingSupportBundle}
                  >
                    <DownloadIcon className="h-4 w-4" />
                    {isExportingSupportBundle ? "Exporting..." : "Export Support Bundle"}
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full justify-start rounded-[8px]"
                    onClick={() => handleExport("markdown")}
                  >
                    <DownloadIcon className="h-4 w-4" />
                    Export Markdown
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full justify-start rounded-[8px]"
                    onClick={() => handleExport("txt")}
                  >
                    <DownloadIcon className="h-4 w-4" />
                    Export TXT
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full justify-start rounded-[8px]"
                    onClick={() => handleExport("pdf")}
                  >
                    <DownloadIcon className="h-4 w-4" />
                    Export PDF
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full justify-start rounded-[8px]"
                    onClick={() => handleExport("archive_pdf")}
                  >
                    <DownloadIcon className="h-4 w-4" />
                    Export Archive PDF
                  </Button>
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Index / Archive" defaultOpen>
                <div className="space-y-3">
                  <Button
                    variant="secondary"
                    className="w-full justify-start rounded-[8px]"
                    disabled={isRebuilding}
                    onClick={handleReindex}
                  >
                    {isRebuilding ? "Re-indexing..." : "Re-index"}
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full justify-start rounded-[8px]"
                    disabled={isCleaningDuplicates}
                    onClick={() => setIsCleanupConfirmOpen(true)}
                  >
                    {isCleaningDuplicates ? "Cleaning..." : "Cleanup Duplicates"}
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full justify-start rounded-[8px]"
                    onClick={() => {
                      if (!story) {
                        return;
                      }
                      setPageError(null);
                      setPageNotice(null);
                      void updateStory(story.id, { isArchived: !story.isArchived }).catch((error) => {
                        setPageError(error instanceof Error ? error.message : "Unable to update story.");
                      });
                    }}
                  >
                    {story?.isArchived ? "Restore Story" : "Archive Story"}
                  </Button>
                  {cleanupSummary ? (
                    <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                      {cleanupSummary}
                    </div>
                  ) : null}
                  {rebuildInfo ? (
                    <div className="rounded-[8px] border border-divider/[0.4] bg-panel-muted/50 px-3.5 py-3 text-sm text-ink-muted">
                      {rebuildInfo.phase === "error"
                        ? rebuildInfo.error || "Rebuild failed."
                        : rebuildInfo.message ||
                          `Rebuilding… ${rebuildInfo.processedMessages}/${rebuildInfo.totalMessages} messages`}
                    </div>
                  ) : null}
                  {storyJobs.length ? (
                    <div className="space-y-2">
                      {storyJobs.slice(0, 6).map((job) => (
                        <div
                          key={job.id}
                          className="rounded-[8px] border border-divider/[0.4] bg-panel-muted/50 px-3.5 py-3 text-sm text-ink-muted"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-semibold text-ink-soft">
                                {job.type === "metachat_generate" ? "MetaChat reply" : "Indexing"}
                              </div>
                              <div className="mt-1 text-xs uppercase tracking-[0.18em] text-ink-muted">
                                {job.status}
                              </div>
                              {job.progress?.label ? (
                                <div className="mt-2 text-sm">{job.progress.label}</div>
                              ) : null}
                              {job.error ? (
                                <div className="mt-2 text-sm text-rose-200">{job.error}</div>
                              ) : null}
                            </div>
                            {job.status === "queued" || job.status === "running" ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void cancelBackgroundJob(job.id)}
                              >
                                Cancel
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {(() => {
                    if (!story || !storyStateData) {
                      return (
                        <div className="rounded-[8px] border border-divider/[0.4] bg-panel-muted/50 px-3.5 py-3 text-sm text-ink-muted">
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
                    const characterStates = Object.entries(storyStateData.characters ?? {});
                    const locations = storyStateData.indexes?.locations
                      ? Object.values(storyStateData.indexes.locations)
                      : [];
                    const relationships = storyStateData.indexes?.relationships ?? [];
                    const significantMemories = (storyStateData.indexes as any)?.significantMemories ?? [];
                    const chapters = getChaptersForStory(story.id);
                    const premise = storyStateData.summaries?.premise?.trim() ?? "";
                    const protagonistSummary = storyStateData.summaries?.protagonistSummary?.trim() ?? "";
                    const currentSituation = storyStateData.summaries?.currentSituation?.trim() ?? "";
                    const recentDevelopments = trimStringList(storyStateData.summaries?.recentDevelopments, 6);
                    const autoIndexMode = (story.autoIndexMode ??
                      (story.autoIndexInterval === "disabled" ? "disabled" : "messages")) as AutoIndexMode;
                    const autoIndexInterval = story.autoIndexInterval ?? 20;
                    const intervalValue = autoIndexInterval === "disabled" ? 20 : autoIndexInterval;
                    const lastAutoDeepIndexMessageCount =
                      storyStateData.lastAutoDeepIndexedMessageCount ?? 0;
                    const messagesSinceAutoDeep = Math.max(
                      0,
                      totalMessages - lastAutoDeepIndexMessageCount,
                    );
                    const messagesUntilAutoDeep =
                      autoIndexMode !== "messages"
                        ? null
                        : Math.max(
                            0,
                            intervalValue -
                              Math.min(messagesSinceAutoDeep, intervalValue),
                          );

                    return (
                      <div className="space-y-4 rounded-[9px] border border-divider/[0.4] bg-panel-muted/30 px-4 py-4 text-sm">
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
                          <div className="flex items-center justify-between gap-3">
                            <div>Auto deep indexed</div>
                            <div className="text-ink-soft">
                              {storyStateData.lastAutoDeepIndexedAt
                                ? new Date(storyStateData.lastAutoDeepIndexedAt).toLocaleString()
                                : "—"}
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <div>Next auto index</div>
                            <div className="text-ink-soft">
                              {autoIndexMode === "disabled"
                                ? "Disabled"
                                : autoIndexMode === "chapter"
                                  ? "After next chapter"
                                  : messagesUntilAutoDeep === 0
                                    ? "Ready on next pass"
                                    : `In ${messagesUntilAutoDeep} message${messagesUntilAutoDeep === 1 ? "" : "s"}`}
                            </div>
                          </div>
                        </div>

                        <div className="rounded-[8px] border border-divider/[0.4] bg-panel-muted/40 px-3 py-3 text-sm text-ink-muted">
                          {autoIndexMode === "disabled"
                            ? "Automatic indexing is disabled for this story."
                            : autoIndexMode === "chapter"
                              ? "Automatic indexing runs after every chapter end."
                              : `Automatic indexing runs every ${intervalValue} new messages. Progress: ${Math.min(messagesSinceAutoDeep, intervalValue)}/${intervalValue}.`}
                        </div>

                        <div className="space-y-5">
                          {chapters.length
                            ? renderArchiveDropdown({
                                title: "Chapters",
                                countLabel: String(chapters.length),
                                children: (
                                  <div className="space-y-3">
                                    {chapters.map((chapter) => (
                                      <div
                                        key={chapter.id}
                                        className="rounded-[8px] border border-divider/[0.4] bg-panel-muted/40 px-3 py-3"
                                      >
                                        <div className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
                                          <span className="truncate">{chapter.label}</span>
                                          <span className="shrink-0">Ends at #{chapter.endsAtIndex}</span>
                                        </div>
                                        {chapter.summary?.trim() ? (
                                          <div className="mt-2 whitespace-pre-wrap text-sm text-ink-soft">
                                            {chapter.summary.trim()}
                                          </div>
                                        ) : (
                                          <div className="mt-2 text-sm text-ink-muted">
                                            No summary yet.
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ),
                              })
                            : null}
                          {premise || protagonistSummary || currentSituation || recentDevelopments.length
                            ? renderArchiveDropdown({
                                title: "Story State",
                                defaultOpen: true,
                                children: (
                                  <div className="space-y-3">
                                    {premise ? (
                                      <div className="rounded-[8px] border border-divider/[0.4] bg-panel-muted/40 px-3 py-3">
                                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
                                          Premise
                                        </div>
                                        <div className="mt-2 text-sm text-ink-soft">{premise}</div>
                                      </div>
                                    ) : null}
                                    {protagonistSummary ? (
                                      <div className="rounded-[8px] border border-divider/[0.4] bg-panel-muted/40 px-3 py-3">
                                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
                                          Protagonist
                                        </div>
                                        <div className="mt-2 text-sm text-ink-soft">{protagonistSummary}</div>
                                      </div>
                                    ) : null}
                                    {currentSituation ? (
                                      <div className="rounded-[8px] border border-divider/[0.4] bg-panel-muted/40 px-3 py-3">
                                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
                                          Current Situation
                                        </div>
                                        <div className="mt-2 text-sm text-ink-soft">{currentSituation}</div>
                                      </div>
                                    ) : null}
                                    {recentDevelopments.length ? (
                                      <div className="rounded-[8px] border border-divider/[0.4] bg-panel-muted/40 px-3 py-3">
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
                                  </div>
                                ),
                              })
                            : null}

                          {openThreads.length
                            ? renderArchiveDropdown({
                                title: "Open Threads",
                                defaultOpen: true,
                                countLabel: `${Math.min(openThreads.length, 8)} shown`,
                                children: (
                                  <div className="space-y-3">
                                    {openThreads.slice(0, 8).map((entry, index) => (
                                      <div key={index} className="rounded-[8px] border border-divider/[0.4] bg-panel-muted/40 px-3 py-3">
                                        <div className="text-ink-soft">{entry.thread}</div>
                                        {renderEvidencePills(entry.evidence?.messageNumbers, `thread-${index}`)}
                                      </div>
                                    ))}
                                  </div>
                                ),
                              })
                            : null}

                          {worldFacts.length
                            ? renderArchiveDropdown({
                                title: "World Facts",
                                countLabel: `${Math.min(worldFacts.length, 8)} shown`,
                                children: (
                                  <div className="space-y-3">
                                    {worldFacts.slice(0, 8).map((entry, index) => (
                                      <div key={index} className="rounded-[8px] border border-divider/[0.4] bg-panel-muted/40 px-3 py-3">
                                        <div className="text-ink-soft">{entry.fact}</div>
                                        {renderEvidencePills(entry.evidence?.messageNumbers, `fact-${index}`)}
                                      </div>
                                    ))}
                                  </div>
                                ),
                              })
                            : null}

                          {characterStates.length
                            ? renderArchiveDropdown({
                                title: "Character Status",
                                countLabel: `${characterStates.length} tracked`,
                                children: (
                                  <div className="space-y-3">
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
                                          <div key={name} className="rounded-[8px] border border-divider/[0.4] bg-panel-muted/40 px-3 py-3">
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
                                ),
                              })
                            : null}

                          {characters.length
                            ? renderArchiveDropdown({
                                title: "Characters",
                                countLabel: `${Math.min(characters.length, 12)} shown`,
                                children: (
                                  <div className="space-y-3">
                                    {characters
                                      .slice(0, 12)
                                      .sort((a, b) => a.name.localeCompare(b.name))
                                      .map((entry) => (
                                        <div key={entry.name} className="rounded-[8px] border border-divider/[0.4] bg-panel-muted/40 px-3 py-3">
                                          <div className="font-semibold text-ink-soft">{entry.name}</div>
                                          {entry.description ? (
                                            <div className="mt-1 text-sm text-ink-muted">{entry.description}</div>
                                          ) : null}
                                          {renderEvidencePills(entry.evidence?.messageNumbers, `char-${entry.name}`)}
                                        </div>
                                      ))}
                                  </div>
                                ),
                              })
                            : null}

                          {locations.length
                            ? renderArchiveDropdown({
                                title: "Locations",
                                countLabel: `${Math.min(locations.length, 12)} shown`,
                                children: (
                                  <div className="space-y-3">
                                    {locations
                                      .slice(0, 12)
                                      .sort((a, b) => a.name.localeCompare(b.name))
                                      .map((entry) => (
                                        <div key={entry.name} className="rounded-[8px] border border-divider/[0.4] bg-panel-muted/40 px-3 py-3">
                                          <div className="font-semibold text-ink-soft">{entry.name}</div>
                                          {entry.description ? (
                                            <div className="mt-1 text-sm text-ink-muted">{entry.description}</div>
                                          ) : null}
                                          {renderEvidencePills(entry.evidence?.messageNumbers, `loc-${entry.name}`)}
                                        </div>
                                      ))}
                                  </div>
                                ),
                              })
                            : null}

                          {relationships.length
                            ? renderArchiveDropdown({
                                title: "Relationships",
                                countLabel: `${Math.min(relationships.length, 12)} shown`,
                                children: (
                                  <div className="space-y-3">
                                    {relationships.slice(0, 12).map((entry, index) => (
                                      <div key={`${entry.a}-${entry.b}-${index}`} className="rounded-[8px] border border-divider/[0.4] bg-panel-muted/40 px-3 py-3">
                                        <div className="font-semibold text-ink-soft">
                                          {entry.a} ↔ {entry.b}
                                        </div>
                                        {(() => {
                                          const parts = [
                                            typeof entry.friendship === "number" ? `Friendship ${Math.round(entry.friendship)}` : null,
                                            typeof entry.trust === "number" ? `Trust ${Math.round(entry.trust)}` : null,
                                            typeof entry.respect === "number" ? `Respect ${Math.round(entry.respect)}` : null,
                                            typeof entry.loyalty === "number" ? `Loyalty ${Math.round(entry.loyalty)}` : null,
                                            typeof entry.comfort === "number" ? `Comfort ${Math.round(entry.comfort)}` : null,
                                            typeof entry.suspicion === "number" ? `Suspicion ${Math.round(entry.suspicion)}` : null,
                                            typeof entry.fear === "number" ? `Fear ${Math.round(entry.fear)}` : null,
                                            typeof entry.affection === "number" ? `Affection ${Math.round(entry.affection)}` : null,
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
                                ),
                              })
                            : null}

                          {Array.isArray(significantMemories) && significantMemories.length
                            ? renderArchiveDropdown({
                                title: "Significant Memories",
                                countLabel: `${Math.min(significantMemories.length, 8)} shown`,
                                children: (
                                  <div className="space-y-3">
                                    {significantMemories.slice(0, 8).map((entry: any, index: number) => (
                                      <div key={index} className="rounded-[8px] border border-divider/[0.4] bg-panel-muted/40 px-3 py-3">
                                        <div className="text-ink-soft">{entry?.moment ?? entry?.memory ?? entry?.fact ?? "—"}</div>
                                        {renderEvidencePills(entry?.evidence?.messageNumbers, `mem-${index}`)}
                                      </div>
                                    ))}
                                  </div>
                                ),
                              })
                            : null}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Controls">
                <div className="grid gap-2">
                  <Button variant="ghost" className="w-full" onClick={handleDeleteStory}>
                    <TrashIcon className="h-4 w-4" />
                    Delete Story
                  </Button>
                </div>
              </CollapsibleSection>
            </>
          ) : (
            <div className="rounded-[10px] border border-divider/[0.35] bg-app-elevated px-4 py-3 text-sm text-ink-muted">
              Select a story to view settings.
            </div>
          )}

          {pageError ? (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
              {pageError}
            </div>
          ) : null}
          {pageNotice ? (
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
              {pageNotice}
            </div>
          ) : null}
          {jobNotice ? (
            <div className="rounded-2xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm text-sky-100">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{jobNotice.title}</div>
                  <div className="mt-1">{jobNotice.body}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={dismissJobNotice}>
                  Dismiss
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div
        className={cn(
          "fixed inset-0 z-[80]",
          isCleanupConfirmOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!isCleanupConfirmOpen}
      >
        <button
          type="button"
          aria-label="Close cleanup dialog"
          className={cn(
            "absolute inset-0 bg-app/80 backdrop-blur-sm transition-opacity duration-200",
            isCleanupConfirmOpen ? "opacity-100" : "opacity-0",
          )}
          onClick={() => setIsCleanupConfirmOpen(false)}
        />
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center p-4 transition-opacity duration-200",
            isCleanupConfirmOpen ? "opacity-100" : "opacity-0",
          )}
        >
          <div className="w-full max-w-lg">
            <Panel variant="flat" padding="lg" role="dialog" aria-modal="true">
              <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">
                Cleanup
              </div>
              <div className="mt-2 text-[18px] font-bold tracking-tight text-ink">
                Cleanup Duplicates
              </div>
              <div className="mt-3 text-sm leading-7 text-ink-muted">
                This will merge duplicate Player Characters and update any stories that reference them.
              </div>
              <div className="mt-2 text-sm leading-7 text-ink-muted">
                It targets likely duplicates with the same name and universe where one is story-scoped and one is in the library.
              </div>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button
                  variant="secondary"
                  onClick={() => setIsCleanupConfirmOpen(false)}
                  disabled={isCleaningDuplicates}
                >
                  Cancel
                </Button>
                <Button onClick={() => void handleCleanupDuplicates()} disabled={isCleaningDuplicates}>
                  {isCleaningDuplicates ? "Cleaning..." : "Run Cleanup"}
                </Button>
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
