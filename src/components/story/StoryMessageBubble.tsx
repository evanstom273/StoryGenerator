import type { StoryMessage, StoryMessageSpeakerType } from "../../types/models";
import { formatDateTime } from "../../lib/dates";
import { cn } from "../../utils/cn";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Panel";

interface StoryMessageBubbleProps {
  message: StoryMessage;
  playerCharacterName: string;
  onEdit: (message: StoryMessage) => void;
  onDelete: (message: StoryMessage) => void;
}

function resolveSpeakerLabel(
  role: StoryMessage["role"],
  speakerType: StoryMessageSpeakerType | undefined,
  speakerName: string | undefined,
  playerCharacterName: string,
) {
  if (role === "user") {
    return playerCharacterName;
  }

  if (speakerName?.trim()) {
    return speakerName.trim();
  }

  if (speakerType === "narrator") {
    return "Narrator";
  }

  if (role === "system" || speakerType === "system") {
    return "System";
  }

  return "Assistant";
}

export function StoryMessageBubble({
  message,
  playerCharacterName,
  onEdit,
  onDelete,
}: StoryMessageBubbleProps) {
  const speakerLabel = resolveSpeakerLabel(
    message.role,
    message.speakerType,
    message.speakerName,
    playerCharacterName,
  );

  const containerClassName =
    message.role === "user" ? "justify-end" : "justify-start";
  const bubbleClassName =
    message.role === "user"
      ? "border-accent/25 bg-accent/12"
      : message.role === "system"
        ? "border-amber-300/20 bg-amber-300/10"
        : message.speakerType === "narrator"
          ? "border-white/10 bg-white/[0.035]"
          : "border-white/10 bg-white/[0.05]";

  return (
    <div className={cn("flex", containerClassName)}>
      <Panel
        className={cn("w-full max-w-3xl shadow-none", bubbleClassName)}
        padding="sm"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-ink">{speakerLabel}</div>
            <div className="mt-1 text-xs uppercase tracking-[0.18em] text-ink-muted">
              {message.role}
            </div>
          </div>
          <div className="text-xs text-ink-muted">{formatDateTime(message.timestamp)}</div>
        </div>
        <p
          className={cn(
            "mt-4 whitespace-pre-wrap text-sm leading-7 text-ink-soft",
            message.speakerType === "narrator" ? "italic" : "",
          )}
        >
          {message.content}
        </p>
        <div className="mt-4 flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => onEdit(message)}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDelete(message)}>
            Delete
          </Button>
        </div>
      </Panel>
    </div>
  );
}
