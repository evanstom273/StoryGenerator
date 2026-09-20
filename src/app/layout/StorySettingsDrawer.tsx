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
import { StoryIndexSection } from "../../components/story/StoryIndexSection";

function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return <div className="rounded-[10px] border border-divider/[0.35] bg-app-elevated">
    <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between gap-3 px-4 py-3.5">
      <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">{title}</span>
      <span className={cn("text-white/30 transition-transform", open ? "rotate-0" : "-rotate-90")}>⌄</span>
    </button>
    {open ? <div className="border-t border-divider/[0.25] px-4 pb-4 pt-3.5">{children}</div> : null}
  </div>;
}

export function StorySettingsDrawer({ storyId }: { storyId?: string }) {
  const navigate = useNavigate();
  const { storySettingsOpen, setStorySettingsOpen } = useUiPrefs();
  const { aiSettings, getStoryById, getUniverseById, getPlayerCharacterById, getPlayerCharactersForUniverse, exportStory, promoteStoryPlayerCharacter, cleanupDuplicatePlayerCharacters, updateStory, deleteStory, getStoryAIConfig, saveStoryAIConfig, queueAudiobookJob, backgroundJobs, dismissJobNotice, jobNotice, audiobookExportStatus } = useStoryEngine();
  const story = storyId ? getStoryById(storyId) : undefined;
  const playerCharacter = story ? getPlayerCharacterById(story.playerCharacterId) : undefined;
  const isReadOnly = story?.readOnlyReason === "sequel_prequel";
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
    if (!story || !window.confirm("Delete this story and every stored message in its timeline?")) return;
    await deleteStory(story.id); setStorySettingsOpen(false); navigate("/stories");
  }

  async function promote() {
    if (!story || !playerCharacter) return;
    setPromoting(true); setError(null);
    try { await promoteStoryPlayerCharacter(story.id); setNotice("Saved to Player Characters."); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to promote character."); }
    finally { setPromoting(false); }
  }

  async function cleanup() {
    setCleaning(true); setError(null);
    try { const result = await cleanupDuplicatePlayerCharacters(); setNotice(`Merged ${result.mergedDuplicates} duplicates; updated ${result.updatedStories} stories.`); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to cleanup duplicates."); }
    finally { setCleaning(false); setCleanupOpen(false); }
  }

  const activeAudiobookJob = story ? backgroundJobs.find((job) => isAudiobookExportBackgroundJob(job) && job.storyId === story.id && (job.status === "queued" || job.status === "running")) : undefined;
  const audiobookProgress = audiobookExportStatus && audiobookExportStatus.storyId === story?.id ? audiobookExportStatus.progress ?? null : null;

  if (!storySettingsOpen) return null;

  return <div className={cn(OVERLAY_BACKDROP_CLASS, "fixed inset-0 z-[70] flex justify-end")} onClick={() => setStorySettingsOpen(false)}>
    <div className={cn(DRAWER_PANEL_CLASS, "h-full w-full max-w-xl overflow-y-auto")} onClick={(event) => event.stopPropagation()}>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-divider bg-app/95 px-5 py-4 backdrop-blur">
        <div><div className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">Story settings</div><div className="mt-1 text-xl font-bold text-ink">{story?.title ?? "Story"}</div></div>
        <Button variant="ghost" onClick={() => setStorySettingsOpen(false)}>Close</Button>
      </div>
      <div className="space-y-3 p-4">
        {story ? <>
          <Section title="Edit Story" defaultOpen>
            <form className="space-y-3" onSubmit={saveDetails}>
              <label className="block space-y-2"><FieldLabel label="Title" help="Shown in your library and story header." labelClassName="text-xs text-ink-muted" /><input className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-2.5 text-sm text-ink" value={fields.title} disabled={isReadOnly} onChange={(e) => setFields((current) => ({ ...current, title: e.target.value }))} /></label>
              <div><FieldLabel label="Imported Characters" help="Library characters available to the story." labelClassName="text-xs text-ink-muted" /><ImportedCharactersPicker selectedIds={fields.importedCharacterIds} excludeCharacterId={story.playerCharacterId} universeIds={getUniverseIds(story)} disabled={isReadOnly} getPlayerCharactersForUniverse={getPlayerCharactersForUniverse} getUniverseById={getUniverseById} getPlayerCharacterById={getPlayerCharacterById} onChange={(ids) => setFields((current) => ({ ...current, importedCharacterIds: ids }))} /></div>
              <Button type="submit" className="w-full" disabled={saving || isReadOnly}>{saving ? "Saving…" : "Save Story"}</Button>
            </form>
          </Section>
          <Section title="Story Index" defaultOpen>
            <StoryIndexSection storyId={story.id} />
          </Section>
          <Section title="Story accent">
            <ThemePicker accentOnly allowAppDefault appDefaultSelected={!fields.accentThemeKey} selectedKey={fields.accentThemeKey ?? "ruby"} customAccent={fields.accentThemeCustom} onSelectAppDefault={() => setFields((current) => ({ ...current, accentThemeKey: null }))} onSelectKey={(key) => isAccentThemeKey(key) && setFields((current) => ({ ...current, accentThemeKey: key }))} onCustomAccentChange={(value) => setFields((current) => ({ ...current, accentThemeCustom: value, accentThemeKey: "custom" }))} />
          </Section>
          <Section title="Content Mode">
            <label className="block space-y-2"><FieldLabel label="Adult content mode" help="Choose the intended content boundary." labelClassName="text-xs text-ink-muted" /><select className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-2.5 text-sm text-ink" value={fields.adultContentMode} disabled={isReadOnly} onChange={(e) => { const value = e.target.value; if (isAdultContentMode(value)) setFields((current) => ({ ...current, adultContentMode: value })); }}><option value="standard">Standard</option><option value="mature_non_graphic">Mature fiction (non-graphic)</option><option value="explicit_consensual_adults">Explicit fiction (consenting adults)</option></select><div className="mt-2 text-sm text-ink-muted">{getAdultContentProviderProfile(providerType).explanation}</div></label>
          </Section>
          <Section title="AI Settings">
            <form className="space-y-3" onSubmit={saveAI}>
              {shouldShowProviderPicker() ? <ProviderSelect value={providerType} onChange={(event) => setProviderType(event.target.value as typeof providerType)} /> : null}
              <select className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-2.5 text-sm text-ink" value={model} onChange={(e) => setModel(e.target.value)}>{getProviderModels(providerType).map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select>
              <label className="block text-sm text-ink-muted">Parallel audiobook chapters<input className="mt-2 w-full" type="range" min={1} max={MAX_AUDIOBOOK_PARALLEL_CHAPTERS} value={parallelChapters} onChange={(e) => setParallelChapters(clampAudiobookParallelChapters(Number(e.target.value)))} /></label>
              <Button type="submit" className="w-full" disabled={savingAI}>{savingAI ? "Saving…" : "Save AI Settings"}</Button>
            </form>
          </Section>
          <Section title="Export">
            {exportStage ? <div className="text-xs text-ink-muted">{exportStage}</div> : null}
            {audiobookProgress ? <AudiobookChapterProgressList progress={audiobookProgress} /> : null}
            <div className="grid gap-2">
              {(["json", "markdown", "txt", "pdf"] as const).map((format) => <Button key={format} variant="secondary" onClick={() => void exportAs(format)} disabled={Boolean(exportStage)}><DownloadIcon className="h-4 w-4" />Export {format.toUpperCase()}</Button>)}
              <Button variant="secondary" onClick={() => void exportSupport()} disabled={Boolean(exportStage)}><DownloadIcon className="h-4 w-4" />Export Support Bundle</Button>
              <Button variant="secondary" onClick={() => void saveAudiobook()} disabled={Boolean(activeAudiobookJob)}>Save Story Audiobook</Button>
            </div>
          </Section>
          <Section title="Story actions">
            <div className="grid gap-2">
              <Button variant="secondary" onClick={() => void updateStory(story.id, { isArchived: !story.isArchived })}>{story.isArchived ? "Restore Story" : "Archive Story"}</Button>
              {playerCharacter ? <Button variant="secondary" onClick={() => void promote()} disabled={promoting}>{promoting ? "Saving…" : "Save Player Character"}</Button> : null}
              <Button variant="secondary" onClick={() => setCleanupOpen(true)}>Cleanup Duplicate Characters</Button>
              <Button variant="ghost" onClick={() => void deleteCurrentStory()}><TrashIcon className="h-4 w-4" />Delete Story</Button>
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
