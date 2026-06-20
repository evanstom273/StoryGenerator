import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { buttonClasses } from "../components/ui/Button";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";

export function UniversesPage() {
  const {
    universes,
    getPlayerCharactersForUniverse,
    getStoriesForUniverse,
  } = useStoryEngine();
  const [sortMode, setSortMode] = useState<"created" | "alpha">("created");

  const sortedUniverses = useMemo(() => {
    const items = [...universes];
    if (sortMode === "alpha") {
      items.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return items;
  }, [sortMode, universes]);

  return (
    <div className="space-y-8">
      {sortedUniverses.length ? (
        <section className="space-y-5">
          <div className="flex flex-col gap-4 border-b border-divider/[0.5] pb-6 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                Universes
              </div>
              <h1 className="mt-3 text-[32px] font-extrabold leading-tight tracking-[-0.03em] text-ink md:text-[40px]">
                Fictional worlds
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-muted md:text-base">
                Each universe holds the context your stories live inside.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/universes/new" className={buttonClasses()}>
                New Universe
              </Link>
              <Link to="/universes/import" className={buttonClasses({ variant: "secondary" })}>
                Import Universe
              </Link>
            </div>
          </div>

          <div className="grid gap-3 rounded-xl border border-divider/[0.6] bg-app px-[18px] py-[15px] md:grid-cols-2">
            <label className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-ink-muted">
                Sort
              </div>
              <select
                className="w-full rounded-[8px] border border-divider bg-panel-muted px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent/[0.4] focus:ring-2 focus:ring-accent/[0.15]"
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as "created" | "alpha")}
              >
                <option value="created">Recently created</option>
                <option value="alpha">Alphabetical</option>
              </select>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sortedUniverses.map((universe) => {
              const storyCount = getStoriesForUniverse(universe.id).length;
              const characterCount = getPlayerCharactersForUniverse(universe.id).length;

              return (
                <Link
                  key={universe.id}
                  to={`/universes/${universe.id}`}
                  className="group rounded-xl border border-divider/[0.6] bg-panel-muted p-4 transition hover:border-divider hover:bg-panel"
                >
                  <div className="text-lg font-semibold text-ink">{universe.name}</div>
                  <div className="mt-3 text-sm leading-7 text-ink-muted">
                    {universe.description || "No description written yet."}
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2 text-xs text-ink-muted">
                    <span className="rounded-full border border-divider/[0.5] bg-app/50 px-3 py-1">
                      {storyCount} {storyCount === 1 ? "story" : "stories"}
                    </span>
                    <span className="rounded-full border border-divider/[0.5] bg-app/50 px-3 py-1">
                      {characterCount}{" "}
                      {characterCount === 1 ? "character" : "characters"}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
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
