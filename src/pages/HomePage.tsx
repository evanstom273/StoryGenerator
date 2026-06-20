import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { StoryListRow } from "../components/story/StoryListRow";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";
import { useUiPrefs } from "../app/ui/UiPrefsContext";
import { useChangelog } from "../app/versioning/ChangelogContext";
import { APP_VERSION, CHANGELOG } from "../app/versioning/version";
import { Badge } from "../components/ui/Badge";
import { buttonClasses } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";

function includesQuery(query: string, values: Array<string | undefined | null>) {
  if (!query) return true;
  return values.some((value) => value?.toLowerCase().includes(query));
}

function compareSemverDesc(left: string, right: string) {
  const leftParts = left.split(".").map((part) => Number(part));
  const rightParts = right.split(".").map((part) => Number(part));

  for (let index = 0; index < 3; index += 1) {
    const difference = (rightParts[index] ?? 0) - (leftParts[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
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
  const { openChangelog, openChangelogHistory } = useChangelog();
  const [query, setQuery] = useState("");

  const normalizedQuery = query.trim().toLowerCase();

  const visibleStories = useMemo(
    () => stories.filter((story) => (showArchivedStories ? true : !story.isArchived)),
    [showArchivedStories, stories],
  );

  const continueStory = visibleStories[0];
  const recentStories = visibleStories.slice(0, 8);
  const recentUniverses = universes.slice(0, 6);
  const changelogVersions = useMemo(
    () => Object.keys(CHANGELOG).sort(compareSemverDesc).slice(0, 4),
    [],
  );

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
    <div className="space-y-8">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]">
        <Panel padding="lg" className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-ink-muted/[0.5]">
                Search & Resume
              </div>
              <div className="max-w-3xl">
                <h1 className="text-[28px] font-extrabold tracking-[-0.03em] text-ink md:text-[40px]">
                  Story Engine, but dressed like a midnight literary quarterly.
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                  Search your stories, pick up the active thread, and jump straight
                  back into continuity without the UI looking like it lost a fight
                  with a neon dashboard template.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="rounded-[8px] border border-divider bg-panel-muted px-3 py-2.5 text-xs font-medium text-ink-soft transition hover:border-accent/[0.25] hover:bg-panel"
              onClick={() => setShowArchivedStories(!showArchivedStories)}
            >
              {showArchivedStories ? "Archived stories visible" : "Archived stories hidden"}
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search stories, universes, characters..."
              className="w-full rounded-[8px] border border-divider bg-panel-muted px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted/[0.6] focus:border-accent/[0.4] focus:outline-none focus:ring-2 focus:ring-accent/[0.15]"
            />
            <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3">
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
                New Character
              </Link>
            </div>
          </div>

          {searchResults ? (
            <div className="grid gap-3 lg:grid-cols-3">
              {[
                {
                  title: "Stories",
                  empty: "No story matches.",
                  items: searchResults.matchedStories.map((story) => ({
                    id: story.id,
                    label: story.title,
                    to: `/stories/${story.id}`,
                  })),
                },
                {
                  title: "Universes",
                  empty: "No universe matches.",
                  items: searchResults.matchedUniverses.map((universe) => ({
                    id: universe.id,
                    label: universe.name,
                    to: `/universes/${universe.id}`,
                  })),
                },
                {
                  title: "Characters",
                  empty: "No character matches.",
                  items: searchResults.matchedCharacters.map((character) => ({
                    id: character.id,
                    label: character.name,
                    to: `/player-characters/${character.id}`,
                  })),
                },
              ].map((group) => (
                <div key={group.title} className="rounded-[9px] border border-divider/[0.6] bg-panel-muted p-3.5">
                  <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-ink-muted/[0.5]">
                    {group.title}
                  </div>
                  <div className="mt-3 space-y-1">
                    {group.items.length ? (
                      group.items.map((item) => (
                        <Link
                          key={item.id}
                          to={item.to}
                          className="block rounded-[7px] px-2.5 py-2 text-sm text-ink-soft transition hover:bg-panel"
                        >
                          {item.label}
                        </Link>
                      ))
                    ) : (
                      <div className="rounded-[7px] px-2.5 py-2 text-sm text-ink-muted">
                        {group.empty}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-[9px] border border-divider/[0.6] bg-panel-muted p-3.5">
                <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-ink-muted/[0.5]">
                  Active Stories
                </div>
                <div className="mt-2 text-lg font-semibold text-ink">{visibleStories.length}</div>
                <div className="mt-2 text-sm leading-relaxed text-ink-soft">
                  Current playable stories available for a return dive.
                </div>
              </div>
              <div className="rounded-[9px] border border-divider/[0.6] bg-panel-muted p-3.5">
                <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-ink-muted/[0.5]">
                  Universes
                </div>
                <div className="mt-2 text-lg font-semibold text-ink">{universes.length}</div>
                <div className="mt-2 text-sm leading-relaxed text-ink-soft">
                  Canon sandboxes ready for chaos, yearning, and admin.
                </div>
              </div>
              <div className="rounded-[9px] border border-divider/[0.6] bg-panel-muted p-3.5">
                <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-ink-muted/[0.5]">
                  Characters
                </div>
                <div className="mt-2 text-lg font-semibold text-ink">{playerCharacters.length}</div>
                <div className="mt-2 text-sm leading-relaxed text-ink-soft">
                  Library protagonists and chaos agents on standby.
                </div>
              </div>
            </div>
          )}
        </Panel>

        <Panel padding="lg" className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-ink-muted/[0.5]">
                What&apos;s New
              </div>
              <h2 className="mt-3 text-lg font-semibold text-ink">Release notes & themes</h2>
            </div>
            <Badge variant="accent">v{APP_VERSION}</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {changelogVersions.map((version) => (
              <button
                key={version}
                type="button"
                onClick={openChangelog}
                className="rounded-full border border-accent/[0.24] bg-accent/[0.12] px-3 py-0.5 text-[11px] font-semibold text-accent-soft transition hover:bg-accent/[0.18]"
              >
                v{version}
              </button>
            ))}
          </div>
          <p className="text-sm leading-relaxed text-ink-soft">
            Tap the current release chips for the latest notes or open the full
            history when you need the archaeological layer.
          </p>
          <button
            type="button"
            onClick={openChangelogHistory}
            className="text-[11px] font-medium text-accent transition hover:text-accent-soft"
          >
            View history →
          </button>
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel padding="lg" className="space-y-5">
          <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-ink-muted/[0.5]">
            Continue Story
          </div>
          {continueStory ? (
            <>
              <div className="space-y-3">
                <h2 className="text-[28px] font-extrabold tracking-[-0.03em] text-ink">
                  {continueStory.title}
                </h2>
                <p className="text-sm leading-relaxed text-ink-soft">
                  {getUniverseById(continueStory.universeId)?.name ?? "Unknown universe"} ·{" "}
                  {getPlayerCharacterById(continueStory.playerCharacterId)?.name ??
                    "Unknown character"}
                </p>
                <p className="text-sm leading-relaxed text-ink-soft">
                  {continueStory.currentSummary || "No summary yet."}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
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
            <EmptyState
              title="No stories yet"
              description="Create your first universe, attach a player character, and start a story."
              action={
                <Link to="/stories/new" className={buttonClasses({ size: "lg" })}>
                  Create Story
                </Link>
              }
            />
          )}
        </Panel>

        <Panel padding="lg" className="h-fit space-y-4">
          <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-ink-muted/[0.5]">
            Quick Actions
          </div>
          <div className="grid gap-3">
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
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-ink-muted/[0.5]">
              Stories
            </div>
            <h2 className="mt-2 text-lg font-semibold text-ink">Recent Stories</h2>
          </div>
          <Link
            to="/stories"
            className="text-[11px] font-medium text-accent transition hover:text-accent-soft"
          >
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
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-ink-muted/[0.5]">
              Universes
            </div>
            <h2 className="mt-2 text-lg font-semibold text-ink">Recent Universes</h2>
          </div>
          <Link
            to="/universes"
            className="text-[11px] font-medium text-accent transition hover:text-accent-soft"
          >
            View all
          </Link>
        </div>
        {recentUniverses.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {recentUniverses.map((universe) => (
              <Link
                key={universe.id}
                to={`/universes/${universe.id}`}
                className="rounded-[9px] border border-divider/[0.6] bg-panel-muted p-3.5 transition hover:bg-panel"
              >
                <div className="text-lg font-semibold text-ink">{universe.name}</div>
                <div className="mt-2 text-sm leading-relaxed text-ink-soft">
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
