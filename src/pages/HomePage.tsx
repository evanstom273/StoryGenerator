import { Link } from "react-router-dom";
import { useMemo } from "react";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";
import { useUiPrefs } from "../app/ui/UiPrefsContext";
import { APP_VERSION } from "../app/versioning/version";
import { BrandMark } from "../components/BrandMark";
import { buttonClasses } from "../components/ui/Button";

function formatCount(value: number) {
  return value.toString().padStart(2, "0");
}

export function HomePage() {
  const { stories, universes, playerCharacters } = useStoryEngine();
  const { showArchivedStories } = useUiPrefs();

  const visibleStories = useMemo(
    () => stories.filter((story) => (showArchivedStories ? true : !story.isArchived)),
    [showArchivedStories, stories],
  );

  const libraryCharacters = useMemo(
    () => playerCharacters.filter((character) => (character.scope ?? "library") === "library"),
    [playerCharacters],
  );

  const northStarChips = [
    "Story memory",
    "Character relationships",
    "Wiki ingestion",
    "Scene orchestration",
    "Export / import",
    "Local ownership",
    "AI integration",
  ];

  const foundationCards = [
    {
      title: "Continuity comes first",
      body: "Story Engine starts from memory, consequences, and long-running narrative state instead of disposable one-off chats.",
    },
    {
      title: "Built for ensembles",
      body: "The shell already frames stories, characters, and universes as connected systems instead of isolated roleplay threads.",
    },
    {
      title: "User-owned by design",
      body: "The interface is structured around local ownership, future exportability, and preserving story state outside any provider.",
    },
    {
      title: "Canon meets original",
      body: "Universe and character cards make room for original casts to interact with established worlds without losing identity.",
    },
  ];

  const stats = [
    {
      label: "Story shells",
      value: formatCount(visibleStories.length),
      body: "Starter campaigns ready to expand into long-form continuity.",
    },
    {
      label: "Character anchors",
      value: formatCount(libraryCharacters.length),
      body: "A mix of original and canon roles designed for ensemble play.",
    },
    {
      label: "Universe lanes",
      value: formatCount(universes.length),
      body: "Distinct worlds prepared as future ingestion targets.",
    },
  ];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.95fr)]">
        <div className="relative overflow-hidden rounded-[18px] border border-divider/[0.72] bg-app-elevated px-6 py-6 shadow-[0_30px_70px_rgba(0,0,0,0.35)] md:px-8 md:py-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 100% 0%, var(--accent-gradient-start) 0%, var(--accent-gradient-end) 36%, transparent 62%)",
            }}
          />
          <div className="relative z-10 space-y-8">
            <div className="inline-flex items-center rounded-full border border-accent/[0.21] bg-accent/[0.11] px-3 py-1 text-[11px] font-semibold text-accent-soft">
              Application Shell · Version 1
            </div>

            <div className="max-w-3xl space-y-5">
              <div className="flex items-center gap-3">
                <div className="rounded-[12px] border border-divider/[0.8] bg-panel-muted px-3 py-2">
                  <BrandMark compact className="gap-3 [&_span:last-child]:hidden [&_span:first-child]:text-base" />
                </div>
                <div className="rounded-full border border-divider/[0.8] bg-panel-muted px-2.5 py-1 text-[11px] font-medium text-ink-muted">
                  v{APP_VERSION}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.26em] text-accent-soft">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  Now Playing
                </div>
                <h1 className="max-w-4xl text-[42px] font-extrabold leading-[0.95] tracking-[-0.05em] text-ink md:text-[58px]">
                  Create stories inside living fictional worlds.
                </h1>
                <p className="max-w-2xl text-base leading-relaxed text-ink-soft">
                  Story Engine is a modern storytelling workspace for building original
                  characters, placing them beside canon casts, and preserving
                  long-term continuity across ensemble narratives.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link to="/stories/new" className={buttonClasses({ variant: "primary", size: "lg" })}>
                New Story →
              </Link>
              <Link
                to="/universes/import"
                className="inline-flex items-center justify-center rounded-full border border-divider/[0.8] bg-panel-muted px-5 py-[11px] text-[13px] font-semibold text-ink-soft transition hover:border-accent/[0.25] hover:bg-panel"
              >
                Import Universe
              </Link>
              <Link
                to="/player-characters/new"
                className="inline-flex items-center justify-center rounded-full border border-divider/[0.8] bg-panel-muted px-5 py-[11px] text-[13px] font-semibold text-ink-soft transition hover:border-accent/[0.25] hover:bg-panel"
              >
                Create Character
              </Link>
            </div>
          </div>
        </div>

        <div className="rounded-[18px] border border-divider/[0.72] bg-app-elevated px-6 py-6 shadow-[0_30px_70px_rgba(0,0,0,0.28)]">
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-ink-muted/[0.7]">
                Design North Star
              </div>
              <h2 className="max-w-sm text-[34px] font-bold leading-[1.02] tracking-[-0.04em] text-ink">
                A shell that already thinks like a story system.
              </h2>
              <p className="max-w-md text-sm leading-relaxed text-ink-soft">
                Version 1 focuses on structure and clarity: stories, characters,
                universes, and settings are separated cleanly so future memory,
                orchestration, and import systems can drop in without a rewrite.
              </p>
            </div>

            <div className="rounded-[16px] border border-divider/[0.8] bg-app px-4 py-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-ink-muted/[0.7]">
                Future Systems
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {northStarChips.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full border border-divider/[0.8] bg-panel-muted px-3 py-1 text-[11px] font-medium text-ink-soft"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-[18px] border border-divider/[0.72] bg-app-elevated px-6 py-5 shadow-[0_24px_50px_rgba(0,0,0,0.18)]"
          >
            <div className="text-xs text-ink-muted">{stat.label}</div>
            <div className="mt-3 text-[42px] font-bold tracking-[-0.05em] text-ink">
              {stat.value}
            </div>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink-soft">
              {stat.body}
            </p>
          </div>
        ))}
      </section>

      <section className="space-y-5">
        <div className="space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-accent-soft">
            Foundation
          </div>
          <h2 className="text-[34px] font-bold leading-[1.04] tracking-[-0.04em] text-ink">
            Purpose-built for scalable storytelling
          </h2>
        </div>

        <div className="grid gap-4 xl:grid-cols-4 md:grid-cols-2">
          {foundationCards.map((card) => (
            <div
              key={card.title}
              className="rounded-[18px] border border-divider/[0.72] bg-app-elevated px-5 py-5 shadow-[0_24px_50px_rgba(0,0,0,0.18)]"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-divider/[0.8] bg-panel-muted">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="rgb(var(--accent-rgb))"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 3v18" />
                  <path d="M7 8.5c0-1.7 2.2-3 5-3s5 1.3 5 3-2.2 3-5 3-5 1.3-5 3 2.2 3 5 3 5-1.3 5-3" />
                </svg>
              </div>
              <h3 className="mt-5 text-[24px] font-semibold leading-tight tracking-[-0.03em] text-ink">
                {card.title}
              </h3>
              <p className="mt-4 text-sm leading-relaxed text-ink-soft">{card.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
