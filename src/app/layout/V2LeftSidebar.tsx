import { Link, useNavigate } from "react-router-dom";
import { useMemo } from "react";
import { buttonClasses } from "../../components/ui/Button";
import { cn } from "../../utils/cn";
import { useStoryEngine } from "../providers/StoryEngineProvider";
import { APP_VERSION } from "../versioning/version";

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
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
  const navigate = useNavigate();
  const {
    universes,
    stories,
    playerCharacters,
    getStoriesForUniverse,
  } = useStoryEngine();

  const activeStory = useMemo(
    () => (activeStoryId ? stories.find((s) => s.id === activeStoryId) : undefined),
    [activeStoryId, stories],
  );

  const activeUniverseId = useMemo(() => {
    if (activeStory) return activeStory.universeId;
    return stories[0]?.universeId;
  }, [activeStory, stories]);

  const libraryCharacters = useMemo(
    () =>
      playerCharacters
        .filter((c) => (c.scope ?? "library") === "library")
        .slice(0, 6),
    [playerCharacters],
  );

  return (
    <div className={cn("flex h-full flex-col bg-[#0C0C0C]", className)}>

      {/* Header: brandmark + quick actions */}
      <div className="flex-shrink-0 border-b border-[#161616] px-5 pb-4 pt-[22px]">
        <div className="mb-4 flex items-center gap-2.5">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#7C3AED"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="2.2" />
            <path d="M4 14c2.1 3.5 5.3 5.5 8 5.5s5.9-2 8-5.5c-2.1-3.5-5.3-5.5-8-5.5S6.1 10.5 4 14Z" />
            <path d="M9.5 4.5c-1.4 3.8-.9 7.4 1 9.3s5.5 2.4 9.3 1c-1.4-3.8-3.8-6.2-5.7-7.1-1.9-.9-3.8-.8-4.6-3.2Z" />
          </svg>
          <Link
            to="/"
            onClick={onNavigate}
            className="text-[13px] font-bold tracking-[0.07em] text-[#F8FAFC]"
          >
            STORY ENGINE
          </Link>
        </div>

        <div className="flex gap-2">
          <Link
            to="/stories/new"
            onClick={onNavigate}
            className="flex-1 rounded-[7px] border border-[#252525] bg-[#1A1A1A] py-2 text-center text-xs font-medium text-[#DBE4F0] transition hover:bg-[#222]"
          >
            New Story
          </Link>
          <Link
            to="/universes/new"
            onClick={onNavigate}
            className="flex-1 rounded-[7px] bg-[#7C3AED] py-2 text-center text-xs font-semibold text-white transition hover:bg-[#6d28d9]"
          >
            New Universe
          </Link>
        </div>
      </div>

      {/* My Worlds header */}
      <div className="flex flex-shrink-0 items-center justify-between px-[18px] pb-2 pt-3.5">
        <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-white/38">
          My Worlds
        </span>
        <span className="rounded-full bg-[#1A1A1A] px-2 py-0.5 text-[9px] font-semibold text-white/38">
          {universes.length}
        </span>
      </div>

      {/* Universe cards (scrollable) */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2">
        <div className="flex flex-col gap-[5px]">
          {universes.map((universe) => {
            const universeStories = getStoriesForUniverse(universe.id).filter(
              (s) => !s.isArchived,
            );
            const isActive = universe.id === activeUniverseId;

            return (
              <Link
                key={universe.id}
                to={`/universes/${universe.id}`}
                onClick={onNavigate}
                className={cn(
                  "block rounded-[10px] border px-[15px] py-3.5 transition",
                  isActive
                    ? "border-[#7C3AED26] bg-[#7C3AED09]"
                    : "border-[#191919] bg-[#111] hover:border-[#222] hover:bg-[#161616]",
                )}
              >
                <div className="mb-1.5 flex items-start justify-between gap-2">
                  <span
                    className={cn(
                      "text-[13px] font-bold leading-tight",
                      isActive ? "text-[#F8FAFC]" : "text-[#DBE4F0]",
                    )}
                  >
                    {universe.name}
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 flex-shrink-0 rounded-full px-[7px] py-0.5 text-[9px] font-semibold",
                      isActive
                        ? "bg-[#7C3AED1E] text-[#C4B5FD]"
                        : "bg-[#1A1A1A] text-white/38",
                    )}
                  >
                    {universeStories.length}
                  </span>
                </div>
                {universe.description ? (
                  <p className="mb-2 line-clamp-2 text-[11px] leading-[1.55] text-white/48">
                    {universe.description}
                  </p>
                ) : null}
                {universe.genreTheme ? (
                  <span
                    className={cn(
                      "inline-block rounded-full border px-2 py-0.5 text-[9px] font-medium tracking-[0.04em]",
                      isActive
                        ? "border-[#222] bg-[#1A1A1A] text-white/48"
                        : "border-[#1A1A1A] bg-[#111] text-white/38",
                    )}
                  >
                    {universe.genreTheme}
                  </span>
                ) : null}
              </Link>
            );
          })}

          {/* New Universe dashed button */}
          <Link
            to="/universes/new"
            onClick={onNavigate}
            className="flex items-center gap-2 rounded-[10px] border border-dashed border-[#1C1C1C] px-[15px] py-[11px] transition hover:border-[#282828]"
          >
            <span className="text-[15px] leading-none text-white/28">+</span>
            <span className="text-xs text-white/28">New Universe</span>
          </Link>
        </div>
      </div>

      {/* Characters strip */}
      <div className="flex-shrink-0 border-t border-[#161616] px-2.5 pb-0 pt-3">
        <div className="mb-2.5 px-1.5 text-[9px] font-bold uppercase tracking-[0.22em] text-white/38">
          Characters
        </div>
        <div className="flex gap-3 overflow-x-auto px-1.5 pb-3">
          {libraryCharacters.map((character, i) => {
            const initials = getInitials(character.name);
            const isFirst = i === 0;

            return (
              <Link
                key={character.id}
                to={`/player-characters/${character.id}`}
                onClick={onNavigate}
                className="flex flex-col items-center gap-1"
              >
                <div
                  className={cn(
                    "flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
                    isFirst
                      ? "border-[#7C3AED36] bg-[#7C3AED1E] text-[#A78BFA]"
                      : "border-[#222] bg-[#1A1A1A] text-white/38",
                  )}
                >
                  {initials}
                </div>
                <span className="max-w-[40px] truncate text-[9px] text-white/40">
                  {character.name.split(" ")[0]}
                </span>
              </Link>
            );
          })}

          {/* New character button */}
          <Link
            to="/player-characters/new"
            onClick={onNavigate}
            className="flex flex-col items-center gap-1"
          >
            <div className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-full border border-dashed border-[#1C1C1C] bg-[#111]">
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="rgba(255,255,255,0.15)"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            </div>
            <span className="text-[9px] text-white/28">New</span>
          </Link>
        </div>
      </div>

      {/* Footer */}
      <div className="flex flex-shrink-0 items-center justify-between border-t border-[#161616] px-[18px] py-2.5">
        <span className="font-mono text-[10px] text-white/28">v{APP_VERSION}</span>
        <Link
          to="/settings"
          onClick={onNavigate}
          className="flex items-center gap-1.5 text-white/38 transition hover:text-white/40"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2.75v3" />
            <path d="m18.54 5.46-2.12 2.12" />
            <path d="M21.25 12h-3" />
            <path d="m18.54 18.54-2.12-2.12" />
            <path d="M12 18.25v3" />
            <path d="m7.58 16.42-2.12 2.12" />
            <path d="M5.75 12h-3" />
            <path d="m7.58 7.58-2.12-2.12" />
            <circle cx="12" cy="12" r="3.5" />
          </svg>
          <span className="text-[11px]">Settings</span>
        </Link>
      </div>

      {/* Hidden accessibility links */}
      <div className="sr-only">
        <Link to="/player-characters" onClick={onNavigate}
          className={buttonClasses({ variant: "ghost", className: "w-full justify-start" })}>
          Manage Characters
        </Link>
        <Link to="/universes" onClick={onNavigate}
          className={buttonClasses({ variant: "ghost", className: "w-full justify-start" })}>
          Manage Universes
        </Link>
        <button
          type="button"
          onClick={() => { navigate("/developer-notes"); onNavigate?.(); }}
          className={buttonClasses({ variant: "ghost", className: "w-full justify-start" })}
        >
          Developer Notes
        </button>
      </div>
    </div>
  );
}
