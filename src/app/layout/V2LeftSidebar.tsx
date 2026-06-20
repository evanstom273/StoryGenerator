import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { BrandMark } from "../../components/BrandMark";
import { buttonClasses } from "../../components/ui/Button";
import { cn } from "../../utils/cn";
import { useStoryEngine } from "../providers/StoryEngineProvider";
import { useUiPrefs } from "../ui/UiPrefsContext";
import { APP_NAME, APP_VERSION } from "../versioning/version";

function includesQuery(query: string, values: Array<string | undefined | null>) {
  if (!query) return true;
  return values.some((value) => value?.toLowerCase().includes(query));
}

interface V2LeftSidebarProps {
  activeStoryId?: string;
  className?: string;
  onNavigate?: () => void;
}

export function V2LeftSidebar({
  activeStoryId,
  className,
  onNavigate,
}: V2LeftSidebarProps) {
  const { universes, stories, playerCharacters, getStoriesForUniverse, getPlayerCharacterById, getUniverseById } =
    useStoryEngine();
  const { showArchivedStories, setShowArchivedStories } = useUiPrefs();
  const [query, setQuery] = useState("");
  const [collapsedUniverses, setCollapsedUniverses] = useState<Record<string, boolean>>(
    {},
  );

  useEffect(() => {
    // #region debug-point version-mismatch:sidebar-version
    void fetch("http://127.0.0.1:7777/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "in-app-version-mismatch",
        runId: "pre-fix",
        hypothesisId: "A",
        location: "V2LeftSidebar.tsx",
        msg: "[DEBUG] sidebar version render",
        data: {
          appVersion: APP_VERSION,
          href: typeof window !== "undefined" ? window.location.href : null,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        },
        ts: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, []);

  const normalizedQuery = query.trim().toLowerCase();

  const universeRows = useMemo(() => {
    return universes
      .map((universe) => {
        const stories = getStoriesForUniverse(universe.id).filter(
          (story) => showArchivedStories || !story.isArchived,
        );
        const storyRows = stories.map((story) => {
          const playerCharacter = getPlayerCharacterById(story.playerCharacterId);
          return {
            story,
            playerCharacterName: playerCharacter?.name ?? "Unknown character",
          };
        });

        return { universe, stories: storyRows };
      })
      .filter(({ universe, stories }) => {
        if (!normalizedQuery) {
          return true;
        }

        if (
          includesQuery(normalizedQuery, [
            universe.name,
            universe.description,
            universe.concept,
            universe.genreTheme,
            universe.tone,
            universe.universeBlueprint,
            universe.notes,
            universe.wikiUrl,
          ])
        ) {
          return true;
        }

        return stories.some(({ story, playerCharacterName }) =>
          includesQuery(normalizedQuery, [
            story.title,
            story.currentSummary,
            playerCharacterName,
          ]),
        );
      });
  }, [getPlayerCharacterById, getStoriesForUniverse, normalizedQuery, showArchivedStories, universes]);

  const searchResults = useMemo(() => {
    if (!normalizedQuery) {
      return null;
    }

    const matchedStories = stories
      .filter((story) => (showArchivedStories ? true : !story.isArchived))
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
  }, [getUniverseById, normalizedQuery, playerCharacters, showArchivedStories, stories, universes]);

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="px-4 pb-4 pt-5">
        <BrandMark compact />
        <div className="mt-5">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search universes or stories..."
            className="w-full rounded-2xl border border-divider bg-panel-muted px-4 py-3 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-accent/60 focus:bg-panel-strong focus:ring-2 focus:ring-accent/25"
          />
        </div>
        <button
          type="button"
          className="mt-3 w-full rounded-2xl border border-divider bg-panel-muted px-4 py-2 text-left text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft transition hover:bg-panel-strong"
          onClick={() => setShowArchivedStories(!showArchivedStories)}
        >
          {showArchivedStories ? "Showing archived" : "Hiding archived"}
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-auto px-3 pb-4">
        {searchResults ? (
          <div className="space-y-2">
            {searchResults.matchedStories.length ? (
              <div className="rounded-2xl border border-divider bg-panel-muted p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                  Stories
                </div>
                <div className="mt-2 space-y-1">
                  {searchResults.matchedStories.map((story) => (
                    <Link
                      key={story.id}
                      to={`/stories/${story.id}`}
                      onClick={onNavigate}
                      className="block truncate rounded-xl px-2 py-2 text-sm text-ink-soft transition hover:bg-white/[0.04]"
                    >
                      {story.title}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}

            {searchResults.matchedUniverses.length ? (
              <div className="rounded-2xl border border-divider bg-panel-muted p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                  Universes
                </div>
                <div className="mt-2 space-y-1">
                  {searchResults.matchedUniverses.map((universe) => (
                    <Link
                      key={universe.id}
                      to={`/universes/${universe.id}`}
                      onClick={onNavigate}
                      className="block truncate rounded-xl px-2 py-2 text-sm text-ink-soft transition hover:bg-white/[0.04]"
                    >
                      {universe.name}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}

            {searchResults.matchedCharacters.length ? (
              <div className="rounded-2xl border border-divider bg-panel-muted p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                  Characters
                </div>
                <div className="mt-2 space-y-1">
                  {searchResults.matchedCharacters.map((character) => (
                    <Link
                      key={character.id}
                      to={`/player-characters/${character.id}`}
                      onClick={onNavigate}
                      className="block truncate rounded-xl px-2 py-2 text-sm text-ink-soft transition hover:bg-white/[0.04]"
                    >
                      {character.name}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {universeRows.map(({ universe, stories }) => {
          const collapsed = collapsedUniverses[universe.id] ?? false;
          const hasActiveStory = stories.some(({ story }) => story.id === activeStoryId);

          return (
            <div
              key={universe.id}
              className={cn(
                "rounded-2xl border border-divider bg-panel-muted p-2 ring-1 ring-accent/8",
                hasActiveStory ? "border-accent/35 bg-accent/10 ring-accent/12" : "",
              )}
            >
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-white/[0.04]"
                onClick={() =>
                  setCollapsedUniverses((current) => ({
                    ...current,
                    [universe.id]: !collapsed,
                  }))
                }
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-ink">
                    {universe.name}
                  </div>
                  <div className="mt-0.5 text-xs text-ink-muted">
                    {stories.length} {stories.length === 1 ? "story" : "stories"}
                  </div>
                </div>
                <div className="shrink-0 text-xs text-ink-muted">
                  {collapsed ? "▸" : "▾"}
                </div>
              </button>

              {!collapsed ? (
                <div className="mt-1 space-y-1">
                  {stories.length ? (
                    stories.map(({ story }) => {
                      const isActive = story.id === activeStoryId;

                      return (
                        <Link
                          key={story.id}
                          to={`/stories/${story.id}`}
                          onClick={onNavigate}
                          className={cn(
                            "flex items-center gap-2 rounded-xl px-2 py-2 text-sm transition",
                            isActive
                              ? "bg-accent/14 text-ink"
                              : "text-ink-soft hover:bg-white/[0.04]",
                          )}
                        >
                          <span className="text-ink-muted">#</span>
                          <span className="truncate">{story.title}</span>
                        </Link>
                      );
                    })
                  ) : (
                    <div className="px-2 py-2 text-xs text-ink-muted">
                      No stories yet.
                    </div>
                  )}

                  <Link
                    to="/stories/new"
                    onClick={onNavigate}
                    className={cn(
                      "mt-2 flex items-center gap-2 rounded-xl px-2 py-2 text-sm text-accent-soft transition hover:bg-panel-strong",
                    )}
                  >
                    <span className="text-ink-muted">+</span>
                    <span>New Story</span>
                  </Link>
                </div>
              ) : null}
            </div>
          );
        })}

        <div className="pt-2">
          <Link
            to="/universes/new"
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2 rounded-2xl border border-dashed border-divider bg-panel-muted px-4 py-3 text-sm text-ink-soft transition hover:border-accent/25 hover:bg-panel-strong",
            )}
          >
            <span className="text-ink-muted">+</span>
            <span>New Universe</span>
          </Link>
        </div>
      </div>

      <div className="border-t border-divider p-4">
        <div className="grid gap-2">
          <Link
            to="/settings"
            onClick={onNavigate}
            className={buttonClasses({ variant: "ghost", className: "w-full justify-start" })}
          >
            Settings
          </Link>
          <Link
            to="/universes"
            onClick={onNavigate}
            className={buttonClasses({ variant: "ghost", className: "w-full justify-start" })}
          >
            Manage Universes
          </Link>
          <Link
            to="/player-characters"
            onClick={onNavigate}
            className={buttonClasses({ variant: "ghost", className: "w-full justify-start" })}
          >
            Manage Characters
          </Link>
          <Link
            to="/developer-notes"
            onClick={onNavigate}
            className={buttonClasses({ variant: "ghost", className: "w-full justify-start" })}
          >
            Developer Notes
          </Link>
        </div>
        <div className="mt-4 text-center text-xs text-ink-muted">
          {APP_NAME} v{APP_VERSION}
        </div>
      </div>
    </div>
  );
}
