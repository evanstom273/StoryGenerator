import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { BrandMark } from "../../components/BrandMark";
import { buttonClasses } from "../../components/ui/Button";
import { cn } from "../../utils/cn";
import { useStoryEngine } from "../providers/StoryEngineProvider";

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
  const { universes, getStoriesForUniverse, getPlayerCharacterById } = useStoryEngine();
  const [query, setQuery] = useState("");
  const [collapsedUniverses, setCollapsedUniverses] = useState<Record<string, boolean>>(
    {},
  );

  const normalizedQuery = query.trim().toLowerCase();

  const universeRows = useMemo(() => {
    return universes
      .map((universe) => {
        const stories = getStoriesForUniverse(universe.id);
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

        if (universe.name.toLowerCase().includes(normalizedQuery)) {
          return true;
        }

        return stories.some(({ story }) => story.title.toLowerCase().includes(normalizedQuery));
      });
  }, [getPlayerCharacterById, getStoriesForUniverse, normalizedQuery, universes]);

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="px-4 pb-4 pt-5">
        <BrandMark compact />
        <div className="mt-5">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search universes or stories..."
            className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-accent/40 focus:bg-white/[0.06] focus:ring-2 focus:ring-accent/20"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-auto px-3 pb-4">
        {universeRows.map(({ universe, stories }) => {
          const collapsed = collapsedUniverses[universe.id] ?? false;
          const hasActiveStory = stories.some(({ story }) => story.id === activeStoryId);

          return (
            <div
              key={universe.id}
              className={cn(
                "rounded-2xl border border-white/8 bg-white/[0.02] p-2",
                hasActiveStory ? "border-accent/20 bg-accent/6" : "",
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
                      "mt-2 flex items-center gap-2 rounded-xl px-2 py-2 text-sm text-accent-soft transition hover:bg-white/[0.04]",
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
              "flex items-center gap-2 rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-4 py-3 text-sm text-ink-soft transition hover:border-white/20 hover:bg-white/[0.05]",
            )}
          >
            <span className="text-ink-muted">+</span>
            <span>New Universe</span>
          </Link>
        </div>
      </div>

      <div className="border-t border-white/8 p-4">
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
        </div>
      </div>
    </div>
  );
}

