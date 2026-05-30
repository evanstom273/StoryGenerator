import { Link } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { buttonClasses } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";
import { StoryListRow } from "../components/story/StoryListRow";

export function HomePage() {
  const {
    stories,
    universes,
    getPlayerCharacterById,
    getUniverseById,
  } = useStoryEngine();

  const continueStory = stories[0];
  const recentStories = stories.slice(0, 8);
  const recentUniverses = universes.slice(0, 6);

  return (
    <div className="space-y-10">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel padding="lg" className="bg-gradient-to-br from-white/[0.06] to-white/[0.03]">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
            Continue Story
          </div>
          {continueStory ? (
            <>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-ink">
                {continueStory.title}
              </h1>
              <p className="mt-4 text-sm leading-7 text-ink-muted">
                {getUniverseById(continueStory.universeId)?.name ?? "Unknown universe"} ·{" "}
                {getPlayerCharacterById(continueStory.playerCharacterId)?.name ??
                  "Unknown character"}
              </p>
              <p className="mt-4 text-sm leading-7 text-ink-soft">
                {continueStory.currentSummary || continueStory.openingPrompt}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  to={`/stories/${continueStory.id}`}
                  className={buttonClasses({ variant: "primary", size: "lg" })}
                >
                  Continue
                </Link>
                <Link
                  to="/stories"
                  className={buttonClasses({ variant: "secondary", size: "lg" })}
                >
                  Browse Stories
                </Link>
              </div>
            </>
          ) : (
            <div className="mt-4">
              <EmptyState
                title="No stories yet"
                description="Create your first universe, attach a player character, and start a story."
                action={
                  <Link to="/stories/new" className={buttonClasses({ size: "lg" })}>
                    Create Story
                  </Link>
                }
              />
            </div>
          )}
        </Panel>

        <Panel padding="lg" className="h-fit">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
            Quick Actions
          </div>
          <div className="mt-5 grid gap-3">
            <Link to="/stories/new" className={buttonClasses({ className: "w-full" })}>
              New Story
            </Link>
            <Link
              to="/universes/new"
              className={buttonClasses({ variant: "secondary", className: "w-full" })}
            >
              New Universe
            </Link>
            <Link
              to="/player-characters/new"
              className={buttonClasses({ variant: "secondary", className: "w-full" })}
            >
              New Player Character
            </Link>
          </div>
        </Panel>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">Recent Stories</h2>
          <Link to="/stories" className={buttonClasses({ variant: "ghost", size: "sm" })}>
            View all
          </Link>
        </div>
        {recentStories.length ? (
          <div className="space-y-2">
            {recentStories.map((story) => (
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
        ) : null}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">Recent Universes</h2>
          <Link to="/universes" className={buttonClasses({ variant: "ghost", size: "sm" })}>
            View all
          </Link>
        </div>
        {recentUniverses.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {recentUniverses.map((universe) => (
              <Link
                key={universe.id}
                to={`/universes/${universe.id}`}
                className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 transition hover:border-white/16 hover:bg-white/[0.05]"
              >
                <div className="text-lg font-semibold text-ink">{universe.name}</div>
                <div className="mt-2 text-sm leading-7 text-ink-muted">
                  {universe.description || "No description written yet."}
                </div>
              </Link>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
