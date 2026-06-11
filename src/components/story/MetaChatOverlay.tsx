import { useEffect, useMemo, useState } from "react";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Panel";
import { useStoryEngine } from "../../app/providers/StoryEngineProvider";

export function MetaChatOverlay(props: {
  open: boolean;
  storyId: string;
  onClose: () => void;
}) {
  const { getStoryById, getMetaMessagesForStory, sendMetaChatMessage } = useStoryEngine();
  const story = getStoryById(props.storyId);
  const messages = useMemo(
    () => getMetaMessagesForStory(props.storyId),
    [getMetaMessagesForStory, props.storyId],
  );

  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!props.open) {
      setDraft("");
      setIsSending(false);
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

    try {
      await sendMetaChatMessage(props.storyId, trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send MetaChat message.");
      setDraft(trimmed);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <Panel className="flex h-[min(720px,90vh)] w-full max-w-2xl flex-col" padding="lg">
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

        <div className="mt-5 min-h-0 flex-1 space-y-3 overflow-auto rounded-2xl border border-white/8 bg-black/10 p-3">
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

        <div className="mt-4 space-y-3">
          <textarea
            className="min-h-[84px] w-full resize-y rounded-2xl border border-divider bg-panel-muted px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-accent/60 focus:bg-panel-strong focus:ring-2 focus:ring-accent/25"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Brainstorm, ask questions, plan arcs…"
          />
          <Button className="w-full" onClick={() => void handleSend()} disabled={isSending}>
            {isSending ? "Sending..." : "Send"}
          </Button>
        </div>
      </Panel>
    </div>
  );
}

