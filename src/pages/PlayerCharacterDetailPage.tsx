import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { buttonClasses, Button } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";
import { formatDate } from "../lib/dates";
import { getUniverseIds } from "../lib/universeIds";
import { normalizePlayerCharacterAliases } from "../lib/playerCharacterPrompt";

export function PlayerCharacterDetailPage() {
  const { characterId } = useParams();
  const navigate = useNavigate();
  const {
    deletePlayerCharacter,
    getPlayerCharacterById,
    getStoriesForPlayerCharacter,
    getUniverseById,
  } = useStoryEngine();
  const character = characterId ? getPlayerCharacterById(characterId) : undefined;
  const linkedUniverses = character
    ? getUniverseIds(character)
        .map((universeId) => getUniverseById(universeId))
        .filter((universe): universe is NonNullable<typeof universe> => Boolean(universe))
    : [];
  const linkedStories = character ? getStoriesForPlayerCharacter(character.id) : [];
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!character || !linkedUniverses.length) {
    return (
      <div className="space-y-8">
        <PageHeader
          eyebrow="Player Characters"
          title="This player character could not be found"
          description="Return to the list and choose another player character."
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

  const activeCharacter = character;
  const universeLabel = linkedUniverses.map((universe) => universe.name).join(", ");

  async function handleDelete() {
    const confirmed = window.confirm(
      "Delete this player character? Stories linked to it must be removed first.",
    );

    if (!confirmed) {
      return;
    }

    const result = await deletePlayerCharacter(activeCharacter.id);

    if (!result.ok) {
      setErrorMessage(result.reason ?? "Unable to delete this player character.");
      return;
    }

    navigate("/player-characters");
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Player Characters"
        title={activeCharacter.name}
        description="This is the original character the user controls across the selected universes."
        actions={
          <div className="flex gap-3">
            <Link
              to={`/player-characters/${activeCharacter.id}/edit`}
              className={buttonClasses({ variant: "secondary" })}
            >
              Edit
            </Link>
            <Button variant="ghost" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-5">
          <Panel variant="flat">
            <dl className="divide-y divide-divider/[0.3]">
              <div className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-[11px] text-ink-muted">Universes</dt>
                <dd className="text-[13px] text-ink-soft">{universeLabel}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-[11px] text-ink-muted">Age</dt>
                <dd className="text-[13px] text-ink-soft">{activeCharacter.age || "Not specified"}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-[11px] text-ink-muted">Species</dt>
                <dd className="text-[13px] text-ink-soft">{activeCharacter.species || "Not specified"}</dd>
              </div>
              {normalizePlayerCharacterAliases(activeCharacter.aliases).length ? (
                <div className="flex items-center justify-between gap-4 py-2.5">
                  <dt className="text-[11px] text-ink-muted">Aliases</dt>
                  <dd className="text-right text-[13px] text-ink-soft">
                    {normalizePlayerCharacterAliases(activeCharacter.aliases).join(", ")}
                  </dd>
                </div>
              ) : null}
            </dl>
            <div className="mt-4 space-y-4">
              {[
                { label: "Appearance", value: activeCharacter.appearance },
                { label: "Personality", value: activeCharacter.personality },
                { label: "Background", value: activeCharacter.background },
                { label: "Notes", value: activeCharacter.notes },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-ink-muted">{label}</div>
                  <div className="mt-1.5 whitespace-pre-wrap text-[13px] leading-6 text-ink-soft">
                    {value || "Not specified"}
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel variant="flat">
            <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">
              Linked Stories
            </div>
            {linkedStories.length ? (
              <div className="mt-3 space-y-2">
                {linkedStories.map((story) => (
                  <Link
                    key={story.id}
                    to={`/stories/${story.id}`}
                    className="block rounded-[8px] border border-divider/[0.4] bg-panel-muted/40 px-3.5 py-3 text-sm text-ink-soft transition hover:border-accent/[0.15] hover:bg-panel-muted"
                  >
                    <div className="text-[13px] font-medium text-ink">{story.title}</div>
                    <div className="mt-1 text-[11px] text-ink-muted">
                      {story.currentSummary || "No summary yet."}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[13px] leading-6 text-ink-muted">
                No stories are linked to this player character yet.
              </p>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel variant="flat" className="h-fit">
            <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">
              Metadata
            </div>
            <dl className="mt-3 divide-y divide-divider/[0.3]">
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-[11px] text-ink-muted">Created</dt>
                <dd className="text-[13px] text-ink-soft">{formatDate(activeCharacter.createdAt)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-[11px] text-ink-muted">Universes</dt>
                <dd className="flex flex-wrap gap-2">
                  {linkedUniverses.map((universe) => (
                    <Link
                      key={universe.id}
                      to={`/universes/${universe.id}`}
                      className={buttonClasses({ variant: "ghost", size: "sm" })}
                    >
                      {universe.name}
                    </Link>
                  ))}
                </dd>
              </div>
            </dl>
            {errorMessage ? (
              <div className="mt-4 rounded-[8px] border border-rose-400/20 bg-rose-400/10 px-3.5 py-3 text-sm text-rose-200">
                {errorMessage}
              </div>
            ) : null}
          </Panel>
        </div>
      </div>
    </div>
  );
}
