import type { StoryMessage, StoryMessageSpeakerType } from "../../types/models";
import { formatDateTime } from "../../lib/dates";
import { parseActionSegments } from "../../lib/storyText/parseActionSegments";
import { parseSceneBlocks, formatNarratorBlockForDisplay } from "../../lib/storyText/parseSceneBlocks";
import { isAuthorDirectiveMessage } from "../../lib/storyText/authorDirectives";
import { isContinueMessage } from "../../lib/storyText/continueMode";
import { resolveLatestUserMessageBefore } from "../../lib/storyText/messageSpeechText";
import { sanitizeMessageForDisplay } from "../../lib/storyText/transcriptSanitizer";
import { isDirectorMessage } from "../../lib/storyText/directorMode";
import { cn } from "../../utils/cn";
import { Button } from "../ui/Button";
import { StoryMessagePlayButton } from "./StorySpeechControls";

interface StoryMessageBubbleProps {
  message: StoryMessage;
  messages: StoryMessage[];
  playerCharacterName: string;
  onEdit: (message: StoryMessage) => void;
  onQuickEdit?: (message: StoryMessage) => void;
  onRegenerate?: (message: StoryMessage) => void;
  isLatestAssistant?: boolean;
  onDelete: (message: StoryMessage) => void;
  highlighted?: boolean;
}

function resolveSpeakerLabel(
  role: StoryMessage["role"],
  speakerType: StoryMessageSpeakerType | undefined,
  speakerName: string | undefined,
  playerCharacterName: string,
) {
  if (role === "user") {
    if (speakerType === "author" || isAuthorDirectiveMessage({ role, speakerType, speakerName })) {
      return speakerName?.trim() || "Author";
    }

    if (speakerType === "continue" || isContinueMessage({ role, speakerType, speakerName, content: "" })) {
      return "Continue";
    }

    if (speakerType === "director" || isDirectorMessage({ role, speakerType, speakerName })) {
      return "Director";
    }

    return speakerName?.trim() || playerCharacterName;
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

function resolveSpeakerTagClass(
  role: StoryMessage["role"],
  speakerType: StoryMessageSpeakerType | undefined,
  speakerName: string | undefined,
) {
  if (role === "user") {
    if (speakerType === "author" || isAuthorDirectiveMessage({ role, speakerType, speakerName })) {
      return "text-amber-100";
    }

    if (speakerType === "continue" || isContinueMessage({ role, speakerType, speakerName, content: "" })) {
      return "text-sky-100";
    }

    if (speakerType === "director" || isDirectorMessage({ role, speakerType, speakerName })) {
      return "text-violet-200";
    }

    return "text-accent";
  }

  if (role === "system" || speakerType === "system") {
    return "text-ink-muted";
  }

  if (speakerType === "narrator") {
    return "text-ink-soft";
  }

  if (speakerName?.trim()) {
    return "text-accent";
  }

  return "text-ink";
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
  if (speakerType === "author") {
    return "border-amber-300/25 bg-amber-400/12 text-amber-100";
  }

  if (speakerType === "continue") {
    return "border-sky-300/25 bg-sky-400/12 text-sky-100";
  }

  if (speakerType === "director") {
    return "border-violet-300/25 bg-violet-400/12 text-violet-100";
  }

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
  messages,
  playerCharacterName,
  onEdit,
  onQuickEdit,
  onRegenerate,
  isLatestAssistant,
  onDelete,
  highlighted,
}: StoryMessageBubbleProps) {
  if (isContinueMessage(message)) {
    return null;
  }

  const speakerLabel = resolveSpeakerLabel(
    message.role,
    message.speakerType,
    message.speakerName,
    playerCharacterName,
  );
  const speakerTagClass = resolveSpeakerTagClass(
    message.role,
    message.speakerType,
    message.speakerName,
  );
  const initials = getInitials(speakerLabel);
  const avatarClass = resolveAvatarClass(speakerLabel, message.speakerType);

  const rowClassName =
    message.role === "system"
      ? "border-amber-300/12 bg-amber-300/5"
      : message.speakerType === "author"
        ? "border-amber-300/18 bg-amber-400/[0.06]"
      : message.speakerType === "continue"
        ? "border-sky-300/18 bg-sky-400/[0.06]"
      : message.speakerType === "director"
        ? "border-violet-300/18 bg-violet-400/[0.06]"
      : message.speakerType === "narrator"
        ? "border-white/8 bg-white/[0.02]"
        : "border-transparent bg-transparent";

  const messageIndex = messages.findIndex((entry) => entry.id === message.id);
  const latestUserMessage =
    messageIndex > 0 ? resolveLatestUserMessageBefore(messages, messageIndex) : null;

  const sanitizedContent =
    message.role === "assistant"
      ? sanitizeMessageForDisplay({
          message,
          latestUserMessage,
          playerName: playerCharacterName,
        })
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

  function renderTextLines(text: string, { forceItalic }: { forceItalic?: boolean } = {}) {
    const prepared = forceItalic ? formatNarratorBlockForDisplay(text) : text;
    const lines = prepared.replace(/\r\n/g, "\n").split("\n");

    return (
      <div className="space-y-1 whitespace-pre-wrap">
        {lines.map((line, index) => {
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

  function renderInlineSpeakerLine(speaker: string, text: string) {
    const combined = text.replace(/\s*\n+\s*/g, " ").replace(/\s+/g, " ").trim();
    const segments = parseActionSegments(combined);
    return (
      <div className="whitespace-pre-wrap">
        <span className="font-bold text-accent">{speaker}:</span>{" "}
        {renderInlineSegments(segments)}
      </div>
    );
  }

  return (
    <div
      id={`story-message-${message.id}`}
      className={cn(
        "group flex gap-3 rounded-2xl border px-3 py-3 transition hover:bg-white/[0.03]",
        highlighted ? "border-accent/60 bg-accent/10 ring-2 ring-accent/35" : "",
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
            {speakerLabel && message.role !== "assistant" ? (
              <div className={cn("truncate text-sm font-semibold", speakerTagClass)}>
                {speakerLabel}
              </div>
            ) : null}
            <div className="text-xs uppercase tracking-[0.18em] text-ink-muted">
              {message.role}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-ink-muted">{formatDateTime(message.timestamp)}</div>
            {message.role === "assistant" || message.role === "user" ? (
              <StoryMessagePlayButton
                message={message}
                messages={messages}
                playerCharacterName={playerCharacterName}
              />
            ) : null}
            <div className="hidden items-center gap-1 opacity-0 transition group-hover:flex group-hover:opacity-100">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (message.role === "assistant" && isLatestAssistant && onQuickEdit) {
                    onQuickEdit(message);
                    return;
                  }
                  onEdit(message);
                }}
              >
                Edit
              </Button>
              {message.role === "assistant" && isLatestAssistant && onRegenerate ? (
                <Button size="sm" variant="ghost" onClick={() => onRegenerate(message)}>
                  Regenerate
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => onDelete(message)}>
                Delete
              </Button>
            </div>
          </div>
        </div>
        <div className="mt-2 space-y-3 text-sm leading-7 text-ink">
          {message.role === "assistant"
            ? parseSceneBlocks(sanitizedContent).map((block, index) => (
                <div key={index}>
                  {!block.speakerLabel || block.speakerLabel === "Narrator"
                    ? renderTextLines(block.text, { forceItalic: true })
                    : renderInlineSpeakerLine(block.speakerLabel, block.text)}
                </div>
              ))
            : (
                renderTextLines(sanitizedContent)
              )}
        </div>
        <div className="mt-2 flex gap-2 group-hover:hidden">
          {message.role === "assistant" || message.role === "user" ? (
            <StoryMessagePlayButton
              message={message}
              messages={messages}
              playerCharacterName={playerCharacterName}
            />
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (message.role === "assistant" && isLatestAssistant && onQuickEdit) {
                onQuickEdit(message);
                return;
              }
              onEdit(message);
            }}
          >
            Edit
          </Button>
          {message.role === "assistant" && isLatestAssistant && onRegenerate ? (
            <Button size="sm" variant="ghost" onClick={() => onRegenerate(message)}>
              Regenerate
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => onDelete(message)}>
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
