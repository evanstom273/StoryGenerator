import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { Button, buttonClasses } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { PencilIcon, TrashIcon } from "../components/icons";
import { formatDate } from "../lib/dates";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";

export function DeveloperTestingNotesPage() {
  const { developerTestingNotes, deleteDeveloperTestingNote } = useStoryEngine();

  async function handleDelete(id: string) {
    const confirmed = window.confirm(`Delete ${id}?`);
    if (!confirmed) return;
    await deleteDeveloperTestingNote(id);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Developer Notes"
        title="Testing Notes"
        description="Keep lightweight notes on test runs, discoveries, and experiments."
        actions={
          <div className="flex flex-wrap gap-3">
            <Link to="/developer-notes" className={buttonClasses({ variant: "secondary" })}>
              Overview
            </Link>
            <Link to="/developer-notes/testing/new" className={buttonClasses()}>
              New Note
            </Link>
          </div>
        }
      />

      {developerTestingNotes.length ? (
        <div className="space-y-3">
          {developerTestingNotes.map((note) => (
            <Panel key={note.id} padding="lg" className="border border-white/8 bg-white/[0.03]">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-soft">
                      {note.id}
                    </div>
                    <span className="text-xs text-ink-muted">
                      Created {formatDate(note.createdAt)}
                    </span>
                  </div>
                  <div className="mt-2 truncate text-lg font-semibold text-ink">
                    {note.title}
                  </div>
                  <div className="mt-2 text-sm leading-7 text-ink-muted">
                    {note.content ? `${note.content.slice(0, 180)}${note.content.length > 180 ? "…" : ""}` : "No notes yet."}
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  <Link
                    to={`/developer-notes/testing/${note.id}/edit`}
                    className={buttonClasses({ variant: "secondary", size: "sm" })}
                  >
                    <PencilIcon className="h-4 w-4" />
                    Edit
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleDelete(note.id)}
                  >
                    <TrashIcon className="h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No testing notes yet"
          description="Create notes as you test features or try reproducing bugs."
          action={
            <Link to="/developer-notes/testing/new" className={buttonClasses()}>
              Create Note
            </Link>
          }
        />
      )}
    </div>
  );
}

