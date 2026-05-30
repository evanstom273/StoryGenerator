import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { StoryCard } from "../components/cards/StoryCard";
import { buttonClasses } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";

export function StoriesPage() {
  const {
    stories,
    getMessagesForStory,
    getPlayerCharacterById,
    getUniverseById,
  } = useStoryEngine();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Stories"
        title="Story campaigns and active timelines"
        description="Create campaigns from a universe and a player character, then manage the evolving story timeline without ever locking in a fixed cast up front."
        actions={
          <Link to="/stories/new" className={buttonClasses()}>
            Create Story
          </Link>
        }
      />

      {stories.length ? (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-4 lg:grid-cols-2">
            {stories.map((story) => {
              const universe = getUniverseById(story.universeId);
              const playerCharacter = getPlayerCharacterById(story.playerCharacterId);

              return (
                <StoryCard
                  key={story.id}
                  story={story}
                  universeName={universe?.name ?? "Unknown universe"}
                  playerCharacterName={playerCharacter?.name ?? "Unknown character"}
                  messageCount={getMessagesForStory(story.id).length}
                  actions={
                    <Link
                      to={`/stories/${story.id}`}
                      className={buttonClasses({ variant: "ghost", size: "sm" })}
                    >
                      Open
                    </Link>
                  }
                />
              );
            })}
          </div>
          <Panel className="h-fit">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
              Workflow
            </div>
            <h2 className="mt-4 text-xl font-semibold tracking-tight text-ink">
              Universe first. Player character second. Cast emerges later.
            </h2>
            <p className="mt-3 text-sm leading-7 text-ink-muted">
              Stories no longer assume a preselected roster. The workspace is now
              built around campaign setup, story prompt management, message
              history, and future dynamic canon participation.
            </p>
          </Panel>
        </section>
      ) : (
        <EmptyState
          title="No stories yet"
          description="Create a story once you have a universe and a player character prepared."
          action={
            <Link to="/stories/new" className={buttonClasses()}>
              Create Story
            </Link>
          }
        />
      )}
    </div>
  );
}

