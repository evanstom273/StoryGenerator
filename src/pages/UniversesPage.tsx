import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { UniverseCard } from "../components/cards/UniverseCard";
import { buttonClasses } from "../components/ui/Button";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";

export function UniversesPage() {
  const {
    universes,
    getPlayerCharactersForUniverse,
    getStoriesForUniverse,
  } = useStoryEngine();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Universes"
        title="Worlds that stories and player characters live inside"
        description="Universes store the world context that future lore import and canon-character systems will build on."
        actions={
          <div className="flex gap-3">
            <Link to="/universes/new" className={buttonClasses()}>
              Create Universe
            </Link>
            <Link
              to="/universes/import"
              className={buttonClasses({ variant: "secondary" })}
            >
              Import Universe
            </Link>
          </div>
        }
      />

      {universes.length ? (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {universes.map((universe) => (
            <UniverseCard
              key={universe.id}
              universe={universe}
              linkedStoryCount={getStoriesForUniverse(universe.id).length}
              linkedCharacterCount={getPlayerCharactersForUniverse(universe.id).length}
              actions={
                <Link
                  to={`/universes/${universe.id}`}
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
          title="No universes yet"
          description="Add the fictional worlds that stories and player characters belong to."
          action={
            <Link to="/universes/new" className={buttonClasses()}>
              Create Universe
            </Link>
          }
        />
      )}
    </div>
  );
}

