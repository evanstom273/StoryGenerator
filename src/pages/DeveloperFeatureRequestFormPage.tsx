import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { Field, SelectInput, TextAreaInput, TextInput } from "../components/forms/Fields";
import { Button, buttonClasses } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { formatDate } from "../lib/dates";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";
import type {
  DeveloperFeaturePriority,
  DeveloperFeatureRequestDraft,
} from "../types/models";

const priorityOptions: DeveloperFeaturePriority[] = ["low", "medium", "high"];

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

const blankDraft: DeveloperFeatureRequestDraft = {
  id: "",
  title: "",
  priority: "medium",
  description: "",
  notes: "",
};

export function DeveloperFeatureRequestFormPage() {
  const { featureId } = useParams();
  const navigate = useNavigate();
  const {
    developerFeatureRequests,
    getDeveloperFeatureRequestById,
    createDeveloperFeatureRequest,
    updateDeveloperFeatureRequest,
  } = useStoryEngine();
  const existingFeature = featureId ? getDeveloperFeatureRequestById(featureId) : undefined;
  const isEditing = Boolean(existingFeature);

  const suggestedId = useMemo(
    () =>
      suggestNextId(developerFeatureRequests.map((feature) => feature.id), "FEATURE"),
    [developerFeatureRequests],
  );

  const [formState, setFormState] = useState<DeveloperFeatureRequestDraft>(() => ({
    ...blankDraft,
    id: suggestedId,
  }));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (existingFeature) {
      setFormState({
        id: existingFeature.id,
        title: existingFeature.title,
        priority: existingFeature.priority,
        description: existingFeature.description,
        notes: existingFeature.notes,
      });
      return;
    }

    setFormState((current) => ({
      ...current,
      id: current.id?.trim() ? current.id : suggestedId,
    }));
  }, [existingFeature, suggestedId]);

  if (featureId && !existingFeature) {
    return (
      <div className="space-y-8">
        <PageHeader
          eyebrow="Developer Notes"
          title="This feature request could not be found"
          description="Return to the feature request list and choose another entry."
        />
        <EmptyState
          title="Missing feature request"
          description="The requested feature ID is not available in local storage."
          action={
            <Link to="/developer-notes/features" className={buttonClasses()}>
              Back to Features
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
      setErrorMessage("Feature ID is required.");
      return;
    }

    if (!trimmedTitle) {
      setErrorMessage("Title is required.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (existingFeature) {
        await updateDeveloperFeatureRequest(existingFeature.id, formState);
      } else {
        await createDeveloperFeatureRequest(formState);
      }
      navigate("/developer-notes/features");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to save this feature request.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Developer Notes"
        title={isEditing ? "Edit Feature Request" : "Create Feature Request"}
        description="Capture new improvements that do not exist yet."
        actions={
          <div className="flex flex-wrap gap-3">
            <Link
              to="/developer-notes/features"
              className={buttonClasses({ variant: "secondary" })}
            >
              Back to Features
            </Link>
            <Button type="submit" form="developer-feature-form" disabled={isSubmitting}>
              Save
            </Button>
          </div>
        }
      />

      <Panel variant="flat" padding="lg">
        <form id="developer-feature-form" className="space-y-6" onSubmit={handleSubmit}>
          {existingFeature ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-ink-muted">
              Created {formatDate(existingFeature.createdAt)}
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
              placeholder="FEATURE-001"
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
              placeholder="Accessibility settings"
            />
          </Field>

          <Field label="Priority">
            <SelectInput
              value={formState.priority}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  priority: event.target.value as DeveloperFeaturePriority,
                }))
              }
            >
              {priorityOptions.map((option) => (
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
              placeholder="Describe the new functionality you want to add."
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
              placeholder="Potential approaches, UI ideas, or follow-up questions."
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
              to="/developer-notes/features"
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

