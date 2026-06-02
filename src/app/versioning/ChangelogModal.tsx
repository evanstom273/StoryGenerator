import { Button } from "../../components/ui/Button";
import { Panel } from "../../components/ui/Panel";
import { cn } from "../../utils/cn";
import type { ChangelogEntry } from "./version";

export function ChangelogModal({
  open,
  appLabel,
  entry,
  onClose,
}: {
  open: boolean;
  appLabel: string;
  entry: ChangelogEntry | null;
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
            <div className="mt-2 text-sm leading-7 text-ink-muted">
              {entry?.title ?? "No changelog entry available for this version."}
            </div>

            <div className="mt-6 space-y-6">
              {entry?.fixed?.length ? (
                <section>
                  <div className="text-sm font-semibold text-ink">Fixed</div>
                  <ul className="mt-3 space-y-2 text-sm text-ink-soft">
                    {entry.fixed.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {entry?.added?.length ? (
                <section>
                  <div className="text-sm font-semibold text-ink">Added</div>
                  <ul className="mt-3 space-y-2 text-sm text-ink-soft">
                    {entry.added.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {entry?.knownIssues?.length ? (
                <section>
                  <div className="text-sm font-semibold text-ink">Known Issues</div>
                  <ul className="mt-3 space-y-2 text-sm text-ink-soft">
                    {entry.knownIssues.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
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

