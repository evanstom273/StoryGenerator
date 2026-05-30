import { Link } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { buttonClasses } from "../components/ui/Button";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";

export function UniversesPage() {
  const {
    universes,
    getPlayerCharactersForUniverse,
    getStoriesForUniverse,
  } = useStoryEngine();

  return (
    <div className="space-y-8">
      {universes.length ? (
        <section className="space-y-5">
          <div className="flex flex-col gap-4 border-b border-white/8 pb-6 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                Universes
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink md:text-4xl">
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

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {universes.map((universe) => {
              const storyCount = getStoriesForUniverse(universe.id).length;
              const characterCount = getPlayerCharactersForUniverse(universe.id).length;

              return (
                <Link
                  key={universe.id}
                  to={`/universes/${universe.id}`}
                  className="group rounded-2xl border border-white/8 bg-white/[0.03] p-5 transition hover:border-white/16 hover:bg-white/[0.05]"
                >
                  <div className="text-lg font-semibold text-ink">{universe.name}</div>
                  <div className="mt-3 text-sm leading-7 text-ink-muted">
                    {universe.description || "No description written yet."}
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2 text-xs text-ink-muted">
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
                      {storyCount} {storyCount === 1 ? "story" : "stories"}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
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
