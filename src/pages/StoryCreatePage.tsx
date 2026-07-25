import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { Field, SelectInput, TextAreaInput, TextInput } from "../components/forms/Fields";
import { Button, buttonClasses } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";
import type { AIProviderType, PlayerCharacterDraft } from "../types/models";
import { getProviderDefaultModel, getProviderModels } from "../lib/ai/models";

const initialFormState = {
  title: "",
  universeId: "",
  playerCharacterId: "",
  currentSummary: "",
};

const initialQuickCharacterState: PlayerCharacterDraft = {
  name: "",
  age: "",
  gender: "",
  species: "",
  pronouns: "",
  characterConcept: "",
  appearance: "",
  personality: "",
  background: "",
  goals: "",
  notes: "",
  universeId: "",
  scope: "story",
};

export function StoryCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    aiSettings,
    createPlayerCharacter,
    createSequel,
    createStory,
    generatePlayerCharacterDraft,
    getPlayerCharacterById,
    getStoryAIConfig,
    getStoryById,
    getUniverseById,
    universes,
    getPlayerCharactersForUniverse,
    saveStoryAIConfig,
    updatePlayerCharacter,
  } = useStoryEngine();
  const sequelToId = searchParams.get("sequelTo")?.trim() ?? "";
  const [formState, setFormState] = useState(initialFormState);
  const [protagonistMode, setProtagonistMode] = useState<
    "existing" | "newPermanent" | "quick"
  >("existing");
  const [quickCharacterState, setQuickCharacterState] = useState<PlayerCharacterDraft>(
    initialQuickCharacterState,
  );
  const [quickCharacterError, setQuickCharacterError] = useState<string | null>(null);
  const [isQuickGenerating, setIsQuickGenerating] = useState(false);
  const [storyProviderType, setStoryProviderType] = useState(
    aiSettings?.activeProviderType ?? "openai",
  );
  const [storyModel, setStoryModel] = useState(
    aiSettings?.defaultModels?.[aiSettings?.activeProviderType ?? "openai"] ??
      getProviderDefaultModel(aiSettings?.activeProviderType ?? "openai"),
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const sequelSourceStory = sequelToId ? getStoryById(sequelToId) : undefined;
  const sequelSourceUniverse = sequelSourceStory
    ? getUniverseById(sequelSourceStory.universeId)
    : undefined;
  const sequelSourceCharacter = sequelSourceStory
    ? getPlayerCharacterById(sequelSourceStory.playerCharacterId)
    : undefined;
  const isSequelMode = Boolean(
    sequelSourceStory && sequelSourceUniverse && sequelSourceCharacter,
  );

  const availableCharacters = useMemo(
    () =>
      formState.universeId
        ? getPlayerCharactersForUniverse(formState.universeId)
        : [],
    [formState.universeId, getPlayerCharactersForUniverse],
  );

  const selectableCharacters = useMemo(() => {
    if (!isSequelMode || !sequelSourceCharacter) {
      return availableCharacters;
    }

    return availableCharacters.some((character) => character.id === sequelSourceCharacter.id)
      ? availableCharacters
      : [sequelSourceCharacter, ...availableCharacters];
  }, [availableCharacters, isSequelMode, sequelSourceCharacter]);

  useEffect(() => {
    setQuickCharacterState((current) => ({
      ...current,
      universeId: formState.universeId,
      scope: "story",
    }));
  }, [formState.universeId]);

  useEffect(() => {
    if (!isSequelMode || !sequelSourceStory || !sequelSourceUniverse || !sequelSourceCharacter) {
      return;
    }

    setProtagonistMode("existing");
    setFormState((current) => ({
      ...current,
      title: current.title || `${sequelSourceStory.title} II`,
      universeId: sequelSourceUniverse.id,
      playerCharacterId: current.playerCharacterId || sequelSourceCharacter.id,
    }));
  }, [isSequelMode, sequelSourceCharacter, sequelSourceStory, sequelSourceUniverse]);

  useEffect(() => {
    if (!isSequelMode || !sequelSourceStory) {
      return;
    }

    let cancelled = false;
    void getStoryAIConfig(sequelSourceStory.id)
      .then((config) => {
        if (cancelled || !config) {
          return;
        }
        setStoryProviderType(config.providerType);
        setStoryModel(
          config.model?.trim() || getProviderDefaultModel(config.providerType),
        );
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [getStoryAIConfig, isSequelMode, sequelSourceStory]);

  if (!universes.length) {
    return (
      <div className="space-y-8">
        <PageHeader
          eyebrow="Create Story"
          title="Create a story from a universe and a player character"
          description="Stories require a universe first, so start by adding the fictional world you want to play in."
        />
        <EmptyState
          title="You need a universe first"
          description="Create or import a universe, then come back to build a story campaign."
          action={
            <Link to="/universes/new" className={buttonClasses()}>
              Create Universe
            </Link>
          }
        />
      </div>
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!formState.universeId) {
      setErrorMessage("Select a universe before creating the story.");
      return;
    }

    if (!formState.title.trim()) {
      setErrorMessage("Enter a story title.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      let resolvedPlayerCharacterId = formState.playerCharacterId;

      if (protagonistMode === "existing") {
        if (!resolvedPlayerCharacterId) {
          setErrorMessage("Select the player character the user will play.");
          return;
        }
      }

      if (protagonistMode === "newPermanent") {
        setErrorMessage("Create a player character for this universe before creating the story.");
        return;
      }

      if (protagonistMode === "quick") {
        if (!quickCharacterState.name.trim()) {
          setErrorMessage("Enter a quick character name.");
          return;
        }

        const createdCharacter = await createPlayerCharacter({
          ...quickCharacterState,
          universeId: formState.universeId,
          scope: "story",
        });
        resolvedPlayerCharacterId = createdCharacter.id;
      }

      const story = isSequelMode && sequelSourceStory
        ? await createSequel({
            sourceStoryId: sequelSourceStory.id,
            title: formState.title,
            playerCharacterId: resolvedPlayerCharacterId,
            openingNote: formState.currentSummary.trim() || undefined,
          })
        : await createStory({
            ...formState,
            playerCharacterId: resolvedPlayerCharacterId,
            currentSummary: formState.currentSummary.trim(),
          });

      if (!isSequelMode && protagonistMode === "quick") {
        await updatePlayerCharacter(resolvedPlayerCharacterId, {
          ...quickCharacterState,
          universeId: formState.universeId,
          scope: "story",
          storyId: story.id,
        }).catch(() => null);
      }

      await saveStoryAIConfig({
        storyId: story.id,
        providerType: storyProviderType,
        model: storyModel,
      }).catch(() => null);

      navigate(`/stories/${story.id}`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to create the story.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGenerateQuickCharacterDetails(mode: "overwrite" | "fillEmpty") {
    if (!formState.universeId) {
      setQuickCharacterError("Select a universe before generating a character.");
      return;
    }

    const candidateFields: Array<keyof PlayerCharacterDraft> = [
      "appearance",
      "personality",
      "background",
      "goals",
      "notes",
    ];

    const fields =
      mode === "fillEmpty"
        ? candidateFields.filter((field) => !(quickCharacterState[field] ?? "").trim())
        : candidateFields;

    if (!fields.length) {
      setQuickCharacterError("No fields to generate.");
      return;
    }

    setIsQuickGenerating(true);
    setQuickCharacterError(null);

    try {
      const patch = await generatePlayerCharacterDraft(
        formState.universeId,
        fields,
        quickCharacterState,
      );
      setQuickCharacterState((current) => ({ ...current, ...patch }));
    } catch (error) {
      setQuickCharacterError(
        error instanceof Error ? error.message : "Unable to generate character fields.",
      );
    } finally {
      setIsQuickGenerating(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={isSequelMode ? "Create Sequel" : "Create Story"}
        title={
          isSequelMode
            ? "Start a new sequel from an existing story"
            : "Create a story from a universe and a player character"
        }
        description={
          isSequelMode
            ? "The predecessor stays canon and becomes read-only. The sequel starts fresh at message 1 while inheriting distilled story state."
            : "Choose the fictional universe, select the player character, then set a title and optional summary."
        }
      />

      {isSequelMode && sequelSourceStory && sequelSourceUniverse && sequelSourceCharacter ? (
        <Panel variant="flat" className="border-dashed border-white/12 bg-white/[0.03]" padding="lg">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
            Sequel Source
          </div>
          <div className="mt-3 text-lg font-semibold text-ink">{sequelSourceStory.title}</div>
          <p className="mt-2 text-sm leading-7 text-ink-muted">
            Universe: {sequelSourceUniverse.name} · Default protagonist: {sequelSourceCharacter.name}
          </p>
          <p className="mt-3 text-sm leading-7 text-ink-muted">
            This new story inherits the predecessor&apos;s distilled canon state, relationships, and world facts. The old story becomes a locked prequel and the new transcript begins with <span className="font-semibold text-ink-soft">Chapter I.</span>
          </p>
          {sequelSourceStory.currentSummary.trim() ? (
            <div className="mt-4 rounded-[10px] border border-divider/[0.45] bg-app-elevated px-4 py-3 text-sm leading-7 text-ink-soft">
              {sequelSourceStory.currentSummary}
            </div>
          ) : null}
        </Panel>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["Step 1", isSequelMode ? "Confirm Source" : "Select Universe"],
          ["Step 2", "Select Player Character"],
          ["Step 3", isSequelMode ? "Sequel Details" : "Story Details"],
        ].map(([step, title]) => (
          <Panel variant="flat" key={step}>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
              {step}
            </div>
            <div className="mt-3 text-lg font-semibold text-ink">{title}</div>
          </Panel>
        ))}
      </div>

      <Panel variant="flat" padding="lg">
        <form className="space-y-8" onSubmit={handleSubmit}>
          <div className="grid gap-6 lg:grid-cols-2">
            <Field label="Universe" hint="Required">
              <SelectInput
                value={formState.universeId}
                disabled={isSequelMode}
                onChange={(event) =>
                  setFormState((currentState) => ({
                    ...currentState,
                    universeId: event.target.value,
                    playerCharacterId:
                      currentState.universeId === event.target.value
                        ? currentState.playerCharacterId
                        : "",
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

            <Field label="Protagonist" hint="Required">
              {isSequelMode ? (
                <div className="rounded-[10px] border border-divider/[0.45] bg-panel-muted/50 px-4 py-3 text-sm text-ink-muted">
                  The sequel stays in the same universe. You can keep the same protagonist or switch to another character from this universe.
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-3">
                  <Button
                    type="button"
                    variant={protagonistMode === "existing" ? "secondary" : "ghost"}
                    onClick={() => setProtagonistMode("existing")}
                    disabled={!formState.universeId}
                  >
                    Existing
                  </Button>
                  <Button
                    type="button"
                    variant={protagonistMode === "newPermanent" ? "secondary" : "ghost"}
                    onClick={() => setProtagonistMode("newPermanent")}
                    disabled={!formState.universeId}
                  >
                    New
                  </Button>
                  <Button
                    type="button"
                    variant={protagonistMode === "quick" ? "secondary" : "ghost"}
                    onClick={() => setProtagonistMode("quick")}
                    disabled={!formState.universeId}
                  >
                    Quick
                  </Button>
                </div>
              )}
            </Field>
          </div>

          {protagonistMode === "existing" ? (
            <Field label="Player Character" hint="Required">
              <SelectInput
                value={formState.playerCharacterId}
                onChange={(event) =>
                  setFormState((currentState) => ({
                    ...currentState,
                    playerCharacterId: event.target.value,
                  }))
                }
                disabled={!formState.universeId || !selectableCharacters.length}
              >
                <option value="">
                  {formState.universeId
                    ? selectableCharacters.length
                      ? "Select a player character"
                      : "No player characters in this universe yet"
                    : "Select a universe first"}
                </option>
                {selectableCharacters.map((character) => (
                  <option key={character.id} value={character.id}>
                    {character.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
          ) : null}

          {!isSequelMode && protagonistMode === "newPermanent" ? (
            <Panel variant="flat" className="border-dashed border-white/12 bg-white/[0.03]">
              <h2 className="text-lg font-semibold text-ink">Create a permanent player character</h2>
              <p className="mt-2 text-sm leading-7 text-ink-muted">
                This adds the character to your Player Characters library so you can reuse them across stories.
              </p>
              <Link
                to={`/player-characters/new?universeId=${formState.universeId}`}
                className={buttonClasses({ className: "mt-5" })}
              >
                Create Player Character
              </Link>
            </Panel>
          ) : null}

          {!isSequelMode && protagonistMode === "quick" ? (
            <Panel variant="flat" className="border-dashed border-white/12 bg-white/[0.03]" padding="lg">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                Quick Story Character
              </div>
              <div className="mt-4 grid gap-6 md:grid-cols-2">
                <Field label="Name" hint="Required">
                  <TextInput
                    value={quickCharacterState.name}
                    onChange={(event) =>
                      setQuickCharacterState((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Jamie Mercer"
                  />
                </Field>
                <Field label="Pronouns">
                  <TextInput
                    value={quickCharacterState.pronouns}
                    onChange={(event) =>
                      setQuickCharacterState((current) => ({
                        ...current,
                        pronouns: event.target.value,
                      }))
                    }
                    placeholder="she/her, he/him, they/them, ..."
                  />
                </Field>
              </div>

              <div className="mt-6 grid gap-6 md:grid-cols-2">
                <Field label="Age">
                  <TextInput
                    value={quickCharacterState.age}
                    onChange={(event) =>
                      setQuickCharacterState((current) => ({
                        ...current,
                        age: event.target.value,
                      }))
                    }
                    placeholder="29"
                  />
                </Field>
                <Field label="Gender">
                  <TextInput
                    value={quickCharacterState.gender}
                    onChange={(event) =>
                      setQuickCharacterState((current) => ({
                        ...current,
                        gender: event.target.value,
                      }))
                    }
                    placeholder="Woman / Man / Non-binary / ..."
                  />
                </Field>
              </div>

              <div className="mt-6 grid gap-6 md:grid-cols-2">
                <Field label="Species">
                  <TextInput
                    value={quickCharacterState.species}
                    onChange={(event) =>
                      setQuickCharacterState((current) => ({
                        ...current,
                        species: event.target.value,
                      }))
                    }
                    placeholder="Human, Twi'lek, Khajiit, ..."
                  />
                </Field>
                <Field label="Character Concept">
                  <TextAreaInput
                    value={quickCharacterState.characterConcept ?? ""}
                    onChange={(event) =>
                      setQuickCharacterState((current) => ({
                        ...current,
                        characterConcept: event.target.value,
                      }))
                    }
                    placeholder="A short pitch for the character."
                  />
                </Field>
              </div>

              <div className="mt-6 grid gap-6 md:grid-cols-2">
                <Field label="Appearance">
                  <TextAreaInput
                    value={quickCharacterState.appearance}
                    onChange={(event) =>
                      setQuickCharacterState((current) => ({
                        ...current,
                        appearance: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="Personality">
                  <TextAreaInput
                    value={quickCharacterState.personality}
                    onChange={(event) =>
                      setQuickCharacterState((current) => ({
                        ...current,
                        personality: event.target.value,
                      }))
                    }
                  />
                </Field>
              </div>

              <div className="mt-6 grid gap-6 md:grid-cols-2">
                <Field label="Background">
                  <TextAreaInput
                    value={quickCharacterState.background}
                    onChange={(event) =>
                      setQuickCharacterState((current) => ({
                        ...current,
                        background: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="Goals">
                  <TextAreaInput
                    value={quickCharacterState.goals}
                    onChange={(event) =>
                      setQuickCharacterState((current) => ({
                        ...current,
                        goals: event.target.value,
                      }))
                    }
                  />
                </Field>
              </div>

              <div className="mt-6">
                <Field label="Notes">
                  <TextAreaInput
                    value={quickCharacterState.notes}
                    onChange={(event) =>
                      setQuickCharacterState((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                  />
                </Field>
              </div>

              {quickCharacterError ? (
                <div className="mt-6 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
                  {quickCharacterError}
                </div>
              ) : null}

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void handleGenerateQuickCharacterDetails("overwrite")}
                  disabled={isQuickGenerating || isSubmitting}
                >
                  {isQuickGenerating ? "Generating..." : "Generate Character Details"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void handleGenerateQuickCharacterDetails("fillEmpty")}
                  disabled={isQuickGenerating || isSubmitting}
                >
                  {isQuickGenerating ? "Generating..." : "Regenerate All (Fill Empty)"}
                </Button>
              </div>
            </Panel>
          ) : null}

          <Panel variant="flat" className="border-dashed border-white/12 bg-white/[0.03]">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
              AI (per story)
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Field label="Provider Type">
                <SelectInput
                  value={storyProviderType}
                  onChange={(event) => {
                    const nextProvider = event.target.value as AIProviderType;
                    setStoryProviderType(nextProvider);
                    setStoryModel(
                      aiSettings?.defaultModels?.[nextProvider] ??
                        getProviderDefaultModel(nextProvider),
                    );
                  }}
                >
                  <option value="openai">OpenAI</option>
                  <option value="gemini">Gemini</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="anthropic">Anthropic</option>
                </SelectInput>
              </Field>
              <Field label="Model">
                <SelectInput
                  value={storyModel}
                  onChange={(event) => setStoryModel(event.target.value)}
                >
                  {getProviderModels(storyProviderType).map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </div>
            <p className="mt-4 text-sm leading-7 text-ink-muted">
              Configure your API key and default model in Settings. This story can
              pick a provider and model independently.
            </p>
          </Panel>

          {formState.universeId && !selectableCharacters.length && protagonistMode === "existing" && !isSequelMode ? (
            <Panel variant="flat" className="border-dashed border-white/12 bg-white/[0.03]">
              <h2 className="text-lg font-semibold text-ink">
                This universe needs a player character
              </h2>
              <p className="mt-2 text-sm leading-7 text-ink-muted">
                Create the original character the user will play, then return to
                finish this story setup. Or switch to Quick.
              </p>
              <Link
                to={`/player-characters/new?universeId=${formState.universeId}`}
                className={buttonClasses({ className: "mt-5" })}
              >
                Create Player Character
              </Link>
            </Panel>
          ) : null}

          <div className="space-y-6">
            <Field label="Story Title" hint="Required">
              <TextInput
                value={formState.title}
                onChange={(event) =>
                  setFormState((currentState) => ({
                    ...currentState,
                    title: event.target.value,
                  }))
                }
                placeholder={
                  isSequelMode
                    ? "Example: Davies Chronicles II"
                    : "Example: Brooklyn Nine-Nine: Jamie Mercer"
                }
              />
            </Field>

            <Field
              label={isSequelMode ? "Sequel Setup Note" : "Current Summary"}
              hint="Optional"
            >
              <TextAreaInput
                value={formState.currentSummary}
                onChange={(event) =>
                  setFormState((currentState) => ({
                    ...currentState,
                    currentSummary: event.target.value,
                  }))
                }
                placeholder={
                  isSequelMode
                    ? "Optional extra setup to add on top of the inherited canon state."
                    : "Leave blank for now or add a short story overview."
                }
              />
            </Field>
          </div>

          {errorMessage ? (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
              {errorMessage}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting
                ? isSequelMode
                  ? "Creating Sequel..."
                  : "Creating Story..."
                : isSequelMode
                  ? "Create Sequel"
                  : "Create Story"}
            </Button>
            <Link
              to="/stories"
              className={buttonClasses({ variant: "ghost", size: "lg" })}
            >
              Cancel
            </Link>
          </div>
        </form>
      </Panel>
    </div>
  );
}
