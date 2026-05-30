import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { Field, SelectInput, TextAreaInput, TextInput } from "../components/forms/Fields";
import { SparklesIcon } from "../components/icons";
import { Button, buttonClasses } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";
import {
  generateStoryPremise,
  suggestStoryTitle,
} from "../lib/storyPremises";

type StoryStartMode = "custom" | "generated";

const initialFormState = {
  title: "",
  universeId: "",
  playerCharacterId: "",
  openingPrompt: "",
  currentSummary: "",
};

export function StoryCreatePage() {
  const navigate = useNavigate();
  const {
    createStory,
    universes,
    getPlayerCharactersForUniverse,
    getPlayerCharacterById,
    getUniverseById,
  } = useStoryEngine();
  const [formState, setFormState] = useState(initialFormState);
  const [storyStartMode, setStoryStartMode] = useState<StoryStartMode>("custom");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedUniverse = getUniverseById(formState.universeId);
  const availableCharacters = useMemo(
    () =>
      formState.universeId
        ? getPlayerCharactersForUniverse(formState.universeId)
        : [],
    [formState.universeId, getPlayerCharactersForUniverse],
  );
  const selectedPlayerCharacter = getPlayerCharacterById(formState.playerCharacterId);

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

    if (!formState.playerCharacterId) {
      setErrorMessage("Select the player character the user will play.");
      return;
    }

    if (!formState.title.trim()) {
      setErrorMessage("Enter a story title.");
      return;
    }

    if (!formState.openingPrompt.trim()) {
      setErrorMessage("Write or generate an opening prompt.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const story = await createStory({
        ...formState,
        currentSummary: formState.currentSummary.trim(),
      });

      navigate(`/stories/${story.id}`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to create the story.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleGeneratePremise() {
    if (!selectedUniverse || !selectedPlayerCharacter) {
      setErrorMessage(
        "Select both a universe and a player character before generating a premise.",
      );
      return;
    }

    const openingPrompt = generateStoryPremise(
      selectedUniverse.name,
      selectedPlayerCharacter.name,
    );

    setStoryStartMode("generated");
    setErrorMessage(null);
    setFormState((currentState) => ({
      ...currentState,
      title:
        currentState.title.trim() ||
        suggestStoryTitle(selectedUniverse.name, selectedPlayerCharacter.name),
      openingPrompt,
    }));
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Create Story"
        title="Build a campaign from universe to opening scene"
        description="Start by choosing the fictional universe, then the player character the user controls, then the opening scenario that puts the story in motion."
      />

      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["Step 1", "Select Universe"],
          ["Step 2", "Select Player Character"],
          ["Step 3", "Choose Story Start"],
        ].map(([step, title]) => (
          <Panel key={step}>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
              {step}
            </div>
            <div className="mt-3 text-lg font-semibold text-ink">{title}</div>
          </Panel>
        ))}
      </div>

      <Panel padding="lg">
        <form className="space-y-8" onSubmit={handleSubmit}>
          <div className="grid gap-6 lg:grid-cols-2">
            <Field label="Universe" hint="Required">
              <SelectInput
                value={formState.universeId}
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

            <Field label="Player Character" hint="Required">
              <SelectInput
                value={formState.playerCharacterId}
                onChange={(event) =>
                  setFormState((currentState) => ({
                    ...currentState,
                    playerCharacterId: event.target.value,
                  }))
                }
                disabled={!formState.universeId || !availableCharacters.length}
              >
                <option value="">
                  {formState.universeId
                    ? availableCharacters.length
                      ? "Select a player character"
                      : "No player characters in this universe yet"
                    : "Select a universe first"}
                </option>
                {availableCharacters.map((character) => (
                  <option key={character.id} value={character.id}>
                    {character.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>

          {formState.universeId && !availableCharacters.length ? (
            <Panel className="border-dashed border-white/12 bg-white/[0.03]">
              <h2 className="text-lg font-semibold text-ink">
                This universe needs a player character
              </h2>
              <p className="mt-2 text-sm leading-7 text-ink-muted">
                Create the original character the user will play, then return to
                finish this story setup.
              </p>
              <Link
                to={`/player-characters/new?universeId=${formState.universeId}`}
                className={buttonClasses({ className: "mt-5" })}
              >
                Create Player Character
              </Link>
            </Panel>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
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
                  placeholder="Example: Brooklyn Nine-Nine: Jamie Mercer"
                />
              </Field>

              <Field label="Opening Prompt" hint="Required">
                <TextAreaInput
                  value={formState.openingPrompt}
                  onChange={(event) =>
                    setFormState((currentState) => ({
                      ...currentState,
                      openingPrompt: event.target.value,
                    }))
                  }
                  placeholder="Write the scenario that starts the story."
                />
              </Field>

              <Field label="Current Summary" hint="Optional">
                <TextAreaInput
                  value={formState.currentSummary}
                  onChange={(event) =>
                    setFormState((currentState) => ({
                      ...currentState,
                      currentSummary: event.target.value,
                    }))
                  }
                  placeholder="Leave blank for now or add a short story overview."
                />
              </Field>
            </div>

            <Panel className="h-fit">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                Story start
              </div>
              <div className="mt-4 space-y-3">
                <Button
                  variant={storyStartMode === "custom" ? "primary" : "secondary"}
                  className="w-full justify-start rounded-2xl"
                  onClick={() => setStoryStartMode("custom")}
                >
                  Write your own prompt
                </Button>
                <Button
                  variant={
                    storyStartMode === "generated" ? "primary" : "secondary"
                  }
                  className="w-full justify-start rounded-2xl"
                  onClick={handleGeneratePremise}
                >
                  <SparklesIcon className="h-4 w-4" />
                  Generate Story Premise
                </Button>
              </div>
              <p className="mt-4 text-sm leading-7 text-ink-muted">
                Premise generation is fully local in Step 2. It fills the opening
                prompt field without calling any AI provider.
              </p>
            </Panel>
          </div>

          {errorMessage ? (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
              {errorMessage}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting ? "Creating Story..." : "Create Story"}
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

