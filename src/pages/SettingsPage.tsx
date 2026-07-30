import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { cn } from "../utils/cn";
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
import { useTheme } from "../app/theming/ThemeContext";
import type { AIProviderType } from "../types/models";
import { getProviderDefaultModel, getProviderModels, getValidModel } from "../lib/ai/models";
import { downloadFile } from "../lib/download";
import { serializeStoryExport } from "../lib/storyExport";
import { useDebouncedEffect } from "../lib/useDebouncedEffect";
import { TutorialSettingsTab } from "../components/settings/TutorialSettingsTab";
import { ThemePicker } from "../components/settings/ThemePicker";

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
  const [searchParams] = useSearchParams();
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
    deleteAllStories,
    deleteAllPlayerCharacters,
    deleteAllUniverses,
  } = useStoryEngine();

  const { openChangelog, openChangelogHistory } = useChangelog();
  const { themeKey, setThemeKey, theme, customAccent, setCustomAccent } = useTheme();
  const [customAccentError, setCustomAccentError] = useState<string | null>(null);
  const [activeProviderType, setActiveProviderType] = useState<AIProviderType>(
    aiSettings?.activeProviderType ?? "openai",
  );
  const [openaiModel, setOpenaiModel] = useState(
    aiSettings?.defaultModels?.openai ?? getProviderDefaultModel("openai"),
  );
  const [geminiModel, setGeminiModel] = useState(
    getValidModel("gemini", aiSettings?.defaultModels?.gemini),
  );
  const [openrouterModel, setOpenrouterModel] = useState(
    aiSettings?.defaultModels?.openrouter ?? getProviderDefaultModel("openrouter"),
  );
  const [anthropicModel, setAnthropicModel] = useState(
    aiSettings?.defaultModels?.anthropic ?? getProviderDefaultModel("anthropic"),
  );
  const [openaiKeyInput, setOpenaiKeyInput] = useState("");
  const [geminiKeyInput, setGeminiKeyInput] = useState("");
  const [openrouterKeyInput, setOpenrouterKeyInput] = useState("");
  const [anthropicKeyInput, setAnthropicKeyInput] = useState("");
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
    setCustomAccentError(null);
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
  const [deleteStoriesConfirm, setDeleteStoriesConfirm] = useState("");
  const [deleteCharactersConfirm, setDeleteCharactersConfirm] = useState("");
  const [deleteUniversesConfirm, setDeleteUniversesConfirm] = useState("");
  const [dangerZoneLoading, setDangerZoneLoading] = useState<"stories" | "characters" | "universes" | null>(null);

  useEffect(() => {
    setActiveProviderType(aiSettings?.activeProviderType ?? "openai");
    setOpenaiModel(
      aiSettings?.defaultModels?.openai ?? getProviderDefaultModel("openai"),
    );
    setGeminiModel(getValidModel("gemini", aiSettings?.defaultModels?.gemini));
    setOpenrouterModel(
      aiSettings?.defaultModels?.openrouter ?? getProviderDefaultModel("openrouter"),
    );
    setAnthropicModel(
      aiSettings?.defaultModels?.anthropic ?? getProviderDefaultModel("anthropic"),
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
          (aiSettings.defaultModels?.openrouter ?? getProviderDefaultModel("openrouter")) &&
        anthropicModel ===
          (aiSettings.defaultModels?.anthropic ?? getProviderDefaultModel("anthropic"))
      ) {
        return;
      }

      void saveAISettings({
        activeProviderType,
        defaultModels: {
          openai: openaiModel,
          gemini: geminiModel,
          openrouter: openrouterModel,
          anthropic: anthropicModel,
        },
      }).catch(() => {});
    },
    800,
    [aiSettings, isSaving, activeProviderType, openaiModel, geminiModel, openrouterModel, anthropicModel],
  );

  useDebouncedEffect(
    () => {
      if (isSaving) {
        return;
      }

      const openaiKey = openaiKeyInput.trim();
      const geminiKey = geminiKeyInput.trim();
      const openrouterKey = openrouterKeyInput.trim();
      const anthropicKey = anthropicKeyInput.trim();

      if (!openaiKey && !geminiKey && !openrouterKey && !anthropicKey) {
        return;
      }

      void saveAISettings({
        activeProviderType,
        apiKeys: {
          openai: openaiKey ? openaiKey : undefined,
          gemini: geminiKey ? geminiKey : undefined,
          openrouter: openrouterKey ? openrouterKey : undefined,
          anthropic: anthropicKey ? anthropicKey : undefined,
        },
        defaultModels: {
          openai: openaiModel,
          gemini: geminiModel,
          openrouter: openrouterModel,
          anthropic: anthropicModel,
        },
      })
        .then(() => {
          setOpenaiKeyInput("");
          setGeminiKeyInput("");
          setOpenrouterKeyInput("");
          setAnthropicKeyInput("");
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
      anthropicModel,
      openaiKeyInput,
      geminiKeyInput,
      openrouterKeyInput,
      anthropicKeyInput,
    ],
  );

  const openaiConfigured = Boolean(aiSettings?.apiKeys?.openai?.trim());
  const geminiConfigured = Boolean(aiSettings?.apiKeys?.gemini?.trim());
  const openrouterConfigured = Boolean(aiSettings?.apiKeys?.openrouter?.trim());
  const anthropicConfigured = Boolean(aiSettings?.apiKeys?.anthropic?.trim());
  const providerBadge = useMemo(() => {
    if (!openaiConfigured && !geminiConfigured && !openrouterConfigured && !anthropicConfigured) {
      return <Badge variant="warning">Not configured</Badge>;
    }

    return <Badge variant="accent">Configured</Badge>;
  }, [anthropicConfigured, geminiConfigured, openaiConfigured, openrouterConfigured]);

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
          anthropic: anthropicKeyInput.trim() ? anthropicKeyInput : undefined,
        },
        defaultModels: {
          openai: openaiModel,
          gemini: geminiModel,
          openrouter: openrouterModel,
          anthropic: anthropicModel,
        },
      });
      setOpenaiKeyInput("");
      setGeminiKeyInput("");
      setOpenrouterKeyInput("");
      setAnthropicKeyInput("");
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

  const [activeTab, setActiveTab] = useState<"theme" | "ai" | "data" | "storage" | "tutorial">("theme");

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "tutorial") {
      setActiveTab("tutorial");
    }
  }, [searchParams]);

  const tabs = [
    { id: "theme" as const, label: "Theme" },
    { id: "ai" as const, label: "AI" },
    { id: "data" as const, label: "Data" },
    { id: "storage" as const, label: "Storage" },
    { id: "tutorial" as const, label: "Tutorial" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Settings"
        description="Configure your AI provider, theme, local workspace, and learn how the app works."
      />

      {/* Tab bar */}
      <div className="-mx-4 flex overflow-x-auto border-b border-divider/[0.3] px-4 md:mx-0 md:px-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-shrink-0 px-5 py-3 text-[12px] font-semibold transition",
              activeTab === tab.id
                ? "border-b-2 border-accent text-ink"
                : "border-b-2 border-transparent text-white/30 hover:text-white/50",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Theme tab */}
      {activeTab === "theme" && (
        <div className="space-y-5">
          <Panel variant="flat">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">App accent</div>
              <Badge variant="accent">{theme.name}</Badge>
            </div>
            <div className="mt-4">
              <ThemePicker
                selectedKey={themeKey}
                customAccent={customAccent}
                onSelectKey={(key) => {
                  setThemeKey(key);
                  setCustomAccentError(null);
                }}
                onCustomAccentChange={(value) => {
                  const applied = setCustomAccent(value);
                  setCustomAccentError(applied ? null : "Enter a valid hex colour (#RRGGBB).");
                }}
              />
            </div>
            {customAccentError ? (
              <div className="mt-3 rounded-[8px] border border-rose-400/20 bg-rose-400/10 px-3.5 py-3 text-sm text-rose-200">
                {customAccentError}
              </div>
            ) : null}
          </Panel>

          <Panel variant="flat">
            <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">Text Size</div>
            <div className="mt-3">
              <Field label="">
                <SelectInput
                  value={textSize}
                  onChange={(event) => setTextSize(event.target.value as "sm" | "md" | "lg" | "xl")}
                >
                  <option value="sm">Small</option>
                  <option value="md">Default</option>
                  <option value="lg">Large</option>
                  <option value="xl">Extra Large</option>
                </SelectInput>
              </Field>
            </div>
          </Panel>

          <Panel variant="flat">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">Version</div>
              <Badge variant="accent">v{APP_VERSION}</Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={openChangelog}>Changelog</Button>
              <Button variant="secondary" size="sm" onClick={openChangelogHistory}>Full History</Button>
              <Button variant="secondary" size="sm" onClick={handleCopyVersionInformation}>Copy Version Info</Button>
            </div>
            {versionCopyStatus ? (
              <div className="mt-3 rounded-[8px] border border-divider/[0.4] bg-panel-muted/50 px-3.5 py-3 text-[13px] text-ink-muted">
                {versionCopyStatus}
              </div>
            ) : null}
          </Panel>
        </div>
      )}

      {/* AI tab */}
      {activeTab === "ai" && (
        <div className="space-y-4">
          <Panel variant="flat">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">Active Provider</div>
              {providerBadge}
            </div>
            <div className="mt-3">
              <SelectInput
                value={activeProviderType}
                onChange={(event) => setActiveProviderType(event.target.value as AIProviderType)}
              >
                <option value="openai">OpenAI</option>
                <option value="gemini">Gemini</option>
                <option value="openrouter">OpenRouter</option>
                <option value="anthropic">Anthropic</option>
              </SelectInput>
            </div>
          </Panel>

          {(
            [
              {
                id: "openai" as const,
                label: "OpenAI",
                configured: openaiConfigured,
                model: openaiModel,
                setModel: setOpenaiModel,
                keyInput: openaiKeyInput,
                setKeyInput: setOpenaiKeyInput,
                placeholder: "sk-...",
              },
              {
                id: "gemini" as const,
                label: "Gemini",
                configured: geminiConfigured,
                model: geminiModel,
                setModel: setGeminiModel,
                keyInput: geminiKeyInput,
                setKeyInput: setGeminiKeyInput,
                placeholder: "AIza...",
              },
              {
                id: "openrouter" as const,
                label: "OpenRouter",
                configured: openrouterConfigured,
                model: openrouterModel,
                setModel: setOpenrouterModel,
                keyInput: openrouterKeyInput,
                setKeyInput: setOpenrouterKeyInput,
                placeholder: "sk-or-...",
              },
              {
                id: "anthropic" as const,
                label: "Anthropic",
                configured: anthropicConfigured,
                model: anthropicModel,
                setModel: setAnthropicModel,
                keyInput: anthropicKeyInput,
                setKeyInput: setAnthropicKeyInput,
                placeholder: "sk-ant-...",
              },
            ] as const
          ).map((provider) => (
            <Panel variant="flat" key={provider.id}>
              <div className="flex items-center justify-between gap-3">
                <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">{provider.label}</div>
                <Badge variant={provider.configured ? "accent" : "warning"}>
                  {provider.configured ? "Key saved" : "No key"}
                </Badge>
              </div>
              <div className="mt-3 space-y-3">
                <Field label="Default Model">
                  <SelectInput
                    value={provider.model}
                    onChange={(event) => provider.setModel(event.target.value)}
                  >
                    {getProviderModels(provider.id).map((model) => (
                      <option key={model.id} value={model.id}>{model.label}</option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="API Key" hint={provider.configured ? "Saved locally" : "Required"}>
                  <TextInput
                    type="password"
                    value={provider.keyInput}
                    onChange={(event) => provider.setKeyInput(event.target.value)}
                    placeholder={provider.configured ? "Enter a new key to replace" : provider.placeholder}
                    autoComplete="off"
                  />
                </Field>
              </div>
            </Panel>
          ))}

          {statusMessage ? (
            <div className="rounded-[8px] border border-emerald-400/20 bg-emerald-400/10 px-3.5 py-3 text-sm text-emerald-200">
              {statusMessage}
            </div>
          ) : null}
          {errorMessage ? (
            <div className="rounded-[8px] border border-rose-400/20 bg-rose-400/10 px-3.5 py-3 text-sm text-rose-200">
              {errorMessage}
            </div>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save"}
            </Button>
            <Button variant="secondary" onClick={handleValidate} disabled={isValidating}>
              {isValidating ? "Validating..." : "Validate Connection"}
            </Button>
          </div>
        </div>
      )}

      {/* Data tab */}
      {activeTab === "data" && (
        <div className="space-y-5">
          <Panel variant="flat">
            <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">Backup & Restore</div>
            <p className="mt-2 text-[13px] leading-6 text-ink-muted">
              Export a portable JSON backup of your entire local workspace.
            </p>
            <div className="mt-3 space-y-3">
              <Button variant="secondary" onClick={handleExportBackup}>Export Backup</Button>
              <div className="space-y-2 border-t border-divider/[0.3] pt-3">
                <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">Import Backup</div>
                <input
                  type="file"
                  className="block w-full text-sm text-ink-muted file:mr-3 file:rounded-[8px] file:border-0 file:bg-white/[0.06] file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-ink hover:file:bg-white/[0.09]"
                  onChange={(event) => setBackupFile(event.target.files?.[0] ?? null)}
                />
                <div className="text-[11px] text-ink-muted">
                  Android file pickers can mislabel JSON files — file filtering is disabled. The app validates contents during import.
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" onClick={handleImportBackup} disabled={!backupFile}>
                    Import (Merge)
                  </Button>
                  <Button variant="secondary" onClick={handleReplaceBackup} disabled={!backupFile}>
                    Import (Replace All)
                  </Button>
                </div>
              </div>
              {backupStatus ? (
                <div className="rounded-[8px] border border-emerald-400/20 bg-emerald-400/10 px-3.5 py-3 text-sm text-emerald-200">{backupStatus}</div>
              ) : null}
              {backupError ? (
                <div className="rounded-[8px] border border-rose-400/20 bg-rose-400/10 px-3.5 py-3 text-sm text-rose-200">{backupError}</div>
              ) : null}
            </div>
          </Panel>

          <Panel variant="flat">
            <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">Export Item</div>
            <div className="mt-3 space-y-3">
              <Field label="Type">
                <SelectInput
                  value={itemExportType}
                  onChange={(event) => setItemExportType(event.target.value as "universe" | "playerCharacter" | "story")}
                >
                  <option value="story">Story</option>
                  <option value="universe">Universe</option>
                  <option value="playerCharacter">Player Character</option>
                </SelectInput>
              </Field>
              {itemExportType === "universe" ? (
                <Field label="Universe">
                  <SelectInput value={itemExportUniverseId} onChange={(event) => setItemExportUniverseId(event.target.value)}>
                    {universes.length ? universes.map((u) => <option key={u.id} value={u.id}>{u.name}</option>) : <option value="">No universes</option>}
                  </SelectInput>
                </Field>
              ) : itemExportType === "playerCharacter" ? (
                <Field label="Player Character">
                  <SelectInput value={itemExportCharacterId} onChange={(event) => setItemExportCharacterId(event.target.value)}>
                    {playerCharacters.length ? playerCharacters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>) : <option value="">No characters</option>}
                  </SelectInput>
                </Field>
              ) : (
                <>
                  <Field label="Story">
                    <SelectInput value={itemExportStoryId} onChange={(event) => setItemExportStoryId(event.target.value)}>
                      {stories.length ? stories.map((s) => <option key={s.id} value={s.id}>{s.title}</option>) : <option value="">No stories</option>}
                    </SelectInput>
                  </Field>
                  <Field label="Format">
                    <SelectInput value={itemExportStoryFormat} onChange={(event) => setItemExportStoryFormat(event.target.value as "json" | "markdown" | "txt" | "pdf")}>
                      <option value="json">JSON</option>
                      <option value="markdown">Markdown</option>
                      <option value="txt">TXT</option>
                      <option value="pdf">PDF</option>
                    </SelectInput>
                  </Field>
                </>
              )}
              <Button variant="secondary" onClick={handleExportItem} disabled={itemExportType === "universe" ? !universes.length : itemExportType === "playerCharacter" ? !playerCharacters.length : !stories.length}>
                Export
              </Button>
              {itemExportStatus ? <div className="rounded-[8px] border border-emerald-400/20 bg-emerald-400/10 px-3.5 py-3 text-sm text-emerald-200">{itemExportStatus}</div> : null}
              {itemExportError ? <div className="rounded-[8px] border border-rose-400/20 bg-rose-400/10 px-3.5 py-3 text-sm text-rose-200">{itemExportError}</div> : null}
            </div>
          </Panel>

          <Panel variant="flat">
            <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">Import Item</div>
            <div className="mt-3 space-y-3">
              <Field label="Type">
                <SelectInput value={itemImportType} onChange={(event) => setItemImportType(event.target.value as "universe" | "playerCharacter" | "story")}>
                  <option value="story">Story JSON</option>
                  <option value="universe">Universe JSON</option>
                  <option value="playerCharacter">Player Character JSON</option>
                </SelectInput>
              </Field>
              <input
                type="file"
                className="block w-full text-sm text-ink-muted file:mr-3 file:rounded-[8px] file:border-0 file:bg-white/[0.06] file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-ink hover:file:bg-white/[0.09]"
                onChange={(event) => setItemImportFile(event.target.files?.[0] ?? null)}
              />
              <div className="text-[11px] text-ink-muted">Imports always create new IDs and never overwrite existing data.</div>
              {itemImportType === "playerCharacter" ? (
                <Field label="Target Universe">
                  <SelectInput value={itemImportUniverseId} onChange={(event) => setItemImportUniverseId(event.target.value)}>
                    {universes.length ? universes.map((u) => <option key={u.id} value={u.id}>{u.name}</option>) : <option value="">No universes</option>}
                  </SelectInput>
                </Field>
              ) : null}
              <Button variant="secondary" onClick={handleImportItem} disabled={!itemImportFile || (itemImportType === "playerCharacter" && !universes.length)}>
                Import
              </Button>
              {itemImportStatus ? <div className="rounded-[8px] border border-emerald-400/20 bg-emerald-400/10 px-3.5 py-3 text-sm text-emerald-200">{itemImportStatus}</div> : null}
              {itemImportError ? <div className="rounded-[8px] border border-rose-400/20 bg-rose-400/10 px-3.5 py-3 text-sm text-rose-200">{itemImportError}</div> : null}
            </div>
          </Panel>
        </div>
      )}

      {/* Storage tab */}
      {activeTab === "storage" && (
        <div className="space-y-4">
          <Panel variant="flat">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">Storage Status</div>
              <Badge variant={storageStatus.ready ? "success" : "warning"}>
                {storageStatus.ready ? "Ready" : "Attention needed"}
              </Badge>
            </div>
            <div className="mt-3 flex items-center gap-2.5 text-accent-soft">
              <DatabaseIcon className="h-4 w-4" />
              <span className="text-[13px]">{storageStatus.driver}</span>
            </div>
            <dl className="mt-3 divide-y divide-divider/[0.3]">
              {[
                { label: "Universes", value: storageStatus.universesCount },
                { label: "Player Characters", value: storageStatus.playerCharactersCount },
                { label: "Stories", value: storageStatus.storiesCount },
                { label: "Messages", value: storageStatus.messagesCount },
                { label: "Total Records", value: storageStatus.totalRecords },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between gap-4 py-2.5">
                  <dt className="text-[11px] text-ink-muted">{label}</dt>
                  <dd className="text-[13px] text-ink-soft">{value}</dd>
                </div>
              ))}
            </dl>
            {storageStatus.errorMessage ? (
              <div className="mt-3 rounded-[8px] border border-amber-300/20 bg-amber-300/10 px-3.5 py-3 text-sm text-amber-100">
                {storageStatus.errorMessage}
              </div>
            ) : null}
          </Panel>

          <Panel variant="flat">
            <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-rose-400/70">Danger Zone</div>
            <div className="mt-3 space-y-3">
              {/* Delete All Stories */}
              <div className="rounded-[8px] border border-rose-400/20 bg-rose-400/5 px-4 py-4 space-y-3">
                <div>
                  <div className="font-semibold text-sm text-ink">Delete All Stories</div>
                  <div className="text-xs text-ink-muted mt-0.5">Delete {storageStatus.storiesCount} {storageStatus.storiesCount === 1 ? "story" : "stories"}?</div>
                </div>
                <ul className="text-xs text-ink-muted space-y-0.5 list-disc list-inside">
                  <li>Stories and chapters</li>
                  <li>Messages and transcripts</li>
                  <li>RP data, HP, money and events</li>
                  <li>Relationships and timelines</li>
                </ul>
                <div className="text-xs text-ink-muted">
                  Type <span className="font-mono font-semibold text-ink">DELETE STORIES</span> to continue.
                </div>
                <input
                  className="w-full rounded-[6px] border border-divider bg-panel-muted/50 px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-rose-400/40 focus:ring-2 focus:ring-rose-400/10"
                  value={deleteStoriesConfirm}
                  onChange={(e) => setDeleteStoriesConfirm(e.target.value)}
                  placeholder="Type DELETE STORIES"
                  autoComplete="off"
                  spellCheck={false}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full border-rose-400/30 text-rose-300 hover:bg-rose-400/10 disabled:opacity-40"
                  disabled={deleteStoriesConfirm !== "DELETE STORIES" || dangerZoneLoading !== null}
                  onClick={async () => {
                    setDangerZoneLoading("stories");
                    try { await deleteAllStories(); } finally {
                      setDangerZoneLoading(null);
                      setDeleteStoriesConfirm("");
                    }
                  }}
                >
                  {dangerZoneLoading === "stories" ? "Deleting…" : "Delete All Stories"}
                </Button>
              </div>

              {/* Delete All Characters */}
              <div className="rounded-[8px] border border-rose-400/20 bg-rose-400/5 px-4 py-4 space-y-3">
                <div>
                  <div className="font-semibold text-sm text-ink">Delete All Characters</div>
                  <div className="text-xs text-ink-muted mt-0.5">Delete {storageStatus.playerCharactersCount} {storageStatus.playerCharactersCount === 1 ? "character" : "characters"}?</div>
                </div>
                <div className="text-xs text-ink-muted">This may affect stories that reference these characters.</div>
                <div className="text-xs text-ink-muted">
                  Type <span className="font-mono font-semibold text-ink">DELETE CHARACTERS</span> to continue.
                </div>
                <input
                  className="w-full rounded-[6px] border border-divider bg-panel-muted/50 px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-rose-400/40 focus:ring-2 focus:ring-rose-400/10"
                  value={deleteCharactersConfirm}
                  onChange={(e) => setDeleteCharactersConfirm(e.target.value)}
                  placeholder="Type DELETE CHARACTERS"
                  autoComplete="off"
                  spellCheck={false}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full border-rose-400/30 text-rose-300 hover:bg-rose-400/10 disabled:opacity-40"
                  disabled={deleteCharactersConfirm !== "DELETE CHARACTERS" || dangerZoneLoading !== null}
                  onClick={async () => {
                    setDangerZoneLoading("characters");
                    try { await deleteAllPlayerCharacters(); } finally {
                      setDangerZoneLoading(null);
                      setDeleteCharactersConfirm("");
                    }
                  }}
                >
                  {dangerZoneLoading === "characters" ? "Deleting…" : "Delete All Characters"}
                </Button>
              </div>

              {/* Delete All Universes */}
              <div className="rounded-[8px] border border-rose-400/20 bg-rose-400/5 px-4 py-4 space-y-3">
                <div>
                  <div className="font-semibold text-sm text-ink">Delete All Universes</div>
                  <div className="text-xs text-ink-muted mt-0.5">Delete {storageStatus.universesCount} {storageStatus.universesCount === 1 ? "universe" : "universes"}?</div>
                </div>
                <div className="text-xs text-ink-muted">Stories will remain, but universe-specific lore and settings will be lost.</div>
                <div className="text-xs text-ink-muted">
                  Type <span className="font-mono font-semibold text-ink">DELETE UNIVERSES</span> to continue.
                </div>
                <input
                  className="w-full rounded-[6px] border border-divider bg-panel-muted/50 px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-rose-400/40 focus:ring-2 focus:ring-rose-400/10"
                  value={deleteUniversesConfirm}
                  onChange={(e) => setDeleteUniversesConfirm(e.target.value)}
                  placeholder="Type DELETE UNIVERSES"
                  autoComplete="off"
                  spellCheck={false}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full border-rose-400/30 text-rose-300 hover:bg-rose-400/10 disabled:opacity-40"
                  disabled={deleteUniversesConfirm !== "DELETE UNIVERSES" || dangerZoneLoading !== null}
                  onClick={async () => {
                    setDangerZoneLoading("universes");
                    try { await deleteAllUniverses(); } finally {
                      setDangerZoneLoading(null);
                      setDeleteUniversesConfirm("");
                    }
                  }}
                >
                  {dangerZoneLoading === "universes" ? "Deleting…" : "Delete All Universes"}
                </Button>
              </div>
            </div>
          </Panel>
        </div>
      )}

      {activeTab === "tutorial" && <TutorialSettingsTab />}
    </div>
  );
}
