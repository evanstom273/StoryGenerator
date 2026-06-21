import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { buttonClasses, Button } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";
import { formatDate, formatDateTime } from "../lib/dates";
import type { UniverseImport } from "../types/models";
import { normalizeUniverseWikiSources } from "../lib/universeSources";

function PlaceholderImportSection({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <Panel className="h-full">
      <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">
        {title}
      </div>
      {items.length ? (
        <ul className="mt-3 space-y-2.5 text-[13px] text-ink-soft">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] leading-6 text-ink-muted">
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
        <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">
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
        <p className="mt-3 text-[13px] leading-6 text-ink-muted">Loading imports...</p>
      ) : errorMessage ? (
        <div className="mt-3 rounded-[8px] border border-rose-400/20 bg-rose-400/10 px-3.5 py-3 text-sm text-rose-200">
          {errorMessage}
        </div>
      ) : latestImport ? (
        <div className="mt-4 space-y-4">
          <dl className="grid gap-3 text-sm text-ink-soft md:grid-cols-2">
            <div>
              <dt className="text-[9px] font-bold uppercase tracking-[0.18em] text-ink-muted">
                Source
              </dt>
              <dd className="mt-1 break-all text-[13px]">
                {latestImport.sourceLabel ? `${latestImport.sourceLabel} — ` : ""}
                {latestImport.sourceUrl}
              </dd>
            </div>
            <div>
              <dt className="text-[9px] font-bold uppercase tracking-[0.18em] text-ink-muted">
                Imported
              </dt>
              <dd className="mt-1">{formatDateTime(latestImport.importedAt)}</dd>
            </div>
            <div className="md:col-span-2">
              <dt className="text-[9px] font-bold uppercase tracking-[0.18em] text-ink-muted">
                Title
              </dt>
              <dd className="mt-1">{latestImport.title || "Untitled wiki page"}</dd>
            </div>
          </dl>
          <div className="max-h-[360px] overflow-auto whitespace-pre-wrap rounded-[8px] border border-divider/[0.4] bg-panel-muted/40 p-3.5 text-sm leading-6 text-ink-soft">
            {latestImport.importedText}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-[13px] leading-6 text-ink-muted">
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
  const universeMode = activeUniverse.mode ?? "referenced";
  const universeDescription = activeUniverse.description.trim() || activeUniverse.concept?.trim() || "";
  const universeConcept = activeUniverse.concept?.trim() || "";
  const universeBlueprint = activeUniverse.universeBlueprint ?? "";
  const wikiSources = normalizeUniverseWikiSources(activeUniverse);

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
            <dl className="space-y-4">
              <div className="flex items-center justify-between gap-4 border-b border-divider/[0.3] pb-3">
                <dt className="text-[11px] text-ink-muted">Mode</dt>
                <dd className="text-[13px] text-ink-soft">
                  {universeMode === "custom" ? "Custom" : "Referenced"}
                </dd>
              </div>

              {universeMode === "referenced" ? (
                <>
                  {universeDescription ? (
                    <div>
                      <dt className="text-[9px] font-bold uppercase tracking-[0.18em] text-ink-muted">Description</dt>
                      <dd className="mt-1.5 whitespace-pre-wrap text-[13px] leading-6 text-ink-soft">
                        {universeDescription}
                      </dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-[9px] font-bold uppercase tracking-[0.18em] text-ink-muted">
                      Wiki / Reference Sources
                    </dt>
                    <dd className="mt-1.5 text-[13px] text-ink-soft">
                      {wikiSources.length ? (
                        <ol className="space-y-1.5">
                          {wikiSources.map((source) => (
                            <li key={`${source.order}-${source.url}`} className="break-all">
                              <span className="text-ink-muted">{source.order + 1}.</span>{" "}
                              {source.label ? `${source.label} — ` : ""}
                              {source.url}
                            </li>
                          ))}
                        </ol>
                      ) : (
                        activeUniverse.wikiUrl || "Not provided"
                      )}
                    </dd>
                  </div>
                  {activeUniverse.notes ? (
                    <div>
                      <dt className="text-[9px] font-bold uppercase tracking-[0.18em] text-ink-muted">Notes</dt>
                      <dd className="mt-1.5 whitespace-pre-wrap text-[13px] leading-6 text-ink-soft">
                        {activeUniverse.notes}
                      </dd>
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  {universeConcept ? (
                    <div>
                      <dt className="text-[9px] font-bold uppercase tracking-[0.18em] text-ink-muted">Concept</dt>
                      <dd className="mt-1.5 whitespace-pre-wrap text-[13px] leading-6 text-ink-soft">
                        {universeConcept}
                      </dd>
                    </div>
                  ) : null}
                  {universeDescription ? (
                    <div>
                      <dt className="text-[9px] font-bold uppercase tracking-[0.18em] text-ink-muted">Description</dt>
                      <dd className="mt-1.5 whitespace-pre-wrap text-[13px] leading-6 text-ink-soft">
                        {universeDescription}
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between gap-4 border-t border-divider/[0.3] pt-3">
                    <dt className="text-[11px] text-ink-muted">Genre / Theme</dt>
                    <dd className="text-[13px] text-ink-soft">{activeUniverse.genreTheme || "Not set"}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-[11px] text-ink-muted">Tone</dt>
                    <dd className="text-[13px] text-ink-soft">{activeUniverse.tone || "Not set"}</dd>
                  </div>
                  {universeBlueprint ? (
                    <div className="border-t border-divider/[0.3] pt-3">
                      <dt className="text-[9px] font-bold uppercase tracking-[0.18em] text-ink-muted">Universe Blueprint</dt>
                      <dd className="mt-1.5 whitespace-pre-wrap text-[13px] leading-6 text-ink-soft">
                        {universeBlueprint}
                      </dd>
                    </div>
                  ) : null}
                </>
              )}
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
            <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">
              Workspace Links
            </div>
            <dl className="mt-3 divide-y divide-divider/[0.3]">
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-[11px] text-ink-muted">Characters</dt>
                <dd className="text-[13px] text-ink-soft">{linkedCharacters.length}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-[11px] text-ink-muted">Stories</dt>
                <dd className="text-[13px] text-ink-soft">{linkedStories.length}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-[11px] text-ink-muted">Added</dt>
                <dd className="text-[13px] text-ink-soft">{formatDate(activeUniverse.createdAt)}</dd>
              </div>
            </dl>
          </Panel>

          {linkedCharacters.length ? (
            <Panel>
              <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">
                Linked Characters
              </div>
              <div className="mt-3 space-y-2">
                {linkedCharacters.map((character) => (
                  <Link
                    key={character.id}
                    to={`/player-characters/${character.id}`}
                    className="block rounded-[8px] border border-divider/[0.4] bg-panel-muted/40 px-3.5 py-2.5 text-[13px] text-ink-soft transition hover:border-accent/[0.15] hover:bg-panel-muted"
                  >
                    {character.name}
                  </Link>
                ))}
              </div>
            </Panel>
          ) : null}

          {linkedStories.length ? (
            <Panel>
              <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">
                Linked Stories
              </div>
              <div className="mt-3 space-y-2">
                {linkedStories.map((story) => (
                  <Link
                    key={story.id}
                    to={`/stories/${story.id}`}
                    className="block rounded-[8px] border border-divider/[0.4] bg-panel-muted/40 px-3.5 py-2.5 text-[13px] text-ink-soft transition hover:border-accent/[0.15] hover:bg-panel-muted"
                  >
                    {story.title}
                  </Link>
                ))}
              </div>
            </Panel>
          ) : null}

          {errorMessage ? (
            <div className="rounded-[8px] border border-rose-400/20 bg-rose-400/10 px-3.5 py-3 text-sm text-rose-200">
              {errorMessage}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
