import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { buttonClasses } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";
import { StoryListRow } from "../components/story/StoryListRow";
import { useUiPrefs } from "../app/ui/UiPrefsContext";

function includesQuery(query: string, values: Array<string | undefined | null>) {
  if (!query) return true;
  return values.some((value) => value?.toLowerCase().includes(query));
}

export function HomePage() {
  const {
    stories,
    universes,
    playerCharacters,
    getPlayerCharacterById,
    getUniverseById,
  } = useStoryEngine();
  const { showArchivedStories, setShowArchivedStories } = useUiPrefs();
  const [query, setQuery] = useState("");

  const normalizedQuery = query.trim().toLowerCase();

  const visibleStories = useMemo(
    () => stories.filter((story) => (showArchivedStories ? true : !story.isArchived)),
    [showArchivedStories, stories],
  );

  const continueStory = visibleStories[0];
  const recentStories = visibleStories.slice(0, 8);
  const recentUniverses = universes.slice(0, 6);

  const searchResults = useMemo(() => {
    if (!normalizedQuery) {
      return null;
    }

    const matchedStories = visibleStories
      .filter((story) =>
        includesQuery(normalizedQuery, [
          story.title,
          story.currentSummary,
          getUniverseById(story.universeId)?.name,
        ]),
      )
      .slice(0, 8);
    const matchedUniverses = universes
      .filter((universe) =>
        includesQuery(normalizedQuery, [
          universe.name,
          universe.description,
          universe.concept,
          universe.genreTheme,
          universe.tone,
          universe.universeBlueprint,
          universe.notes,
          universe.wikiUrl,
        ]),
      )
      .slice(0, 6);
    const matchedCharacters = playerCharacters
      .filter((character) => (character.scope ?? "library") === "library")
      .filter((character) =>
        includesQuery(normalizedQuery, [
          character.name,
          character.characterConcept,
          character.background,
          character.goals,
          character.notes,
          character.gender,
          character.pronouns,
          character.species,
        ]),
      )
      .slice(0, 8);

    return { matchedStories, matchedUniverses, matchedCharacters };
  }, [getUniverseById, normalizedQuery, playerCharacters, universes, visibleStories]);

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <Panel padding="lg" className="bg-gradient-to-br from-white/[0.06] to-white/[0.03]">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
              Search
            </div>
            <button
              type="button"
              className="rounded-2xl border border-divider bg-panel-muted px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft transition hover:bg-panel-strong"
              onClick={() => setShowArchivedStories(!showArchivedStories)}
            >
              {showArchivedStories ? "Showing archived" : "Hiding archived"}
            </button>
          </div>
          <div className="mt-4">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search stories, universes, characters..."
              className="w-full rounded-2xl border border-divider bg-panel-muted px-4 py-3 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-accent/60 focus:bg-panel-strong focus:ring-2 focus:ring-accent/25"
            />
          </div>

          {searchResults ? (
            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              <div className="rounded-2xl border border-white/8 bg-black/10 p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                  Stories
                </div>
                <div className="mt-2 space-y-1">
                  {searchResults.matchedStories.length ? (
                    searchResults.matchedStories.map((story) => (
                      <Link
                        key={story.id}
                        to={`/stories/${story.id}`}
                        className="block truncate rounded-xl px-2 py-2 text-sm text-ink-soft transition hover:bg-white/[0.04]"
                      >
                        {story.title}
                      </Link>
                    ))
                  ) : (
                    <div className="px-2 py-2 text-sm text-ink-muted">No story matches.</div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-white/8 bg-black/10 p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                  Universes
                </div>
                <div className="mt-2 space-y-1">
                  {searchResults.matchedUniverses.length ? (
                    searchResults.matchedUniverses.map((universe) => (
                      <Link
                        key={universe.id}
                        to={`/universes/${universe.id}`}
                        className="block truncate rounded-xl px-2 py-2 text-sm text-ink-soft transition hover:bg-white/[0.04]"
                      >
                        {universe.name}
                      </Link>
                    ))
                  ) : (
                    <div className="px-2 py-2 text-sm text-ink-muted">No universe matches.</div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-white/8 bg-black/10 p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                  Characters
                </div>
                <div className="mt-2 space-y-1">
                  {searchResults.matchedCharacters.length ? (
                    searchResults.matchedCharacters.map((character) => (
                      <Link
                        key={character.id}
                        to={`/player-characters/${character.id}`}
                        className="block truncate rounded-xl px-2 py-2 text-sm text-ink-soft transition hover:bg-white/[0.04]"
                      >
                        {character.name}
                      </Link>
                    ))
                  ) : (
                    <div className="px-2 py-2 text-sm text-ink-muted">No character matches.</div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </Panel>
      </section>

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
                {continueStory.currentSummary || "No summary yet."}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  to={`/stories/${continueStory.id}`}
                  className={buttonClasses({ variant: "primary", size: "lg" })}
                >
                  Continue
                </Link>
                <Link
                  to="/stories/new"
                  className={buttonClasses({ variant: "secondary", size: "lg" })}
                >
                  New Story
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
