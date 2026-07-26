import { useEffect, useMemo, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { Button } from "../ui/Button";
import { useStoryEngine } from "../../app/providers/StoryEngineProvider";
import { downloadFile } from "../../lib/download";
import { getMetaChatReferenceDisplay } from "../../lib/metaChatReferences";
import { isGlobalMetaChatScope } from "../../lib/metaChatScope";
import {
  createMetaChatExportFilename,
  serializeMetaChatExport,
  type MetaChatExportFormat,
} from "../../lib/metaChatExport";

const GENERATION_AUDIT_URL = "http://127.0.0.1:7777/event";
const GENERATION_AUDIT_SESSION = "generation-pipeline-audit";

function reportMetaChatUiAudit(args: {
  msg: string;
  data?: Record<string, unknown>;
}) {
  // #region debug-point E:metachat-ui
  void fetch(GENERATION_AUDIT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: GENERATION_AUDIT_SESSION,
      runId: "pre-fix",
      hypothesisId: "E",
      location: "MetaChatOverlay.tsx",
      msg: `[DEBUG] ${args.msg}`,
      data: args.data,
      ts: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

export function MetaChatOverlay(props: {
  open: boolean;
  storyId: string;
  onClose: () => void;
}) {
  const {
    clearMetaChatDraft,
    getMetaChatJobs,
    getMetaChatDraft,
    getMetaChatReferences,
    getStoryById,
    getMetaMessagesForScope,
    queueMetaChatMessage,
    resetMetaChatConversation,
    setMetaChatDraft,
    setMetaChatReferences,
  } = useStoryEngine();
  const isGlobalScope = isGlobalMetaChatScope(props.storyId);
  const story = getStoryById(props.storyId);
  const messages = useMemo(
    () => getMetaMessagesForScope(props.storyId),
    [getMetaMessagesForScope, props.storyId],
  );
  const references = useMemo(
    () => getMetaChatReferences(props.storyId),
    [getMetaChatReferences, props.storyId],
  );
  const pendingJobs = useMemo(
    () =>
      getMetaChatJobs(props.storyId).filter(
        (job) =>
          job.type === "metachat_generate" &&
          (job.status === "queued" || job.status === "running"),
      ),
    [getMetaChatJobs, props.storyId],
  );

  const failedJobs = useMemo(
    () =>
      getMetaChatJobs(props.storyId).filter(
        (job) => job.type === "metachat_generate" && job.status === "failed",
      ),
    [getMetaChatJobs, props.storyId],
  );

  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isExporting, setIsExporting] = useState<MetaChatExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryingJobIds, setRetryingJobIds] = useState<Set<string>>(new Set());

  async function handleRetry(jobId: string, content: string) {
    setRetryingJobIds((prev) => new Set([...prev, jobId]));
    try {
      await queueMetaChatMessage(props.storyId, content);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to retry MetaChat message.");
    } finally {
      setRetryingJobIds((prev) => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    }
  }

  async function handleResetChat() {
    setError(null);
    try {
      await resetMetaChatConversation(props.storyId);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reset MetaChat.");
    }
  }

  async function handleRemoveReference(referenceId: string) {
    try {
      await setMetaChatReferences(
        props.storyId,
        references.filter((reference) => reference.id !== referenceId),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update references.");
    }
  }

  useEffect(() => {
    if (props.open) {
      setDraft(getMetaChatDraft(props.storyId));
    }
  }, [getMetaChatDraft, props.open, props.storyId]);

  useEffect(() => {
    if (!props.open) {
      setIsSending(false);
      setIsExporting(null);
      setError(null);
    }
  }, [props.open]);

  useEffect(() => {
    if (props.open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [props.open]);

  if (!props.open) {
    return null;
  }

  async function handleSend() {
    const trimmed = draft.trim();
    if (!trimmed) {
      setError("Message content is required.");
      return;
    }

    setIsSending(true);
    setError(null);
    setDraft("");
    void clearMetaChatDraft(props.storyId);

    try {
      await queueMetaChatMessage(props.storyId, trimmed);
    } catch (err) {
      reportMetaChatUiAudit({
        msg: "MetaChat UI displayed send error",
        data: {
          storyId: props.storyId,
          originalUserText: trimmed,
          errorMessage: err instanceof Error ? err.message : "Unable to send MetaChat message.",
        },
      });
      setError(err instanceof Error ? err.message : "Unable to send MetaChat message.");
      setDraft(trimmed);
      void setMetaChatDraft(props.storyId, trimmed);
    } finally {
      setIsSending(false);
    }
  }

  async function handleExport(format: MetaChatExportFormat) {
    if (!story && !isGlobalScope) {
      setError("Story not found.");
      return;
    }

    setIsExporting(format);
    setError(null);

    try {
      const { content, mimeType } = serializeMetaChatExport(
        {
          storyTitle: isGlobalScope ? "Library MetaChat" : story!.title,
          messages,
        },
        format,
      );
      await downloadFile(
        createMetaChatExportFilename(
          isGlobalScope ? "library-meta-chat" : story!.title,
          format,
        ),
        content,
        mimeType,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to export MetaChat.");
    } finally {
      setIsExporting(null);
    }
  }

  return (
    <div className="fixed top-0 left-0 right-0 bottom-12 z-[55] flex flex-col bg-app">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between gap-4 border-b border-divider/[0.3] px-5 py-3.5">
        <div className="min-w-0">
          <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">
            {isGlobalScope ? "Library MetaChat" : "MetaChat"}
          </div>
          <div className="mt-0.5 truncate text-[15px] font-bold leading-tight text-ink">
            {isGlobalScope ? "Entire Writing Library" : story?.title ?? "Story"}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden text-[11px] text-ink-muted sm:block">
            Out of canon · does not affect story
          </span>
          <Button variant="ghost" size="sm" onClick={props.onClose}>
            Close
          </Button>
        </div>
      </div>

      {/* Message list */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-3 px-4 py-4">
          {references.length ? (
            <div className="rounded-[10px] border border-divider/[0.35] bg-app-elevated px-3 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
                Active References
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {references.map((reference) => (
                  <button
                    key={`${reference.kind}:${reference.id}`}
                    type="button"
                    onClick={() => void handleRemoveReference(reference.id)}
                    className="rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-[11px] text-accent-soft transition hover:bg-accent/15"
                  >
                    {getMetaChatReferenceDisplay(reference)} x
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {messages.length ? (
            messages.map((message) => (
              <div
                key={message.id}
                className={
                  message.role === "user"
                    ? "ml-auto w-[92%] rounded-[10px] border border-accent/20 bg-accent/10 px-3 py-3"
                    : "mr-auto w-[92%] rounded-[10px] border border-divider/[0.35] bg-app-elevated px-3 py-3"
                }
              >
                <div className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
                  <div>{message.role === "user" ? "You" : "MetaChat"}</div>
                  <div>{new Date(message.timestamp).toLocaleString()}</div>
                </div>
                <div
                  className="prose-metachat mt-2 text-sm leading-7 text-ink-soft"
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(marked.parse(message.content) as string),
                  }}
                />
              </div>
            ))
          ) : (
            <div className="px-2 py-16 text-center text-sm text-ink-muted">
              {isGlobalScope
                ? "No library MetaChat messages yet. Compare stories, characters, universes, themes, or your writing style across the whole library."
                : "No MetaChat messages yet. Ask anything about your story — brainstorm, plan arcs, compare references, or ask questions."}
            </div>
          )}
        </div>
      </div>

      {/* Footer: notices + composer */}
      <div className="flex-shrink-0 border-t border-divider/[0.3] px-4 pb-4 pt-3">
        <div className="mx-auto max-w-2xl space-y-3">
          {error ? (
            <div className="rounded-[8px] border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}
          {failedJobs.map((job) => (
            <div
              key={job.id}
              className="rounded-[8px] border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200"
            >
              <div className="font-medium">MetaChat reply failed</div>
              {job.error ? (
                <div className="mt-1 text-rose-300/80">{job.error}</div>
              ) : null}
              {job.payload?.content ? (
                <button
                  className="mt-2 rounded px-2 py-1 text-xs font-medium text-rose-200 ring-1 ring-rose-400/30 hover:bg-rose-400/10 disabled:opacity-50"
                  disabled={retryingJobIds.has(job.id)}
                  onClick={() => void handleRetry(job.id, job.payload!.content!)}
                >
                  {retryingJobIds.has(job.id) ? "Retrying…" : "Retry"}
                </button>
              ) : null}
            </div>
          ))}
          {pendingJobs.length ? (
            <div className="rounded-[8px] border border-divider/[0.35] bg-app-elevated px-4 py-3 text-sm text-ink-muted">
              {pendingJobs.length === 1
                ? "MetaChat is generating in the background."
                : `${pendingJobs.length} MetaChat replies are generating in the background.`}
            </div>
          ) : null}
          <div className="grid grid-cols-4 gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleExport("txt")}
              disabled={isSending || Boolean(isExporting)}
            >
              {isExporting === "txt" ? "…" : "TXT"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleExport("markdown")}
              disabled={isSending || Boolean(isExporting)}
            >
              {isExporting === "markdown" ? "…" : "MD"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleExport("pdf")}
              disabled={isSending || Boolean(isExporting)}
            >
              {isExporting === "pdf" ? "…" : "PDF"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleExport("json")}
              disabled={isSending || Boolean(isExporting)}
            >
              {isExporting === "json" ? "…" : "JSON"}
            </Button>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleResetChat()}
            disabled={isSending}
          >
            Reset Chat
          </Button>
          <textarea
            className="min-h-[84px] w-full resize-y rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-accent/[0.4] focus:ring-2 focus:ring-accent/[0.15]"
            value={draft}
            onChange={(event) => {
              const nextDraft = event.target.value;
              setDraft(nextDraft);
              void setMetaChatDraft(props.storyId, nextDraft);
            }}
            placeholder={
              isGlobalScope
                ? "Compare stories, ask about recurring themes, or use @Story, @Character, @Universe…"
                : "Brainstorm, compare references, ask questions, or use @Story, @Character, @Universe…"
            }
          />
          <Button className="w-full" onClick={() => void handleSend()} disabled={isSending}>
            {isSending ? "Queueing..." : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}
