import { useEffect, useMemo, useState } from "react";
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

const initialFormState: UniverseDraft = {
  name: "",
  description: "",
  wikiUrl: "",
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
    const description = existingUniverse.description ?? existingUniverse.concept ?? "";

    setFormState({
      name: existingUniverse.name,
      description,
      wikiUrl: existingUniverse.wikiUrl ?? "",
      mode,
      concept: description,
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

    if (!formState.name.trim()) {
      setErrorMessage("Universe name is required.");
      return;
    }

    if (effectiveMode === "custom" && !formState.description.trim()) {
      setErrorMessage(
        "Universe description is required for custom universes (include power rules and core conflicts).",
      );
      return;
    }

    if (isImportMode && !formState.wikiUrl.trim()) {
      setErrorMessage("Wiki URL is required to import lore.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const description = formState.description.trim();
      const draft: UniverseDraft = {
        ...formState,
        mode: effectiveMode,
        concept: description || undefined,
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

        const imported = await importUniverseLore(formState.wikiUrl);

        await saveUniverseImport({
          universeId: savedUniverse.id,
          sourceUrl: formState.wikiUrl.trim(),
          title: imported.title,
          importedText: imported.importedText,
          importedAt: new Date().toISOString(),
        });

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
      const imported = await importUniverseLore(formState.wikiUrl);

      await saveUniverseImport({
        universeId: pendingUniverseId,
        sourceUrl: formState.wikiUrl.trim(),
        title: imported.title,
        importedText: imported.importedText,
        importedAt: new Date().toISOString(),
      });

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

    const description = formState.description.trim();
    if (!description) {
      setGeneratorError(
        "Universe description is required (include power rules and core conflicts).",
      );
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
      const blueprint = await generateUniverseBlueprint({
        name: formState.name.trim() || "Untitled Universe",
        concept: description,
        genreTheme: (formState.genreTheme ?? "").trim() || undefined,
        tone: (formState.tone ?? "").trim() || undefined,
        existingBlueprint: existingBlueprint || undefined,
      });

      setFormState((current) => ({
        ...current,
        universeBlueprint: blueprint,
        concept: description,
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
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={effectiveMode === "referenced" ? "secondary" : "ghost"}
                onClick={() =>
                  setFormState((current) => ({
                    ...current,
                    mode: "referenced",
                  }))
                }
                disabled={isSubmitting || isGenerating}
              >
                Referenced
              </Button>
              <Button
                type="button"
                size="sm"
                variant={effectiveMode === "custom" ? "secondary" : "ghost"}
                onClick={() =>
                  setFormState((current) => ({
                    ...current,
                    mode: "custom",
                  }))
                }
                disabled={isSubmitting || isGenerating}
              >
                Custom
              </Button>
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

          <Field
            label="Description"
            hint={effectiveMode === "custom" ? "Required" : "Optional"}
          >
            <TextAreaInput
              value={formState.description}
              onChange={(event) =>
                setFormState((currentState) => ({
                  ...currentState,
                  description: event.target.value,
                  concept: event.target.value,
                }))
              }
              placeholder="Describe the setting in player-facing terms. Include power rules (what can/can't happen) and the core conflicts (what keeps things tense)."
            />
          </Field>

          {effectiveMode === "referenced" ? (
            <>
              <Field label="Wiki / Reference URL" hint={isImportMode ? "Required" : undefined}>
                <TextInput
                  value={formState.wikiUrl}
                  onChange={(event) =>
                    setFormState((currentState) => ({
                      ...currentState,
                      wikiUrl: event.target.value,
                    }))
                  }
                  placeholder="https://example-wiki-page"
                />
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
            <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
              {errorMessage}
            </div>
          ) : null}

          {generatorError ? (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
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
