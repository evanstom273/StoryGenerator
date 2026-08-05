import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { Field, MultiUniversePicker, SelectInput, TextAreaInput, TextInput, AliasesInput } from "../components/forms/Fields";
import { getUniverseIds } from "../lib/universeIds";
import { Button, buttonClasses } from "../components/ui/Button";
import { SparklesIcon } from "../components/icons";
import { Panel } from "../components/ui/Panel";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";
import type { AIProviderType, PlayerCharacterDraft } from "../types/models";
import { getProviderDefaultModel, getProviderModels } from "../lib/ai/models";
import { GuidedChapterPlanModal } from "../components/story/GuidedChapterPlanModal";
import { resolveUpcomingChapterLabels } from "../lib/guidedChapterGeneration/chapterLabels";
import { normalizePlayerCharacterAliases } from "../lib/playerCharacterPrompt";
import type { GuidedChapterPlan } from "../lib/guidedChapterGeneration/types";

const initialFormState = {
  title: "",
  universeId: "",
  universeIds: [] as string[],
  playerCharacterId: "",
  currentSummary: "",
  matureFictionMode: true,
  rpMode: true,
};

const initialQuickCharacterState: PlayerCharacterDraft = {
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
  scope: "story",
};

export function StoryCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    aiSettings,
    createBranch,
    createPlayerCharacter,
    createSequel,
    createStory,
    generatePlayerCharacterDraft,
    generatePlayerCharacterConcept,
    getPlayerCharacterById,
    getStoryAIConfig,
    getStoryById,
    getUniverseById,
    generateGuidedChapterPlan,
    universes,
    getPlayerCharactersForUniverse,
    saveStoryAIConfig,
    updatePlayerCharacter,
  } = useStoryEngine();
  const sequelToId = searchParams.get("sequelTo")?.trim() ?? "";
  const branchFromId = searchParams.get("branchFrom")?.trim() ?? "";
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
  const [storyProviderType, setStoryProviderType] = useState(
    aiSettings?.activeProviderType ?? "openai",
  );
  const [storyModel, setStoryModel] = useState(
    aiSettings?.defaultModels?.[aiSettings?.activeProviderType ?? "openai"] ??
      getProviderDefaultModel(aiSettings?.activeProviderType ?? "openai"),
  );
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
  const sourceMode = branchFromId ? "branch" : sequelToId ? "sequel" : null;
  const sourceStory = sourceMode
    ? getStoryById(sourceMode === "branch" ? branchFromId : sequelToId)
    : undefined;
  const sourceUniverseIds = sourceStory ? getUniverseIds(sourceStory) : [];
  const sourceUniverses = sourceUniverseIds
    .map((universeId) => getUniverseById(universeId))
    .filter((universe): universe is NonNullable<typeof universe> => Boolean(universe));
  const sourceCharacter = sourceStory
    ? getPlayerCharacterById(sourceStory.playerCharacterId)
    : undefined;
  const seededSourceKeyRef = useRef<string | null>(null);
  const isSequelMode =
    sourceMode === "sequel" && Boolean(sourceStory && sourceUniverses.length && sourceCharacter);
  const isBranchMode =
    sourceMode === "branch" && Boolean(sourceStory && sourceUniverses.length && sourceCharacter);
  const isDerivedMode = isSequelMode || isBranchMode;
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

  const selectableCharacters = useMemo(() => {
    if (!isDerivedMode || !sourceCharacter) {
      return availableCharacters;
    }

    return availableCharacters.some((character) => character.id === sourceCharacter.id)
      ? availableCharacters
      : [sourceCharacter, ...availableCharacters];
  }, [availableCharacters, isDerivedMode, sourceCharacter]);

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

  useEffect(() => {
    if (!isDerivedMode || !sourceStory || !sourceUniverses.length || !sourceCharacter) {
      return;
    }

    const nextSeedKey = `${sourceMode}:${sourceStory.id}`;
    if (seededSourceKeyRef.current === nextSeedKey) {
      return;
    }

    seededSourceKeyRef.current = nextSeedKey;
    setProtagonistMode("existing");
    setFormState((current) => {
      const nextTitle = isBranchMode
        ? `${sourceStory.title} (Branch)`
        : `${sourceStory.title} II`;
      return {
        ...current,
        title: current.title || nextTitle,
        universeId: sourceUniverseIds[0] ?? "",
        universeIds: sourceUniverseIds,
        playerCharacterId: current.playerCharacterId || sourceCharacter.id,
        currentSummary: isBranchMode ? sourceStory.currentSummary : current.currentSummary,
      };
    });
  }, [
    isBranchMode,
    isDerivedMode,
    sourceCharacter,
    sourceMode,
    sourceStory,
    sourceUniverseIds,
    sourceUniverses.length,
  ]);

  useEffect(() => {
    if (!isDerivedMode || !sourceStory) {
      return;
    }

    let cancelled = false;
    void getStoryAIConfig(sourceStory.id)
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
  }, [getStoryAIConfig, isDerivedMode, sourceStory]);

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

    if (!hasSelectedUniverses) {
      setErrorMessage("Select at least one universe before creating the story.");
      return;
    }

    if (!formState.title.trim()) {
      setErrorMessage("Enter a story title.");
      return;
    }

    if (storyHistoryEnabled && !storyHistoryPlan) {
      setErrorMessage("Configure the generated story history plan before creating the story.");
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
          universeIds:
            formState.universeIds.length > 0
              ? formState.universeIds
              : [formState.universeId],
          scope: "story",
        });
        resolvedPlayerCharacterId = createdCharacter.id;
      }

      const story = isBranchMode && sourceStory
        ? await createBranch({
            sourceStoryId: sourceStory.id,
            title: formState.title,
          })
        : isSequelMode && sourceStory
        ? await createSequel({
            sourceStoryId: sourceStory.id,
            title: formState.title,
            playerCharacterId: resolvedPlayerCharacterId,
            openingNote: formState.currentSummary.trim() || undefined,
          })
        : await createStory({
            ...formState,
            universeIds:
              formState.universeIds.length > 0
                ? formState.universeIds
                : [formState.universeId],
            playerCharacterId: resolvedPlayerCharacterId,
            currentSummary: formState.currentSummary.trim(),
            matureFictionMode: formState.matureFictionMode,
            rpMode: formState.rpMode,
            guidedStoryHistory:
              storyHistoryEnabled && storyHistoryPlan
                ? {
                    enabled: true,
                    overallDirection: storyHistoryPlan.overallDirection,
                    chapterCount: storyHistoryPlan.chapters.length,
                    chapters: storyHistoryPlan.chapters.map((chapter) => ({
                      label: chapter.label,
                      overview: chapter.overview,
                      scenesPerChapter: chapter.scenesPerChapter,
                    })),
                  }
                : undefined,
          });

      if (!isDerivedMode && protagonistMode === "quick") {
        await updatePlayerCharacter(resolvedPlayerCharacterId, {
          ...quickCharacterState,
          universeId: formState.universeId,
          universeIds:
            formState.universeIds.length > 0
              ? formState.universeIds
              : [formState.universeId],
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

  async function handleRandomizeQuickCharacterConcept() {
    setIsQuickGeneratingConcept(true);
    setQuickCharacterError(null);

    try {
      const universeId = formState.universeIds[0] ?? formState.universeId ?? "";
      const concept = await generatePlayerCharacterConcept(
        universeId || undefined,
        quickCharacterState,
      );
      setQuickCharacterState((current) => ({ ...current, characterConcept: concept }));
    } catch (error) {
      setQuickCharacterError(
        error instanceof Error ? error.message : "Unable to generate a character concept.",
      );
    } finally {
      setIsQuickGeneratingConcept(false);
    }
  }

  async function handleGenerateQuickCharacterDetails(mode: "overwrite" | "fillEmpty") {
    if (!hasSelectedUniverses) {
      setQuickCharacterError("Select at least one universe before generating a character.");
      return;
    }

    const candidateFields: Array<keyof PlayerCharacterDraft> = [
      "appearance",
      "personality",
      "background",
      "notes",
    ];

    const fields =
      mode === "fillEmpty"
        ? candidateFields.filter((field) => {
            const value = quickCharacterState[field];
            return typeof value === "string" && !value.trim();
          })
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
        eyebrow={isBranchMode ? "Branch Story" : isSequelMode ? "Create Sequel" : "Create Story"}
        title={
          isBranchMode
            ? "Fork the current story into an editable branch"
            : isSequelMode
            ? "Start a new sequel from an existing story"
            : "Create a story from a universe and a player character"
        }
        description={
          isBranchMode
            ? "The branch copies the current transcript, context, index, and story state so you can continue from the same point without locking the original."
            : isSequelMode
            ? "The predecessor stays canon and becomes read-only. The sequel starts fresh at message 1 while inheriting distilled story state."
            : "Choose the fictional universe, select the player character, then set a title and optional summary."
        }
      />

      {isDerivedMode && sourceStory && sourceUniverses.length && sourceCharacter ? (
        <Panel variant="flat" className="border-dashed border-white/12 bg-white/[0.03]" padding="lg">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
            {isBranchMode ? "Branch Source" : "Sequel Source"}
          </div>
          <div className="mt-3 text-lg font-semibold text-ink">{sourceStory.title}</div>
          <p className="mt-2 text-sm leading-7 text-ink-muted">
            Universes: {sourceUniverses.map((universe) => universe.name).join(", ")} · Default
            protagonist: {sourceCharacter.name}
          </p>
          <p className="mt-3 text-sm leading-7 text-ink-muted">
            {isBranchMode ? (
              <>
                This branch keeps the current transcript, context, index, and canon state intact so you can split the story into an alternate path without locking the source story.
              </>
            ) : (
              <>
                This new story inherits the predecessor&apos;s distilled canon state, relationships, and world facts. The old story becomes a locked prequel and the new transcript begins with <span className="font-semibold text-ink-soft">Chapter I.</span>
              </>
            )}
          </p>
          {sourceStory.currentSummary.trim() ? (
            <div className="mt-4 rounded-[10px] border border-divider/[0.45] bg-app-elevated px-4 py-3 text-sm leading-7 text-ink-soft">
              {sourceStory.currentSummary}
            </div>
          ) : null}
        </Panel>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["Step 1", isDerivedMode ? "Confirm Source" : "Select Universe"],
          ["Step 2", "Select Player Character"],
          ["Step 3", isBranchMode ? "Branch Details" : isSequelMode ? "Sequel Details" : "Story Details"],
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
            <Field label="Universes" hint="Select one or more">
              <MultiUniversePicker
                universes={universes}
                selectedIds={
                  formState.universeIds.length > 0
                    ? formState.universeIds
                    : formState.universeId
                      ? [formState.universeId]
                      : []
                }
                disabled={isDerivedMode}
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

            <Field label="Protagonist" hint="Required">
              {isDerivedMode ? (
                <div className="rounded-[10px] border border-divider/[0.45] bg-panel-muted/50 px-4 py-3 text-sm text-ink-muted">
                  {isBranchMode
                    ? "A branch keeps the same universe and protagonist as the source story so the transcript and indexed state stay consistent."
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
                disabled={isBranchMode || !hasSelectedUniverses || !selectableCharacters.length}
              >
                <option value="">
                  {hasSelectedUniverses
                    ? selectableCharacters.length
                      ? "Select a player character"
                      : "No player characters in these universes yet"
                    : "Select universes first"}
                </option>
                {selectableCharacters.map((character) => (
                  <option key={character.id} value={character.id}>
                    {character.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
          ) : null}

          {!isDerivedMode && protagonistMode === "newPermanent" ? (
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

          {!isDerivedMode && protagonistMode === "quick" ? (
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

              <div className="mt-6">
                <Field label="Aliases" hint="Alternative names the AI should recognise">
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
                <Field
                  label="Character Concept"
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

          {hasSelectedUniverses && !selectableCharacters.length && protagonistMode === "existing" && !isDerivedMode ? (
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
                  isBranchMode
                    ? "Example: Davies Chronicles (Branch)"
                    : isSequelMode
                    ? "Example: Davies Chronicles II"
                    : "Example: Brooklyn Nine-Nine: Jamie Mercer"
                }
              />
            </Field>

            {isBranchMode ? null : (
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
            )}

            {!isDerivedMode ? (
              <div className="grid gap-6 md:grid-cols-2">
                <Field
                  label="Mature fiction (non-graphic)"
                  hint="Defaults to on for new stories"
                >
                  <SelectInput
                    value={formState.matureFictionMode ? "on" : "off"}
                    onChange={(event) =>
                      setFormState((currentState) => ({
                        ...currentState,
                        matureFictionMode: event.target.value === "on",
                      }))
                    }
                  >
                    <option value="on">On</option>
                    <option value="off">Off</option>
                  </SelectInput>
                </Field>
                <Field label="RP mode" hint="Track HP, currency, and core stats">
                  <SelectInput
                    value={formState.rpMode ? "on" : "off"}
                    onChange={(event) =>
                      setFormState((currentState) => ({
                        ...currentState,
                        rpMode: event.target.value === "on",
                      }))
                    }
                  >
                    <option value="on">On</option>
                    <option value="off">Off</option>
                  </SelectInput>
                </Field>
              </div>
            ) : null}

            {!isDerivedMode ? (
              <Panel variant="flat" className="border-dashed border-white/12 bg-white/[0.03]" padding="lg">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                  Story History
                </div>
                <p className="mt-3 text-sm leading-7 text-ink-muted">
                  Optionally generate backstory chapters before play begins. Story Engine stages Director beats,
                  narrates scenes, indexes each chapter, then inserts a divider and opens the playable chapter.
                </p>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Button
                    type="button"
                    variant={storyHistoryEnabled ? "secondary" : "ghost"}
                    onClick={() => {
                      setStoryHistoryEnabled((current) => {
                        if (current) {
                          setStoryHistoryPlan(null);
                        }
                        return !current;
                      });
                    }}
                  >
                    {storyHistoryEnabled ? "Story history enabled" : "Enable story history"}
                  </Button>
                  {storyHistoryEnabled ? (
                    <Button type="button" variant="secondary" onClick={() => setShowStoryHistoryModal(true)}>
                      {storyHistoryPlan
                        ? `Plan ready · ${storyHistoryPlan.chapters.length} chapters`
                        : "Configure Story History"}
                    </Button>
                  ) : null}
                </div>
              </Panel>
            ) : null}
          </div>

          {errorMessage ? (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
              {errorMessage}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting
                ? isBranchMode
                  ? "Creating Branch..."
                  : isSequelMode
                  ? "Creating Sequel..."
                  : "Creating Story..."
                : isBranchMode
                  ? "Create Branch"
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

      <GuidedChapterPlanModal
        open={showStoryHistoryModal}
        onClose={() => setShowStoryHistoryModal(false)}
        title="Plan generated story history"
        description="These chapters become canon backstory before the playable story begins at the next chapter banner."
        submitLabel="Save Story History Plan"
        initialOverallDirection={formState.currentSummary}
        resolveChapterLabels={resolveCreateChapterLabels}
        onGeneratePlan={async ({ overallDirection, chapterLabels }) => {
          const plan = await generateGuidedChapterPlan({
            overallDirection,
            chapterLabels,
            universeName: selectedUniverseName || "Universe",
            playerName: selectedPlayerName,
            currentSituation: formState.currentSummary.trim() || undefined,
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
