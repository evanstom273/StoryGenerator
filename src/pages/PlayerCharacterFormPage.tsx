import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { Field, MultiUniversePicker, TextAreaInput, TextInput, AliasesInput } from "../components/forms/Fields";
import { Button, buttonClasses } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { SparklesIcon } from "../components/icons";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";
import type { PlayerCharacterDraft } from "../types/models";
import { parseUniverseIdsParam } from "../lib/universeIds";
import { normalizePlayerCharacterAliases } from "../lib/playerCharacterPrompt";
import { useDebouncedEffect } from "../lib/useDebouncedEffect";

const initialFormState: PlayerCharacterDraft = {
  name: "",
  aliases: [],
  age: "",
  gender: "",
  species: "",
  pronouns: "",
  characterConcept: "",
  appearance: "",
  personality: "",
  background: "",
  notes: "",
  universeId: "",
  universeIds: [],
};

export function PlayerCharacterFormPage() {
  const { characterId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    createPlayerCharacter,
    generatePlayerCharacterDraft,
    getPlayerCharacterById,
    updatePlayerCharacter,
    universes,
  } = useStoryEngine();
  const existingCharacter = characterId ? getPlayerCharacterById(characterId) : undefined;
  const isEditing = Boolean(existingCharacter);
  const [formState, setFormState] = useState<PlayerCharacterDraft>(() => {
    const seededIds = parseUniverseIdsParam(searchParams.get("universeIds"));
    const legacyId = searchParams.get("universeId")?.trim() ?? "";
    const universeIds = seededIds.length ? seededIds : legacyId ? [legacyId] : [];
    return {
      ...initialFormState,
      universeId: universeIds[0] ?? "",
      universeIds,
    };
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatorError, setGeneratorError] = useState<string | null>(null);
  const loadedCharacterIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!existingCharacter) {
      loadedCharacterIdRef.current = null;
      return;
    }

    if (loadedCharacterIdRef.current === existingCharacter.id) {
      return;
    }

    loadedCharacterIdRef.current = existingCharacter.id;

    setFormState({
      name: existingCharacter.name,
      aliases: normalizePlayerCharacterAliases(existingCharacter.aliases),
      age: existingCharacter.age,
      gender: existingCharacter.gender,
      species: existingCharacter.species ?? "",
      pronouns: existingCharacter.pronouns,
      characterConcept: existingCharacter.characterConcept ?? "",
      appearance: existingCharacter.appearance,
      personality: existingCharacter.personality,
      background: existingCharacter.background,
      notes: existingCharacter.notes,
      universeId: existingCharacter.universeId,
      universeIds: existingCharacter.universeIds?.length
        ? existingCharacter.universeIds
        : [existingCharacter.universeId],
    });
  }, [existingCharacter]);

  useDebouncedEffect(
    () => {
      if (!existingCharacter || isSubmitting || isGenerating) {
        return;
      }

      if (!formState.universeIds?.length && !formState.universeId) {
        return;
      }

      void updatePlayerCharacter(existingCharacter.id, formState).catch((error) => {
        setErrorMessage(
          error instanceof Error ? error.message : "Auto-save failed.",
        );
      });
    },
    800,
    [
      existingCharacter?.id,
      formState.name,
      formState.aliases?.join("|"),
      formState.age,
      formState.gender,
      formState.species,
      formState.pronouns,
      formState.characterConcept,
      formState.appearance,
      formState.personality,
      formState.background,
      formState.notes,
      formState.universeId,
      formState.universeIds?.join("|"),
      isSubmitting,
      isGenerating,
    ],
  );

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

    if (!formState.universeIds?.length && !formState.universeId) {
      setErrorMessage("Select at least one universe for this player character.");
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

  async function handleRandomize(fields: Array<keyof PlayerCharacterDraft>) {
    if (!formState.universeId) {
      setGeneratorError("Select a universe before generating a character.");
      return;
    }

    setIsGenerating(true);
    setGeneratorError(null);

    try {
      const patch = await generatePlayerCharacterDraft(formState.universeId, fields, formState);
      setFormState((current) => ({ ...current, ...patch }));
    } catch (error) {
      setGeneratorError(
        error instanceof Error ? error.message : "Unable to generate character fields.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleGenerateCharacterDetails(mode: "overwrite" | "fillEmpty") {
    const candidateFields: Array<keyof PlayerCharacterDraft> = [
      "appearance",
      "personality",
      "background",
      "notes",
    ];

    const fields =
      mode === "fillEmpty"
        ? candidateFields.filter((field) => !((formState as any)[field] ?? "").trim())
        : candidateFields;

    if (!fields.length) {
      setGeneratorError("No fields to generate.");
      return;
    }

    if (!formState.universeId) {
      setGeneratorError("Select a universe before generating a character.");
      return;
    }

    setIsGenerating(true);
    setGeneratorError(null);

    try {
      const patch = await generatePlayerCharacterDraft(formState.universeId, fields, formState);
      setFormState((current) => ({ ...current, ...patch }));
    } catch (error) {
      setGeneratorError(
        error instanceof Error ? error.message : "Unable to generate character fields.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  function resolveFieldHint(value: string, baseHint?: string) {
    const locked = value.trim() ? "🔒" : "";
    if (!baseHint) {
      return locked || undefined;
    }
    return locked ? `${baseHint} ${locked}` : baseHint;
  }

  function renderFieldRandomizeAction(fields: Array<keyof PlayerCharacterDraft>) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => void handleRandomize(fields)}
        disabled={isGenerating || isSubmitting}
      >
        <SparklesIcon className="h-4 w-4" />
        Regenerate
      </Button>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Player Characters"
        title={pageTitle}
        description="The user controls this original character. Canon characters will enter stories dynamically later instead of being selected here."
      />

      <Panel variant="flat" padding="lg">
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="grid gap-6 md:grid-cols-2">
            <Field
              label="Name"
              hint={resolveFieldHint(formState.name, "Required")}
              action={renderFieldRandomizeAction(["name"])}
            >
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

            <Field label="Universes" hint="Select one or more">
              <MultiUniversePicker
                universes={universes}
                selectedIds={formState.universeIds ?? (formState.universeId ? [formState.universeId] : [])}
                onChange={(universeIds) =>
                  setFormState((currentState) => ({
                    ...currentState,
                    universeIds,
                    universeId: universeIds[0] ?? "",
                  }))
                }
              />
            </Field>

            <Field label="Aliases" hint="Alternative names the AI should recognise">
              <AliasesInput
                value={normalizePlayerCharacterAliases(formState.aliases)}
                disabled={isGenerating || isSubmitting}
                onChange={(aliases) =>
                  setFormState((currentState) => ({
                    ...currentState,
                    aliases,
                  }))
                }
              />
            </Field>
          </div>

          <Field
            label="Character Concept"
            hint={resolveFieldHint(formState.characterConcept ?? "")}
          >
            <TextAreaInput
              value={formState.characterConcept ?? ""}
              onChange={(event) =>
                setFormState((currentState) => ({
                  ...currentState,
                  characterConcept: event.target.value,
                }))
              }
              placeholder="A short pitch for the character (vibe, role, core conflict, what makes them fun to play)."
            />
          </Field>

          <div className="grid gap-6 md:grid-cols-2">
            <Field
              label="Age"
              hint={resolveFieldHint(formState.age)}
              action={renderFieldRandomizeAction(["age"])}
            >
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

          </div>

          <Field
            label="Appearance"
            hint={resolveFieldHint(formState.appearance)}
            action={renderFieldRandomizeAction(["appearance"])}
          >
            <TextAreaInput
              defaultHeightPx={260}
              minHeightPx={220}
              maxHeightPx={520}
              value={formState.appearance}
              onChange={(event) =>
                setFormState((currentState) => ({
                  ...currentState,
                  appearance: event.target.value,
                }))
              }
              placeholder="Describe the character's look, body language, clothing, vibe, and any standout visual details."
            />
          </Field>

          <div className="grid gap-6 md:grid-cols-2">
            <Field
              label="Gender"
              hint={resolveFieldHint(formState.gender)}
              action={renderFieldRandomizeAction(["gender"])}
            >
              <TextInput
                value={formState.gender}
                onChange={(event) =>
                  setFormState((currentState) => ({
                    ...currentState,
                    gender: event.target.value,
                  }))
                }
                placeholder="Woman / Man / Non-binary / ..."
              />
            </Field>

            <Field
              label="Species"
              hint={resolveFieldHint(formState.species)}
              action={renderFieldRandomizeAction(["species"])}
            >
              <TextInput
                value={formState.species}
                onChange={(event) =>
                  setFormState((currentState) => ({
                    ...currentState,
                    species: event.target.value,
                  }))
                }
                placeholder="Human, Twi'lek, Khajiit, ..."
              />
            </Field>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Field
              label="Pronouns"
              hint={resolveFieldHint(formState.pronouns)}
              action={renderFieldRandomizeAction(["pronouns"])}
            >
              <TextInput
                value={formState.pronouns}
                onChange={(event) =>
                  setFormState((currentState) => ({
                    ...currentState,
                    pronouns: event.target.value,
                  }))
                }
                placeholder="she/her, he/him, they/them, ..."
              />
            </Field>
          </div>

          <Field
            label="Background"
            hint={resolveFieldHint(formState.background)}
            action={renderFieldRandomizeAction(["background"])}
          >
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

          <Field
            label="Personality"
            hint={resolveFieldHint(formState.personality)}
            action={renderFieldRandomizeAction(["personality"])}
          >
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

          <Field
            label="Notes"
            hint={resolveFieldHint(formState.notes)}
            action={renderFieldRandomizeAction(["notes"])}
          >
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
            <div className="rounded-[8px] border border-rose-400/20 bg-rose-400/10 px-3.5 py-3 text-sm text-rose-200">
              {errorMessage}
            </div>
          ) : null}

          {generatorError ? (
            <div className="rounded-[8px] border border-rose-400/20 bg-rose-400/10 px-3.5 py-3 text-sm text-rose-200">
              {generatorError}
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
            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleGenerateCharacterDetails("overwrite")}
              disabled={isGenerating || isSubmitting}
            >
              {isGenerating ? "Generating..." : "Generate Character Details"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleGenerateCharacterDetails("fillEmpty")}
              disabled={isGenerating || isSubmitting}
            >
              {isGenerating ? "Generating..." : "Regenerate All (Fill Empty)"}
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
