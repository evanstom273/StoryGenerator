import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { PageHeader } from "../components/PageHeader";
import { DatabaseIcon } from "../components/icons";
import { Badge } from "../components/ui/Badge";
import { Field, SelectInput, TextInput } from "../components/forms/Fields";
import { Button } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";
import { UI_PREFS_KEYS, readStoredTextSize, writeStoredTextSize } from "../app/ui/UiPrefsContext";
import { useChangelog } from "../app/versioning/ChangelogContext";
import { APP_NAME, APP_VERSION } from "../app/versioning/version";
import { buildThemeCssVariables, useTheme } from "../app/theming/ThemeContext";
import { themes, type ThemeKey } from "../app/theming/themes";
import type { AIProviderType } from "../types/models";
import { getProviderDefaultModel, getProviderModels } from "../lib/ai/models";
import { downloadFile } from "../lib/download";
import { serializeStoryExport } from "../lib/storyExport";
import { useDebouncedEffect } from "../lib/useDebouncedEffect";
import { cn } from "../utils/cn";

function sanitizeFileStem(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function readSelectedFileAsText(file: File) {
  if (typeof file.text === "function") {
    return await file.text();
  }

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(new Error("Unable to read the selected file."));
    };

    reader.onload = () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    };

    reader.readAsText(file);
  });
}

export function SettingsPage() {
  const {
    aiSettings,
    saveAISettings,
    storageStatus,
    validateAIConnection,
    universes,
    playerCharacters,
    stories,
    exportStory,
    exportUniverse,
    exportPlayerCharacter,
    refreshStoryState,
    importUniverseExport,
    importPlayerCharacterExport,
    importStoryExport,
    exportWorkspaceBackup,
    importWorkspaceBackup,
  } = useStoryEngine();

  const { openChangelog, openChangelogHistory } = useChangelog();
  const { themeKey, setThemeKey, theme, customAccent, setCustomAccent } = useTheme();
  const [customAccentInput, setCustomAccentInput] = useState(customAccent);
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
  const [itemExportType, setItemExportType] = useState<
    "universe" | "playerCharacter" | "story"
  >("story");
  const [itemExportUniverseId, setItemExportUniverseId] = useState<string>("");
  const [itemExportCharacterId, setItemExportCharacterId] = useState<string>("");
  const [itemExportStoryId, setItemExportStoryId] = useState<string>("");
  const [itemExportStoryFormat, setItemExportStoryFormat] = useState<
    "json" | "markdown" | "txt" | "pdf"
  >("json");
  const [itemExportStatus, setItemExportStatus] = useState<string | null>(null);

  useEffect(() => {
    if (themeKey !== "custom") {
      return;
    }
    setCustomAccentInput(customAccent);
  }, [customAccent, themeKey]);
  const [itemExportError, setItemExportError] = useState<string | null>(null);
  const [itemImportType, setItemImportType] = useState<
    "universe" | "playerCharacter" | "story"
  >("story");
  const [itemImportFile, setItemImportFile] = useState<File | null>(null);
  const [itemImportUniverseId, setItemImportUniverseId] = useState<string>("");
  const [itemImportStatus, setItemImportStatus] = useState<string | null>(null);
  const [itemImportError, setItemImportError] = useState<string | null>(null);
  const [textSize, setTextSize] = useState<"sm" | "md" | "lg" | "xl">(() =>
    readStoredTextSize(UI_PREFS_KEYS.textSize, "md"),
  );
  const [versionCopyStatus, setVersionCopyStatus] = useState<string | null>(null);

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

  useEffect(() => {
    writeStoredTextSize(UI_PREFS_KEYS.textSize, textSize);
  }, [textSize]);

  async function handleCopyVersionInformation() {
    const platform = await (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        return Capacitor.getPlatform();
      } catch {
        return "web";
      }
    })();

    const text = `${APP_NAME} v${APP_VERSION}\nPlatform: ${platform}\nUser Agent: ${navigator.userAgent}`;

    try {
      await navigator.clipboard.writeText(text);
      setVersionCopyStatus("Copied to clipboard.");
    } catch {
      window.prompt("Copy version info:", text);
      setVersionCopyStatus("Copy prompt opened.");
    }
  }

  useEffect(() => {
    if (!itemExportUniverseId && universes[0]?.id) {
      setItemExportUniverseId(universes[0].id);
    }
    if (!itemExportCharacterId && playerCharacters[0]?.id) {
      setItemExportCharacterId(playerCharacters[0].id);
    }
    if (!itemExportStoryId && stories[0]?.id) {
      setItemExportStoryId(stories[0].id);
    }
    if (!itemImportUniverseId && universes[0]?.id) {
      setItemImportUniverseId(universes[0].id);
    }
  }, [
    itemExportUniverseId,
    itemExportCharacterId,
    itemExportStoryId,
    itemImportUniverseId,
    universes,
    playerCharacters,
    stories,
  ]);

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

  async function handleExportItem() {
    setItemExportStatus(null);
    setItemExportError(null);

    try {
      if (itemExportType === "universe") {
        if (!itemExportUniverseId) {
          throw new Error("Select a universe first.");
        }

        const bundle = await exportUniverse(itemExportUniverseId);
        if (!bundle) {
          throw new Error("Unable to assemble export data for this universe.");
        }

        const filename = `${sanitizeFileStem(bundle.universe.name) || "story-engine-universe"}.json`;
        await downloadFile(filename, JSON.stringify(bundle, null, 2), "application/json");
        setItemExportStatus("Universe exported.");
        return;
      }

      if (itemExportType === "playerCharacter") {
        if (!itemExportCharacterId) {
          throw new Error("Select a player character first.");
        }

        const bundle = await exportPlayerCharacter(itemExportCharacterId);
        if (!bundle) {
          throw new Error("Unable to assemble export data for this player character.");
        }

        const filename = `${sanitizeFileStem(bundle.playerCharacter.name) || "story-engine-character"}.json`;
        await downloadFile(filename, JSON.stringify(bundle, null, 2), "application/json");
        setItemExportStatus("Player character exported.");
        return;
      }

      if (!itemExportStoryId) {
        throw new Error("Select a story first.");
      }

      try {
        await refreshStoryState(itemExportStoryId);
      } catch {}

      const bundle = await exportStory(itemExportStoryId);
      if (!bundle) {
        throw new Error("Unable to assemble export data for this story.");
      }

      const stem = sanitizeFileStem(bundle.story.title) || "story-engine-story";
      const extension =
        itemExportStoryFormat === "json"
          ? "json"
          : itemExportStoryFormat === "markdown"
            ? "md"
            : itemExportStoryFormat === "pdf"
              ? "pdf"
              : "txt";
      const filename = `${stem}.${extension}`;
      const { content, mimeType } = serializeStoryExport(bundle, itemExportStoryFormat);
      await downloadFile(filename, content, mimeType);
      setItemExportStatus("Story exported.");
    } catch (error) {
      setItemExportError(error instanceof Error ? error.message : "Unable to export item.");
    }
  }

  async function handleImportItem() {
    setItemImportStatus(null);
    setItemImportError(null);

    try {
      if (!itemImportFile) {
        throw new Error("Select a JSON file first.");
      }

      const text = await readSelectedFileAsText(itemImportFile);
      const parsed = JSON.parse(text);

      if (itemImportType === "universe") {
        if (
          parsed?.exportVersion !== 1 ||
          (parsed?.type !== "universe" && parsed?.type !== "universe_pack")
        ) {
          throw new Error("This file is not a supported universe export.");
        }

        const result = await importUniverseExport(parsed);
        setItemImportStatus(`Universe imported. (${result.universeId})`);
        return;
      }

      if (itemImportType === "playerCharacter") {
        if (parsed?.exportVersion !== 1 || parsed?.type !== "playerCharacter") {
          throw new Error("This file is not a supported player character export.");
        }

        if (!itemImportUniverseId) {
          throw new Error("Select a target universe first.");
        }

        const result = await importPlayerCharacterExport(parsed, {
          universeId: itemImportUniverseId,
        });
        setItemImportStatus(`Player character imported. (${result.characterId})`);
        return;
      }

      const hasStoryBundle =
        parsed &&
        typeof parsed.exportedAt === "string" &&
        parsed.story &&
        parsed.universe &&
        parsed.playerCharacter &&
        Array.isArray(parsed.messages);

      if (!hasStoryBundle) {
        throw new Error("This file is not a supported story export.");
      }

      const result = await importStoryExport(parsed);
      setItemImportStatus(`Story imported. (${result.storyId})`);
    } catch (error) {
      setItemImportError(error instanceof Error ? error.message : "Unable to import item.");
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
      const text = await readSelectedFileAsText(backupFile);
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
      const text = await readSelectedFileAsText(backupFile);
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
            <Badge variant="accent">{theme.name}</Badge>
          </div>
          <p className="mt-3 text-sm leading-7 text-ink-muted">
            The interface stays in a dark workspace theme optimized for long-form
            writing and dense continuity review.
          </p>
          <div className="mt-4 space-y-4">
            <Field label="Theme">
              <div className="grid gap-3 sm:grid-cols-2">
                {(Object.entries(themes) as Array<[ThemeKey, (typeof themes)[ThemeKey]]>).map(
                  ([key, item]) => {
                    const isSelected = key === themeKey;
                    const previewStyle = buildThemeCssVariables({
                      themeKey: key,
                      customAccent,
                    });

                    return (
                      <button
                        key={key}
                        type="button"
                        style={previewStyle as unknown as CSSProperties}
                        onClick={() => setThemeKey(key)}
                        aria-pressed={isSelected}
                        className={cn(
                          "rounded-card border p-4 text-left transition duration-200",
                          isSelected
                            ? "border-accent/40 bg-panel shadow-[0_24px_80px_rgba(0,0,0,0.55),0_0_42px_rgb(var(--accent-rgb)/0.06)]"
                            : "border-divider bg-panel-muted hover:border-accent/25 hover:bg-panel",
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="h-3 w-3 rounded-full bg-accent" />
                            <span className="font-semibold text-ink">{item.name}</span>
                          </div>
                          {isSelected ? (
                            <span className="text-xs font-semibold uppercase tracking-[0.15em] text-accent-soft">
                              Active
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-3 space-y-2">
                          <div className="rounded-2xl border border-divider bg-panel-muted px-3 py-2">
                            <div className="text-xs font-semibold text-accent">Jamie:</div>
                            <div className="mt-1 text-xs leading-5 text-ink-soft">
                              Quick player message sample.
                            </div>
                          </div>
                          <div className="text-xs leading-5 text-ink-muted">
                            <span className="font-semibold text-accent">Narrator:</span>{" "}
                            A sample narration line for contrast.
                          </div>
                        </div>
                      </button>
                    );
                  },
                )}
              </div>
            </Field>
            {themeKey === "custom" ? (
              <Field label="Custom Accent">
                <div className="flex flex-wrap items-center gap-3">
                  <TextInput
                    value={customAccentInput}
                    onChange={(event) => {
                      const next = event.target.value;
                      setCustomAccentInput(next);
                      setCustomAccent(next);
                    }}
                    placeholder="#7C3AED"
                  />
                  <input
                    type="color"
                    value={customAccent}
                    onChange={(event) => {
                      setCustomAccentInput(event.target.value);
                      setCustomAccent(event.target.value);
                    }}
                    className="h-10 w-10 cursor-pointer rounded-xl border border-divider bg-panel-muted p-1"
                    aria-label="Pick custom accent"
                  />
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setCustomAccentInput(themes.custom.accent);
                      setCustomAccent(themes.custom.accent);
                    }}
                  >
                    Reset
                  </Button>
                </div>
                <div className="mt-2 text-xs leading-5 text-ink-muted">
                  Enter a hex colour (#RRGGBB). Invalid values won’t apply.
                </div>
              </Field>
            ) : null}
            <Field label="Text Size">
              <SelectInput
                value={textSize}
                onChange={(event) =>
                  setTextSize(event.target.value as "sm" | "md" | "lg" | "xl")
                }
              >
                <option value="sm">Small</option>
                <option value="md">Default</option>
                <option value="lg">Large</option>
                <option value="xl">Extra Large</option>
              </SelectInput>
            </Field>
          </div>
        </Panel>

        <Panel className="h-full">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              Version Information
            </h2>
            <Badge variant="accent">v{APP_VERSION}</Badge>
          </div>
          <p className="mt-3 text-sm leading-7 text-ink-muted">
            Version tracking and release notes for the current build.
          </p>
          <div className="mt-4 space-y-4">
            <Panel className="border-white/8 bg-black/15">
              <div className="text-sm text-ink-soft">{APP_NAME} v{APP_VERSION}</div>
            </Panel>
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={openChangelog}>
                View Changelog
              </Button>
              <Button variant="secondary" onClick={openChangelogHistory}>
                View Full Changelog
              </Button>
              <Button variant="secondary" onClick={handleCopyVersionInformation}>
                Copy Version Information
              </Button>
              <Button variant="secondary" disabled>
                Export Diagnostics
              </Button>
            </div>
            {versionCopyStatus ? (
              <div className="rounded-2xl border border-white/8 bg-black/15 px-4 py-3 text-sm text-ink-muted">
                {versionCopyStatus}
              </div>
            ) : null}
          </div>
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
                className="block w-full text-sm text-ink-muted file:mr-4 file:rounded-2xl file:border-0 file:bg-white/[0.06] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-ink hover:file:bg-white/[0.09]"
                onChange={(event) => setBackupFile(event.target.files?.[0] ?? null)}
              />
              <div className="text-xs text-ink-muted">
                Android file pickers can mislabel JSON files, so file filtering is disabled
                here. The app still validates the file contents during import.
              </div>
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
              Import & Export
            </h2>
          </div>
          <p className="mt-3 text-sm leading-7 text-ink-muted">
            Export individual universes, player characters, or stories. Imports always
            duplicate with new IDs and never overwrite existing data.
          </p>

          <div className="mt-4 space-y-6">
            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                Export Item
              </div>
              <Field label="Type">
                <SelectInput
                  value={itemExportType}
                  onChange={(event) =>
                    setItemExportType(
                      event.target.value as "universe" | "playerCharacter" | "story",
                    )
                  }
                >
                  <option value="story">Story</option>
                  <option value="universe">Universe</option>
                  <option value="playerCharacter">Player Character</option>
                </SelectInput>
              </Field>

              {itemExportType === "universe" ? (
                <Field label="Universe">
                  <SelectInput
                    value={itemExportUniverseId}
                    onChange={(event) => setItemExportUniverseId(event.target.value)}
                  >
                    {universes.length ? (
                      universes.map((universe) => (
                        <option key={universe.id} value={universe.id}>
                          {universe.name}
                        </option>
                      ))
                    ) : (
                      <option value="">No universes available</option>
                    )}
                  </SelectInput>
                </Field>
              ) : itemExportType === "playerCharacter" ? (
                <Field label="Player Character">
                  <SelectInput
                    value={itemExportCharacterId}
                    onChange={(event) => setItemExportCharacterId(event.target.value)}
                  >
                    {playerCharacters.length ? (
                      playerCharacters.map((character) => (
                        <option key={character.id} value={character.id}>
                          {character.name}
                        </option>
                      ))
                    ) : (
                      <option value="">No characters available</option>
                    )}
                  </SelectInput>
                </Field>
              ) : (
                <>
                  <Field label="Story">
                    <SelectInput
                      value={itemExportStoryId}
                      onChange={(event) => setItemExportStoryId(event.target.value)}
                    >
                      {stories.length ? (
                        stories.map((story) => (
                          <option key={story.id} value={story.id}>
                            {story.title}
                          </option>
                        ))
                      ) : (
                        <option value="">No stories available</option>
                      )}
                    </SelectInput>
                  </Field>
                  <Field label="Story Format">
                    <SelectInput
                      value={itemExportStoryFormat}
                      onChange={(event) =>
                        setItemExportStoryFormat(
                          event.target.value as "json" | "markdown" | "txt" | "pdf",
                        )
                      }
                    >
                      <option value="json">json</option>
                      <option value="markdown">markdown</option>
                      <option value="txt">txt</option>
                      <option value="pdf">pdf</option>
                    </SelectInput>
                  </Field>
                </>
              )}

              <Button
                variant="secondary"
                onClick={handleExportItem}
                disabled={
                  itemExportType === "universe"
                    ? !universes.length
                    : itemExportType === "playerCharacter"
                      ? !playerCharacters.length
                      : !stories.length
                }
              >
                Export
              </Button>

              {itemExportStatus ? (
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
                  {itemExportStatus}
                </div>
              ) : null}

              {itemExportError ? (
                <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
                  {itemExportError}
                </div>
              ) : null}
            </div>

            <div className="space-y-3 border-t border-white/8 pt-5">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                Import Item
              </div>

              <Field label="Type">
                <SelectInput
                  value={itemImportType}
                  onChange={(event) =>
                    setItemImportType(
                      event.target.value as "universe" | "playerCharacter" | "story",
                    )
                  }
                >
                  <option value="story">Story JSON</option>
                  <option value="universe">Universe JSON</option>
                  <option value="playerCharacter">Player Character JSON</option>
                </SelectInput>
              </Field>

              <input
                type="file"
                className="block w-full text-sm text-ink-muted file:mr-4 file:rounded-2xl file:border-0 file:bg-white/[0.06] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-ink hover:file:bg-white/[0.09]"
                onChange={(event) => setItemImportFile(event.target.files?.[0] ?? null)}
              />
              <div className="text-xs text-ink-muted">
                Android file pickers can mislabel JSON files, so file filtering is disabled
                here. The app still validates the file contents during import.
              </div>

              {itemImportType === "playerCharacter" ? (
                <Field label="Target Universe">
                  <SelectInput
                    value={itemImportUniverseId}
                    onChange={(event) => setItemImportUniverseId(event.target.value)}
                  >
                    {universes.length ? (
                      universes.map((universe) => (
                        <option key={universe.id} value={universe.id}>
                          {universe.name}
                        </option>
                      ))
                    ) : (
                      <option value="">No universes available</option>
                    )}
                  </SelectInput>
                </Field>
              ) : null}

              <Button
                variant="secondary"
                onClick={handleImportItem}
                disabled={
                  !itemImportFile ||
                  (itemImportType === "playerCharacter" && !universes.length)
                }
              >
                Import
              </Button>

              {itemImportStatus ? (
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
                  {itemImportStatus}
                </div>
              ) : null}

              {itemImportError ? (
                <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
                  {itemImportError}
                </div>
              ) : null}
            </div>
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
