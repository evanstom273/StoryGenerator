import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DownloadIcon, TrashIcon } from "../../components/icons";
import { Button } from "../../components/ui/Button";
import { DRAWER_PANEL_CLASS, OVERLAY_BACKDROP_CLASS } from "../ui/motion";
import { Panel } from "../../components/ui/Panel";
import { downloadFile } from "../../lib/download";
import { createStoryExportFilename } from "../../lib/exportFilename";
import { AudiobookChapterProgressList } from "../../components/story/AudiobookChapterProgressList";
import { ImportedCharactersPicker } from "../../components/story/ImportedCharactersPicker";
import { getProviderDefaultModel, getProviderModels } from "../../lib/ai/models";
import { resolveVisibleProvider, shouldShowProviderPicker } from "../../lib/ai/providerConfig";
import { ProviderSelect } from "../../components/settings/ProviderSelect";
import { serializeStoryExport } from "../../lib/storyExport";
import { normalizeStoryImportedCharacterIds } from "../../lib/storyImportedCharacters";
import { getUniverseIds } from "../../lib/universeIds";
import { buildStorySupportBundleZip } from "../../lib/supportBundle";
import { useStoryEngine } from "../providers/StoryEngineProvider";
import { themes, type AccentThemeKey, isAccentThemeKey } from "../theming/themes";
import { FieldLabel } from "../../components/forms/Fields";
import { ThemePicker } from "../../components/settings/ThemePicker";
import { useUiPrefs } from "../ui/UiPrefsContext";
import { adultContentModeToLegacyMatureFictionMode, isAdultContentMode, resolveAdultContentMode } from "../../lib/ai/adultContentMode";
import { getAdultContentProviderProfile } from "../../lib/ai/providerCapabilities";
import { clampAudiobookParallelChapters, DEFAULT_AUDIOBOOK_PARALLEL_CHAPTERS, MAX_AUDIOBOOK_PARALLEL_CHAPTERS } from "../../lib/ai/storyAudiobookParallel";
import { DEFAULT_AUDIOBOOK_PERFORMANCE_MODE, type AudiobookPerformanceMode } from "../../lib/ai/audiobookPerformance";
import { cn } from "../../utils/cn";
import { isAudiobookExportBackgroundJob } from "../../lib/backgroundTasks";

type SettingsSectionIcon =
  | "edit"
  | "accent"
  | "content"
  | "ai"
  | "export"
  | "sequel"
  | "actions";

function SettingsSectionIcon({ name }: { name: SettingsSectionIcon }) {
  const commonProps = {
    width: 17,
    height: 17,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (name) {
    case "edit":
      return <svg {...commonProps}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>;
    case "accent":
      return <svg {...commonProps}><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 0 0 18c1.7 0 2.4-1 1.7-2.1-.7-1.2.1-2.4 1.4-2.4H18a3 3 0 0 0 3-3A10.5 10.5 0 0 0 12 3Z" /><circle cx="8.5" cy="9" r=".8" /><circle cx="12" cy="7" r=".8" /><circle cx="15.5" cy="9.5" r=".8" /></svg>;
    case "content":
      return <svg {...commonProps}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></svg>;
    case "ai":
      return <svg {...commonProps}><rect x="4" y="5" width="16" height="14" rx="3" /><path d="M9 9h.01M15 9h.01" /><path d="M8 14h8" /><path d="M12 2v3" /></svg>;
    case "export":
      return <svg {...commonProps}><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>;
    case "sequel":
      return <svg {...commonProps}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" /><path d="M11 9h5M13.5 6.5V11.5" /></svg>;
    case "actions":
      return <svg {...commonProps}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06-2.83 2.83-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21h-4v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06-2.83-2.83.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3v-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06 2.83-2.83.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3h4v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06 2.83 2.83-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21v4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></svg>;
  }
}

function Section({
  title,
  description,
  icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  description: string;
  icon: SettingsSectionIcon;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-[12px] border border-divider/[0.35] bg-app-elevated/95">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="group flex w-full items-center gap-3 px-3.5 py-3 text-left transition hover:bg-panel-muted/25"
        aria-expanded={open}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] border border-accent/15 bg-accent/[0.08] text-accent-soft">
          <SettingsSectionIcon name={icon} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-ink">{title}</span>
          <span className="mt-0.5 block text-[11px] leading-4 text-ink-muted">{description}</span>
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(
            "shrink-0 text-white/30 transition-transform duration-200 group-hover:text-white/50",
            open ? "rotate-90" : "rotate-0",
          )}
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>
      {open ? (
        <div className="border-t border-divider/[0.22] bg-panel-muted/[0.12] px-4 pb-4 pt-3.5">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function StorySettingsDrawer({ storyId }: { storyId?: string }) {
  const navigate = useNavigate();
  const { storySettingsOpen, setStorySettingsOpen } = useUiPrefs();
  const { aiSettings, getStoryById, getUniverseById, getPlayerCharacterById, getPlayerCharactersForUniverse, exportStory, promoteStoryPlayerCharacter, cleanupDuplicatePlayerCharacters, createSequel, updateStory, deleteStory, getStoryAIConfig, saveStoryAIConfig, queueAudiobookJob, backgroundJobs, dismissJobNotice, jobNotice, audiobookExportStatus } = useStoryEngine();
  const story = storyId ? getStoryById(storyId) : undefined;
  const playerCharacter = story ? getPlayerCharacterById(story.playerCharacterId) : undefined;
  const [fields, setFields] = useState({ title: story?.title ?? "", adultContentMode: resolveAdultContentMode(story), accentThemeKey: (story?.accentThemeKey ?? null) as AccentThemeKey | null, accentThemeCustom: story?.accentThemeCustom ?? themes.custom.accent, importedCharacterIds: normalizeStoryImportedCharacterIds(story?.importedCharacterIds) });
  const [providerType, setProviderType] = useState(() => resolveVisibleProvider(aiSettings?.activeProviderType));
  const [model, setModel] = useState(() => aiSettings?.defaultModels?.[resolveVisibleProvider(aiSettings?.activeProviderType)] ?? getProviderDefaultModel(resolveVisibleProvider(aiSettings?.activeProviderType)));
  const [parallelChapters, setParallelChapters] = useState(DEFAULT_AUDIOBOOK_PARALLEL_CHAPTERS);
  const [performanceMode, setPerformanceMode] = useState<AudiobookPerformanceMode>(DEFAULT_AUDIOBOOK_PERFORMANCE_MODE);
  const [exportStage, setExportStage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingAI, setSavingAI] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [sequelTitle, setSequelTitle] = useState("");
  const [creatingSequel, setCreatingSequel] = useState(false);

  useEffect(() => {
    if (!story) return;
    setFields({ title: story.title, adultContentMode: resolveAdultContentMode(story), accentThemeKey: (story.accentThemeKey ?? null) as AccentThemeKey | null, accentThemeCustom: story.accentThemeCustom ?? themes.custom.accent, importedCharacterIds: normalizeStoryImportedCharacterIds(story.importedCharacterIds) });
    void getStoryAIConfig(story.id).then((config) => {
      const provider = resolveVisibleProvider(config?.providerType ?? aiSettings?.activeProviderType);
      setProviderType(provider);
      setModel(config?.model?.trim() || aiSettings?.defaultModels?.[provider]?.trim() || getProviderDefaultModel(provider));
      setParallelChapters(config?.audiobookParallelChapters ?? DEFAULT_AUDIOBOOK_PARALLEL_CHAPTERS);
      setPerformanceMode(config?.audiobookPerformanceMode ?? DEFAULT_AUDIOBOOK_PERFORMANCE_MODE);
    }).catch(() => {});
  }, [story, aiSettings, getStoryAIConfig]);

  async function saveDetails(event: React.FormEvent) {
    event.preventDefault();
    if (!story || !fields.title.trim()) return;
    setSaving(true); setError(null);
    try {
      await updateStory(story.id, { title: fields.title.trim(), adultContentMode: fields.adultContentMode, matureFictionMode: adultContentModeToLegacyMatureFictionMode(fields.adultContentMode), accentThemeKey: fields.accentThemeKey ?? undefined, accentThemeCustom: fields.accentThemeKey === "custom" ? fields.accentThemeCustom : undefined, importedCharacterIds: normalizeStoryImportedCharacterIds(fields.importedCharacterIds) });
      setNotice("Story settings saved.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save story settings."); }
    finally { setSaving(false); }
  }

  async function saveAI(event: React.FormEvent) {
    event.preventDefault();
    if (!story) return;
    setSavingAI(true); setError(null);
    try { await saveStoryAIConfig({ storyId: story.id, providerType, model, audiobookParallelChapters: clampAudiobookParallelChapters(parallelChapters), audiobookPerformanceMode: performanceMode }); setNotice("AI settings saved."); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to save AI settings."); }
    finally { setSavingAI(false); }
  }

  async function exportAs(format: "json" | "markdown" | "txt" | "pdf") {
    if (!story) return;
    setExportStage("Assembling export…"); setError(null);
    try {
      const bundle = await exportStory(story.id);
      if (!bundle) throw new Error("Unable to assemble export data.");
      setExportStage("Formatting…");
      const result = serializeStoryExport(bundle, format);
      await downloadFile(createStoryExportFilename(story.title, format), result.content, result.mimeType);
      setNotice("Export saved.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to export."); }
    finally { setExportStage(null); }
  }

  async function exportSupport() {
    if (!story) return;
    setExportStage("Generating support bundle…"); setError(null);
    try { const bundle = await exportStory(story.id); if (!bundle) throw new Error("Unable to assemble export data."); const zip = await buildStorySupportBundleZip(bundle); await downloadFile(zip.filename, zip.content, zip.mimeType); setNotice("Support bundle saved."); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to export support bundle."); }
    finally { setExportStage(null); }
  }

  async function saveAudiobook() {
    if (!story) return;
    try { await queueAudiobookJob(story.id); setNotice("Audiobook save queued."); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to queue audiobook save."); }
  }

  async function deleteCurrentStory() {
    if (!story) return;
    if (story.isFavorite) {
      setError("This story is favorited and protected. Unfavorite it before deleting.");
      return;
    }
    if (!window.confirm("Delete this story and every stored message in its timeline?")) return;
    await deleteStory(story.id); setStorySettingsOpen(false); navigate("/stories");
  }

  async function promote() {
    if (!story || !playerCharacter) return;
    setPromoting(true); setError(null);
    try { await promoteStoryPlayerCharacter(story.id); setNotice("Saved to Player Characters."); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to promote character."); }
    finally { setPromoting(false); }
  }

  async function createStorySequel() {
    if (!story || !sequelTitle.trim()) return;
    setCreatingSequel(true); setError(null);
    try {
      const sequel = await createSequel(story.id, sequelTitle.trim());
      setStorySettingsOpen(false);
      navigate(`/stories/${sequel.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create sequel.");
    } finally {
      setCreatingSequel(false);
    }
  }

  async function cleanup() {
    setCleaning(true); setError(null);
    try { const result = await cleanupDuplicatePlayerCharacters(); setNotice(`Merged ${result.mergedDuplicates} duplicates; updated ${result.updatedStories} stories.`); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to cleanup duplicates."); }
    finally { setCleaning(false); setCleanupOpen(false); }
  }

  useEffect(() => {
    if (!storySettingsOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [storySettingsOpen]);

  const activeAudiobookJob = story ? backgroundJobs.find((job) => isAudiobookExportBackgroundJob(job) && job.storyId === story.id && (job.status === "queued" || job.status === "running")) : undefined;
  const audiobookProgress = audiobookExportStatus && audiobookExportStatus.storyId === story?.id ? audiobookExportStatus.progress ?? null : null;

  if (!storySettingsOpen) return null;

  return <div className={cn(OVERLAY_BACKDROP_CLASS, "fixed inset-x-0 bottom-0 top-14 z-[70] flex justify-end lg:inset-0")} onClick={() => setStorySettingsOpen(false)}>
    <div role="dialog" aria-modal="true" aria-label="Story settings" className={cn(DRAWER_PANEL_CLASS, "h-full w-[86vw] max-w-[28rem] overflow-y-auto overscroll-contain border-l border-divider bg-app-elevated shadow-hero sm:w-[28rem] lg:max-w-[30rem]")} onClick={(event) => event.stopPropagation()}>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-divider bg-app-elevated/95 px-4 py-3.5 backdrop-blur">
        <div className="min-w-0"><div className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">Story settings</div><div className="mt-1 truncate text-lg font-bold text-ink">{story?.title ?? "Story"}</div></div>
        <Button variant="ghost" size="sm" onClick={() => setStorySettingsOpen(false)}>Close</Button>
      </div>
      <div className="space-y-2 p-3 sm:p-4">
        {story ? <>
          <Section title="Edit Story" description="Title and imported cast" icon="edit">
            <form className="space-y-3" onSubmit={saveDetails}>
              <label className="block space-y-2"><FieldLabel label="Title" help="Shown in your library and story header." labelClassName="text-xs text-ink-muted" /><input className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-2.5 text-sm text-ink" value={fields.title} onChange={(e) => setFields((current) => ({ ...current, title: e.target.value }))} /></label>
              <div><FieldLabel label="Imported Characters" help="Library characters available to the story." labelClassName="text-xs text-ink-muted" /><ImportedCharactersPicker selectedIds={fields.importedCharacterIds} excludeCharacterId={story.playerCharacterId} universeIds={getUniverseIds(story)} getPlayerCharactersForUniverse={getPlayerCharactersForUniverse} getUniverseById={getUniverseById} getPlayerCharacterById={getPlayerCharacterById} onChange={(ids) => setFields((current) => ({ ...current, importedCharacterIds: ids }))} /></div>
              <Button type="submit" className="w-full" disabled={saving}>{saving ? "Saving…" : "Save Story"}</Button>
            </form>
          </Section>
          <Section title="Story accent" description="Colour styling for this story" icon="accent">
            <ThemePicker accentOnly allowAppDefault appDefaultSelected={!fields.accentThemeKey} selectedKey={fields.accentThemeKey ?? "ruby"} customAccent={fields.accentThemeCustom} onSelectAppDefault={() => setFields((current) => ({ ...current, accentThemeKey: null }))} onSelectKey={(key) => isAccentThemeKey(key) && setFields((current) => ({ ...current, accentThemeKey: key }))} onCustomAccentChange={(value) => setFields((current) => ({ ...current, accentThemeCustom: value, accentThemeKey: "custom" }))} />
          </Section>
          <Section title="Content Mode" description="Story-specific content boundaries" icon="content">
            <label className="block space-y-2"><FieldLabel label="Adult content mode" help="Choose the intended content boundary." labelClassName="text-xs text-ink-muted" /><select className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-2.5 text-sm text-ink" value={fields.adultContentMode} onChange={(e) => { const value = e.target.value; if (isAdultContentMode(value)) setFields((current) => ({ ...current, adultContentMode: value })); }}><option value="standard">Standard</option><option value="mature_non_graphic">Mature fiction (non-graphic)</option><option value="explicit_consensual_adults">Explicit fiction (consenting adults)</option></select><div className="mt-2 text-sm text-ink-muted">{getAdultContentProviderProfile(providerType).explanation}</div></label>
          </Section>
          <Section title="AI Settings" description="Model and audiobook behaviour" icon="ai">
            <form className="space-y-3" onSubmit={saveAI}>
              {shouldShowProviderPicker() ? <ProviderSelect value={providerType} onChange={(event) => setProviderType(event.target.value as typeof providerType)} /> : null}
              <select className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-2.5 text-sm text-ink" value={model} onChange={(e) => setModel(e.target.value)}>{getProviderModels(providerType).map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select>
              <label className="block space-y-2"><FieldLabel label="Audiobook voices" help="Choose one narrator for the whole story or separate voices for character dialogue." labelClassName="text-xs text-ink-muted" /><select className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-2.5 text-sm text-ink" value={performanceMode} onChange={(e) => setPerformanceMode(e.target.value as AudiobookPerformanceMode)}><option value="single_narrator">Single narrator</option><option value="radio_drama">Narrator + character voices</option></select></label>\n              <label className="block text-sm text-ink-muted">Parallel audiobook chapters<input className="mt-2 w-full" type="range" min={1} max={MAX_AUDIOBOOK_PARALLEL_CHAPTERS} value={parallelChapters} onChange={(e) => setParallelChapters(clampAudiobookParallelChapters(Number(e.target.value)))} /></label>
              <Button type="submit" className="w-full" disabled={savingAI}>{savingAI ? "Saving…" : "Save AI Settings"}</Button>
            </form>
          </Section>
          <Section title="Export" description="Downloads, support files and audio" icon="export">
            {exportStage ? <div className="text-xs text-ink-muted">{exportStage}</div> : null}
            {audiobookProgress ? <AudiobookChapterProgressList progress={audiobookProgress} /> : null}
            <div className="grid gap-2">
              {(["json", "markdown", "txt", "pdf"] as const).map((format) => <Button key={format} variant="secondary" onClick={() => void exportAs(format)} disabled={Boolean(exportStage)}><DownloadIcon className="h-4 w-4" />Export {format.toUpperCase()}</Button>)}
              <Button variant="secondary" onClick={() => void exportSupport()} disabled={Boolean(exportStage)}><DownloadIcon className="h-4 w-4" />Export Support Bundle</Button>
              <Button variant="secondary" onClick={() => void saveAudiobook()} disabled={Boolean(activeAudiobookJob)}>Save Story Audiobook</Button>
            </div>
          </Section>
          <Section title="Create Sequel" description="Continue with inherited Story State" icon="sequel">
            <div className="space-y-3">
              <FieldLabel label="Sequel title" help="Creates a new story that inherits this story's indexed chapters, characters, relationships, and ending state. This story is not modified." labelClassName="text-xs text-ink-muted" />
              <input className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-2.5 text-sm text-ink" value={sequelTitle} onChange={(e) => setSequelTitle(e.target.value)} placeholder="Name the sequel" />
              <Button className="w-full" onClick={() => void createStorySequel()} disabled={creatingSequel || !sequelTitle.trim()}>{creatingSequel ? "Creating…" : "Create Sequel"}</Button>
            </div>
          </Section>
          <Section title="Story actions" description="Favourite, archive and maintenance" icon="actions">
            <div className="grid gap-2">
              <Button variant="secondary" onClick={() => void updateStory(story.id, { isFavorite: !story.isFavorite })}>{story.isFavorite ? "★ Unfavorite Story" : "☆ Favorite Story"}</Button>
              <Button variant="secondary" onClick={() => void updateStory(story.id, { isArchived: !story.isArchived })}>{story.isArchived ? "Restore Story" : "Archive Story"}</Button>
              {playerCharacter ? <Button variant="secondary" onClick={() => void promote()} disabled={promoting}>{promoting ? "Saving…" : "Save Player Character"}</Button> : null}
              <Button variant="secondary" onClick={() => setCleanupOpen(true)}>Cleanup Duplicate Characters</Button>
              <Button variant="ghost" disabled={Boolean(story.isFavorite)} title={story.isFavorite ? "Unfavorite this story before deleting it." : undefined} onClick={() => void deleteCurrentStory()}><TrashIcon className="h-4 w-4" />{story.isFavorite ? "Protected from deletion" : "Delete Story"}</Button>
            </div>
          </Section>
        </> : <div className="text-sm text-ink-muted">Select a story to view settings.</div>}
        {error ? <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
        {notice ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{notice}</div> : null}
        {jobNotice ? <div className="rounded-2xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm text-sky-100"><div className="flex items-start justify-between gap-3"><div><div className="font-semibold">{jobNotice.title}</div><div className="mt-1">{jobNotice.body}</div></div><Button size="sm" variant="ghost" onClick={dismissJobNotice}>Dismiss</Button></div></div> : null}
      </div>
    </div>
    {cleanupOpen ? <div className="fixed inset-0 z-[80] flex items-center justify-center bg-app/80 p-4" onClick={() => setCleanupOpen(false)}><Panel variant="flat" padding="lg" role="dialog" aria-modal="true" onClick={(event: React.MouseEvent) => event.stopPropagation()}><div className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">Cleanup duplicates</div><div className="mt-3 flex gap-3"><Button variant="secondary" onClick={() => setCleanupOpen(false)}>Cancel</Button><Button onClick={() => void cleanup()} disabled={cleaning}>{cleaning ? "Cleaning…" : "Run Cleanup"}</Button></div></Panel></div> : null}
  </div>;
}
