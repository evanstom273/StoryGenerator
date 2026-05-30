import { Link } from "react-router-dom";
import { BrandMark } from "../components/BrandMark";
import { EmptyState } from "../components/EmptyState";
import { CharacterCard } from "../components/cards/CharacterCard";
import { StoryCard } from "../components/cards/StoryCard";
import { UniverseCard } from "../components/cards/UniverseCard";
import { ArrowRightIcon, PlusIcon } from "../components/icons";
import { buttonClasses } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";

function ActionPanel({
  title,
  description,
  to,
}: {
  title: string;
  description: string;
  to: string;
}) {
  return (
    <Panel className="h-full">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-accent/20 bg-accent/12 text-accent-soft">
        <PlusIcon className="h-5 w-5" />
      </div>
      <h2 className="mt-5 text-lg font-semibold text-ink">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-ink-muted">{description}</p>
      <Link to={to} className={buttonClasses({ className: "mt-6" })}>
        Open
        <ArrowRightIcon className="h-4 w-4" />
      </Link>
    </Panel>
  );
}

function SectionHeader({
  title,
  to,
}: {
  title: string;
  to: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 className="text-2xl font-semibold tracking-tight text-ink">{title}</h2>
      <Link
        to={to}
        className={buttonClasses({ variant: "ghost", size: "sm" })}
      >
        View all
      </Link>
    </div>
  );
}

export function HomePage() {
  const {
    stories,
    universes,
    playerCharacters,
    getMessagesForStory,
    getPlayerCharacterById,
    getStoriesForPlayerCharacter,
    getStoriesForUniverse,
    getUniverseById,
    getPlayerCharactersForUniverse,
  } = useStoryEngine();

  const recentStories = stories.slice(0, 3);
  const recentUniverses = universes.slice(0, 3);
  const recentPlayerCharacters = playerCharacters.slice(0, 3);

  return (
    <div className="space-y-10">
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.85fr)]">
        <Panel
          padding="lg"
          className="overflow-hidden bg-gradient-to-br from-white/[0.06] to-white/[0.03] shadow-hero"
        >
          <BrandMark className="mt-1" />
          <div className="mt-8 max-w-3xl">
            <h1 className="text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
              Start stories from universes and player characters.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-ink-muted sm:text-lg">
              Story Engine is now a local-first workspace for choosing a universe,
              choosing the original character you play, and building a long-form
              campaign without pre-selecting a fixed cast.
            </p>
          </div>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              to="/stories/new"
              className={buttonClasses({ variant: "primary", size: "lg" })}
            >
              Create New Story
            </Link>
            <Link
              to="/player-characters/new"
              className={buttonClasses({ variant: "secondary", size: "lg" })}
            >
              Create Player Character
            </Link>
            <Link
              to="/universes/import"
              className={buttonClasses({ variant: "secondary", size: "lg" })}
            >
              Import Universe
            </Link>
          </div>
        </Panel>

        <Panel padding="lg" className="flex flex-col justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
              Workspace status
            </div>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-ink">
              Local ownership comes first.
            </h2>
            <p className="mt-4 text-sm leading-7 text-ink-muted">
              Everything in Step 2 lives in your browser: universes, player
              characters, stories, and the full timeline of messages you add while
              shaping a campaign.
            </p>
          </div>
          <dl className="mt-8 grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                Stories
              </dt>
              <dd className="mt-2 text-3xl font-semibold text-ink">
                {stories.length}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                Universes
              </dt>
              <dd className="mt-2 text-3xl font-semibold text-ink">
                {universes.length}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                Player Characters
              </dt>
              <dd className="mt-2 text-3xl font-semibold text-ink">
                {playerCharacters.length}
              </dd>
            </div>
          </dl>
        </Panel>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <ActionPanel
          title="Create New Story"
          description="Choose a universe, choose the player character you play, and start a campaign from a custom or generated premise."
          to="/stories/new"
        />
        <ActionPanel
          title="Create Player Character"
          description="Build the original character the user will control inside a specific fictional universe."
          to="/player-characters/new"
        />
        <ActionPanel
          title="Import Universe"
          description="Capture a universe name, wiki URL, and description now so future lore import can attach cleanly later."
          to="/universes/import"
        />
      </section>

      <section className="space-y-5">
        <SectionHeader title="Recent Stories" to="/stories" />
        {recentStories.length ? (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {recentStories.map((story) => {
              const universe = getUniverseById(story.universeId);
              const playerCharacter = getPlayerCharacterById(story.playerCharacterId);
              return (
                <StoryCard
                  key={story.id}
                  story={story}
                  universeName={universe?.name ?? "Unknown universe"}
                  playerCharacterName={playerCharacter?.name ?? "Unknown character"}
                  messageCount={getMessagesForStory(story.id).length}
                  actions={
                    <Link
                      to={`/stories/${story.id}`}
                      className={buttonClasses({ variant: "ghost", size: "sm" })}
                    >
                      Open
                    </Link>
                  }
                />
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No stories yet"
            description="Create a story once you have a universe and a player character ready."
            action={
              <Link to="/stories/new" className={buttonClasses()}>
                Create Story
              </Link>
            }
          />
        )}
      </section>

      <section className="space-y-5">
        <SectionHeader title="Recent Universes" to="/universes" />
        {recentUniverses.length ? (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {recentUniverses.map((universe) => (
              <UniverseCard
                key={universe.id}
                universe={universe}
                linkedStoryCount={getStoriesForUniverse(universe.id).length}
                linkedCharacterCount={getPlayerCharactersForUniverse(universe.id).length}
                actions={
                  <Link
                    to={`/universes/${universe.id}`}
                    className={buttonClasses({ variant: "ghost", size: "sm" })}
                  >
                    View
                  </Link>
                }
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No universes yet"
            description="Start by creating or importing a universe so player characters and stories have a home."
            action={
              <Link to="/universes/new" className={buttonClasses()}>
                Create Universe
              </Link>
            }
          />
        )}
      </section>

      <section className="space-y-5">
        <SectionHeader title="Recent Characters" to="/player-characters" />
        {recentPlayerCharacters.length ? (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {recentPlayerCharacters.map((character) => {
              const universe = getUniverseById(character.universeId);
              return (
                <CharacterCard
                  key={character.id}
                  character={character}
                  universeName={universe?.name ?? "Unknown universe"}
                  linkedStoryCount={getStoriesForPlayerCharacter(character.id).length}
                  actions={
                    <Link
                      to={`/player-characters/${character.id}`}
                      className={buttonClasses({ variant: "ghost", size: "sm" })}
                    >
                      View
                    </Link>
                  }
                />
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No player characters yet"
            description="Create the original character the user will play inside a chosen universe."
            action={
              <Link to="/player-characters/new" className={buttonClasses()}>
                Create Player Character
              </Link>
            }
          />
        )}
      </section>
    </div>
  );
}
