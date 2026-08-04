import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { buttonClasses } from "../components/ui/Button";
import { GLOBAL_META_CHAT_SCOPE_ID } from "../lib/metaChatScope";
import { META_CHAT_OPEN_STORAGE_KEY } from "../lib/jobNotifications";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";
import { useUiPrefs } from "../app/ui/UiPrefsContext";
import { useChangelog } from "../app/versioning/ChangelogContext";
import { formatRelativeTime } from "../lib/dates";
import { APP_VERSION, CHANGELOG } from "../app/versioning/version";
import { cn } from "../utils/cn";

function includesQuery(query: string, values: Array<string | undefined | null>) {
  if (!query) return true;
  return values.some((value) => value?.toLowerCase().includes(query));
}

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
  const { showArchivedStories, setShowArchivedStories } = useUiPrefs();
  const { openChangelog } = useChangelog();
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();

  function openLibraryMetaChat() {
    try {
      localStorage.setItem(META_CHAT_OPEN_STORAGE_KEY, GLOBAL_META_CHAT_SCOPE_ID);
    } catch {}
    window.dispatchEvent(new Event("story-engine:open-global-metachat"));
  }

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

  const searchResults = useMemo(() => {
    if (!normalizedQuery) return null;
    return {
      matchedStories: visibleStories
        .filter((s) => includesQuery(normalizedQuery, [s.title, s.currentSummary, getUniverseById(s.universeId)?.name]))
        .slice(0, 8),
      matchedUniverses: universes
        .filter((u) => includesQuery(normalizedQuery, [u.name, u.description, u.concept, u.genreTheme, u.tone, u.universeBlueprint, u.notes, u.wikiUrl]))
        .slice(0, 6),
      matchedCharacters: playerCharacters
        .filter((c) => (c.scope ?? "library") === "library")
        .filter((c) => includesQuery(normalizedQuery, [c.name, ...(c.aliases ?? []), c.characterConcept, c.background, c.notes, c.gender, c.pronouns, c.species]))
        .slice(0, 8),
    };
  }, [normalizedQuery, visibleStories, universes, playerCharacters, getUniverseById]);

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

      {/* ── Search ── */}
      <div className="flex-shrink-0 pt-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/25"
              width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search stories, universes, characters…"
              className="w-full rounded-[8px] border border-divider/[0.5] bg-panel-muted py-2 pl-8 pr-3 text-[13px] text-ink outline-none transition placeholder:text-white/25 focus:border-accent/[0.35] focus:ring-2 focus:ring-accent/[0.12]"
            />
          </div>
          <button
            type="button"
            onClick={openLibraryMetaChat}
            className={cn(
              "flex-shrink-0 rounded-[8px] border px-3 py-2 text-[11px] font-medium transition",
              "border-accent/[0.3] bg-accent/[0.08] text-accent-soft hover:bg-accent/[0.14]",
            )}
          >
            Library MetaChat
          </button>
          <button
            type="button"
            onClick={() => setShowArchivedStories(!showArchivedStories)}
            className={cn(
              "flex-shrink-0 rounded-[8px] border px-3 py-2 text-[11px] font-medium transition",
              showArchivedStories
                ? "border-accent/[0.3] bg-accent/[0.08] text-accent-soft"
                : "border-divider/[0.45] bg-panel-muted text-white/35 hover:border-divider/[0.65] hover:text-white/50",
            )}
          >
            {showArchivedStories ? "Archived on" : "Archived off"}
          </button>
        </div>

        {searchResults && (
          <div className="mt-2.5 grid gap-2 rounded-[10px] border border-divider/[0.45] bg-app px-[18px] py-[15px] lg:grid-cols-3">
            {[
              { label: "Stories", items: searchResults.matchedStories, getTo: (s: typeof searchResults.matchedStories[0]) => `/stories/${s.id}`, getName: (s: typeof searchResults.matchedStories[0]) => s.title },
              { label: "Universes", items: searchResults.matchedUniverses, getTo: (u: typeof searchResults.matchedUniverses[0]) => `/universes/${u.id}`, getName: (u: typeof searchResults.matchedUniverses[0]) => u.name },
              { label: "Characters", items: searchResults.matchedCharacters, getTo: (c: typeof searchResults.matchedCharacters[0]) => `/player-characters/${c.id}`, getName: (c: typeof searchResults.matchedCharacters[0]) => c.name },
            ].map(({ label, items, getTo, getName }) => (
              <div key={label}>
                <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.22em] text-white/30">{label}</div>
                <div className="flex flex-col">
                  {items.length ? (
                    (items as any[]).map((item) => (
                      <Link
                        key={item.id}
                        to={getTo(item)}
                        className="truncate rounded-[7px] px-2 py-1.5 text-[13px] text-ink-soft transition hover:bg-white/[0.04]"
                      >
                        {getName(item)}
                      </Link>
                    ))
                  ) : (
                    <div className="px-2 py-1.5 text-[13px] text-white/25">No matches.</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
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
