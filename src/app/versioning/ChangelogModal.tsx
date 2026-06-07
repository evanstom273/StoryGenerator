import { Button } from "../../components/ui/Button";
import { Panel } from "../../components/ui/Panel";
import { cn } from "../../utils/cn";
import type { ChangelogEntry } from "./version";

export function ChangelogModal({
  open,
  appLabel,
  releases,
  onClose,
}: {
  open: boolean;
  appLabel: string;
  releases: Array<{ version: string; entry: ChangelogEntry }>;
  onClose: () => void;
}) {
  return (
    <div
      className={cn("fixed inset-0 z-[70]", open ? "pointer-events-auto" : "pointer-events-none")}
      aria-hidden={!open}
    >
      <button
        type="button"
        aria-label="Close changelog"
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
        <div className="w-full max-w-2xl">
          <Panel padding="lg" role="dialog" aria-modal="true">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
              Changelog
            </div>
            <div className="mt-3 text-2xl font-semibold tracking-tight text-ink">
              {appLabel}
            </div>
            <div className="mt-2 text-sm leading-7 text-ink-muted">What’s new</div>

            <div className="mt-6 max-h-[70vh] space-y-8 overflow-auto pr-2">
              {releases.length ? (
                releases.map((release) => (
                  <section key={release.version} className="rounded-2xl border border-divider bg-white/[0.02] px-4 py-4">
                    <div className="text-sm font-semibold text-ink">
                      v{release.version} · {release.entry.title}
                    </div>

                    {release.entry.fixed?.length ? (
                      <div className="mt-4">
                        <div className="text-sm font-semibold text-ink">Fixed</div>
                        <ul className="mt-3 space-y-2 text-sm text-ink-soft">
                          {release.entry.fixed.map((item) => (
                            <li key={item}>• {item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {release.entry.added?.length ? (
                      <div className="mt-4">
                        <div className="text-sm font-semibold text-ink">Added</div>
                        <ul className="mt-3 space-y-2 text-sm text-ink-soft">
                          {release.entry.added.map((item) => (
                            <li key={item}>• {item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {release.entry.knownIssues?.length ? (
                      <div className="mt-4">
                        <div className="text-sm font-semibold text-ink">Known Issues</div>
                        <ul className="mt-3 space-y-2 text-sm text-ink-soft">
                          {release.entry.knownIssues.map((item) => (
                            <li key={item}>• {item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </section>
                ))
              ) : (
                <div className="text-sm text-ink-soft">No changelog entries available for this update.</div>
              )}
            </div>

            <div className="mt-8 flex justify-end">
              <Button onClick={onClose}>Continue</Button>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
