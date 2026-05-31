import type { StoryMessage, StoryMessageSpeakerType } from "../../types/models";
import { formatDateTime } from "../../lib/dates";
import { parseActionSegments } from "../../lib/storyText/parseActionSegments";
import { parseSceneBlocks } from "../../lib/storyText/parseSceneBlocks";
import { sanitizeAssistantTranscript } from "../../lib/storyText/transcriptSanitizer";
import { cn } from "../../utils/cn";
import { Button } from "../ui/Button";

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
    return "";
  }

  if (role === "system" || speakerType === "system") {
    return "System";
  }

  return "Assistant";
}

function getInitials(label: string) {
  const parts = label
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) {
    return "";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function hashString(value: string) {
  let hash = 0;

  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }

  return Math.abs(hash);
}

function resolveAvatarClass(label: string, speakerType: StoryMessageSpeakerType | undefined) {
  if (speakerType === "narrator") {
    return "border-white/10 bg-white/[0.04] text-ink-soft";
  }

  const palette = [
    "border-sky-400/20 bg-sky-400/10 text-sky-100",
    "border-violet-400/25 bg-violet-400/12 text-violet-100",
    "border-emerald-400/20 bg-emerald-400/10 text-emerald-100",
    "border-amber-400/20 bg-amber-400/10 text-amber-100",
    "border-rose-400/20 bg-rose-400/10 text-rose-100",
  ];

  return palette[hashString(label) % palette.length] ?? palette[0];
}

export function StoryMessageBubble({
  message,
  playerCharacterName,
  onEdit,
  onDelete,
}: StoryMessageBubbleProps) {
  const isNarration = message.speakerType === "narrator" && message.role === "assistant";
  const speakerLabel = resolveSpeakerLabel(
    message.role,
    message.speakerType,
    message.speakerName,
    playerCharacterName,
  );
  const initials = getInitials(speakerLabel);
  const avatarClass = resolveAvatarClass(speakerLabel, message.speakerType);

  const rowClassName =
    message.role === "system"
      ? "border-amber-300/12 bg-amber-300/5"
      : message.speakerType === "narrator"
        ? "border-white/8 bg-white/[0.02]"
        : "border-transparent bg-transparent";

  const sanitizedContent =
    message.role === "assistant"
      ? sanitizeAssistantTranscript({ text: message.content }).text
      : message.content;

  function renderInlineSegments(
    segments: ReturnType<typeof parseActionSegments>,
    { forceItalic }: { forceItalic?: boolean } = {},
  ) {
    return segments.map((segment, index) => {
      if (segment.type === "action") {
        return (
          <span key={index} className="italic text-ink-muted">
            {segment.text}
          </span>
        );
      }

      return (
        <span
          key={index}
          className={forceItalic ? "italic text-ink-muted" : undefined}
        >
          {segment.text}
        </span>
      );
    });
  }

  function parseActionLine(line: string) {
    const trimmed = line.trim();
    if (trimmed.startsWith("*") && trimmed.endsWith("*") && trimmed.length > 2) {
      const inner = trimmed.slice(1, -1).trim();
      if (inner) {
        return inner;
      }
    }

    return null;
  }

  function renderTextLines(text: string, { forceItalic }: { forceItalic?: boolean } = {}) {
    const lines = text.replace(/\r\n/g, "\n").split("\n");

    return (
      <div className="space-y-1 whitespace-pre-wrap">
        {lines.map((line, index) => {
          const actionLine = parseActionLine(line);
          if (actionLine) {
            return (
              <div key={index} className="italic text-ink-muted">
                {actionLine}
              </div>
            );
          }

          if (!line.trim()) {
            return <div key={index} className="h-2" />;
          }

          const segments = parseActionSegments(line);

          if (forceItalic) {
            return (
              <div key={index} className="italic text-ink-muted">
                {renderInlineSegments(segments, { forceItalic: true })}
              </div>
            );
          }

          return <div key={index}>{renderInlineSegments(segments)}</div>;
        })}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group flex gap-3 rounded-2xl border px-3 py-3 transition hover:bg-white/[0.03]",
        rowClassName,
      )}
    >
      <div
        className={cn(
          "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border text-xs font-semibold",
          avatarClass,
        )}
      >
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div className="flex min-w-0 items-center gap-2">
            {speakerLabel ? (
              <div className="truncate text-sm font-semibold text-ink">
                {speakerLabel}
              </div>
            ) : null}
            <div className="text-xs uppercase tracking-[0.18em] text-ink-muted">
              {message.role}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-ink-muted">{formatDateTime(message.timestamp)}</div>
            <div className="hidden items-center gap-1 opacity-0 transition group-hover:flex group-hover:opacity-100">
              <Button size="sm" variant="ghost" onClick={() => onEdit(message)}>
                Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onDelete(message)}>
                Delete
              </Button>
            </div>
          </div>
        </div>
        <div className="mt-2 space-y-3 text-sm leading-7 text-ink-soft">
          {message.role === "assistant"
            ? parseSceneBlocks(sanitizedContent).map((block, index) => (
                <div key={index}>
                  {block.speakerLabel && block.speakerLabel !== "Narrator" ? (
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">
                      {block.speakerLabel}
                    </div>
                  ) : null}
                  {renderTextLines(block.text, {
                    forceItalic: !block.speakerLabel || block.speakerLabel === "Narrator",
                  })}
                </div>
              ))
            : (
                renderTextLines(sanitizedContent)
              )}
        </div>
        <div className="mt-2 flex gap-2 group-hover:hidden">
          <Button size="sm" variant="ghost" onClick={() => onEdit(message)}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDelete(message)}>
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
