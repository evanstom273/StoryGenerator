import { useMemo, useState } from "react";
import { Panel } from "../../components/ui/Panel";
import { Button } from "../../components/ui/Button";
import { SelectInput } from "../../components/forms/Fields";
import { cn } from "../../utils/cn";
import {
  exportChangelog,
  formatChangelogReleaseLabel,
  sortVersionsDesc,
  type ChangelogExportFormat,
} from "./changelogExport";
import { APP_NAME, APP_VERSION, CHANGELOG, type ChangelogEntry } from "./version";

function VersionEntry({
  version,
  entry,
  expanded,
  onToggle,
  onExport,
}: {
  version: string;
  entry: ChangelogEntry;
  expanded: boolean;
  onToggle: () => void;
  onExport: (format: ChangelogExportFormat) => void;
}) {
  return (
    <div
      id={`changelog-${version}`}
      className={cn(
        "rounded-2xl border border-divider bg-panel p-4 ring-1 ring-accent/8",
        version === APP_VERSION ? "border-accent/35 ring-accent/12" : "",
      )}
    >
      <button
        type="button"
        className="flex w-full items-start justify-between gap-4 text-left"
        onClick={onToggle}
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink">
            {APP_NAME} v{version}
          </div>
          {formatChangelogReleaseLabel(entry.releasedAt) ? (
            <div className="mt-1 text-xs text-ink-muted">
              {formatChangelogReleaseLabel(entry.releasedAt)}
            </div>
          ) : null}
          <div className="mt-1 text-sm text-ink-muted">{entry.title}</div>
        </div>
        <div className="shrink-0 text-xs text-ink-muted">{expanded ? "▾" : "▸"}</div>
      </button>

      {expanded ? (
        <div className="mt-4 space-y-5">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => onExport("json")}>
              Export JSON
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onExport("markdown")}>
              Export Markdown
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onExport("txt")}>
              Export TXT
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onExport("pdf")}>
              Export PDF
            </Button>
          </div>

          {entry.fixed?.length ? (
            <section>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                Fixed
              </div>
              <ul className="mt-3 space-y-2 text-sm text-ink-soft">
                {entry.fixed.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {entry.added?.length ? (
            <section>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                Added
              </div>
              <ul className="mt-3 space-y-2 text-sm text-ink-soft">
                {entry.added.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {entry.knownIssues?.length ? (
            <section>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                Known Issues
              </div>
              <ul className="mt-3 space-y-2 text-sm text-ink-soft">
                {entry.knownIssues.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ChangelogHistoryModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const versions = useMemo(() => sortVersionsDesc(Object.keys(CHANGELOG)), []);
  const [selectedVersion, setSelectedVersion] = useState(APP_VERSION);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => ({
    [APP_VERSION]: true,
  }));

  async function handleExportAll(format: ChangelogExportFormat) {
    await exportChangelog({
      filenameStem: "story-engine-changelog",
      entries: CHANGELOG,
      format,
    });
  }

  async function handleExportRelease(version: string, format: ChangelogExportFormat) {
    await exportChangelog({
      filenameStem: `story-engine-changelog-${version}`,
      entries: { [version]: CHANGELOG[version]! },
      format,
    });
  }

  function handleJump(version: string) {
    setSelectedVersion(version);
    const element = document.getElementById(`changelog-${version}`);
    element?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  return (
    <div
      className={cn("fixed inset-0 z-[70]", open ? "pointer-events-auto" : "pointer-events-none")}
      aria-hidden={!open}
    >
      <button
        type="button"
        aria-label="Close changelog history"
        className={cn(
          "absolute inset-0 bg-slate-950/65 backdrop-blur-sm transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center p-4 transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="w-full max-w-4xl">
          <Panel variant="flat"
            padding="lg"
            role="dialog"
            aria-modal="true"
            className="flex max-h-[82vh] flex-col overflow-hidden"
          >
            <div className="flex shrink-0 items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                  Changelog History
                </div>
                <div className="mt-2 text-2xl font-semibold tracking-tight text-ink">
                  {APP_NAME}
                </div>
                <div className="mt-1 text-sm text-ink-muted">
                  Expand a release to view details and export it.
                </div>
              </div>
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
            </div>

            <div className="mt-6 flex shrink-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-[240px]">
                <div className="text-xs text-ink-muted">Jump to version</div>
                <SelectInput
                  className="mt-2"
                  value={selectedVersion}
                  onChange={(event) => handleJump(event.target.value)}
                >
                  {versions.map((version) => (
                    <option key={version} value={version}>
                      v{version}
                    </option>
                  ))}
                </SelectInput>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => handleExportAll("json")}>
                  Export All JSON
                </Button>
                <Button variant="secondary" size="sm" onClick={() => handleExportAll("markdown")}>
                  Export All Markdown
                </Button>
                <Button variant="secondary" size="sm" onClick={() => handleExportAll("txt")}>
                  Export All TXT
                </Button>
                <Button variant="secondary" size="sm" onClick={() => handleExportAll("pdf")}>
                  Export All PDF
                </Button>
              </div>
            </div>

            <div className="mt-6 min-h-0 flex-1 space-y-4 overflow-auto pr-1">
              {versions.map((version) => {
                const entry = CHANGELOG[version]!;
                const isExpanded = expanded[version] ?? false;
                return (
                  <VersionEntry
                    key={version}
                    version={version}
                    entry={entry}
                    expanded={isExpanded}
                    onToggle={() =>
                      setExpanded((current) => ({
                        ...current,
                        [version]: !isExpanded,
                      }))
                    }
                    onExport={(format) => handleExportRelease(version, format)}
                  />
                );
              })}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
