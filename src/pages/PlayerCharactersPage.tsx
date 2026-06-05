import { Link } from "react-router-dom";
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
  } = useStoryEngine();

  const libraryCharacters = playerCharacters.filter(
    (character) => (character.scope ?? "library") === "library",
  );

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

      {libraryCharacters.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {libraryCharacters.map((character) => (
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
