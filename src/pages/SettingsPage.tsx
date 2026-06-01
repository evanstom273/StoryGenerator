import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { DatabaseIcon } from "../components/icons";
import { Badge } from "../components/ui/Badge";
import { Field, SelectInput, TextInput } from "../components/forms/Fields";
import { Button } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";
import type { AIProviderType } from "../types/models";
import { getProviderDefaultModel, getProviderModels } from "../lib/ai/models";
import { downloadFile } from "../lib/download";
import { useDebouncedEffect } from "../lib/useDebouncedEffect";

export function SettingsPage() {
  const {
    aiSettings,
    saveAISettings,
    storageStatus,
    validateAIConnection,
    exportWorkspaceBackup,
    importWorkspaceBackup,
  } = useStoryEngine();
  const [activeProviderType, setActiveProviderType] = useState<AIProviderType>(
    aiSettings?.activeProviderType ?? "openai",
  );
  const [openaiModel, setOpenaiModel] = useState(
    aiSettings?.defaultModels?.openai ?? getProviderDefaultModel("openai"),
  );
  const [geminiModel, setGeminiModel] = useState(
    aiSettings?.defaultModels?.gemini ?? getProviderDefaultModel("gemini"),
  );
  const [openrouterModel, setOpenrouterModel] = useState(
    aiSettings?.defaultModels?.openrouter ?? getProviderDefaultModel("openrouter"),
  );
  const [openaiKeyInput, setOpenaiKeyInput] = useState("");
  const [geminiKeyInput, setGeminiKeyInput] = useState("");
  const [openrouterKeyInput, setOpenrouterKeyInput] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);

  useEffect(() => {
    setActiveProviderType(aiSettings?.activeProviderType ?? "openai");
    setOpenaiModel(
      aiSettings?.defaultModels?.openai ?? getProviderDefaultModel("openai"),
    );
    setGeminiModel(
      aiSettings?.defaultModels?.gemini ?? getProviderDefaultModel("gemini"),
    );
    setOpenrouterModel(
      aiSettings?.defaultModels?.openrouter ?? getProviderDefaultModel("openrouter"),
    );
  }, [aiSettings]);

  useDebouncedEffect(
    () => {
      if (!aiSettings || isSaving) {
        return;
      }

      if (
        activeProviderType === aiSettings.activeProviderType &&
        openaiModel === (aiSettings.defaultModels?.openai ?? getProviderDefaultModel("openai")) &&
        geminiModel === (aiSettings.defaultModels?.gemini ?? getProviderDefaultModel("gemini")) &&
        openrouterModel ===
          (aiSettings.defaultModels?.openrouter ?? getProviderDefaultModel("openrouter"))
      ) {
        return;
      }

      void saveAISettings({
        activeProviderType,
        defaultModels: {
          openai: openaiModel,
          gemini: geminiModel,
          openrouter: openrouterModel,
        },
      }).catch(() => {});
    },
    800,
    [aiSettings, isSaving, activeProviderType, openaiModel, geminiModel, openrouterModel],
  );

  useDebouncedEffect(
    () => {
      if (isSaving) {
        return;
      }

      const openaiKey = openaiKeyInput.trim();
      const geminiKey = geminiKeyInput.trim();
      const openrouterKey = openrouterKeyInput.trim();

      if (!openaiKey && !geminiKey && !openrouterKey) {
        return;
      }

      void saveAISettings({
        activeProviderType,
        apiKeys: {
          openai: openaiKey ? openaiKey : undefined,
          gemini: geminiKey ? geminiKey : undefined,
          openrouter: openrouterKey ? openrouterKey : undefined,
        },
        defaultModels: {
          openai: openaiModel,
          gemini: geminiModel,
          openrouter: openrouterModel,
        },
      })
        .then(() => {
          setOpenaiKeyInput("");
          setGeminiKeyInput("");
          setOpenrouterKeyInput("");
          setStatusMessage("AI settings saved locally.");
        })
        .catch((error) => {
          setErrorMessage(
            error instanceof Error ? error.message : "Unable to save AI settings.",
          );
        });
    },
    900,
    [
      isSaving,
      activeProviderType,
      openaiModel,
      geminiModel,
      openrouterModel,
      openaiKeyInput,
      geminiKeyInput,
      openrouterKeyInput,
    ],
  );

  const openaiConfigured = Boolean(aiSettings?.apiKeys?.openai?.trim());
  const geminiConfigured = Boolean(aiSettings?.apiKeys?.gemini?.trim());
  const openrouterConfigured = Boolean(aiSettings?.apiKeys?.openrouter?.trim());
  const providerBadge = useMemo(() => {
    if (!openaiConfigured && !geminiConfigured && !openrouterConfigured) {
      return <Badge variant="warning">Not configured</Badge>;
    }

    return <Badge variant="accent">Configured</Badge>;
  }, [geminiConfigured, openaiConfigured, openrouterConfigured]);

  async function handleSave() {
    setIsSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      await saveAISettings({
        activeProviderType,
        apiKeys: {
          openai: openaiKeyInput.trim() ? openaiKeyInput : undefined,
          gemini: geminiKeyInput.trim() ? geminiKeyInput : undefined,
          openrouter: openrouterKeyInput.trim() ? openrouterKeyInput : undefined,
        },
        defaultModels: {
          openai: openaiModel,
          gemini: geminiModel,
          openrouter: openrouterModel,
        },
      });
      setOpenaiKeyInput("");
      setGeminiKeyInput("");
      setOpenrouterKeyInput("");
      setStatusMessage("AI settings saved locally.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to save AI settings.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleValidate() {
    setIsValidating(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      await validateAIConnection(activeProviderType);
      setStatusMessage("AI provider connection validated.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to validate connection.",
      );
    } finally {
      setIsValidating(false);
    }
  }

  async function handleExportBackup() {
    setBackupStatus(null);
    setBackupError(null);

    try {
      const backup = await exportWorkspaceBackup();
      const content = JSON.stringify(backup, null, 2);
      await downloadFile("story-engine-backup.json", content, "application/json");
      setBackupStatus("Backup exported.");
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : "Unable to export backup.");
    }
  }

  async function handleImportBackup() {
    if (!backupFile) {
      setBackupError("Select a backup file first.");
      return;
    }

    setBackupStatus(null);
    setBackupError(null);

    try {
      const text = await backupFile.text();
      const parsed = JSON.parse(text);
      await importWorkspaceBackup(parsed, { mode: "merge", conflict: "skip" });
      setBackupStatus("Backup imported (merged). Reloading...");
      window.location.reload();
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : "Unable to import backup.");
    }
  }

  async function handleReplaceBackup() {
    if (!backupFile) {
      setBackupError("Select a backup file first.");
      return;
    }

    const confirmed = window.confirm(
      "Replace all current local data (universes, stories, characters, messages, settings) with this backup? Continue?",
    );

    if (!confirmed) {
      return;
    }

    setBackupStatus(null);
    setBackupError(null);

    try {
      const text = await backupFile.text();
      const parsed = JSON.parse(text);
      await importWorkspaceBackup(parsed, { mode: "replace" });
      setBackupStatus("Backup imported (replaced). Reloading...");
      window.location.reload();
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : "Unable to import backup.");
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Settings"
        title="Local workspace settings and future integration points"
        description="Configure local storage, connect an AI provider, and validate your connection before roleplaying."
      />

      <section className="grid gap-4 lg:grid-cols-3">
        <Panel className="h-full">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              Theme
            </h2>
            <Badge variant="accent">Dark default</Badge>
          </div>
          <p className="mt-3 text-sm leading-7 text-ink-muted">
            The interface stays in a dark workspace theme optimized for long-form
            writing and dense continuity review.
          </p>
        </Panel>

        <Panel className="h-full">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              AI Provider
            </h2>
            {providerBadge}
          </div>
          <div className="mt-4 space-y-4">
            <Field label="Active Provider">
              <SelectInput
                value={activeProviderType}
                onChange={(event) =>
                  setActiveProviderType(event.target.value as AIProviderType)
                }
              >
                <option value="openai">OpenAI</option>
                <option value="gemini">Gemini</option>
                <option value="openrouter">OpenRouter</option>
              </SelectInput>
            </Field>

            <Panel className="border-white/8 bg-black/15">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                OpenAI
              </div>
              <div className="mt-4 space-y-4">
                <Field label="Default Model">
                  <SelectInput
                    value={openaiModel}
                    onChange={(event) => setOpenaiModel(event.target.value)}
                  >
                    {getProviderModels("openai").map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="API Key" hint={openaiConfigured ? "Saved locally" : "Required"}>
                  <TextInput
                    type="password"
                    value={openaiKeyInput}
                    onChange={(event) => setOpenaiKeyInput(event.target.value)}
                    placeholder={openaiConfigured ? "Enter a new key to replace" : "sk-..."}
                    autoComplete="off"
                  />
                </Field>
              </div>
            </Panel>

            <Panel className="border-white/8 bg-black/15">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                  Gemini
                </div>
                <Badge variant={geminiConfigured ? "accent" : "warning"}>
                  {geminiConfigured ? "Key saved" : "No key"}
                </Badge>
              </div>
              <div className="mt-4 space-y-4">
                <Field label="Default Model">
                  <SelectInput
                    value={geminiModel}
                    onChange={(event) => setGeminiModel(event.target.value)}
                  >
                    {getProviderModels("gemini").map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="API Key" hint={geminiConfigured ? "Saved locally" : "Required"}>
                  <TextInput
                    type="password"
                    value={geminiKeyInput}
                    onChange={(event) => setGeminiKeyInput(event.target.value)}
                    placeholder={geminiConfigured ? "Enter a new key to replace" : "AIza..."}
                    autoComplete="off"
                  />
                </Field>
              </div>
            </Panel>

            <Panel className="border-white/8 bg-black/15">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                  OpenRouter
                </div>
                <Badge variant={openrouterConfigured ? "accent" : "warning"}>
                  {openrouterConfigured ? "Key saved" : "No key"}
                </Badge>
              </div>
              <div className="mt-4 space-y-4">
                <Field label="Default Model">
                  <SelectInput
                    value={openrouterModel}
                    onChange={(event) => setOpenrouterModel(event.target.value)}
                  >
                    {getProviderModels("openrouter").map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field
                  label="OpenRouter API Key"
                  hint={openrouterConfigured ? "Saved locally" : "Required"}
                >
                  <TextInput
                    type="password"
                    value={openrouterKeyInput}
                    onChange={(event) => setOpenrouterKeyInput(event.target.value)}
                    placeholder={openrouterConfigured ? "Enter a new key to replace" : "sk-or-..."}
                    autoComplete="off"
                  />
                </Field>
              </div>
            </Panel>

            {statusMessage ? (
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
                {statusMessage}
              </div>
            ) : null}

            {errorMessage ? (
              <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
                {errorMessage}
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save"}
              </Button>
              <Button
                variant="secondary"
                onClick={handleValidate}
                disabled={isValidating}
              >
                {isValidating ? "Validating..." : "Validate Connection"}
              </Button>
            </div>
          </div>
        </Panel>

        <Panel className="h-full">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              Backup & Restore
            </h2>
          </div>
          <p className="mt-3 text-sm leading-7 text-ink-muted">
            Export a portable JSON backup of your entire local workspace. Importing a
            backup merges in missing items by default.
          </p>

          <div className="mt-4 space-y-4">
            <Button variant="secondary" onClick={handleExportBackup}>
              Export Backup
            </Button>

            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                Import Backup
              </div>
              <input
                type="file"
                accept="application/json"
                className="block w-full text-sm text-ink-muted file:mr-4 file:rounded-2xl file:border-0 file:bg-white/[0.06] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-ink hover:file:bg-white/[0.09]"
                onChange={(event) => setBackupFile(event.target.files?.[0] ?? null)}
              />
              <Button
                variant="ghost"
                onClick={handleImportBackup}
                disabled={!backupFile}
              >
                Import Backup (Merge)
              </Button>
              <Button
                variant="secondary"
                onClick={handleReplaceBackup}
                disabled={!backupFile}
              >
                Import Backup (Replace All)
              </Button>
            </div>

            {backupStatus ? (
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
                {backupStatus}
              </div>
            ) : null}

            {backupError ? (
              <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
                {backupError}
              </div>
            ) : null}
          </div>
        </Panel>

        <Panel className="h-full">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              Storage Status
            </h2>
            <Badge variant={storageStatus.ready ? "success" : "warning"}>
              {storageStatus.ready ? "Ready" : "Attention needed"}
            </Badge>
          </div>
          <div className="mt-4 flex items-center gap-3 text-accent-soft">
            <DatabaseIcon className="h-5 w-5" />
            <span className="text-sm">{storageStatus.driver}</span>
          </div>
          <dl className="mt-5 space-y-3 text-sm text-ink-soft">
            <div className="flex items-center justify-between gap-4">
              <dt>Universes</dt>
              <dd>{storageStatus.universesCount}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt>Player Characters</dt>
              <dd>{storageStatus.playerCharactersCount}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt>Stories</dt>
              <dd>{storageStatus.storiesCount}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt>Messages</dt>
              <dd>{storageStatus.messagesCount}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-white/8 pt-3">
              <dt>Total Records</dt>
              <dd>{storageStatus.totalRecords}</dd>
            </div>
          </dl>
          {storageStatus.errorMessage ? (
            <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
              {storageStatus.errorMessage}
            </div>
          ) : null}
        </Panel>
      </section>
    </div>
  );
}
