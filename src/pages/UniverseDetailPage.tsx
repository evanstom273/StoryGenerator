import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { buttonClasses, Button } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";
import { formatDate, formatDateTime } from "../lib/dates";
import type { UniverseImport } from "../types/models";

function PlaceholderImportSection({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <Panel className="h-full">
      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
        {title}
      </div>
      {items.length ? (
        <ul className="mt-4 space-y-3 text-sm text-ink-soft">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm leading-7 text-ink-muted">
          Empty until AI import is implemented.
        </p>
      )}
    </Panel>
  );
}

function ImportedLoreSection({
  imports,
  loading,
  errorMessage,
}: {
  imports: UniverseImport[];
  loading: boolean;
  errorMessage: string | null;
}) {
  const latestImport = imports[0];

  return (
    <Panel className="h-full md:col-span-2 xl:col-span-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
          Imported Lore
        </div>
        <Link
          to="/universes/import"
          className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted transition hover:text-ink"
        >
          Import new
        </Link>
      </div>

      {loading ? (
        <p className="mt-4 text-sm leading-7 text-ink-muted">Loading imports...</p>
      ) : errorMessage ? (
        <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
          {errorMessage}
        </div>
      ) : latestImport ? (
        <div className="mt-4 space-y-4">
          <dl className="grid gap-3 text-sm text-ink-soft md:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                Source
              </dt>
              <dd className="mt-1 break-all">{latestImport.sourceUrl}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                Imported
              </dt>
              <dd className="mt-1">{formatDateTime(latestImport.importedAt)}</dd>
            </div>
            <div className="md:col-span-2">
              <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                Title
              </dt>
              <dd className="mt-1">{latestImport.title || "Untitled wiki page"}</dd>
            </div>
          </dl>
          <div className="max-h-[360px] overflow-auto whitespace-pre-wrap rounded-2xl border border-white/8 bg-black/15 p-4 text-sm leading-7 text-ink-soft">
            {latestImport.importedText}
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm leading-7 text-ink-muted">
          No imports yet. Use the universe import page to store lore text for AI
          context.
        </p>
      )}
    </Panel>
  );
}

export function UniverseDetailPage() {
  const { universeId } = useParams();
  const navigate = useNavigate();
  const {
    deleteUniverse,
    getPlayerCharactersForUniverse,
    getStoriesForUniverse,
    getUniverseById,
    listUniverseImports,
  } = useStoryEngine();
  const universe = universeId ? getUniverseById(universeId) : undefined;
  const linkedCharacters = universe ? getPlayerCharactersForUniverse(universe.id) : [];
  const linkedStories = universe ? getStoriesForUniverse(universe.id) : [];
  const [universeImports, setUniverseImports] = useState<UniverseImport[]>([]);
  const [importsLoading, setImportsLoading] = useState(false);
  const [importsErrorMessage, setImportsErrorMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!universe) {
      return;
    }

    let cancelled = false;
    setImportsLoading(true);
    setImportsErrorMessage(null);

    void listUniverseImports(universe.id)
      .then((items) => {
        if (cancelled) {
          return;
        }
        setUniverseImports(items);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setImportsErrorMessage(
          error instanceof Error ? error.message : "Unable to load universe imports.",
        );
      })
      .finally(() => {
        if (cancelled) {
          return;
        }
        setImportsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [listUniverseImports, universe]);

  if (!universe) {
    return (
      <div className="space-y-8">
        <PageHeader
          eyebrow="Universes"
          title="This universe could not be found"
          description="Return to the universe list and choose another entry."
        />
        <EmptyState
          title="Missing universe"
          description="The requested universe is not available in local storage."
          action={
            <Link to="/universes" className={buttonClasses()}>
              Back to Universes
            </Link>
          }
        />
      </div>
    );
  }

  const activeUniverse = universe;

  const placeholderSections = useMemo(
    (): Array<{ title: string; items: string[] }> => [
      { title: "Imported Characters", items: activeUniverse.importedCharacters },
      { title: "Imported Locations", items: activeUniverse.importedLocations },
      {
        title: "Imported Relationships",
        items: activeUniverse.importedRelationships,
      },
    ],
    [
      activeUniverse.importedCharacters,
      activeUniverse.importedLocations,
      activeUniverse.importedRelationships,
    ],
  );

  async function handleDelete() {
    const confirmed = window.confirm(
      "Delete this universe? Linked player characters and stories must be removed first.",
    );

    if (!confirmed) {
      return;
    }

    const result = await deleteUniverse(activeUniverse.id);

    if (!result.ok) {
      setErrorMessage(result.reason ?? "Unable to delete this universe.");
      return;
    }

    navigate("/universes");
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Universes"
        title={activeUniverse.name}
        description="Universes hold story context now and future import-ready canon context later."
        actions={
          <div className="flex gap-3">
            <Link
              to={`/universes/${activeUniverse.id}/edit`}
              className={buttonClasses({ variant: "secondary" })}
            >
              Edit
            </Link>
            <Button variant="ghost" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Panel>
            <dl className="grid gap-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                  Lore Primer
                </dt>
                <dd className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-soft">
                  {activeUniverse.lorePrimer ||
                    activeUniverse.description ||
                    "No lore primer written yet."}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                  Genre / Theme
                </dt>
                <dd className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-soft">
                  {activeUniverse.genreTheme || "Not set"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">Tone</dt>
                <dd className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-soft">
                  {activeUniverse.tone || "Not set"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                  Era / Tech Level
                </dt>
                <dd className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-soft">
                  {activeUniverse.eraTechLevel || "Not set"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                  Core Conflict
                </dt>
                <dd className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-soft">
                  {activeUniverse.coreConflict || "Not set"}
                </dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                  Canon Guardrails
                </dt>
                <dd className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-soft">
                  {activeUniverse.canonGuardrails || "Not set"}
                </dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                  Power System Rules
                </dt>
                <dd className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-soft">
                  {activeUniverse.powerSystemRules || "Not set"}
                </dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                  Everyday Life Vibe
                </dt>
                <dd className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-soft">
                  {activeUniverse.everydayLifeVibe || "Not set"}
                </dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                  Key Factions
                </dt>
                <dd className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-soft">
                  {activeUniverse.keyFactions || "Not set"}
                </dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                  Key Locations
                </dt>
                <dd className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-soft">
                  {activeUniverse.keyLocations || "Not set"}
                </dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                  Character Archetypes
                </dt>
                <dd className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-soft">
                  {activeUniverse.characterArchetypes || "Not set"}
                </dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">Notes</dt>
                <dd className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-soft">
                  {activeUniverse.notes || "Not set"}
                </dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                  Player Boundaries
                </dt>
                <dd className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-soft">
                  {activeUniverse.playerBoundaries || "Not set"}
                </dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                  Rating / Content Notes
                </dt>
                <dd className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-soft">
                  {activeUniverse.ratingContentNotes || "Not set"}
                </dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                  Wiki URL
                </dt>
                <dd className="mt-2 break-all text-sm text-ink-soft">
                  {activeUniverse.wikiUrl || "Not provided"}
                </dd>
              </div>
            </dl>
          </Panel>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <ImportedLoreSection
              imports={universeImports}
              loading={importsLoading}
              errorMessage={importsErrorMessage}
            />
            {placeholderSections.map((section) => (
              <PlaceholderImportSection
                key={section.title}
                title={section.title}
                items={section.items}
              />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <Panel>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
              Workspace Links
            </div>
            <dl className="mt-4 space-y-4">
              <div>
                <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                  Player Characters
                </dt>
                <dd className="mt-2 text-sm text-ink-soft">
                  {linkedCharacters.length}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                  Stories
                </dt>
                <dd className="mt-2 text-sm text-ink-soft">{linkedStories.length}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                  Added
                </dt>
                <dd className="mt-2 text-sm text-ink-soft">
                  {formatDate(activeUniverse.createdAt)}
                </dd>
              </div>
            </dl>
          </Panel>

          {linkedCharacters.length ? (
            <Panel>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                Linked Player Characters
              </div>
              <div className="mt-4 space-y-3">
                {linkedCharacters.map((character) => (
                  <Link
                    key={character.id}
                    to={`/player-characters/${character.id}`}
                    className="block rounded-2xl border border-white/8 bg-black/15 px-4 py-4 text-sm text-ink-soft transition hover:border-white/16 hover:bg-white/[0.04]"
                  >
                    {character.name}
                  </Link>
                ))}
              </div>
            </Panel>
          ) : null}

          {linkedStories.length ? (
            <Panel>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                Linked Stories
              </div>
              <div className="mt-4 space-y-3">
                {linkedStories.map((story) => (
                  <Link
                    key={story.id}
                    to={`/stories/${story.id}`}
                    className="block rounded-2xl border border-white/8 bg-black/15 px-4 py-4 text-sm text-ink-soft transition hover:border-white/16 hover:bg-white/[0.04]"
                  >
                    {story.title}
                  </Link>
                ))}
              </div>
            </Panel>
          ) : null}

          {errorMessage ? (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
              {errorMessage}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
