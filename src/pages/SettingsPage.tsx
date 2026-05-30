import { PageHeader } from "../components/PageHeader";
import { DatabaseIcon } from "../components/icons";
import { Badge } from "../components/ui/Badge";
import { Panel } from "../components/ui/Panel";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";

export function SettingsPage() {
  const { storageStatus } = useStoryEngine();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Settings"
        title="Local workspace settings and future integration points"
        description="Step 2 focuses on real local storage, export, and story management. AI provider wiring still remains intentionally unimplemented."
      />

      <section className="grid gap-4 lg:grid-cols-3">
        <Panel className="h-full">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              Theme
            </h2>
            <Badge variant="accent">Dark default</Badge>
          </div>
          <p className="mt-3 text-sm leading-7 text-ink-muted">
            The interface stays in a dark workspace theme optimized for long-form
            writing and dense continuity review.
          </p>
        </Panel>

        <Panel className="h-full">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              AI Provider
            </h2>
            <Badge>Not connected</Badge>
          </div>
          <p className="mt-3 text-sm leading-7 text-ink-muted">
            No model provider is attached in Step 2. This release is entirely
            focused on workflow, storage, exports, and story management.
          </p>
        </Panel>

        <Panel className="h-full">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              Storage Status
            </h2>
            <Badge variant={storageStatus.ready ? "success" : "warning"}>
              {storageStatus.ready ? "Ready" : "Attention needed"}
            </Badge>
          </div>
          <div className="mt-4 flex items-center gap-3 text-accent-soft">
            <DatabaseIcon className="h-5 w-5" />
            <span className="text-sm">{storageStatus.driver}</span>
          </div>
          <dl className="mt-5 space-y-3 text-sm text-ink-soft">
            <div className="flex items-center justify-between gap-4">
              <dt>Universes</dt>
              <dd>{storageStatus.universesCount}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt>Player Characters</dt>
              <dd>{storageStatus.playerCharactersCount}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt>Stories</dt>
              <dd>{storageStatus.storiesCount}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt>Messages</dt>
              <dd>{storageStatus.messagesCount}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-white/8 pt-3">
              <dt>Total Records</dt>
              <dd>{storageStatus.totalRecords}</dd>
            </div>
          </dl>
          {storageStatus.errorMessage ? (
            <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
              {storageStatus.errorMessage}
            </div>
          ) : null}
        </Panel>
      </section>
    </div>
  );
}

