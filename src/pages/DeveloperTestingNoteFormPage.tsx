import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { Field, TextAreaInput, TextInput } from "../components/forms/Fields";
import { Button, buttonClasses } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { formatDate } from "../lib/dates";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";
import type { DeveloperTestingNoteDraft } from "../types/models";

function suggestNextId(existingIds: string[], prefix: string) {
  const numbers = existingIds
    .map((id) => {
      const match = new RegExp(`^${prefix}-(\\d+)$`, "i").exec(id.trim());
      if (!match) return null;
      const value = Number(match[1]);
      return Number.isFinite(value) ? value : null;
    })
    .filter((value): value is number => value !== null);

  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `${prefix}-${String(next).padStart(3, "0")}`;
}

const blankDraft: DeveloperTestingNoteDraft = {
  id: "",
  title: "",
  content: "",
};

export function DeveloperTestingNoteFormPage() {
  const { noteId } = useParams();
  const navigate = useNavigate();
  const {
    developerTestingNotes,
    getDeveloperTestingNoteById,
    createDeveloperTestingNote,
    updateDeveloperTestingNote,
  } = useStoryEngine();
  const existingNote = noteId ? getDeveloperTestingNoteById(noteId) : undefined;
  const isEditing = Boolean(existingNote);

  const suggestedId = useMemo(
    () => suggestNextId(developerTestingNotes.map((note) => note.id), "TEST"),
    [developerTestingNotes],
  );

  const [formState, setFormState] = useState<DeveloperTestingNoteDraft>(() => ({
    ...blankDraft,
    id: suggestedId,
  }));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (existingNote) {
      setFormState({
        id: existingNote.id,
        title: existingNote.title,
        content: existingNote.content,
      });
      return;
    }

    setFormState((current) => ({
      ...current,
      id: current.id?.trim() ? current.id : suggestedId,
    }));
  }, [existingNote, suggestedId]);

  if (noteId && !existingNote) {
    return (
      <div className="space-y-8">
        <PageHeader
          eyebrow="Developer Notes"
          title="This testing note could not be found"
          description="Return to the testing notes list and choose another entry."
        />
        <EmptyState
          title="Missing testing note"
          description="The requested testing note ID is not available in local storage."
          action={
            <Link to="/developer-notes/testing" className={buttonClasses()}>
              Back to Testing Notes
            </Link>
          }
        />
      </div>
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedId = formState.id.trim();
    const trimmedTitle = formState.title.trim();

    if (!trimmedId) {
      setErrorMessage("Note ID is required.");
      return;
    }

    if (!trimmedTitle) {
      setErrorMessage("Title is required.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (existingNote) {
        await updateDeveloperTestingNote(existingNote.id, formState);
      } else {
        await createDeveloperTestingNote(formState);
      }
      navigate("/developer-notes/testing");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to save this testing note.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Developer Notes"
        title={isEditing ? "Edit Testing Note" : "Create Testing Note"}
        description="Record discoveries and experiments during testing."
        actions={
          <div className="flex flex-wrap gap-3">
            <Link
              to="/developer-notes/testing"
              className={buttonClasses({ variant: "secondary" })}
            >
              Back to Testing Notes
            </Link>
            <Button type="submit" form="developer-testing-note-form" disabled={isSubmitting}>
              Save
            </Button>
          </div>
        }
      />

      <Panel variant="flat" padding="lg">
        <form
          id="developer-testing-note-form"
          className="space-y-6"
          onSubmit={handleSubmit}
        >
          {existingNote ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-ink-muted">
              Created {formatDate(existingNote.createdAt)}
            </div>
          ) : null}

          <Field label="ID" hint="Required">
            <TextInput
              value={formState.id}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  id: event.target.value,
                }))
              }
              placeholder="TEST-001"
            />
          </Field>

          <Field label="Title" hint="Required">
            <TextInput
              value={formState.title}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              placeholder="Regression testing - story import"
            />
          </Field>

          <Field label="Notes">
            <TextAreaInput
              value={formState.content}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  content: event.target.value,
                }))
              }
              placeholder="Record observations, test steps, and outcomes."
            />
          </Field>

          {errorMessage ? (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
              {errorMessage}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={isSubmitting}>
              Save
            </Button>
            <Link
              to="/developer-notes/testing"
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

