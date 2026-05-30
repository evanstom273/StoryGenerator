import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { Field, SelectInput, TextAreaInput, TextInput } from "../components/forms/Fields";
import { Button, buttonClasses } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";
import type { PlayerCharacterDraft } from "../types/models";

const initialFormState: PlayerCharacterDraft = {
  name: "",
  age: "",
  appearance: "",
  personality: "",
  background: "",
  goals: "",
  notes: "",
  universeId: "",
};

export function PlayerCharacterFormPage() {
  const { characterId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    createPlayerCharacter,
    getPlayerCharacterById,
    updatePlayerCharacter,
    universes,
  } = useStoryEngine();
  const existingCharacter = characterId ? getPlayerCharacterById(characterId) : undefined;
  const isEditing = Boolean(existingCharacter);
  const [formState, setFormState] = useState<PlayerCharacterDraft>(() => ({
    ...initialFormState,
    universeId: searchParams.get("universeId") ?? "",
  }));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!existingCharacter) {
      return;
    }

    setFormState({
      name: existingCharacter.name,
      age: existingCharacter.age,
      appearance: existingCharacter.appearance,
      personality: existingCharacter.personality,
      background: existingCharacter.background,
      goals: existingCharacter.goals,
      notes: existingCharacter.notes,
      universeId: existingCharacter.universeId,
    });
  }, [existingCharacter]);

  const pageTitle = useMemo(
    () => (isEditing ? "Edit Player Character" : "Create Player Character"),
    [isEditing],
  );

  if (!universes.length) {
    return (
      <div className="space-y-8">
        <PageHeader
          eyebrow="Player Characters"
          title="Create the user’s original character"
          description="Player characters belong to a universe, so create that universe first."
        />
        <EmptyState
          title="You need a universe first"
          description="Create or import a universe before adding the player character who will live there."
          action={
            <Link to="/universes/new" className={buttonClasses()}>
              Create Universe
            </Link>
          }
        />
      </div>
    );
  }

  if (characterId && !existingCharacter) {
    return (
      <div className="space-y-8">
        <PageHeader
          eyebrow="Player Characters"
          title="This player character could not be found"
          description="Return to the player character list and open another entry."
        />
        <EmptyState
          title="Missing player character"
          description="The requested player character is not available in local storage."
          action={
            <Link to="/player-characters" className={buttonClasses()}>
              Back to Player Characters
            </Link>
          }
        />
      </div>
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!formState.name.trim()) {
      setErrorMessage("Player character name is required.");
      return;
    }

    if (!formState.universeId) {
      setErrorMessage("Select the universe this player character belongs to.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (existingCharacter) {
        const savedCharacter = await updatePlayerCharacter(existingCharacter.id, formState);

        if (savedCharacter) {
          navigate(`/player-characters/${savedCharacter.id}`);
        }
      } else {
        const savedCharacter = await createPlayerCharacter(formState);
        navigate(`/player-characters/${savedCharacter.id}`);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to save the player character.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Player Characters"
        title={pageTitle}
        description="The user controls this original character. Canon characters will enter stories dynamically later instead of being selected here."
      />

      <Panel padding="lg">
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="grid gap-6 md:grid-cols-2">
            <Field label="Name" hint="Required">
              <TextInput
                value={formState.name}
                onChange={(event) =>
                  setFormState((currentState) => ({
                    ...currentState,
                    name: event.target.value,
                  }))
                }
                placeholder="Jamie Mercer"
              />
            </Field>

            <Field label="Universe" hint="Required">
              <SelectInput
                value={formState.universeId}
                onChange={(event) =>
                  setFormState((currentState) => ({
                    ...currentState,
                    universeId: event.target.value,
                  }))
                }
              >
                <option value="">Select a universe</option>
                {universes.map((universe) => (
                  <option key={universe.id} value={universe.id}>
                    {universe.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Field label="Age">
              <TextInput
                value={formState.age}
                onChange={(event) =>
                  setFormState((currentState) => ({
                    ...currentState,
                    age: event.target.value,
                  }))
                }
                placeholder="29"
              />
            </Field>

            <Field label="Appearance">
              <TextInput
                value={formState.appearance}
                onChange={(event) =>
                  setFormState((currentState) => ({
                    ...currentState,
                    appearance: event.target.value,
                  }))
                }
                placeholder="Neat, understated, observant"
              />
            </Field>
          </div>

          <Field label="Background">
            <TextAreaInput
              value={formState.background}
              onChange={(event) =>
                setFormState((currentState) => ({
                  ...currentState,
                  background: event.target.value,
                }))
              }
            />
          </Field>

          <Field label="Goals">
            <TextAreaInput
              value={formState.goals}
              onChange={(event) =>
                setFormState((currentState) => ({
                  ...currentState,
                  goals: event.target.value,
                }))
              }
            />
          </Field>

          <Field label="Personality">
            <TextAreaInput
              value={formState.personality}
              onChange={(event) =>
                setFormState((currentState) => ({
                  ...currentState,
                  personality: event.target.value,
                }))
              }
            />
          </Field>

          <Field label="Notes">
            <TextAreaInput
              value={formState.notes}
              onChange={(event) =>
                setFormState((currentState) => ({
                  ...currentState,
                  notes: event.target.value,
                }))
              }
            />
          </Field>

          {errorMessage ? (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
              {errorMessage}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? "Saving..."
                : isEditing
                  ? "Save Player Character"
                  : "Create Player Character"}
            </Button>
            <Link
              to={existingCharacter ? `/player-characters/${existingCharacter.id}` : "/player-characters"}
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

