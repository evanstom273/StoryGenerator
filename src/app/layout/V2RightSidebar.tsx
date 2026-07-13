import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DownloadIcon, TrashIcon } from "../../components/icons";
import { Button, buttonClasses } from "../../components/ui/Button";
import { Panel } from "../../components/ui/Panel";
import { downloadFile } from "../../lib/download";
import { serializeStoryExport } from "../../lib/storyExport";
import { buildStorySupportBundleZip } from "../../lib/supportBundle";
import type { ExportFormat } from "../../types/models";
import { cn } from "../../utils/cn";
import { StoryListRow } from "../../components/story/StoryListRow";
import { useStoryEngine } from "../providers/StoryEngineProvider";
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

interface V2RightSidebarProps {
  storyId?: string;
  className?: string;
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

export function V2RightSidebar({
  storyId,
  className,
}: V2RightSidebarProps) {
  const navigate = useNavigate();
  const { setStorySettingsOpen } = useUiPrefs();
  const {
    stories,
    getStoryById,
    getUniverseById,
    getPlayerCharacterById,
    exportStory,
    deleteStory,
  } = useStoryEngine();

  const story = storyId ? getStoryById(storyId) : undefined;
  const universe = story ? getUniverseById(story.universeId) : undefined;
  const playerCharacter = story ? getPlayerCharacterById(story.playerCharacterId) : undefined;

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageNotice, setPageNotice] = useState<string | null>(null);
  const [isExportingSupportBundle, setIsExportingSupportBundle] = useState(false);
  const [exportStage, setExportStage] = useState<string | null>(null);

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

  const recentStories = useMemo(() => stories.slice(0, 8), [stories]);

  async function handleExport(format: ExportFormat) {
    if (!story) {
      return;
    }

    showError(null);
    showNotice(null);

    const stageLabels: Record<ExportFormat, string[]> = {
      json: ["Assembling data…", "Saving…"],
      markdown: ["Assembling data…", "Formatting…", "Saving…"],
      txt: ["Assembling data…", "Formatting…", "Saving…"],
      pdf: ["Assembling data…", "Rendering PDF…", "Saving…"],
      archive_pdf: ["Refreshing archive…", "Assembling data…", "Rendering PDF…", "Saving…"],
    };

    const stages = stageLabels[format] ?? ["Exporting…"];
    setExportStage(stages[0]);
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    try {
      // #region debug-point archive-pdf-no-op:export-start
      reportArchivePdfDebug({
        hypothesisId: "A",
        location: "V2RightSidebar.tsx:handleExport:start",
        msg: "export clicked",
        data: {
          storyId: story.id,
          format,
        },
      });
      // #endregion

      setExportStage(stages[1] ?? stages[0]);
      const bundle = await exportStory(story.id, {
        refreshArchiveIfStale: format === "archive_pdf",
      });
      // #region debug-point archive-pdf-no-op:bundle
      reportArchivePdfDebug({
        hypothesisId: "B",
        location: "V2RightSidebar.tsx:handleExport:exportStory",
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

      setExportStage(stages[2] ?? stages[1] ?? stages[0]);
      const { content, mimeType } = serializeStoryExport(bundle, format);
      // #region debug-point archive-pdf-no-op:serialized
      reportArchivePdfDebug({
        hypothesisId: "C",
        location: "V2RightSidebar.tsx:handleExport:serializeStoryExport",
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
      setExportStage(stages[stages.length - 1]);
      await downloadFile(createExportFilename(story.title, format), content, mimeType);
      // #region debug-point archive-pdf-no-op:download-ok
      reportArchivePdfDebug({
        hypothesisId: "D",
        location: "V2RightSidebar.tsx:handleExport:downloadFile",
        msg: "downloadFile resolved",
        data: { format },
      });
      // #endregion
    } catch (error) {
      // #region debug-point archive-pdf-no-op:export-error
      reportArchivePdfDebug({
        hypothesisId: "E",
        location: "V2RightSidebar.tsx:handleExport:catch",
        msg: "export failed",
        data: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      // #endregion
      showError(error instanceof Error ? error.message : "Unable to export.");
    } finally {
      setExportStage(null);
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

  async function handleDeleteStory() {
    if (!story) {
      return;
    }

    const confirmed = window.confirm(
      "Delete this story and every stored message in its timeline?",
    );

    if (!confirmed) {
      return;
    }

    await deleteStory(story.id);
    navigate("/stories");
  }

  return (
    <aside className={cn("h-full", className)}>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-divider px-4 py-4">
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
              {story ? "Story Info" : "Workspace"}
            </div>
            <div className="mt-1 truncate text-sm font-semibold text-ink">
              {story ? story.title : "No story selected"}
            </div>
          </div>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
          {story && universe && playerCharacter ? (
            <>
              <Panel variant="flat" padding="sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                    Story Information
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0"
                    onClick={() => setStorySettingsOpen(true)}
                  >
                    Settings
                  </Button>
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

              <Panel variant="flat" padding="sm">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                  Export
                </div>
                <div className="mt-4 space-y-2">
                  {exportStage && (
                    <p className="text-xs text-muted-foreground px-1">{exportStage}</p>
                  )}
                  <Button
                    variant="secondary"
                    className="w-full justify-start rounded-2xl"
                    onClick={() => handleExport("json")}
                    disabled={!!exportStage || isExportingSupportBundle}
                  >
                    <DownloadIcon className="h-4 w-4" />
                    Export JSON
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full justify-start rounded-2xl"
                    onClick={() => void handleExportSupportBundle()}
                    disabled={isExportingSupportBundle || !!exportStage}
                  >
                    <DownloadIcon className="h-4 w-4" />
                    {isExportingSupportBundle ? "Exporting..." : "Export Support Bundle"}
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full justify-start rounded-2xl"
                    onClick={() => handleExport("markdown")}
                    disabled={!!exportStage || isExportingSupportBundle}
                  >
                    <DownloadIcon className="h-4 w-4" />
                    Export Markdown
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full justify-start rounded-2xl"
                    onClick={() => handleExport("txt")}
                    disabled={!!exportStage || isExportingSupportBundle}
                  >
                    <DownloadIcon className="h-4 w-4" />
                    Export TXT
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full justify-start rounded-2xl"
                    onClick={() => handleExport("pdf")}
                    disabled={!!exportStage || isExportingSupportBundle}
                  >
                    <DownloadIcon className="h-4 w-4" />
                    Export PDF
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full justify-start rounded-2xl"
                    onClick={() => handleExport("archive_pdf")}
                    disabled={!!exportStage || isExportingSupportBundle}
                  >
                    <DownloadIcon className="h-4 w-4" />
                    Export Archive PDF
                  </Button>
                </div>
              </Panel>

              <Panel variant="flat" padding="sm">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                  Controls
                </div>
                <div className="mt-4 grid gap-2">
                  <Link
                    to="/stories"
                    className={buttonClasses({ variant: "ghost", className: "w-full" })}
                  >
                    Back to Stories
                  </Link>
                  <Button variant="ghost" className="w-full" onClick={handleDeleteStory}>
                    <TrashIcon className="h-4 w-4" />
                    Delete Story
                  </Button>
                </div>
              </Panel>
            </>
          ) : (
            <>
              <Panel variant="flat" padding="sm">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                  Continue Story
                </div>
                <div className="mt-3 text-sm leading-7 text-ink-muted">
                  Pick a story from the left sidebar to jump back into the timeline.
                </div>
              </Panel>

              {recentStories.length ? (
                <div className="space-y-2">
                  {recentStories.map((recentStory) => (
                    <StoryListRow
                      key={recentStory.id}
                      story={recentStory}
                      universeName={
                        getUniverseById(recentStory.universeId)?.name ?? "Unknown universe"
                      }
                      playerCharacterName={
                        getPlayerCharacterById(recentStory.playerCharacterId)?.name ??
                        "Unknown character"
                      }
                      to={`/stories/${recentStory.id}`}
                    />
                  ))}
                </div>
              ) : (
                <Panel variant="flat" padding="sm">
                  <div className="text-sm text-ink-muted">No stories yet.</div>
                  <Link to="/stories/new" className={buttonClasses({ className: "mt-4 w-full" })}>
                    Create Story
                  </Link>
                </Panel>
              )}
            </>
          )}

          {pageNotice ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-ink-soft">
              {pageNotice}
            </div>
          ) : null}

          {pageError ? (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
              {pageError}
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
