import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/ui/Panel";
import { buttonClasses } from "../components/ui/Button";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";

export function DeveloperNotesPage() {
  const { developerBugs, developerFeatureRequests, developerTestingNotes } =
    useStoryEngine();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Developer Notes"
        title="Testing tracker"
        description="Capture bugs, feature ideas, and testing discoveries directly inside Story Engine."
        actions={
          <Link to="/developer-notes/export" className={buttonClasses()}>
            Export JSON
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Link to="/developer-notes/bugs" className="group">
          <Panel
            padding="lg"
            className="h-full border border-white/8 bg-white/[0.03] transition group-hover:border-white/16 group-hover:bg-white/[0.05]"
          >
            <div className="text-lg font-semibold text-ink">Bugs</div>
            <div className="mt-2 text-sm leading-7 text-ink-muted">
              {developerBugs.length} {developerBugs.length === 1 ? "entry" : "entries"}
            </div>
          </Panel>
        </Link>

        <Link to="/developer-notes/features" className="group">
          <Panel
            padding="lg"
            className="h-full border border-white/8 bg-white/[0.03] transition group-hover:border-white/16 group-hover:bg-white/[0.05]"
          >
            <div className="text-lg font-semibold text-ink">Feature Requests</div>
            <div className="mt-2 text-sm leading-7 text-ink-muted">
              {developerFeatureRequests.length}{" "}
              {developerFeatureRequests.length === 1 ? "entry" : "entries"}
            </div>
          </Panel>
        </Link>

        <Link to="/developer-notes/testing" className="group">
          <Panel
            padding="lg"
            className="h-full border border-white/8 bg-white/[0.03] transition group-hover:border-white/16 group-hover:bg-white/[0.05]"
          >
            <div className="text-lg font-semibold text-ink">Testing Notes</div>
            <div className="mt-2 text-sm leading-7 text-ink-muted">
              {developerTestingNotes.length}{" "}
              {developerTestingNotes.length === 1 ? "entry" : "entries"}
            </div>
          </Panel>
        </Link>

        <Link to="/developer-notes/export" className="group">
          <Panel
            padding="lg"
            className="h-full border border-white/8 bg-white/[0.03] transition group-hover:border-white/16 group-hover:bg-white/[0.05]"
          >
            <div className="text-lg font-semibold text-ink">Export</div>
            <div className="mt-2 text-sm leading-7 text-ink-muted">
              Download a JSON snapshot for sharing or archiving.
            </div>
          </Panel>
        </Link>
      </div>
    </div>
  );
}

