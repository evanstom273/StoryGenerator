import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { CharacterCard } from "../components/cards/CharacterCard";
import { buttonClasses } from "../components/ui/Button";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";

export function PlayerCharactersPage() {
  const {
    playerCharacters,
    getStoriesForPlayerCharacter,
    getUniverseById,
    universes,
  } = useStoryEngine();
  const [sortMode, setSortMode] = useState<"created" | "alpha">("created");
  const [universeFilter, setUniverseFilter] = useState<string>("all");

  const libraryCharacters = playerCharacters.filter(
    (character) => (character.scope ?? "library") === "library",
  );

  const filteredCharacters = useMemo(() => {
    let items = libraryCharacters;
    if (universeFilter !== "all") {
      items = items.filter((character) => character.universeId === universeFilter);
    }

    const sorted = [...items];
    if (sortMode === "alpha") {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    return sorted;
  }, [libraryCharacters, sortMode, universeFilter]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Player Characters"
        title="Original characters the user will play"
        description="Player characters belong to a universe and anchor each campaign. Canon characters are no longer managed here as fixed upfront participants."
        actions={
          <Link to="/player-characters/new" className={buttonClasses()}>
            Create Player Character
          </Link>
        }
      />

      {filteredCharacters.length ? (
        <>
          <div className="grid gap-3 rounded-xl border border-divider/[0.6] bg-app px-[18px] py-[15px] md:grid-cols-2">
            <label className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-ink-muted">
                Universe
              </div>
              <select
                className="w-full rounded-[8px] border border-divider bg-panel-muted px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent/[0.4] focus:ring-2 focus:ring-accent/[0.15]"
                value={universeFilter}
                onChange={(event) => setUniverseFilter(event.target.value)}
              >
                <option value="all">All universes</option>
                {universes.map((universe) => (
                  <option key={universe.id} value={universe.id}>
                    {universe.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-ink-muted">
                Sort
              </div>
              <select
                className="w-full rounded-[8px] border border-divider bg-panel-muted px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent/[0.4] focus:ring-2 focus:ring-accent/[0.15]"
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as "created" | "alpha")}
              >
                <option value="created">Recently created</option>
                <option value="alpha">Alphabetical</option>
              </select>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredCharacters.map((character) => (
            <CharacterCard
              key={character.id}
              character={character}
              universeName={getUniverseById(character.universeId)?.name ?? "Unknown universe"}
              linkedStoryCount={getStoriesForPlayerCharacter(character.id).length}
              actions={
                <Link
                  to={`/player-characters/${character.id}`}
                  className={buttonClasses({ variant: "ghost", size: "sm" })}
                >
                  View
                </Link>
              }
            />
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          title="No player characters yet"
          description="Create the original character the user will control inside a specific fictional universe."
          action={
            <Link to="/player-characters/new" className={buttonClasses()}>
              Create Player Character
            </Link>
          }
        />
      )}
    </div>
  );
}
