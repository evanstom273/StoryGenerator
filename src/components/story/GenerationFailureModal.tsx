import { Button } from "../ui/Button";
import { Panel } from "../ui/Panel";
import { cn } from "../../utils/cn";
import type { GenerationFailure } from "../../lib/ai/errors";

export function formatFailureDetails(failure: GenerationFailure) {
  const lines = [
    `kind=${failure.kind}`,
    `stage=${failure.stage}`,
    failure.providerName ? `provider=${failure.providerName}` : "",
    failure.model ? `model=${failure.model}` : "",
    `attempts=${failure.attempts}/${failure.maxAttempts}`,
    `automaticRetry=${failure.retryable ? "available" : "stopped"}`,
    failure.requestId ? `requestId=${failure.requestId}` : "",
    failure.diagnostic ? `diagnostic=${failure.diagnostic}` : "",
    failure.transmitSafe
      ? `transmitSafe=on; notes=${failure.transmitSafe.notes.join(",")}`
      : "",
  ].filter(Boolean);

  return lines.join("\n");
}

export function getGenerationFailurePresentation(failure: GenerationFailure | null) {
  if (failure?.kind === "provider_refusal") {
    const contentMinimizedFallbackAttempted =
      /(?:^|;\s*)fallback=content_minimized_mature_non_graphic(?:;|$)/i.test(
        failure.diagnostic ?? "",
      );
    return {
      eyebrow: "Provider Refusal",
      title: "The provider declined this request",
      recovery: contentMinimizedFallbackAttempted
        ? "Provider safeguards cannot be overridden. A separate content-minimized, mature non-graphic fallback was attempted once and was also declined, so no further automatic request was made. Your turn remains available and no refused assistant scene was saved."
        : "Provider safeguards cannot be overridden, and the explicit request was not retried automatically. Your turn remains available and no refused assistant scene was saved. You can retry, edit the turn, switch to mature non-graphic mode, or choose another configured provider.",
      retryLabel: "Retry original request",
    };
  }

  return {
    eyebrow: "Generation Failed",
    title: "Why it failed",
    recovery: null,
    retryLabel: "Retry",
  };
}

export function GenerationFailureModal(props: {
  open: boolean;
  failure: GenerationFailure | null;
  onClose: () => void;
  onRetry: () => void;
}) {
  const failure = props.failure;
  const detailText = failure ? formatFailureDetails(failure) : "";
  const presentation = getGenerationFailurePresentation(failure);

  async function handleCopy() {
    if (!failure) {
      return;
    }

    const text = [
      failure.summaryMessage,
      "",
      "Details:",
      detailText,
      failure.transmitSafe
        ? [
            "",
            "Transmit-safe:",
            "Original:",
            failure.transmitSafe.originalText,
            "",
            "Transmitted:",
            failure.transmitSafe.transmittedText,
          ].join("\n")
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("Copy diagnostics:", text);
    }
  }

  async function handleCopyDraft() {
    if (!failure?.rawDraft) return;
    try {
      await navigator.clipboard.writeText(failure.rawDraft);
    } catch {
      window.prompt("Copy partial response:", failure.rawDraft);
    }
  }

  return (
    <div
      className={cn("fixed inset-0 z-[80]", props.open ? "pointer-events-auto" : "pointer-events-none")}
      aria-hidden={!props.open}
    >
      <button
        type="button"
        aria-label="Close error details"
        className={cn(
          "absolute inset-0 bg-slate-950/65 backdrop-blur-sm transition-opacity duration-200",
          props.open ? "opacity-100" : "opacity-0",
        )}
        onClick={props.onClose}
      />
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center p-4 transition-opacity duration-200",
          props.open ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="w-full max-w-2xl">
          <Panel variant="flat"
            padding="lg"
            role="dialog"
            aria-modal="true"
            className="flex max-h-[88vh] flex-col overflow-hidden"
          >
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
              {presentation.eyebrow}
            </div>
            <div className="mt-3 text-xl font-semibold tracking-tight text-ink">
              {presentation.title}
            </div>
            <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-ink-soft">
              {failure?.summaryMessage || "Unable to generate a response."}
            </div>
            {presentation.recovery ? (
              <div className="mt-4 rounded-2xl border border-divider bg-white/[0.02] px-4 py-3 text-sm leading-6 text-ink-muted">
                {presentation.recovery}
              </div>
            ) : null}

            {failure?.rawDraft ? (
              <details className="mt-6 min-h-0 rounded-2xl border border-divider bg-white/[0.02] px-4 py-4">
                <summary className="cursor-pointer list-none text-sm font-semibold text-ink marker:content-none">
                  Partial response
                </summary>
                <div className="mt-3 max-h-[30vh] overflow-y-auto pr-2">
                  <div className="whitespace-pre-wrap text-sm leading-7 text-ink-muted">
                    {failure.rawDraft}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-3"
                    onClick={() => void handleCopyDraft()}
                  >
                    Copy partial response
                  </Button>
                </div>
              </details>
            ) : null}

            {failure ? (
              <details className="mt-6 min-h-0 rounded-2xl border border-divider bg-white/[0.02] px-4 py-4">
                <summary className="cursor-pointer list-none text-sm font-semibold text-ink marker:content-none">
                  Details
                </summary>
                <div className="mt-3 max-h-[40vh] space-y-4 overflow-y-auto pr-2">
                  <div className="whitespace-pre-wrap text-sm leading-7 text-ink-muted">
                    {detailText}
                  </div>
                  {failure.transmitSafe ? (
                    <div className="space-y-3 text-sm text-ink-muted">
                    <div className="font-semibold text-ink-soft">Transmit-safe</div>
                    <div className="rounded-2xl border border-white/10 bg-black/10 px-3 py-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">
                        Original
                      </div>
                      <div className="mt-2 whitespace-pre-wrap text-ink-soft">
                        {failure.transmitSafe.originalText}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/10 px-3 py-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">
                        Transmitted
                      </div>
                      <div className="mt-2 whitespace-pre-wrap text-ink-soft">
                        {failure.transmitSafe.transmittedText}
                      </div>
                    </div>
                    </div>
                  ) : null}
                </div>
              </details>
            ) : null}

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => void handleCopy()} disabled={!failure}>
                Copy diagnostics
              </Button>
              <Button variant="secondary" onClick={props.onRetry} disabled={!failure}>
                {presentation.retryLabel}
              </Button>
              <Button onClick={props.onClose}>Close</Button>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
