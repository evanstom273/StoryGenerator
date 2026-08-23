import type { StoryMessage, StoryMessageSpeakerType } from "../../types/models";
import { useState } from "react";
import { formatDateTime } from "../../lib/dates";
import { parseActionSegments } from "../../lib/storyText/parseActionSegments";
import { parseSceneBlocks, formatNarratorBlockForDisplay } from "../../lib/storyText/parseSceneBlocks";
import { isAuthorDirectiveMessage } from "../../lib/storyText/authorDirectives";
import { isContinueMessage } from "../../lib/storyText/continueMode";
import { resolveLatestUserMessageBefore } from "../../lib/storyText/messageSpeechText";
import { sanitizeMessageForDisplay } from "../../lib/storyText/transcriptSanitizer";
import type { CharacterTtsGenderMap } from "../../lib/ai/characterTtsVoices";
import { isDirectorMessage, isPlayerLegalNameDirectorBeat, resolveUserTranscriptSpeaker } from "../../lib/storyText/directorMode";
import { cn } from "../../utils/cn";
import { Button } from "../ui/Button";

interface StoryMessageBubbleProps {
  message: StoryMessage;
  messages: StoryMessage[];
  playerCharacterName: string;
  playerLegalName?: string;
  playerSceneName?: string;
  playerPronouns?: string;
  playerAliases?: string[];
  characterGenders?: CharacterTtsGenderMap;
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
  opts?: { playerLegalName?: string; playerSceneName?: string; messageContent?: string },
) {
  if (role === "user") {
    return resolveUserTranscriptSpeaker(
      {
        role,
        speakerType,
        speakerName,
        content: opts?.messageContent ?? "",
      },
      {
        legalName: opts?.playerLegalName?.trim() || playerCharacterName,
        sceneName: opts?.playerSceneName?.trim() || playerCharacterName,
      },
    );
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
  isDirectorBeat = false,
) {
  if (role === "user") {
    if (speakerType === "author" || isAuthorDirectiveMessage({ role, speakerType, speakerName })) {
      return "text-amber-100";
    }

    if (speakerType === "continue" || isContinueMessage({ role, speakerType, speakerName, content: "" })) {
      return "text-sky-100";
    }

    if (isDirectorBeat || speakerType === "director" || isDirectorMessage({ role, speakerType, speakerName })) {
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
  playerLegalName,
  playerSceneName,
  playerPronouns,
  playerAliases,
  characterGenders,
  onEdit,
  onQuickEdit,
  onRegenerate,
  isLatestAssistant,
  onDelete,
  highlighted,
}: StoryMessageBubbleProps) {
  const effectiveLegalName = playerLegalName?.trim() || playerCharacterName;
  const effectiveSceneName = playerSceneName?.trim() || playerCharacterName;
  const isContinue = isContinueMessage(message);
  const isDirector =
    isDirectorMessage(message) ||
    isPlayerLegalNameDirectorBeat(message, effectiveLegalName, effectiveSceneName);

  const speakerLabel = resolveSpeakerLabel(
    message.role,
    message.speakerType,
    message.speakerName,
    effectiveSceneName,
    {
      playerLegalName: effectiveLegalName,
      playerSceneName: effectiveSceneName,
      messageContent: message.content,
    },
  );
  const speakerTagClass = resolveSpeakerTagClass(
    message.role,
    message.speakerType,
    message.speakerName,
    isDirector,
  );
  const initials = getInitials(speakerLabel);
  const avatarClass = resolveAvatarClass(speakerLabel, isDirector ? "director" : message.speakerType);

  const rowClassName =
    message.role === "system"
      ? "border-amber-300/12 bg-amber-300/5"
      : message.speakerType === "author"
        ? "border-amber-300/18 bg-amber-400/[0.06]"
      : isContinue || message.speakerType === "continue"
        ? "border-sky-300/18 bg-sky-400/[0.06]"
      : isDirector || message.speakerType === "director"
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
          playerName: effectiveLegalName,
          playerSceneName: effectiveSceneName,
          playerPronouns,
          playerAliases,
          characterGenders,
        })
      : message.content;

  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");

  async function handleCopyMessage() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopyStatus("copied");
      window.setTimeout(() => setCopyStatus("idle"), 1500);
    } catch {
      window.prompt("Copy message:", message.content);
    }
  }

  function renderMessageActions(className?: string) {
    return (
      <div className={cn("flex items-center gap-1", className)}>
        <Button size="sm" variant="ghost" onClick={() => void handleCopyMessage()}>
          {copyStatus === "copied" ? "Copied" : "Copy"}
        </Button>
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
    );
  }

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
              <div className="min-w-0">
                <div className={cn("truncate text-sm font-semibold", speakerTagClass)}>
                  {speakerLabel}
                </div>
                {isDirector ? (
                  <div className="text-[10px] text-violet-200/75">
                    Out-of-character scene staging
                  </div>
                ) : isContinue ? (
                  <div className="text-[10px] text-sky-200/75">
                    Extend the current scene
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="text-xs uppercase tracking-[0.18em] text-ink-muted">
              {message.role}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-ink-muted">{formatDateTime(message.timestamp)}</div>
            <div className="hidden items-center gap-1 opacity-0 transition group-hover:flex group-hover:opacity-100">
              {renderMessageActions()}
            </div>
          </div>
        </div>
        <div className="mt-2 space-y-3 text-sm leading-7 text-ink">
          {message.role === "assistant"
            ? parseSceneBlocks(sanitizedContent).map((block, index) => (
                <div key={index}>
                  {!block.speakerLabel || block.speakerLabel === "Narrator"
                    ? renderTextLines(formatNarratorBlockForDisplay(block.text), { forceItalic: true })
                    : renderInlineSpeakerLine(block.speakerLabel, block.text)}
                </div>
              ))
            : (
                renderTextLines(sanitizedContent)
              )}
        </div>
        <div className="mt-2 group-hover:hidden">{renderMessageActions()}</div>
      </div>
    </div>
  );
}
