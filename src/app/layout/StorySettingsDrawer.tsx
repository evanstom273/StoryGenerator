import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DownloadIcon, TrashIcon } from "../../components/icons";
import { Button } from "../../components/ui/Button";
import { Panel } from "../../components/ui/Panel";
import { downloadFile } from "../../lib/download";
import { getProviderDefaultModel, getProviderModels } from "../../lib/ai/models";
import { serializeStoryExport } from "../../lib/storyExport";
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

  const extension =
    format === "json"
      ? "json"
      : format === "markdown"
        ? "md"
        : format === "pdf"
          ? "pdf"
          : "txt";
  return `${sanitizedTitle || "story-engine-story"}.${extension}`;
}

export function StorySettingsDrawer({ storyId }: { storyId?: string }) {
  const navigate = useNavigate();
  const { storySettingsOpen, setStorySettingsOpen } = useUiPrefs();
  const {
    aiSettings,
    getStoryById,
    getUniverseById,
    getPlayerCharacterById,
    exportStory,
    updateStory,
    deleteStory,
    getStoryAIConfig,
    saveStoryAIConfig,
  } = useStoryEngine();

  const story = storyId ? getStoryById(storyId) : undefined;
  const universe = story ? getUniverseById(story.universeId) : undefined;
  const playerCharacter = story ? getPlayerCharacterById(story.playerCharacterId) : undefined;

  const [storyFields, setStoryFields] = useState({
    title: story?.title ?? "",
    openingPrompt: story?.openingPrompt ?? "",
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
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    if (!story) {
      return;
    }

    setStoryFields({
      title: story.title,
      openingPrompt: story.openingPrompt,
      currentSummary: story.currentSummary,
    });
  }, [story]);

  useDebouncedEffect(
    () => {
      if (!story) {
        return;
      }

      if (
        storyFields.title === story.title &&
        storyFields.openingPrompt === story.openingPrompt &&
        storyFields.currentSummary === story.currentSummary
      ) {
        return;
      }

      if (!storyFields.title.trim() || !storyFields.openingPrompt.trim()) {
        return;
      }

      void updateStory(story.id, storyFields).catch(() => {});
    },
    800,
    [story?.id, storyFields.title, storyFields.openingPrompt, storyFields.currentSummary],
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
    downloadFile(createExportFilename(story.title, format), content, mimeType);
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

    if (!storyFields.openingPrompt.trim()) {
      setPageError("Opening prompt is required.");
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
          "absolute inset-y-0 right-0 flex w-[min(92vw,28rem)] flex-col border-l border-white/10 bg-app-elevated shadow-hero transition-transform duration-200",
          storySettingsOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-4">
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
                      className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-accent/40 focus:bg-white/[0.06] focus:ring-2 focus:ring-accent/20"
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
                      className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-accent/40 focus:bg-white/[0.06] focus:ring-2 focus:ring-accent/20"
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
                      className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-accent/40 focus:bg-white/[0.06] focus:ring-2 focus:ring-accent/20"
                      value={storyFields.title}
                      onChange={(event) =>
                        setStoryFields((current) => ({ ...current, title: event.target.value }))
                      }
                    />
                  </label>
                  <label className="block space-y-2">
                    <div className="text-xs text-ink-muted">Opening Prompt</div>
                    <textarea
                      className="min-h-[110px] w-full resize-y rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-accent/40 focus:bg-white/[0.06] focus:ring-2 focus:ring-accent/20"
                      value={storyFields.openingPrompt}
                      onChange={(event) =>
                        setStoryFields((current) => ({
                          ...current,
                          openingPrompt: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="block space-y-2">
                    <div className="text-xs text-ink-muted">Current Summary</div>
                    <textarea
                      className="min-h-[100px] w-full resize-y rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-accent/40 focus:bg-white/[0.06] focus:ring-2 focus:ring-accent/20"
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
