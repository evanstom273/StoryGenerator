import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { Field, SelectInput, TextAreaInput, TextInput } from "../components/forms/Fields";
import { Button, buttonClasses } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { formatDate } from "../lib/dates";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";
import type { DeveloperBugDraft, DeveloperBugStatus } from "../types/models";

const statusOptions: DeveloperBugStatus[] = ["open", "in-progress", "resolved", "closed"];

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

const blankDraft: DeveloperBugDraft = {
  id: "",
  title: "",
  status: "open",
  description: "",
  reproductionSteps: "",
  expectedBehaviour: "",
  actualBehaviour: "",
  notes: "",
};

export function DeveloperBugFormPage() {
  const { bugId } = useParams();
  const navigate = useNavigate();
  const {
    developerBugs,
    getDeveloperBugById,
    createDeveloperBug,
    updateDeveloperBug,
  } = useStoryEngine();
  const existingBug = bugId ? getDeveloperBugById(bugId) : undefined;
  const isEditing = Boolean(existingBug);

  const suggestedId = useMemo(
    () => suggestNextId(developerBugs.map((bug) => bug.id), "BUG"),
    [developerBugs],
  );

  const [formState, setFormState] = useState<DeveloperBugDraft>(() => ({
    ...blankDraft,
    id: suggestedId,
  }));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (existingBug) {
      setFormState({
        id: existingBug.id,
        title: existingBug.title,
        status: existingBug.status,
        description: existingBug.description,
        reproductionSteps: existingBug.reproductionSteps,
        expectedBehaviour: existingBug.expectedBehaviour,
        actualBehaviour: existingBug.actualBehaviour,
        notes: existingBug.notes,
      });
      return;
    }

    setFormState((current) => ({
      ...current,
      id: current.id?.trim() ? current.id : suggestedId,
    }));
  }, [existingBug, suggestedId]);

  if (bugId && !existingBug) {
    return (
      <div className="space-y-8">
        <PageHeader
          eyebrow="Developer Notes"
          title="This bug could not be found"
          description="Return to the bug list and choose another entry."
        />
        <EmptyState
          title="Missing bug entry"
          description="The requested bug ID is not available in local storage."
          action={
            <Link to="/developer-notes/bugs" className={buttonClasses()}>
              Back to Bugs
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
      setErrorMessage("Bug ID is required.");
      return;
    }

    if (!trimmedTitle) {
      setErrorMessage("Title is required.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (existingBug) {
        await updateDeveloperBug(existingBug.id, formState);
      } else {
        await createDeveloperBug(formState);
      }
      navigate("/developer-notes/bugs");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to save this bug entry.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Developer Notes"
        title={isEditing ? "Edit Bug" : "Create Bug"}
        description="Capture enough detail to reproduce and verify the fix."
        actions={
          <div className="flex flex-wrap gap-3">
            <Link to="/developer-notes/bugs" className={buttonClasses({ variant: "secondary" })}>
              Back to Bugs
            </Link>
            <Button type="submit" form="developer-bug-form" disabled={isSubmitting}>
              Save
            </Button>
          </div>
        }
      />

      <Panel padding="lg">
        <form id="developer-bug-form" className="space-y-6" onSubmit={handleSubmit}>
          {existingBug ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-ink-muted">
              Reported {formatDate(existingBug.reportedAt)}
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
              placeholder="BUG-001"
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
              placeholder="Story import creates duplicate universe"
            />
          </Field>

          <Field label="Status">
            <SelectInput
              value={formState.status}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  status: event.target.value as DeveloperBugStatus,
                }))
              }
            >
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </SelectInput>
          </Field>

          <Field label="Description">
            <TextAreaInput
              value={formState.description}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              placeholder="Describe what you found and the context where it occurs."
            />
          </Field>

          <Field label="Reproduction Steps">
            <TextAreaInput
              value={formState.reproductionSteps}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  reproductionSteps: event.target.value,
                }))
              }
              placeholder="1. ...\n2. ...\n3. ..."
            />
          </Field>

          <Field label="Expected Behaviour">
            <TextAreaInput
              value={formState.expectedBehaviour}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  expectedBehaviour: event.target.value,
                }))
              }
              placeholder="What should happen?"
            />
          </Field>

          <Field label="Actual Behaviour">
            <TextAreaInput
              value={formState.actualBehaviour}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  actualBehaviour: event.target.value,
                }))
              }
              placeholder="What actually happened?"
            />
          </Field>

          <Field label="Notes">
            <TextAreaInput
              value={formState.notes}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              placeholder="Extra context, hypotheses, or links to related issues."
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
              to="/developer-notes/bugs"
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

