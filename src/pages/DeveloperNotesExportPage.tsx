import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { Button, buttonClasses } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { downloadFile } from "../lib/download";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";

export function DeveloperNotesExportPage() {
  const { developerBugs, developerFeatureRequests, developerTestingNotes } =
    useStoryEngine();

  async function handleExport() {
    const payload = {
      exportVersion: 1,
      exportedAt: new Date().toISOString(),
      data: {
        bugs: developerBugs,
        featureRequests: developerFeatureRequests,
        testingNotes: developerTestingNotes,
      },
    };

    const date = new Date().toISOString().slice(0, 10);
    await downloadFile(
      `developer-notes-${date}.json`,
      JSON.stringify(payload, null, 2),
      "application/json",
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Developer Notes"
        title="Export"
        description="Download all developer notes as a JSON snapshot."
        actions={
          <div className="flex flex-wrap gap-3">
            <Link to="/developer-notes" className={buttonClasses({ variant: "secondary" })}>
              Overview
            </Link>
            <Button onClick={() => void handleExport()}>Download JSON</Button>
          </div>
        }
      />

      <Panel padding="lg">
        <div className="grid gap-3 text-sm text-ink-muted md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-soft">
              Bugs
            </div>
            <div className="mt-1 text-lg font-semibold text-ink">{developerBugs.length}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-soft">
              Feature Requests
            </div>
            <div className="mt-1 text-lg font-semibold text-ink">
              {developerFeatureRequests.length}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-soft">
              Testing Notes
            </div>
            <div className="mt-1 text-lg font-semibold text-ink">
              {developerTestingNotes.length}
            </div>
          </div>
        </div>

        <div className="mt-6 text-sm leading-7 text-ink-muted">
          The export contains only local data from this device. PDF and Markdown exports can be
          added later if needed.
        </div>
      </Panel>
    </div>
  );
}

