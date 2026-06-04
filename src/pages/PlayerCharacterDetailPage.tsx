import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { buttonClasses, Button } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";
import { formatDate } from "../lib/dates";

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
  const universe = character ? getUniverseById(character.universeId) : undefined;
  const linkedStories = character ? getStoriesForPlayerCharacter(character.id) : [];
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!character || !universe) {
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
  const activeUniverse = universe;

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
        description="This is the original character the user controls inside the selected universe."
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Panel>
            <dl className="grid gap-5 md:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                  Universe
                </dt>
                <dd className="mt-2 text-sm text-ink-soft">{activeUniverse.name}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                  Age
                </dt>
                <dd className="mt-2 text-sm text-ink-soft">
                  {activeCharacter.age || "Not specified"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                  Species
                </dt>
                <dd className="mt-2 text-sm text-ink-soft">
                  {activeCharacter.species || "Not specified"}
                </dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                  Appearance
                </dt>
                <dd className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-soft">
                  {activeCharacter.appearance || "Not specified"}
                </dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                  Personality
                </dt>
                <dd className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-soft">
                  {activeCharacter.personality || "Not specified"}
                </dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                  Background
                </dt>
                <dd className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-soft">
                  {activeCharacter.background || "Not specified"}
                </dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                  Goals
                </dt>
                <dd className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-soft">
                  {activeCharacter.goals || "Not specified"}
                </dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                  Notes
                </dt>
                <dd className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-soft">
                  {activeCharacter.notes || "Not specified"}
                </dd>
              </div>
            </dl>
          </Panel>

          <Panel>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
              Linked Stories
            </div>
            {linkedStories.length ? (
              <div className="mt-4 space-y-3">
                {linkedStories.map((story) => (
                  <Link
                    key={story.id}
                    to={`/stories/${story.id}`}
                    className="block rounded-2xl border border-white/8 bg-black/15 px-4 py-4 text-sm text-ink-soft transition hover:border-white/16 hover:bg-white/[0.04]"
                  >
                    <div className="font-medium text-ink">{story.title}</div>
                    <div className="mt-2 text-ink-muted">
                      {story.currentSummary || "No summary yet."}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm leading-7 text-ink-muted">
                No stories are linked to this player character yet.
              </p>
            )}
          </Panel>
        </div>

        <Panel className="h-fit">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
            Metadata
          </div>
          <dl className="mt-4 space-y-4">
            <div>
              <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                Created
              </dt>
              <dd className="mt-2 text-sm text-ink-soft">
                {formatDate(activeCharacter.createdAt)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                Universe Link
              </dt>
              <dd className="mt-2">
                <Link
                  to={`/universes/${activeUniverse.id}`}
                  className={buttonClasses({ variant: "ghost", size: "sm" })}
                >
                  Open Universe
                </Link>
              </dd>
            </div>
          </dl>
          {errorMessage ? (
            <div className="mt-5 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
              {errorMessage}
            </div>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}
