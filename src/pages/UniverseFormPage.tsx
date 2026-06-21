import { useEffect, useMemo, useState } from "react";
import { cn } from "../utils/cn";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { Field, TextAreaInput, TextInput } from "../components/forms/Fields";
import { Button, buttonClasses } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { SparklesIcon } from "../components/icons";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";
import type { UniverseDraft } from "../types/models";
import { importUniverseLore } from "../lib/ingestion/importUniverseLore";
import { useDebouncedEffect } from "../lib/useDebouncedEffect";
import {
  getPrimaryUniverseWikiUrl,
  normalizeUniverseWikiSources,
} from "../lib/universeSources";

const initialFormState: UniverseDraft = {
  name: "",
  description: "",
  wikiUrl: "",
  wikiUrls: [],
  mode: "referenced",
  concept: "",
  genreTheme: "",
  tone: "",
  universeBlueprint: "",
  notes: "",
};

function normalizeMode(value: UniverseDraft["mode"] | undefined) {
  return value === "custom" ? "custom" : "referenced";
}

export function UniverseFormPage() {
  const { universeId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    createUniverse,
    generateUniverseBlueprint,
    getUniverseById,
    saveUniverseImport,
    updateUniverse,
  } = useStoryEngine();
  const existingUniverse = universeId ? getUniverseById(universeId) : undefined;
  const isEditing = Boolean(existingUniverse);
  const isImportMode = location.pathname.endsWith("/import");
  const [formState, setFormState] = useState<UniverseDraft>(initialFormState);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatorError, setGeneratorError] = useState<string | null>(null);
  const [pendingUniverseId, setPendingUniverseId] = useState<string | null>(null);

  useEffect(() => {
    if (!existingUniverse) {
      return;
    }

    const mode = normalizeMode(existingUniverse.mode);
    const description = existingUniverse.description ?? "";
    const concept =
      mode === "custom"
        ? (existingUniverse.concept ?? existingUniverse.description ?? "")
        : (existingUniverse.concept ?? "");

    setFormState({
      name: existingUniverse.name,
      description,
      wikiUrl: existingUniverse.wikiUrl ?? "",
      wikiUrls: normalizeUniverseWikiSources(existingUniverse),
      mode,
      concept,
      genreTheme: existingUniverse.genreTheme ?? "",
      tone: existingUniverse.tone ?? "",
      universeBlueprint: existingUniverse.universeBlueprint ?? "",
      notes: existingUniverse.notes ?? "",
    });
    setPendingUniverseId(null);
  }, [existingUniverse]);

  useDebouncedEffect(
    () => {
      if (!existingUniverse || isSubmitting || isImportMode || isGenerating) {
        return;
      }

      void updateUniverse(existingUniverse.id, formState).catch((error) => {
        setErrorMessage(
          error instanceof Error ? error.message : "Auto-save failed.",
        );
      });
    },
    800,
    [
      existingUniverse?.id,
      formState.mode,
      formState.name,
      formState.description,
      formState.wikiUrl,
      JSON.stringify(formState.wikiUrls ?? []),
      formState.concept,
      formState.genreTheme,
      formState.tone,
      formState.universeBlueprint,
      formState.notes,
      isSubmitting,
      isGenerating,
      isImportMode,
    ],
  );

  const pageTitle = useMemo(() => {
    if (isEditing) {
      return "Edit Universe";
    }

    return isImportMode ? "Import Universe" : "Create Universe";
  }, [isEditing, isImportMode]);

  if (universeId && !existingUniverse) {
    return (
      <div className="space-y-8">
        <PageHeader
          eyebrow="Universes"
          title="This universe could not be found"
          description="Return to the universe list and choose another entry."
        />
        <EmptyState
          title="Missing universe"
          description="The requested universe is not available in local storage."
          action={
            <Link to="/universes" className={buttonClasses()}>
              Back to Universes
            </Link>
          }
        />
      </div>
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const effectiveMode = isImportMode ? "referenced" : normalizeMode(formState.mode);
    const normalizedSources = normalizeUniverseWikiSources(formState);
    const primaryWikiUrl = getPrimaryUniverseWikiUrl({
      wikiUrl: formState.wikiUrl,
      wikiUrls: normalizedSources,
    });

    if (!formState.name.trim()) {
      setErrorMessage("Universe name is required.");
      return;
    }

    if (effectiveMode === "custom" && !(formState.concept ?? "").trim()) {
      setErrorMessage("Universe concept is required for custom universes.");
      return;
    }

    if (isImportMode && !primaryWikiUrl) {
      setErrorMessage("Wiki URL is required to import lore.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const description = formState.description.trim();
      const concept = (formState.concept ?? "").trim();
      const draft: UniverseDraft = {
        ...formState,
        wikiUrl: primaryWikiUrl,
        wikiUrls: normalizedSources,
        mode: effectiveMode,
        concept: concept || undefined,
        description,
      };

      if (existingUniverse) {
        const savedUniverse = await updateUniverse(existingUniverse.id, draft);

        if (savedUniverse) {
          navigate(`/universes/${savedUniverse.id}`);
        }
      } else {
        const savedUniverse = await createUniverse(draft);

        if (!isImportMode) {
          navigate(`/universes/${savedUniverse.id}`);
          return;
        }

        setPendingUniverseId(savedUniverse.id);

        for (const source of normalizedSources.length
          ? normalizedSources
          : [{ url: primaryWikiUrl, label: undefined, order: 0 }]) {
          const imported = await importUniverseLore(source.url);

          await saveUniverseImport({
            universeId: savedUniverse.id,
            sourceUrl: source.url,
            sourceLabel: source.label,
            title: imported.title,
            importedText: imported.importedText,
            importedAt: new Date().toISOString(),
          });
        }

        navigate(`/universes/${savedUniverse.id}`);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save this universe.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRetryImport() {
    if (!pendingUniverseId) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const normalizedSources = normalizeUniverseWikiSources(formState);
      const sources = normalizedSources.length
        ? normalizedSources
        : [{ url: getPrimaryUniverseWikiUrl(formState), label: undefined, order: 0 }];

      for (const source of sources) {
        const imported = await importUniverseLore(source.url);

        await saveUniverseImport({
          universeId: pendingUniverseId,
          sourceUrl: source.url,
          sourceLabel: source.label,
          title: imported.title,
          importedText: imported.importedText,
          importedAt: new Date().toISOString(),
        });
      }

      navigate(`/universes/${pendingUniverseId}`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to import lore text.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGenerateUniverse(force?: boolean) {
    setGeneratorError(null);

    const mode = normalizeMode(formState.mode);
    if (mode !== "custom") {
      setGeneratorError("Switch to Custom mode to generate a blueprint.");
      return;
    }

    const concept = (formState.concept ?? "").trim();
    if (!concept) {
      setGeneratorError("Universe concept is required.");
      return;
    }

    const existingBlueprint = (formState.universeBlueprint ?? "").trim();
    if (!force && existingBlueprint) {
      const confirmed = window.confirm("Overwrite the existing Universe Blueprint?");
      if (!confirmed) {
        return;
      }
    }

    setIsGenerating(true);
    try {
      const result = await generateUniverseBlueprint({
        name: formState.name.trim() || "Untitled Universe",
        concept,
        genreTheme: (formState.genreTheme ?? "").trim() || undefined,
        tone: (formState.tone ?? "").trim() || undefined,
        existingBlueprint: existingBlueprint || undefined,
      });

      setFormState((current) => ({
        ...current,
        universeBlueprint: result.universeBlueprint,
        description: current.description.trim()
          ? current.description
          : (result.description ?? current.description),
        genreTheme: current.genreTheme?.trim()
          ? current.genreTheme
          : (result.genreTheme ?? current.genreTheme),
        tone: current.tone?.trim() ? current.tone : (result.tone ?? current.tone),
      }));
    } catch (error) {
      setGeneratorError(error instanceof Error ? error.message : "Unable to generate a blueprint.");
    } finally {
      setIsGenerating(false);
    }
  }

  const effectiveMode = isImportMode ? "referenced" : normalizeMode(formState.mode);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Universes"
        title={pageTitle}
        description={
          isImportMode
            ? "Create a universe from a wiki URL and store clean lore text for AI context."
            : "Choose a referenced universe or a concept-first custom universe with a single editable blueprint."
        }
      />

      <Panel padding="lg">
        <form className="space-y-6" onSubmit={handleSubmit}>
          {isImportMode ? null : (
            <div className="-mx-1 flex border-b border-divider/[0.3]">
              {(["referenced", "custom"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  disabled={isSubmitting || isGenerating}
                  onClick={() => setFormState((current) => ({ ...current, mode }))}
                  className={cn(
                    "px-4 py-2.5 text-[12px] font-semibold capitalize transition disabled:opacity-40",
                    effectiveMode === mode
                      ? "border-b-2 border-accent text-ink"
                      : "border-b-2 border-transparent text-white/30 hover:text-white/50",
                  )}
                >
                  {mode}
                </button>
              ))}
            </div>
          )}

          <Field label="Universe Name" hint="Required">
            <TextInput
              value={formState.name}
              onChange={(event) =>
                setFormState((currentState) => ({
                  ...currentState,
                  name: event.target.value,
                }))
              }
              placeholder="Hopeful Frontier"
            />
          </Field>

          {effectiveMode === "custom" ? (
            <Field label="Universe Concept" hint="Required">
              <TextAreaInput
                value={formState.concept ?? ""}
                onChange={(event) =>
                  setFormState((currentState) => ({
                    ...currentState,
                    concept: event.target.value,
                  }))
                }
                placeholder="What kind of universe do you want to play in?"
              />
            </Field>
          ) : null}

          <Field
            label="Description"
            hint="Player-facing (shown in universe lists)"
          >
            <TextAreaInput
              value={formState.description}
              onChange={(event) =>
                setFormState((currentState) => ({
                  ...currentState,
                  description: event.target.value,
                }))
              }
              placeholder="Describe the setting in player-facing terms. Include power rules (what can/can't happen) and the core conflicts (what keeps things tense)."
            />
          </Field>

          {effectiveMode === "referenced" ? (
            <>
              <Field label="Reference Sources" hint={isImportMode ? "At least one source is required" : "Ordered highest to lowest precedence"}>
                <div className="space-y-3">
                  {(formState.wikiUrls?.length
                    ? formState.wikiUrls
                    : [{ url: formState.wikiUrl, label: "", order: 0 }]).map((source, index, all) => (
                    <div
                      key={`${index}-${source.order}`}
                      className="rounded-[8px] border border-divider/[0.45] bg-panel-muted/50 p-3"
                    >
                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                        <TextInput
                          value={source.label ?? ""}
                          onChange={(event) =>
                            setFormState((currentState) => {
                              const nextSources = normalizeUniverseWikiSources(currentState);
                              const seeded = nextSources.length
                                ? nextSources
                                : [{ url: currentState.wikiUrl, label: "", order: 0 }];
                              seeded[index] = {
                                ...seeded[index],
                                label: event.target.value,
                              };
                              return {
                                ...currentState,
                                wikiUrls: seeded.map((entry, entryIndex) => ({
                                  ...entry,
                                  order: entryIndex,
                                })),
                                wikiUrl: index === 0 ? seeded[0]?.url ?? "" : currentState.wikiUrl,
                              };
                            })
                          }
                          placeholder="Optional label"
                        />
                        <TextInput
                          value={source.url}
                          onChange={(event) =>
                            setFormState((currentState) => {
                              const nextSources = normalizeUniverseWikiSources(currentState);
                              const seeded = nextSources.length
                                ? nextSources
                                : [{ url: currentState.wikiUrl, label: "", order: 0 }];
                              seeded[index] = {
                                ...seeded[index],
                                url: event.target.value,
                              };
                              return {
                                ...currentState,
                                wikiUrls: seeded.map((entry, entryIndex) => ({
                                  ...entry,
                                  order: entryIndex,
                                })),
                                wikiUrl:
                                  index === 0
                                    ? event.target.value
                                    : getPrimaryUniverseWikiUrl({
                                        wikiUrl: currentState.wikiUrl,
                                        wikiUrls: seeded,
                                      }),
                              };
                            })
                          }
                          placeholder="https://example-wiki-page"
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={index === 0}
                          onClick={() =>
                            setFormState((currentState) => {
                              const nextSources = normalizeUniverseWikiSources(currentState);
                              if (index <= 0 || index >= nextSources.length) {
                                return currentState;
                              }
                              [nextSources[index - 1], nextSources[index]] = [
                                nextSources[index],
                                nextSources[index - 1],
                              ];
                              const normalized = nextSources.map((entry, entryIndex) => ({
                                ...entry,
                                order: entryIndex,
                              }));
                              return {
                                ...currentState,
                                wikiUrls: normalized,
                                wikiUrl: normalized[0]?.url ?? "",
                              };
                            })
                          }
                        >
                          Up
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={index === all.length - 1}
                          onClick={() =>
                            setFormState((currentState) => {
                              const nextSources = normalizeUniverseWikiSources(currentState);
                              if (index < 0 || index >= nextSources.length - 1) {
                                return currentState;
                              }
                              [nextSources[index], nextSources[index + 1]] = [
                                nextSources[index + 1],
                                nextSources[index],
                              ];
                              const normalized = nextSources.map((entry, entryIndex) => ({
                                ...entry,
                                order: entryIndex,
                              }));
                              return {
                                ...currentState,
                                wikiUrls: normalized,
                                wikiUrl: normalized[0]?.url ?? "",
                              };
                            })
                          }
                        >
                          Down
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={all.length === 1}
                          onClick={() =>
                            setFormState((currentState) => {
                              const nextSources = normalizeUniverseWikiSources(currentState);
                              const normalized = nextSources
                                .filter((_, sourceIndex) => sourceIndex !== index)
                                .map((entry, entryIndex) => ({
                                  ...entry,
                                  order: entryIndex,
                                }));
                              return {
                                ...currentState,
                                wikiUrls: normalized,
                                wikiUrl: normalized[0]?.url ?? "",
                              };
                            })
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setFormState((currentState) => {
                        const nextSources = normalizeUniverseWikiSources(currentState);
                        return {
                          ...currentState,
                          wikiUrls: [
                            ...nextSources,
                            {
                              url: "",
                              label: "",
                              order: nextSources.length,
                            },
                          ],
                        };
                      })
                    }
                  >
                    Add Source
                  </Button>
                </div>
              </Field>

              <Field label="Notes (optional)">
                <TextAreaInput
                  value={formState.notes ?? ""}
                  onChange={(event) =>
                    setFormState((currentState) => ({
                      ...currentState,
                      notes: event.target.value,
                    }))
                  }
                  placeholder="Anything you want to remember about this setting."
                />
              </Field>
            </>
          ) : (
            <>
              <div className="grid gap-6 md:grid-cols-2">
                <Field label="Genre / Theme">
                  <TextInput
                    value={formState.genreTheme ?? ""}
                    onChange={(event) =>
                      setFormState((currentState) => ({
                        ...currentState,
                        genreTheme: event.target.value,
                      }))
                    }
                    placeholder="Hopeful sci-fi frontier"
                  />
                </Field>

                <Field label="Tone">
                  <TextInput
                    value={formState.tone ?? ""}
                    onChange={(event) =>
                      setFormState((currentState) => ({
                        ...currentState,
                        tone: event.target.value,
                      }))
                    }
                    placeholder="Optimistic, tense, mysterious..."
                  />
                </Field>
              </div>

              <Button
                type="button"
                variant="secondary"
                className="justify-start"
                onClick={() => void handleGenerateUniverse()}
                disabled={isSubmitting || isGenerating}
              >
                <SparklesIcon className="h-4 w-4" />
                {isGenerating
                  ? "Generating..."
                  : (formState.universeBlueprint ?? "").trim()
                    ? "Regenerate Universe"
                    : "Generate Universe"}
              </Button>

              {(formState.universeBlueprint ?? "").trim() ? (
                <Field label="Universe Blueprint">
                  <TextAreaInput
                    value={formState.universeBlueprint ?? ""}
                    onChange={(event) =>
                      setFormState((currentState) => ({
                        ...currentState,
                        universeBlueprint: event.target.value,
                      }))
                    }
                    placeholder="Generate a blueprint to begin editing..."
                  />
                </Field>
              ) : null}
            </>
          )}

          {errorMessage ? (
            <div className="rounded-[8px] border border-rose-400/20 bg-rose-400/10 px-3.5 py-3 text-sm text-rose-200">
              {errorMessage}
            </div>
          ) : null}

          {generatorError ? (
            <div className="rounded-[8px] border border-rose-400/20 bg-rose-400/10 px-3.5 py-3 text-sm text-rose-200">
              {generatorError}
            </div>
          ) : null}

          {isImportMode && pendingUniverseId ? (
            <Panel className="border-amber-300/20 bg-amber-300/10">
              <div className="text-sm text-amber-100">
                The universe was created, but the lore import did not finish. Retry the
                import or open the universe now.
              </div>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <Button type="button" onClick={handleRetryImport} disabled={isSubmitting}>
                  {isSubmitting ? "Retrying..." : "Retry Import"}
                </Button>
                <Link
                  to={`/universes/${pendingUniverseId}`}
                  className={buttonClasses({ variant: "ghost" })}
                >
                  Open Universe
                </Link>
              </div>
            </Panel>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? "Saving..."
                : isImportMode
                  ? "Save Imported Universe"
                  : isEditing
                    ? "Save Universe"
                    : "Create Universe"}
            </Button>
            <Link
              to={existingUniverse ? `/universes/${existingUniverse.id}` : "/universes"}
              className={buttonClasses({ variant: "ghost" })}
            >
              Cancel
            </Link>
          </div>
        </form>
      </Panel>
    </div>
  );
}
