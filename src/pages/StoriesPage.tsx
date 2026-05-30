import { Link } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { buttonClasses } from "../components/ui/Button";
import { StoryListRow } from "../components/story/StoryListRow";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";

export function StoriesPage() {
  const {
    stories,
    getPlayerCharacterById,
    getUniverseById,
  } = useStoryEngine();

  return (
    <div className="space-y-8">
      {stories.length ? (
        <section className="space-y-5">
          <div className="flex flex-col gap-4 border-b border-white/8 pb-6 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                Stories
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink md:text-4xl">
                Continue a story
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-muted md:text-base">
                Stories are your active channels. Pick one and keep writing.
              </p>
            </div>
            <Link to="/stories/new" className={buttonClasses()}>
              New Story
            </Link>
          </div>

          <div className="space-y-2">
            {stories.map((story) => (
              <StoryListRow
                key={story.id}
                story={story}
                universeName={getUniverseById(story.universeId)?.name ?? "Unknown universe"}
                playerCharacterName={
                  getPlayerCharacterById(story.playerCharacterId)?.name ?? "Unknown character"
                }
                to={`/stories/${story.id}`}
              />
            ))}
          </div>
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
