import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DownloadIcon, TrashIcon } from "../../components/icons";
import { Button, buttonClasses } from "../../components/ui/Button";
import { Panel } from "../../components/ui/Panel";
import { downloadFile } from "../../lib/download";
import { serializeStoryExport } from "../../lib/storyExport";
import type { ExportFormat } from "../../types/models";
import { cn } from "../../utils/cn";
import { StoryListRow } from "../../components/story/StoryListRow";
import { useStoryEngine } from "../providers/StoryEngineProvider";
import { useUiPrefs } from "../ui/UiPrefsContext";

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

  const [pageError, setPageError] = useState<string | null>(null);

  const recentStories = useMemo(() => stories.slice(0, 8), [stories]);

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

        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
          {story && universe && playerCharacter ? (
            <>
              <Panel padding="sm">
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
              <Panel padding="sm">
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
                <Panel padding="sm">
                  <div className="text-sm text-ink-muted">No stories yet.</div>
                  <Link to="/stories/new" className={buttonClasses({ className: "mt-4 w-full" })}>
                    Create Story
                  </Link>
                </Panel>
              )}
            </>
          )}

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
