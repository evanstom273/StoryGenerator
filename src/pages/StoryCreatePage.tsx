import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { Field, MultiUniversePicker, SelectInput, TextAreaInput, TextInput, AliasesInput, KnownTiesInput } from "../components/forms/Fields";
import { getUniverseIds } from "../lib/universeIds";
import { Button, buttonClasses } from "../components/ui/Button";
import { SparklesIcon } from "../components/icons";
import { Panel } from "../components/ui/Panel";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";
import type {
  AIProviderType,
  PlayerCharacterDraft,
} from "../types/models";
import { getProviderDefaultModel, getProviderModels } from "../lib/ai/models";
import { GuidedChapterPlanModal } from "../components/story/GuidedChapterPlanModal";
import { ImportedCharactersPicker } from "../components/story/ImportedCharactersPicker";
import { resolveUpcomingChapterLabels } from "../lib/guidedChapterGeneration/chapterLabels";
import { normalizeStoryImportedCharacterIds } from "../lib/storyImportedCharacters";
import { normalizePlayerCharacterAliases, normalizePlayerCharacterKnownTies } from "../lib/playerCharacterPrompt";
import type { GuidedChapterPlan } from "../lib/guidedChapterGeneration/types";
import { ProviderSelect } from "../components/settings/ProviderSelect";
import {
	resolveVisibleProvider,
	shouldShowProviderPicker,
} from "../lib/ai/providerConfig";
import {
  adultContentModeToLegacyMatureFictionMode,
  isAdultContentMode,
  resolveNewStoryAdultContentMode,
} from "../lib/ai/adultContentMode";
import { getAdultContentProviderProfile } from "../lib/ai/providerCapabilities";

const initialFormState = {
  title: "",
  universeId: "",
  universeIds: [] as string[],
  playerCharacterId: "",
	openingPrompt: "",
  importedCharacterIds: [] as string[],
  adultContentMode: resolveNewStoryAdultContentMode(),
  rpMode: true,
};

const initialQuickCharacterState: PlayerCharacterDraft = {
  name: "",
  aliases: [],
  knownTies: [],
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
  scope: "story",
};

export function StoryCreatePage() {
  const navigate = useNavigate();
  const {
    aiSettings,
    createPlayerCharacter,
    createStory,
    generatePlayerCharacterDraft,
    generatePlayerCharacterConcept,
    generateStoryTitle,
    getPlayerCharacterById,
    getUniverseById,
    generateGuidedChapterPlan,
    universes,
    getPlayerCharactersForUniverse,
    saveStoryAIConfig,
    updatePlayerCharacter,
  } = useStoryEngine();
  const [formState, setFormState] = useState(initialFormState);
  const [protagonistMode, setProtagonistMode] = useState<
    "existing" | "newPermanent" | "quick"
  >("existing");
  const [quickCharacterState, setQuickCharacterState] = useState<PlayerCharacterDraft>(
    initialQuickCharacterState,
  );
  const [quickCharacterError, setQuickCharacterError] = useState<string | null>(null);
  const [isQuickGenerating, setIsQuickGenerating] = useState(false);
  const [isQuickGeneratingConcept, setIsQuickGeneratingConcept] = useState(false);
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
  const [storyTitleError, setStoryTitleError] = useState<string | null>(null);
  const [storyProviderType, setStoryProviderType] = useState(() =>
    resolveVisibleProvider(aiSettings?.activeProviderType),
  );
  const [storyModel, setStoryModel] = useState(() => {
    const provider = resolveVisibleProvider(aiSettings?.activeProviderType);
    return (
      aiSettings?.defaultModels?.[provider] ?? getProviderDefaultModel(provider)
    );
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [storyHistoryEnabled, setStoryHistoryEnabled] = useState(false);
  const [storyHistoryPlan, setStoryHistoryPlan] = useState<GuidedChapterPlan | null>(null);
  const [showStoryHistoryModal, setShowStoryHistoryModal] = useState(false);
  const resolveCreateChapterLabels = useCallback(
    (count: number) => resolveUpcomingChapterLabels([], [], count),
    [],
  );
  const selectedUniverseName = useMemo(() => {
    const selectedIds =
      formState.universeIds.length > 0
        ? formState.universeIds
        : formState.universeId
          ? [formState.universeId]
          : [];
    return selectedIds
      .map((universeId) => getUniverseById(universeId)?.name)
      .filter(Boolean)
      .join(", ");
  }, [formState.universeId, formState.universeIds, getUniverseById]);
  const selectedPlayerName = useMemo(() => {
    if (protagonistMode === "quick") {
      return quickCharacterState.name.trim();
    }
    return getPlayerCharacterById(formState.playerCharacterId)?.name ?? "Player";
  }, [formState.playerCharacterId, getPlayerCharacterById, protagonistMode, quickCharacterState.name]);
  const hasSelectedUniverses = formState.universeIds.length > 0 || Boolean(formState.universeId);

  const availableCharacters = useMemo(
    () => {
      const selectedIds =
        formState.universeIds.length > 0
          ? formState.universeIds
          : formState.universeId
            ? [formState.universeId]
            : [];
      return selectedIds.length ? getPlayerCharactersForUniverse(selectedIds) : [];
    },
    [formState.universeId, formState.universeIds, getPlayerCharactersForUniverse],
  );

  const selectableCharacters = availableCharacters;

  useEffect(() => {
    setQuickCharacterState((current) => ({
      ...current,
      universeId: formState.universeId,
      universeIds:
        formState.universeIds.length > 0
          ? formState.universeIds
          : formState.universeId
            ? [formState.universeId]
            : [],
      scope: "story",
    }));
  }, [formState.universeId, formState.universeIds]);


  if (!universes.length) {
    return (
      <div className="space-y-8">
        <PageHeader
        eyebrow="Create Story"
        title="Create a story from a universe and a player character"
        description="Choose the fictional universe, select the player character, then set a title and optional summary."
      />

      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["Step 1", "Select Universe"],
          ["Step 2", "Select Player Character"],
          ["Step 3", "Story Details"],
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
            <Field
              label="Universes"
              hint="Select one or more"
              help="Stories can use one world or several for crossovers. The AI draws lore from every universe you select."
            >
              <MultiUniversePicker
                universes={universes}
                selectedIds={
                  formState.universeIds.length > 0
                    ? formState.universeIds
                    : formState.universeId
                      ? [formState.universeId]
                      : []
                }
                onChange={(universeIds) =>
                  setFormState((currentState) => {
                    const previousIds =
                      currentState.universeIds.length > 0
                        ? currentState.universeIds
                        : currentState.universeId
                          ? [currentState.universeId]
                          : [];
                    const selectionChanged =
                      previousIds.join("|") !== universeIds.join("|");
                    return {
                      ...currentState,
                      universeIds,
                      universeId: universeIds[0] ?? "",
                      playerCharacterId: selectionChanged ? "" : currentState.playerCharacterId,
                    };
                  })
                }
              />
            </Field>

            <Field
              label="Protagonist"
              hint="Required"
              help="The character you control. Everyone else is played by the AI."
            >
              {isDerivedMode ? (
                <div className="rounded-[10px] border border-divider/[0.45] bg-panel-muted/50 px-4 py-3 text-sm text-ink-muted">
                  {isBranchMode
					? "A branch keeps the same universe and protagonist as the source story so the transcript stays consistent."
                    : "The sequel stays in the same universes. You can keep the same protagonist or switch to another character from those universes."}
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-3">
                  <Button
                    type="button"
                    variant={protagonistMode === "existing" ? "secondary" : "ghost"}
                    onClick={() => setProtagonistMode("existing")}
                    disabled={!hasSelectedUniverses}
                  >
                    Existing
                  </Button>
                  <Button
                    type="button"
                    variant={protagonistMode === "newPermanent" ? "secondary" : "ghost"}
                    onClick={() => setProtagonistMode("newPermanent")}
                    disabled={!hasSelectedUniverses}
                  >
                    New
                  </Button>
                  <Button
                    type="button"
                    variant={protagonistMode === "quick" ? "secondary" : "ghost"}
                    onClick={() => setProtagonistMode("quick")}
                    disabled={!hasSelectedUniverses}
                  >
                    Quick
                  </Button>
                </div>
            </Field>
          </div>

          {protagonistMode === "existing" ? (
            <Field
              label="Player Character"
              hint="Required"
              help="Pick a saved protagonist from your library. They must belong to at least one of the selected universes."
            >
              {hasSelectedUniverses && selectableCharacters.length ? (
                <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                  {selectableCharacters.map((character) => {
                    const selected = formState.playerCharacterId === character.id;
                    const details = [character.age ? `Age ${character.age}` : "", character.gender?.trim() ?? ""]
                      .filter(Boolean)
                      .join(" · ");
                    const concept = character.characterConcept?.trim() || "No character concept written yet.";

                    return (
                      <button
                        key={character.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() =>
                          setFormState((currentState) => ({
                            ...currentState,
                            playerCharacterId: character.id,
                          }))
                        }
                        className={`w-full rounded-[10px] border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                          selected
                            ? "border-accent/50 bg-accent/[0.10]"
                            : "border-divider/[0.45] bg-panel-muted/40 hover:border-accent/[0.35] hover:bg-panel-muted/70"
                        }`}
                      >
                        <span className="block text-sm font-semibold text-ink">{character.name}</span>
                        {details ? (
                          <span className="mt-1 block text-xs font-medium text-accent-soft">{details}</span>
                        ) : null}
                        <span className="mt-1.5 block overflow-hidden text-xs leading-5 text-ink-muted [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                          {concept}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-[10px] border border-divider/[0.45] bg-panel-muted/40 px-4 py-3 text-sm text-ink-muted">
                  {hasSelectedUniverses
                    ? "No player characters in these universes yet"
                    : "Select universes first"}
                </div>
              )}
            </Field>
          ) : null}

          {protagonistMode === "newPermanent" ? (
            <Panel variant="flat" className="border-dashed border-white/12 bg-white/[0.03]">
              <h2 className="text-lg font-semibold text-ink">Create a permanent player character</h2>
              <p className="mt-2 text-sm leading-7 text-ink-muted">
                This adds the character to your Player Characters library so you can reuse them across stories.
              </p>
              <Link
                to={`/player-characters/new?universeIds=${encodeURIComponent(
                  (
                    formState.universeIds.length > 0
                      ? formState.universeIds
                      : [formState.universeId]
                  ).join(","),
                )}`}
                className={buttonClasses({ className: "mt-5" })}
              >
                Create Player Character
              </Link>
            </Panel>
          ) : null}

          {protagonistMode === "quick" ? (
            <Panel variant="flat" className="border-dashed border-white/12 bg-white/[0.03]" padding="lg">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                Quick Story Character
              </div>
              <div className="mt-4 grid gap-6 md:grid-cols-2">
                <Field
                  label="Name"
                  hint="Required"
                  help="The primary name the AI uses when this character speaks or is mentioned."
                >
                  <TextInput
                    value={quickCharacterState.name}
                    onChange={(event) =>
                      setQuickCharacterState((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Alex Rivera"
                  />
                </Field>
                <Field
                  label="Pronouns"
                  help="How others address this character in narration and dialogue."
                >
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

              <div className="mt-6">
                <Field
                  label="Aliases"
                  hint="Alternative names the AI should recognise"
                  help="Nicknames, titles, or surnames the model should treat as the same person."
                >
                  <AliasesInput
                    value={normalizePlayerCharacterAliases(quickCharacterState.aliases)}
                    disabled={isQuickGenerating || isSubmitting}
                    onChange={(aliases) =>
                      setQuickCharacterState((current) => ({
                        ...current,
                        aliases,
                      }))
                    }
                  />
                </Field>
              </div>

              <div className="mt-6">
                <Field
                  label="Known ties"
                  hint="Optional canon characters and relationships the AI may reference"
                  help="List important NPCs and how they relate — for example mentor, sibling, or rival — without importing an entire cast."
                >
                  <KnownTiesInput
                    value={normalizePlayerCharacterKnownTies(quickCharacterState.knownTies)}
                    disabled={isQuickGenerating || isSubmitting}
                    onChange={(knownTies) =>
                      setQuickCharacterState((current) => ({
                        ...current,
                        knownTies,
                      }))
                    }
                  />
                </Field>
              </div>

              <div className="mt-6 grid gap-6 md:grid-cols-2">
                <Field
                  label="Age"
                  help="Approximate age or life stage. Helps the AI match tone and references."
                >
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
                <Field
                  label="Gender"
                  help="How the character identifies. Free text — use whatever fits your setting."
                >
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
                <Field
                  label="Species"
                  help="Biological or fantasy race. Matters for lore-heavy universes."
                >
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
                <Field
                  label="Character Concept"
                  help="A one-line pitch: role, vibe, and core conflict. Used when generating or randomising the rest of the sheet."
                  action={
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => void handleRandomizeQuickCharacterConcept()}
                      disabled={isQuickGenerating || isQuickGeneratingConcept || isSubmitting}
                    >
                      <SparklesIcon className="h-4 w-4" />
                      {isQuickGeneratingConcept ? "Randomising..." : "Randomise"}
                    </Button>
                  }
                >
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
                <Field
                  label="Appearance"
                  help="Physical description the AI can reference in narration and dialogue."
                >
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
                <Field
                  label="Personality"
                  help="Traits, habits, fears, and social style the AI should keep consistent."
                >
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
                <Field
                  label="Background"
                  help="Where they came from, formative experiences, and what they did before the story."
                >
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
                <Field
                  label="Notes"
                  help="Anything else you want the AI to remember — secrets, hooks, or play constraints."
                >
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
              {shouldShowProviderPicker() ? (
                <Field label="Provider Type" help="Which AI service generates this story. Override the global default from Settings for this story only.">
                  <ProviderSelect
                    value={storyProviderType}
                    onChange={(event) => {
                      const nextProvider = event.target.value as AIProviderType;
                      setStoryProviderType(nextProvider);
                      setStoryModel(
                        aiSettings?.defaultModels?.[nextProvider] ??
                          getProviderDefaultModel(nextProvider),
                      );
                    }}
                  />
                </Field>
              ) : null}
              <div className={shouldShowProviderPicker() ? undefined : "lg:col-span-2"}>
                <Field label="Model" help="The specific model used for chat generation in this story. Faster models respond quicker; larger models may follow complex lore more closely.">
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
            </div>
            <p className="mt-4 text-sm leading-7 text-ink-muted">
              Configure your API key and default model in Settings. This story can
              pick a provider and model independently.
            </p>
          </Panel>

          {hasSelectedUniverses && !selectableCharacters.length && protagonistMode === "existing" ? (
            <Panel variant="flat" className="border-dashed border-white/12 bg-white/[0.03]">
              <h2 className="text-lg font-semibold text-ink">
                These universes need a player character
              </h2>
              <p className="mt-2 text-sm leading-7 text-ink-muted">
                Create the original character the user will play, then return to
                finish this story setup. Or switch to Quick.
              </p>
              <Link
                to={`/player-characters/new?universeIds=${encodeURIComponent(
                  (
                    formState.universeIds.length > 0
                      ? formState.universeIds
                      : [formState.universeId]
                  ).join(","),
                )}`}
                className={buttonClasses({ className: "mt-5" })}
              >
                Create Player Character
              </Link>
            </Panel>
          ) : null}

          <div className="space-y-6">
            <Field
              label="Story Title"
              hint="Required"
              help="Shown in your library and story header. Generate one from the selected universe, protagonist, imported characters, and opening setup, or type your own."
              action={
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void handleGenerateStoryTitle()}
                  disabled={isGeneratingTitle || isSubmitting || !hasSelectedUniverses}
                >
                  <SparklesIcon className="h-4 w-4" />
                  {isGeneratingTitle ? "Generating..." : formState.title.trim() ? "Regenerate" : "Generate"}
                </Button>
              }
            >
              <TextInput
                value={formState.title}
                onChange={(event) => {
                  setStoryTitleError(null);
                  setFormState((currentState) => ({
                    ...currentState,
                    title: event.target.value,
                  }));
                }}
                placeholder="Example: The Harbor Job: Alex Rivera"
              />
              {storyTitleError ? (
                <p className="mt-2 text-sm text-rose-200">{storyTitleError}</p>
              ) : null}
            </Field>

            <Field
                label="Current Summary"
                hint="Optional"
                help="A short overview of where the story begins. The AI uses this for context before you write the first scene."
              >
                <TextAreaInput
					value={formState.openingPrompt}
                  onChange={(event) =>
                    setFormState((currentState) => ({
                      ...currentState,
						openingPrompt: event.target.value,
                    }))
                  }
                  placeholder="Leave blank for now or add a short story overview."
                />
              </Field>

            <Field
                label="Imported Characters"
                hint="Optional supporting cast"
                help="Library characters the AI should know in this story. They are not auto-spawned into scenes — only used when you reference them or when it makes narrative sense."
              >
                <ImportedCharactersPicker
                  selectedIds={formState.importedCharacterIds}
                  excludeCharacterId={formState.playerCharacterId || undefined}
                  universeIds={
                    formState.universeIds.length > 0
                      ? formState.universeIds
                      : formState.universeId
                        ? [formState.universeId]
                        : []
                  }
                  disabled={isSubmitting ? "Creating Story..." : "Create Story"}
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

      <GuidedChapterPlanModal
        open={showStoryHistoryModal}
        onClose={() => setShowStoryHistoryModal(false)}
        title="Plan generated story history"
        description="These chapters become canon backstory before the playable story begins at the next chapter banner."
        submitLabel="Save Story History Plan"
			initialOverallDirection={formState.openingPrompt}
        resolveChapterLabels={resolveCreateChapterLabels}
        onGeneratePlan={async ({ overallDirection, chapterLabels, chapters }) => {
          const plan = await generateGuidedChapterPlan({
            overallDirection,
            chapterLabels,
            chapters,
            universeName: selectedUniverseName || "Universe",
            playerName: selectedPlayerName,
			currentSituation: formState.openingPrompt.trim() || undefined,
          });
          return plan?.chapters ?? null;
        }}
        onSubmit={async (plan) => {
          setStoryHistoryPlan(plan);
          setStoryHistoryEnabled(true);
        }}
      />
    </div>
  );
}
