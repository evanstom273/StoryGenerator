import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { Button, buttonClasses } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { PencilIcon, TrashIcon } from "../components/icons";
import { formatDate } from "../lib/dates";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";

export function DeveloperBugsPage() {
  const { developerBugs, deleteDeveloperBug } = useStoryEngine();

  async function handleDelete(id: string) {
    const confirmed = window.confirm(`Delete ${id}?`);
    if (!confirmed) return;
    await deleteDeveloperBug(id);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Developer Notes"
        title="Bugs"
        description="Record broken or incorrect behaviour discovered during testing."
        actions={
          <div className="flex flex-wrap gap-3">
            <Link to="/developer-notes" className={buttonClasses({ variant: "secondary" })}>
              Overview
            </Link>
            <Link to="/developer-notes/bugs/new" className={buttonClasses()}>
              New Bug
            </Link>
          </div>
        }
      />

      {developerBugs.length ? (
        <div className="space-y-3">
          {developerBugs.map((bug) => (
            <Panel variant="flat" key={bug.id} padding="lg" className="border border-white/8 bg-white/[0.03]">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-soft">
                      {bug.id}
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-ink-muted">
                      {bug.status}
                    </span>
                    <span className="text-xs text-ink-muted">
                      Reported {formatDate(bug.reportedAt)}
                    </span>
                  </div>
                  <div className="mt-2 truncate text-lg font-semibold text-ink">
                    {bug.title}
                  </div>
                  <div className="mt-2 text-sm leading-7 text-ink-muted">
                    {bug.description || "No description yet."}
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  <Link
                    to={`/developer-notes/bugs/${bug.id}/edit`}
                    className={buttonClasses({ variant: "secondary", size: "sm" })}
                  >
                    <PencilIcon className="h-4 w-4" />
                    Edit
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleDelete(bug.id)}
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
          title="No bug reports yet"
          description="Create an entry the moment something looks wrong during testing."
          action={
            <Link to="/developer-notes/bugs/new" className={buttonClasses()}>
              Create Bug
            </Link>
          }
        />
      )}
    </div>
  );
}

