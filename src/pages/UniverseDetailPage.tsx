import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { buttonClasses, Button } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";
import { formatDate } from "../lib/dates";

function PlaceholderImportSection({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <Panel className="h-full">
      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
        {title}
      </div>
      {items.length ? (
        <ul className="mt-4 space-y-3 text-sm text-ink-soft">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm leading-7 text-ink-muted">
          Empty until AI import is implemented.
        </p>
      )}
    </Panel>
  );
}

export function UniverseDetailPage() {
  const { universeId } = useParams();
  const navigate = useNavigate();
  const {
    deleteUniverse,
    getPlayerCharactersForUniverse,
    getStoriesForUniverse,
    getUniverseById,
  } = useStoryEngine();
  const universe = universeId ? getUniverseById(universeId) : undefined;
  const linkedCharacters = universe ? getPlayerCharactersForUniverse(universe.id) : [];
  const linkedStories = universe ? getStoriesForUniverse(universe.id) : [];
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!universe) {
    return (
      <div className="space-y-8">
        <PageHeader
          eyebrow="Universes"
          title="This universe could not be found"
          description="Return to the universe list and choose another entry."
        />
        <EmptyState
          title="Missing universe"
          description="The requested universe is not available in local storage."
          action={
            <Link to="/universes" className={buttonClasses()}>
              Back to Universes
            </Link>
          }
        />
      </div>
    );
  }

  const activeUniverse = universe;

  async function handleDelete() {
    const confirmed = window.confirm(
      "Delete this universe? Linked player characters and stories must be removed first.",
    );

    if (!confirmed) {
      return;
    }

    const result = await deleteUniverse(activeUniverse.id);

    if (!result.ok) {
      setErrorMessage(result.reason ?? "Unable to delete this universe.");
      return;
    }

    navigate("/universes");
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Universes"
        title={activeUniverse.name}
        description="Universes hold story context now and future import-ready canon context later."
        actions={
          <div className="flex gap-3">
            <Link
              to={`/universes/${activeUniverse.id}/edit`}
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
              <div className="md:col-span-2">
                <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                  Description
                </dt>
                <dd className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-soft">
                  {activeUniverse.description || "No description written yet."}
                </dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                  Wiki URL
                </dt>
                <dd className="mt-2 break-all text-sm text-ink-soft">
                  {activeUniverse.wikiUrl || "Not provided"}
                </dd>
              </div>
            </dl>
          </Panel>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <PlaceholderImportSection
              title="Imported Lore"
              items={activeUniverse.importedLore}
            />
            <PlaceholderImportSection
              title="Imported Characters"
              items={activeUniverse.importedCharacters}
            />
            <PlaceholderImportSection
              title="Imported Locations"
              items={activeUniverse.importedLocations}
            />
            <PlaceholderImportSection
              title="Imported Relationships"
              items={activeUniverse.importedRelationships}
            />
          </div>
        </div>

        <div className="space-y-4">
          <Panel>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
              Workspace Links
            </div>
            <dl className="mt-4 space-y-4">
              <div>
                <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                  Player Characters
                </dt>
                <dd className="mt-2 text-sm text-ink-soft">
                  {linkedCharacters.length}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                  Stories
                </dt>
                <dd className="mt-2 text-sm text-ink-soft">{linkedStories.length}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                  Added
                </dt>
                <dd className="mt-2 text-sm text-ink-soft">
                  {formatDate(activeUniverse.createdAt)}
                </dd>
              </div>
            </dl>
          </Panel>

          {linkedCharacters.length ? (
            <Panel>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                Linked Player Characters
              </div>
              <div className="mt-4 space-y-3">
                {linkedCharacters.map((character) => (
                  <Link
                    key={character.id}
                    to={`/player-characters/${character.id}`}
                    className="block rounded-2xl border border-white/8 bg-black/15 px-4 py-4 text-sm text-ink-soft transition hover:border-white/16 hover:bg-white/[0.04]"
                  >
                    {character.name}
                  </Link>
                ))}
              </div>
            </Panel>
          ) : null}

          {linkedStories.length ? (
            <Panel>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                Linked Stories
              </div>
              <div className="mt-4 space-y-3">
                {linkedStories.map((story) => (
                  <Link
                    key={story.id}
                    to={`/stories/${story.id}`}
                    className="block rounded-2xl border border-white/8 bg-black/15 px-4 py-4 text-sm text-ink-soft transition hover:border-white/16 hover:bg-white/[0.04]"
                  >
                    {story.title}
                  </Link>
                ))}
              </div>
            </Panel>
          ) : null}

          {errorMessage ? (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
              {errorMessage}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
