import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
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
  const {
    universes,
    stories,
    playerCharacters,
    getStoriesForUniverse,
    getPlayerCharacterById,
    getUniverseById,
  } = useStoryEngine();
  const { showArchivedStories, setShowArchivedStories } = useUiPrefs();
  const [query, setQuery] = useState("");
  const [collapsedUniverses, setCollapsedUniverses] = useState<Record<string, boolean>>({});

  const normalizedQuery = query.trim().toLowerCase();
  const activeStory = stories.find((story) => story.id === activeStoryId);
  const activeUniverseId = activeStory?.universeId ?? stories[0]?.universeId ?? null;

  const universeRows = useMemo(() => {
    return universes
      .map((universe) => {
        const storyRows = getStoriesForUniverse(universe.id)
          .filter((story) => showArchivedStories || !story.isArchived)
          .map((story) => {
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
    <div className={cn("flex h-full flex-col bg-app", className)}>
      <div className="border-b border-divider/[0.7] px-4 pb-4 pt-5">
        <BrandMark compact />
        <div className="mt-5 space-y-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search universes or stories..."
            className="w-full rounded-[8px] border border-divider bg-panel-muted px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted/[0.6] focus:border-accent/[0.4] focus:outline-none focus:ring-2 focus:ring-accent/[0.15]"
          />
          <button
            type="button"
            className="w-full rounded-[8px] border border-divider bg-panel-muted px-3 py-2.5 text-left text-xs font-medium text-ink-soft transition hover:border-accent/[0.25] hover:bg-panel"
            onClick={() => setShowArchivedStories(!showArchivedStories)}
          >
            {showArchivedStories ? "Archived stories visible" : "Archived stories hidden"}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto px-3 py-4">
        {searchResults ? (
          <div className="space-y-3">
            {[
              {
                title: "Stories",
                items: searchResults.matchedStories.map((story) => ({
                  id: story.id,
                  label: story.title,
                  to: `/stories/${story.id}`,
                })),
              },
              {
                title: "Universes",
                items: searchResults.matchedUniverses.map((universe) => ({
                  id: universe.id,
                  label: universe.name,
                  to: `/universes/${universe.id}`,
                })),
              },
              {
                title: "Characters",
                items: searchResults.matchedCharacters.map((character) => ({
                  id: character.id,
                  label: character.name,
                  to: `/player-characters/${character.id}`,
                })),
              },
            ].map(
              (group) =>
                group.items.length ? (
                  <div
                    key={group.title}
                    className="rounded-[9px] border border-divider/[0.6] bg-panel-muted p-3.5"
                  >
                    <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-ink-muted/[0.5]">
                      {group.title}
                    </div>
                    <div className="mt-2 space-y-1">
                      {group.items.map((item) => (
                        <Link
                          key={item.id}
                          to={item.to}
                          onClick={onNavigate}
                          className="block rounded-[7px] px-2.5 py-2 text-sm text-ink-soft transition hover:bg-panel"
                        >
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null,
            )}
          </div>
        ) : null}

        {universeRows.map(({ universe, stories: universeStories }) => {
          const collapsed = collapsedUniverses[universe.id] ?? false;
          const hasActiveStory = universeStories.some(({ story }) => story.id === activeStoryId);
          const isActiveUniverse = universe.id === activeUniverseId;

          return (
            <div
              key={universe.id}
              className={cn(
                "rounded-[9px] border border-divider/[0.6] bg-panel-muted p-2",
                isActiveUniverse || hasActiveStory
                  ? "border-accent/[0.24] bg-accent/[0.11]"
                  : "",
              )}
            >
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-[7px] px-2.5 py-2 text-left transition hover:bg-panel"
                onClick={() =>
                  setCollapsedUniverses((current) => ({
                    ...current,
                    [universe.id]: !collapsed,
                  }))
                }
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-ink">{universe.name}</div>
                  <div className="mt-0.5 text-xs text-ink-muted">
                    {universeStories.length} {universeStories.length === 1 ? "story" : "stories"}
                  </div>
                </div>
                <div className="shrink-0 text-xs text-ink-muted">{collapsed ? "▸" : "▾"}</div>
              </button>

              {!collapsed ? (
                <div className="mt-1 space-y-1">
                  {universeStories.length ? (
                    universeStories.map(({ story }) => {
                      const isActive = story.id === activeStoryId;

                      return (
                        <Link
                          key={story.id}
                          to={`/stories/${story.id}`}
                          onClick={onNavigate}
                          className={cn(
                            "flex items-center gap-2 rounded-[7px] px-2.5 py-2 text-sm transition",
                            isActive
                              ? "bg-panel-muted text-ink"
                              : "text-ink-soft hover:bg-panel",
                          )}
                        >
                          <span className="text-ink-muted">#</span>
                          <span className="truncate">{story.title}</span>
                        </Link>
                      );
                    })
                  ) : (
                    <div className="rounded-[7px] px-2.5 py-2 text-xs text-ink-muted">
                      No stories yet.
                    </div>
                  )}

                  <Link
                    to="/stories/new"
                    onClick={onNavigate}
                    className="mt-1 flex items-center gap-2 rounded-[7px] border border-dashed border-divider/[0.5] px-2.5 py-2 text-sm text-ink-muted/[0.35] transition hover:border-divider hover:text-ink-soft"
                  >
                    <span>+</span>
                    <span>New Story</span>
                  </Link>
                </div>
              ) : null}
            </div>
          );
        })}

        <Link
          to="/universes/new"
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-[8px] border border-dashed border-divider/[0.5] px-4 py-3 text-sm text-ink-muted/[0.35] transition hover:border-divider hover:text-ink-soft"
        >
          <span>+</span>
          <span>New Universe</span>
        </Link>
      </div>

      <div className="border-t border-divider/[0.7] p-4">
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
