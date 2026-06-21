import { useEffect, useMemo, useState } from "react";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Panel";
import { useStoryEngine } from "../../app/providers/StoryEngineProvider";
import { downloadFile } from "../../lib/download";
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
    getJobsForStory,
    getMetaChatDraft,
    getStoryById,
    getMetaMessagesForStory,
    queueMetaChatMessage,
    setMetaChatDraft,
  } = useStoryEngine();
  const story = getStoryById(props.storyId);
  const messages = useMemo(
    () => getMetaMessagesForStory(props.storyId),
    [getMetaMessagesForStory, props.storyId],
  );
  const pendingJobs = useMemo(
    () =>
      getJobsForStory(props.storyId).filter(
        (job) =>
          job.type === "metachat_generate" &&
          (job.status === "queued" || job.status === "running"),
      ),
    [getJobsForStory, props.storyId],
  );

  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isExporting, setIsExporting] = useState<MetaChatExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    if (!story) {
      setError("Story not found.");
      return;
    }

    setIsExporting(format);
    setError(null);

    try {
      const { content, mimeType } = serializeMetaChatExport(
        {
          storyTitle: story.title,
          messages,
        },
        format,
      );
      await downloadFile(createMetaChatExportFilename(story.title, format), content, mimeType);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to export MetaChat.");
    } finally {
      setIsExporting(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <Panel variant="flat" className="flex h-[min(720px,90vh)] w-full max-w-2xl flex-col" padding="lg">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
              MetaChat
            </div>
            <div className="mt-2 truncate text-lg font-semibold text-ink">
              {story?.title ?? "Story"}
            </div>
            <div className="mt-1 text-sm text-ink-muted">
              Out of canon. Does not affect story.
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={props.onClose}>
            Close
          </Button>
        </div>

        <div className="mt-5 min-h-0 flex-1 space-y-3 overflow-auto rounded-[10px] border border-divider/[0.35] bg-app p-3">
          {messages.length ? (
            messages.map((message) => (
              <div
                key={message.id}
                className={
                  message.role === "user"
                    ? "ml-auto w-[92%] rounded-2xl border border-accent/20 bg-accent/10 px-3 py-3"
                    : "mr-auto w-[92%] rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3"
                }
              >
                <div className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
                  <div>{message.role === "user" ? "You" : "MetaChat"}</div>
                  <div>{new Date(message.timestamp).toLocaleString()}</div>
                </div>
                <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-soft">
                  {message.content}
                </div>
              </div>
            ))
          ) : (
            <div className="px-2 py-8 text-center text-sm text-ink-muted">
              No MetaChat messages yet.
            </div>
          )}
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        ) : null}
        {pendingJobs.length ? (
          <div className="mt-4 rounded-2xl border border-white/8 bg-black/15 px-4 py-3 text-sm text-ink-muted">
            {pendingJobs.length === 1
              ? "MetaChat is generating in the background."
              : `${pendingJobs.length} MetaChat replies are generating in the background.`}
          </div>
        ) : null}

        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleExport("txt")}
              disabled={isSending || Boolean(isExporting)}
            >
              {isExporting === "txt" ? "Exporting..." : "Export TXT"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleExport("markdown")}
              disabled={isSending || Boolean(isExporting)}
            >
              {isExporting === "markdown" ? "Exporting..." : "Export MD"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleExport("pdf")}
              disabled={isSending || Boolean(isExporting)}
            >
              {isExporting === "pdf" ? "Exporting..." : "Export PDF"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleExport("json")}
              disabled={isSending || Boolean(isExporting)}
            >
              {isExporting === "json" ? "Exporting..." : "Export JSON"}
            </Button>
          </div>
          <textarea
            className="min-h-[84px] w-full resize-y rounded-2xl border border-divider bg-panel-muted px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-accent/60 focus:bg-panel-strong focus:ring-2 focus:ring-accent/25"
            value={draft}
            onChange={(event) => {
              const nextDraft = event.target.value;
              setDraft(nextDraft);
              void setMetaChatDraft(props.storyId, nextDraft);
            }}
            placeholder="Brainstorm, ask questions, plan arcs…"
          />
          <Button className="w-full" onClick={() => void handleSend()} disabled={isSending}>
            {isSending ? "Queueing..." : "Send"}
          </Button>
        </div>
      </Panel>
    </div>
  );
}
