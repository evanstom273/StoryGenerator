import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { Field, TextAreaInput, TextInput } from "../components/forms/Fields";
import { Button, buttonClasses } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";
import type { UniverseDraft } from "../types/models";
import { importUniverseLore } from "../lib/ingestion/importUniverseLore";
import { useDebouncedEffect } from "../lib/useDebouncedEffect";

const initialFormState: UniverseDraft = {
  name: "",
  description: "",
  wikiUrl: "",
};

export function UniverseFormPage() {
  const { universeId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { createUniverse, getUniverseById, saveUniverseImport, updateUniverse } =
    useStoryEngine();
  const existingUniverse = universeId ? getUniverseById(universeId) : undefined;
  const isEditing = Boolean(existingUniverse);
  const isImportMode = location.pathname.endsWith("/import");
  const [formState, setFormState] = useState<UniverseDraft>(initialFormState);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingUniverseId, setPendingUniverseId] = useState<string | null>(null);

  useEffect(() => {
    if (!existingUniverse) {
      return;
    }

    setFormState({
      name: existingUniverse.name,
      description: existingUniverse.description,
      wikiUrl: existingUniverse.wikiUrl,
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
      isSubmitting,
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
          <Field label="Universe Name" hint="Required">
            <TextInput
              value={formState.name}
              onChange={(event) =>
                setFormState((currentState) => ({
                  ...currentState,
                  name: event.target.value,
                }))
              }
              placeholder="Brooklyn Nine-Nine"
            />
          </Field>

          <Field label="Wiki URL">
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

          <Field label="Description">
            <TextAreaInput
              value={formState.description}
              onChange={(event) =>
                setFormState((currentState) => ({
                  ...currentState,
                  description: event.target.value,
                }))
              }
              placeholder="Describe the world, tone, and story potential."
            />
          </Field>

          {errorMessage ? (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
              {errorMessage}
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
