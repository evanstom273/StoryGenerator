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
  genreTheme: "",
  tone: "",
  eraTechLevel: "",
  powerSystemRules: "",
  coreConflict: "",
  everydayLifeVibe: "",
  canonGuardrails: "",
  playerBoundaries: "",
  ratingContentNotes: "",
  lorePrimer: "",
  keyFactions: "",
  keyLocations: "",
  characterArchetypes: "",
  notes: "",
};

export function UniverseFormPage() {
  const { universeId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    createUniverse,
    generateUniverseDraft,
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

    setFormState({
      name: existingUniverse.name,
      description: existingUniverse.description,
      wikiUrl: existingUniverse.wikiUrl,
      genreTheme: existingUniverse.genreTheme ?? "",
      tone: existingUniverse.tone ?? "",
      eraTechLevel: existingUniverse.eraTechLevel ?? "",
      powerSystemRules: existingUniverse.powerSystemRules ?? "",
      coreConflict: existingUniverse.coreConflict ?? "",
      everydayLifeVibe: existingUniverse.everydayLifeVibe ?? "",
      canonGuardrails: existingUniverse.canonGuardrails ?? "",
      playerBoundaries: existingUniverse.playerBoundaries ?? "",
      ratingContentNotes: existingUniverse.ratingContentNotes ?? "",
      lorePrimer: existingUniverse.lorePrimer ?? existingUniverse.description ?? "",
      keyFactions: existingUniverse.keyFactions ?? "",
      keyLocations: existingUniverse.keyLocations ?? "",
      characterArchetypes: existingUniverse.characterArchetypes ?? "",
      notes: existingUniverse.notes ?? "",
    });
    setPendingUniverseId(null);
  }, [existingUniverse]);

  useDebouncedEffect(
    () => {
      if (!existingUniverse || isSubmitting || isImportMode) {
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
      formState.name,
      formState.description,
      formState.wikiUrl,
      formState.genreTheme,
      formState.tone,
      formState.eraTechLevel,
      formState.powerSystemRules,
      formState.coreConflict,
      formState.everydayLifeVibe,
      formState.canonGuardrails,
      formState.playerBoundaries,
      formState.ratingContentNotes,
      formState.lorePrimer,
      formState.keyFactions,
      formState.keyLocations,
      formState.characterArchetypes,
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

    if (!formState.name.trim()) {
      setErrorMessage("Universe name is required.");
      return;
    }

    if (isImportMode && !formState.wikiUrl.trim()) {
      setErrorMessage("Wiki URL is required to import lore.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (existingUniverse) {
        const savedUniverse = await updateUniverse(existingUniverse.id, formState);

        if (savedUniverse) {
          navigate(`/universes/${savedUniverse.id}`);
        }
      } else {
        const savedUniverse = await createUniverse(formState);

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
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to complete the import.",
      );
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

  function resolveFieldHint(value: string, baseHint?: string) {
    const locked = value.trim() ? "🔒" : "";
    if (!baseHint) {
      return locked || undefined;
    }
    return locked ? `${baseHint} ${locked}` : baseHint;
  }

  async function handleRandomise() {
    setIsGenerating(true);
    setGeneratorError(null);

    try {
      const patch = await generateUniverseDraft(
        existingUniverse?.id,
        [
          "name",
          "genreTheme",
          "tone",
          "eraTechLevel",
          "powerSystemRules",
          "coreConflict",
          "everydayLifeVibe",
          "canonGuardrails",
          "playerBoundaries",
          "ratingContentNotes",
          "lorePrimer",
          "keyFactions",
          "keyLocations",
          "characterArchetypes",
          "notes",
        ],
        formState,
      );
      setFormState((current) => ({ ...current, ...patch }));
    } catch (error) {
      setGeneratorError(
        error instanceof Error ? error.message : "Unable to generate universe fields.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleFillWithAi() {
    const candidateFields: Array<keyof UniverseDraft> = [
      "genreTheme",
      "tone",
      "eraTechLevel",
      "powerSystemRules",
      "coreConflict",
      "everydayLifeVibe",
      "canonGuardrails",
      "playerBoundaries",
      "ratingContentNotes",
      "lorePrimer",
      "keyFactions",
      "keyLocations",
      "characterArchetypes",
      "notes",
    ];

    const fields = candidateFields.filter((field) => !((formState as any)[field] ?? "").trim());
    if (!fields.length) {
      setGeneratorError("No empty fields to fill.");
      return;
    }

    setIsGenerating(true);
    setGeneratorError(null);

    try {
      const patch = await generateUniverseDraft(existingUniverse?.id, fields, formState);
      setFormState((current) => ({ ...current, ...patch }));
    } catch (error) {
      setGeneratorError(
        error instanceof Error ? error.message : "Unable to generate universe fields.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  function handleClear() {
    setGeneratorError(null);
    setFormState((current) => ({
      ...initialFormState,
      name: current.name,
      wikiUrl: current.wikiUrl,
    }));
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Universes"
        title={pageTitle}
        description={
          isImportMode
            ? "Create a universe from a wiki URL and store clean lore text for AI context."
            : "Create the world that player characters and story campaigns will belong to."
        }
      />

      <Panel padding="lg">
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              className="justify-start"
              onClick={() => void handleRandomise()}
              disabled={isSubmitting || isGenerating}
            >
              <SparklesIcon className="h-4 w-4" />
              {isGenerating ? "Generating..." : "Randomise"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="justify-start"
              onClick={() => void handleFillWithAi()}
              disabled={isSubmitting || isGenerating}
            >
              <SparklesIcon className="h-4 w-4" />
              Fill with AI
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="justify-start"
              onClick={handleClear}
              disabled={isSubmitting || isGenerating}
            >
              Clear
            </Button>
          </div>

          <Field label="Name" hint={resolveFieldHint(formState.name, "Required")}>
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

          <Field label="Genre / Theme" hint={resolveFieldHint(formState.genreTheme ?? "")}>
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

          <Field label="Tone" hint={resolveFieldHint(formState.tone ?? "")}>
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

          <Field label="Era / Tech Level" hint={resolveFieldHint(formState.eraTechLevel ?? "")}>
            <TextInput
              value={formState.eraTechLevel ?? ""}
              onChange={(event) =>
                setFormState((currentState) => ({
                  ...currentState,
                  eraTechLevel: event.target.value,
                }))
              }
              placeholder="Late-stage colony era; scarce FTL; dangerous ruins"
            />
          </Field>

          <Field label="Power System Rules" hint={resolveFieldHint(formState.powerSystemRules ?? "")}>
            <TextAreaInput
              value={formState.powerSystemRules ?? ""}
              onChange={(event) =>
                setFormState((currentState) => ({
                  ...currentState,
                  powerSystemRules: event.target.value,
                }))
              }
              placeholder="How tech, magic, psionics, or special abilities work (and what they cannot do)."
            />
          </Field>

          <Field label="Core Conflict" hint={resolveFieldHint(formState.coreConflict ?? "")}>
            <TextAreaInput
              value={formState.coreConflict ?? ""}
              onChange={(event) =>
                setFormState((currentState) => ({
                  ...currentState,
                  coreConflict: event.target.value,
                }))
              }
              placeholder="What is the big pressure driving stories in this universe?"
            />
          </Field>

          <Field label="Everyday Life Vibe" hint={resolveFieldHint(formState.everydayLifeVibe ?? "")}>
            <TextAreaInput
              value={formState.everydayLifeVibe ?? ""}
              onChange={(event) =>
                setFormState((currentState) => ({
                  ...currentState,
                  everydayLifeVibe: event.target.value,
                }))
              }
              placeholder="What does a normal day feel like for an average person here?"
            />
          </Field>

          <Field label="Canon Guardrails" hint={resolveFieldHint(formState.canonGuardrails ?? "")}>
            <TextAreaInput
              value={formState.canonGuardrails ?? ""}
              onChange={(event) =>
                setFormState((currentState) => ({
                  ...currentState,
                  canonGuardrails: event.target.value,
                }))
              }
              placeholder="What must never be contradicted? What are the non-negotiables?"
            />
          </Field>

          <Field label="Player Boundaries" hint={resolveFieldHint(formState.playerBoundaries ?? "")}>
            <TextAreaInput
              value={formState.playerBoundaries ?? ""}
              onChange={(event) =>
                setFormState((currentState) => ({
                  ...currentState,
                  playerBoundaries: event.target.value,
                }))
              }
              placeholder="Limits on what the player character can/cannot do; consent lines/veils; narrative boundaries."
            />
          </Field>

          <Field
            label="Rating / Content Notes"
            hint={resolveFieldHint(formState.ratingContentNotes ?? "")}
          >
            <TextAreaInput
              value={formState.ratingContentNotes ?? ""}
              onChange={(event) =>
                setFormState((currentState) => ({
                  ...currentState,
                  ratingContentNotes: event.target.value,
                }))
              }
              placeholder="Violence level, horror elements, romance intensity, etc."
            />
          </Field>

          <Field label="Lore Primer" hint={resolveFieldHint(formState.lorePrimer ?? "")}>
            <TextAreaInput
              value={formState.lorePrimer ?? ""}
              onChange={(event) =>
                setFormState((currentState) => ({
                  ...currentState,
                  lorePrimer: event.target.value,
                  description: event.target.value,
                }))
              }
              placeholder="The short canonical primer the AI should treat as the setting's core truth."
            />
          </Field>

          <Field label="Key Factions" hint={resolveFieldHint(formState.keyFactions ?? "")}>
            <TextAreaInput
              value={formState.keyFactions ?? ""}
              onChange={(event) =>
                setFormState((currentState) => ({
                  ...currentState,
                  keyFactions: event.target.value,
                }))
              }
              placeholder="Major powers, factions, megacorps, cults, governments..."
            />
          </Field>

          <Field label="Key Locations" hint={resolveFieldHint(formState.keyLocations ?? "")}>
            <TextAreaInput
              value={formState.keyLocations ?? ""}
              onChange={(event) =>
                setFormState((currentState) => ({
                  ...currentState,
                  keyLocations: event.target.value,
                }))
              }
              placeholder="Important places: stations, cities, ruins, regions, planets..."
            />
          </Field>

          <Field label="Character Archetypes" hint={resolveFieldHint(formState.characterArchetypes ?? "")}>
            <TextAreaInput
              value={formState.characterArchetypes ?? ""}
              onChange={(event) =>
                setFormState((currentState) => ({
                  ...currentState,
                  characterArchetypes: event.target.value,
                }))
              }
              placeholder="Recurring archetypes that fit this setting: scavenger, corp fixer, relic diver..."
            />
          </Field>

          <Field label="Notes" hint={resolveFieldHint(formState.notes ?? "")}>
            <TextAreaInput
              value={formState.notes ?? ""}
              onChange={(event) =>
                setFormState((currentState) => ({
                  ...currentState,
                  notes: event.target.value,
                }))
              }
              placeholder="Anything else you want to capture."
            />
          </Field>

          <Panel padding="sm" className="border-dashed border-white/12 bg-white/[0.03]">
            <div className="text-sm font-semibold text-ink">Imported Lore</div>
            <div className="mt-2 text-sm leading-7 text-ink-muted">
              Imported lore is stored separately from these curated fields. Use a wiki URL to
              import clean lore text for AI context.
            </div>
            <div className="mt-4 space-y-4">
              <Field label="Wiki URL" hint={isImportMode ? "Required" : undefined}>
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
            </div>
          </Panel>

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
