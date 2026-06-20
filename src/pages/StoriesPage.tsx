import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { buttonClasses } from "../components/ui/Button";
import { StoryListRow } from "../components/story/StoryListRow";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";
import { useUiPrefs } from "../app/ui/UiPrefsContext";

export function StoriesPage() {
  const {
    stories,
    universes,
    getPlayerCharacterById,
    getUniverseById,
  } = useStoryEngine();
  const { showArchivedStories } = useUiPrefs();

  const [statusFilter, setStatusFilter] = useState<"active" | "archived" | "all">(
    showArchivedStories ? "all" : "active",
  );
  const [sortMode, setSortMode] = useState<"updated" | "created" | "alpha">("updated");
  const [universeFilter, setUniverseFilter] = useState<string>("all");

  const filteredStories = useMemo(() => {
    let result = stories;

    if (statusFilter !== "all") {
      const wantArchived = statusFilter === "archived";
      result = result.filter((story) => Boolean(story.isArchived) === wantArchived);
    }

    if (universeFilter !== "all") {
      result = result.filter((story) => story.universeId === universeFilter);
    }

    if (sortMode === "created") {
      result = [...result].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    } else if (sortMode === "alpha") {
      result = [...result].sort((a, b) => a.title.localeCompare(b.title));
    } else {
      result = [...result].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    }

    return result;
  }, [sortMode, statusFilter, stories, universeFilter]);

  return (
    <div className="space-y-8">
      {filteredStories.length ? (
        <section className="space-y-5">
          <div className="flex flex-col gap-4 border-b border-divider/[0.3] pb-5 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                Stories
              </div>
              <h1 className="mt-2 text-[28px] font-extrabold leading-tight tracking-[-0.03em] text-ink md:text-[34px]">
                Continue a story
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">
                Stories are your active channels. Pick one and keep writing.
              </p>
            </div>
            <Link to="/stories/new" className={buttonClasses()}>
              New Story
            </Link>
          </div>

          <div className="grid gap-3 rounded-xl border border-divider/[0.6] bg-app px-[18px] py-[15px] md:grid-cols-3">
            <label className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-ink-muted">
                Status
              </div>
              <select
                className="w-full rounded-[8px] border border-divider bg-panel-muted px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent/[0.4] focus:ring-2 focus:ring-accent/[0.15]"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as any)}
              >
                <option value="active">Active</option>
                <option value="archived">Archived</option>
                <option value="all">All</option>
              </select>
            </label>

            <label className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-ink-muted">
                Universe
              </div>
              <select
                className="w-full rounded-[8px] border border-divider bg-panel-muted px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent/[0.4] focus:ring-2 focus:ring-accent/[0.15]"
                value={universeFilter}
                onChange={(event) => setUniverseFilter(event.target.value)}
              >
                <option value="all">All universes</option>
                {universes.map((universe) => (
                  <option key={universe.id} value={universe.id}>
                    {universe.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-ink-muted">
                Sort
              </div>
              <select
                className="w-full rounded-[8px] border border-divider bg-panel-muted px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent/[0.4] focus:ring-2 focus:ring-accent/[0.15]"
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as any)}
              >
                <option value="updated">Recently updated</option>
                <option value="created">Recently created</option>
                <option value="alpha">Alphabetical</option>
              </select>
            </label>
          </div>

          <div className="space-y-2">
            {filteredStories.map((story) => (
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
