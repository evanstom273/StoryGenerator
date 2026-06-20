import { Link } from "react-router-dom";
import { useMemo } from "react";
import { buttonClasses } from "../components/ui/Button";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";
import { useUiPrefs } from "../app/ui/UiPrefsContext";
import { useChangelog } from "../app/versioning/ChangelogContext";
import { formatRelativeTime } from "../lib/dates";
import { APP_VERSION, CHANGELOG } from "../app/versioning/version";
import { cn } from "../utils/cn";

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

export function HomePage() {
  const {
    stories,
    universes,
    playerCharacters,
    getPlayerCharacterById,
    getUniverseById,
    getStoriesForUniverse,
  } = useStoryEngine();
  const { showArchivedStories } = useUiPrefs();
  const { openChangelog } = useChangelog();

  const visibleStories = useMemo(
    () => stories.filter((s) => (showArchivedStories ? true : !s.isArchived)),
    [showArchivedStories, stories],
  );

  const heroStory = visibleStories[0];
  const heroUniverse = heroStory ? getUniverseById(heroStory.universeId) : undefined;
  const heroCharacter = heroStory ? getPlayerCharacterById(heroStory.playerCharacterId) : undefined;

  const recentStories = visibleStories.slice(0, 5);
  const recentUniverses = universes.slice(0, 4);

  const libraryCharacters = useMemo(
    () => playerCharacters.filter((c) => (c.scope ?? "library") === "library").slice(0, 5),
    [playerCharacters],
  );

  const changelogEntries = useMemo(() => {
    const versions = Object.keys(CHANGELOG).reverse().slice(0, 3);
    return versions.map((v, i) => ({ version: v, entry: CHANGELOG[v]!, isLatest: i === 0 }));
  }, []);

  return (
    <div className="flex min-h-full flex-col">

      {/* ── Hero: Now Playing ── */}
      <div className="-mx-4 -mt-6 flex-shrink-0 border-b border-divider/[0.4] sm:-mx-6 sm:-mt-6 lg:-mx-10 lg:-mt-10">
        <div className="relative overflow-hidden px-4 pb-8 pt-10 sm:px-6 lg:px-10 lg:pb-8 lg:pt-[42px]">
          {/* Gradient accents */}
          <div
            className="pointer-events-none absolute right-0 top-0 h-[280px] w-[500px]"
            style={{
              background: "radial-gradient(ellipse at 100% 0%, rgb(var(--accent-rgb) / 0.08) 0%, transparent 68%)",
            }}
          />
          <div
            className="pointer-events-none absolute bottom-0 left-[200px] h-[120px] w-[300px]"
            style={{
              background: "radial-gradient(ellipse at 50% 100%, rgb(var(--accent-rgb) / 0.05) 0%, transparent 70%)",
            }}
          />

          <div className="relative">
            {/* Now Playing label */}
            <div className="mb-3.5 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.26em] text-white/20">
              <div className="h-[5px] w-[5px] rounded-full bg-accent" />
              Now Playing
            </div>

            {heroStory ? (
              <>
                <h1 className="mb-4 text-[40px] font-extrabold leading-[1.02] tracking-[-0.04em] text-ink">
                  {heroStory.title}
                </h1>

                <div className="mb-4 flex flex-wrap items-center gap-2.5">
                  {heroUniverse && (
                    <span className="rounded-full border border-accent/[0.24] bg-accent/[0.12] px-3 py-0.5 text-[11px] font-semibold tracking-[0.02em] text-accent-soft">
                      {heroUniverse.name}
                    </span>
                  )}
                  {heroUniverse && heroCharacter && (
                    <span className="inline-block h-3 w-px bg-divider/[0.5]" />
                  )}
                  {heroCharacter && (
                    <span className="text-xs text-ink-muted/[0.6]">{heroCharacter.name}</span>
                  )}
                  <span className="inline-block h-3 w-px bg-divider/[0.5]" />
                  <span className="text-xs text-ink-muted/[0.4]">
                    {formatRelativeTime(heroStory.updatedAt)}
                  </span>
                </div>

                {heroStory.currentSummary && (
                  <p className="mb-5 max-w-[560px] text-[13px] leading-[1.72] text-ink-muted/[0.7]">
                    {heroStory.currentSummary}
                  </p>
                )}

                <Link
                  to={`/stories/${heroStory.id}`}
                  className="inline-flex items-center rounded-[8px] bg-accent px-6 py-[11px] text-[13px] font-bold tracking-[0.015em] text-accent-foreground transition hover:bg-accent-hover"
                >
                  Continue Writing →
                </Link>
              </>
            ) : (
              <div className="py-4">
                <h1 className="mb-4 text-[32px] font-extrabold leading-tight tracking-tight text-ink">
                  Your stories begin here
                </h1>
                <p className="mb-5 max-w-[480px] text-[13px] leading-[1.72] text-ink-muted/[0.7]">
                  Create a universe, add a character, and start your first story.
                </p>
                <Link
                  to="/stories/new"
                  className="inline-flex items-center rounded-[8px] bg-accent px-6 py-[11px] text-[13px] font-bold tracking-[0.015em] text-accent-foreground transition hover:bg-accent-hover"
                >
                  Create Story →
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 2-col layout ── */}
      <div className="grid flex-1 gap-5 pt-5 lg:grid-cols-[1.15fr_0.85fr]">

        {/* Left column */}
        <div className="flex flex-col gap-3.5">

          {/* Recent Stories */}
          <div className="rounded-[10px] border border-divider/[0.45] bg-app px-[18px] py-[15px]">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-white/20">
                Recent Stories
              </span>
              <Link
                to="/stories"
                className="text-[11px] font-medium text-accent transition hover:text-accent-hover"
              >
                All →
              </Link>
            </div>

            <div className="flex flex-col">
              {recentStories.length ? (
                recentStories.map((story, i) => {
                  const universe = getUniverseById(story.universeId);
                  const isFirst = i === 0;
                  return (
                    <Link
                      key={story.id}
                      to={`/stories/${story.id}`}
                      className={cn(
                        "flex items-center justify-between rounded-[7px] px-2.5 py-2 transition hover:bg-white/[0.03]",
                        isFirst ? "bg-panel-muted" : "",
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={cn(
                            "truncate text-xs font-semibold",
                            isFirst ? "text-ink" : "text-ink-muted",
                          )}
                        >
                          {story.title}
                        </span>
                        {universe && (
                          <span className="flex-shrink-0 text-[10px] text-white/22">
                            {universe.name}
                          </span>
                        )}
                      </div>
                      <span className="ml-3 flex-shrink-0 text-[10px] text-white/18">
                        {formatRelativeTime(story.updatedAt)}
                      </span>
                    </Link>
                  );
                })
              ) : (
                <div className="py-3 text-xs text-white/25">No stories yet.</div>
              )}
            </div>
          </div>

          {/* Universes grid */}
          <div className="flex flex-1 flex-col rounded-[10px] border border-divider/[0.45] bg-app px-[18px] py-[15px]">
            <div className="mb-2.5 flex flex-shrink-0 items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-white/20">
                Universes
              </span>
              <Link
                to="/universes"
                className="text-[11px] font-medium text-accent transition hover:text-accent-hover"
              >
                Manage →
              </Link>
            </div>

            <div className="grid flex-1 grid-cols-2 gap-2">
              {recentUniverses.map((universe) => {
                const universeStories = getStoriesForUniverse(universe.id).filter(
                  (s) => !s.isArchived,
                );
                const isActive = universe.id === visibleStories[0]?.universeId;

                return (
                  <Link
                    key={universe.id}
                    to={`/universes/${universe.id}`}
                    className={cn(
                      "flex flex-col justify-between rounded-[9px] border p-3.5 transition",
                      isActive
                        ? "border-accent/[0.11] bg-panel"
                        : "border-transparent bg-panel-muted hover:bg-panel",
                    )}
                  >
                    <div>
                      <div className={cn("mb-0.5 text-xs font-semibold", isActive ? "text-ink" : "text-ink-soft")}>
                        {universe.name}
                      </div>
                      <div className="mb-2 text-[10px] text-white/28">
                        {universe.genreTheme ?? ""}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "w-fit rounded-full px-2 py-0.5 text-[9px] font-semibold",
                        isActive
                          ? "bg-accent/[0.12] text-accent-soft"
                          : "bg-panel text-white/22",
                      )}
                    >
                      {universeStories.length} {universeStories.length === 1 ? "story" : "stories"}
                    </span>
                  </Link>
                );
              })}

              {/* New Universe card */}
              <Link
                to="/universes/new"
                className="flex items-center justify-center gap-1.5 rounded-[9px] border border-dashed border-divider/[0.4] py-4 transition hover:border-divider/[0.55]"
              >
                <span className="text-[15px] leading-none text-white/15">+</span>
                <span className="text-[11px] text-white/15">New World</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-3.5">

          {/* Characters */}
          <div className="rounded-[10px] border border-divider/[0.45] bg-app px-[18px] py-[15px]">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-white/20">
                Characters
              </span>
              <Link
                to="/player-characters"
                className="text-[11px] font-medium text-accent transition hover:text-accent-hover"
              >
                Manage →
              </Link>
            </div>

            <div className="flex flex-col gap-1">
              {libraryCharacters.length ? (
                libraryCharacters.map((character, i) => {
                  const initials = getInitials(character.name);
                  const isFirst = i === 0;
                  const activeStoryCount = stories.filter(
                    (s) => s.playerCharacterId === character.id && !s.isArchived,
                  ).length;

                  return (
                    <Link
                      key={character.id}
                      to={`/player-characters/${character.id}`}
                      className={cn(
                        "flex items-center gap-2.5 rounded-[7px] px-2.5 py-2 transition hover:bg-white/[0.03]",
                        isFirst ? "bg-panel-muted" : "",
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
                          isFirst
                            ? "border-accent/[0.21] bg-accent/[0.12] text-accent-secondary"
                            : "border-divider/[0.5] bg-panel text-white/22",
                        )}
                      >
                        {initials}
                      </div>
                      <div>
                        <div className={cn("text-xs font-medium", isFirst ? "text-ink-soft" : "text-ink-muted")}>
                          {character.name}
                        </div>
                        <div className="text-[10px] text-white/22">
                          {character.characterConcept
                            ? `${character.characterConcept.slice(0, 20)}${character.characterConcept.length > 20 ? "…" : ""}`
                            : activeStoryCount > 0
                              ? `${activeStoryCount} ${activeStoryCount === 1 ? "story" : "stories"}`
                              : "idle"}
                        </div>
                      </div>
                    </Link>
                  );
                })
              ) : (
                <div className="py-2 text-xs text-white/25">No characters yet.</div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="rounded-[10px] border border-divider/[0.45] bg-app px-[18px] py-[15px]">
            <span className="mb-2.5 block text-[9px] font-bold uppercase tracking-[0.22em] text-white/20">
              Quick Actions
            </span>
            <div className="flex flex-col gap-1.5">
              {[
                { label: "New Story", to: "/stories/new" },
                { label: "New Universe", to: "/universes/new" },
                { label: "New Character", to: "/player-characters/new" },
              ].map(({ label, to }) => (
                <Link
                  key={label}
                  to={to}
                  className="flex items-center gap-2.5 rounded-[8px] border border-divider/[0.4] bg-panel-muted px-3 py-2.5 text-xs font-medium text-ink-soft transition hover:border-divider/[0.55] hover:bg-panel"
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="rgb(var(--accent-rgb))"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  >
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                  {label}
                </Link>
              ))}
            </div>
          </div>

          {/* What's New (Changelog) */}
          <div className="flex flex-1 flex-col overflow-hidden rounded-[10px] border border-divider/[0.45] bg-app px-[18px] py-[15px]">
            <div className="mb-2.5 flex flex-shrink-0 items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-white/20">
                What's New
              </span>
              <button
                type="button"
                onClick={openChangelog}
                className="text-[11px] font-medium text-accent transition hover:text-accent-hover"
              >
                All →
              </button>
            </div>
            <div className="flex flex-col gap-2.5 overflow-hidden">
              {changelogEntries.map(({ version, entry, isLatest }, i) => (
                <div key={version}>
                  <span
                    className={cn(
                      "mb-1 inline-block rounded-[3px] px-[7px] py-0.5 font-mono text-[9px] font-bold",
                      isLatest
                        ? "bg-accent/[0.10] text-accent-soft"
                        : "border border-divider/[0.4] bg-panel-muted text-white/18",
                    )}
                  >
                    v{version}
                  </span>
                  <p className={cn("text-xs leading-[1.55]", isLatest ? "text-white/28" : "text-white/18")}>
                    {entry.title}
                    {entry.added?.[0] ? ` — ${entry.added[0]}` : ""}
                  </p>
                  {i < changelogEntries.length - 1 && (
                    <div className="mt-2.5 h-px bg-divider/[0.4]" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* "v{version}" bottom link */}
          <div className="hidden">
            <Link to="/settings" className={buttonClasses({ variant: "ghost", size: "sm" })}>
              v{APP_VERSION}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
