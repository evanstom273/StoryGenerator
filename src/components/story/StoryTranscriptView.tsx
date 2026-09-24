import { Fragment } from "react";
import type { StoryChapter, StoryMessage } from "../../types/models";
import { cn } from "../../utils/cn";
import { parseActionSegments } from "../../lib/storyText/parseActionSegments";
import { parseSceneBlocks } from "../../lib/storyText/parseSceneBlocks";
import { normalizeSceneSpeakerLabel } from "../../lib/storyText/speakerLabels";
import { isAuthorDirectiveMessage } from "../../lib/storyText/authorDirectives";
import { isContinueMessage } from "../../lib/storyText/continueMode";
import type { CharacterTtsGenderMap } from "../../lib/ai/characterTtsVoices";
import { isDirectorMessage, isDirectorSpeakerLabel } from "../../lib/storyText/directorMode";
import { resolveMessageChapterBoundary } from "../../lib/storyText/chapterNavigation";
import { isStoryHistoryDividerMessage } from "../../lib/guidedChapterGeneration/storyHistoryDivider";
import { ChapterListenBanner, FullStoryAudiobookControls } from "./StorySpeechControls";
import type { ResolvedSceneParticipant } from "../../lib/sceneParticipation";

type StoryTranscriptViewProps = {
  messages: StoryMessage[];
  playerCharacterName: string;
  playerSceneName?: string;
  playerPronouns?: string;
  playerAliases?: string[];
  characterGenders?: CharacterTtsGenderMap;
  storyTitle?: string;
  chapters?: StoryChapter[];
  className?: string;
  highlightedMessageId?: string | null;
  /** Retained for callers; assistant speaker styling is never identity-derived. */
  resolvedParticipants?: readonly ResolvedSceneParticipant[];
};

type SpeakerKind =
  | "player"
  | "author"
  | "continue"
  | "director"
  | "narrator"
  | "npc"
  | "system";

function getSpeakerTag(label: string, kind: SpeakerKind) {
  const baseTagClass = "shrink-0 font-semibold";
  const baseRowClass = "rounded-2xl px-3 py-2";

  if (kind === "player") {
    return {
      label,
      kind,
      tagClass: cn(baseTagClass, "text-accent"),
      rowClass: cn(baseRowClass, "ml-3 border-l-2 border-accent/35 bg-accent/10"),
      contentClass: "text-ink",
    };
  }

  if (kind === "director") {
    return {
      label,
      kind,
      tagClass: cn(baseTagClass, "text-violet-200"),
      rowClass: cn(baseRowClass, "ml-3 border-l-2 border-violet-400/35 bg-violet-400/10"),
      contentClass: "text-ink-soft italic",
    };
  }

  if (kind === "continue") {
    return {
      label,
      kind,
      tagClass: cn(baseTagClass, "text-sky-100"),
      rowClass: cn(baseRowClass, "ml-3 border-l-2 border-sky-400/35 bg-sky-400/10"),
      contentClass: "text-ink-soft italic",
    };
  }

  if (kind === "author") {
    return {
      label,
      kind,
      tagClass: cn(baseTagClass, "text-amber-100"),
      rowClass: cn(baseRowClass, "ml-3 border-l-2 border-amber-400/35 bg-amber-400/10"),
      contentClass: "text-ink-soft italic",
    };
  }

  if (kind === "narrator") {
    return {
      label,
      kind,
      tagClass: cn(baseTagClass, "text-ink-soft"),
      rowClass: cn(baseRowClass, "bg-white/[0.02]"),
      contentClass: "text-ink-muted italic",
    };
  }

  if (kind === "system") {
    return {
      label,
      kind,
      tagClass: cn(baseTagClass, "text-ink-muted"),
      rowClass: cn(baseRowClass, "border border-white/10 bg-white/[0.03]"),
      contentClass: "text-ink-muted",
    };
  }

  return {
    label,
    kind,
    tagClass: cn(baseTagClass, "text-accent"),
    rowClass: "rounded-2xl px-3 py-1 bg-transparent",
    contentClass: "text-ink",
  };
}

function renderInlineContent(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const segments = parseActionSegments(trimmed);
  if (!segments.some((segment) => segment.type === "action")) {
    return <span className="text-ink">{trimmed}</span>;
  }

  return (
    <span className="text-ink">
      {segments.map((segment, index) =>
        segment.type === "action" ? (
          <span key={index} className="italic text-ink-muted">
            {segment.text}
          </span>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </span>
  );
}

function renderLine(value: string, { forceItalic }: { forceItalic: boolean }) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (forceItalic) {
    const segments = parseActionSegments(trimmed);
    return (
      <div>
        {segments.map((segment, index) => (
          <span key={index}>{segment.text}</span>
        ))}
      </div>
    );
  }

  const segments = parseActionSegments(trimmed);
  if (!segments.some((segment) => segment.type === "action")) {
    return <div className="text-ink">{trimmed}</div>;
  }

  return (
    <div className="text-ink">
      {segments.map((segment, index) =>
        segment.type === "action" ? (
          <span key={index} className="italic text-ink-muted">
            {segment.text}
          </span>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </div>
  );
}

export function StoryTranscriptView({
  messages,
  playerCharacterName,
  playerSceneName,
  storyTitle = "Story",
  chapters,
  className,
  highlightedMessageId,
}: StoryTranscriptViewProps) {
  const effectiveSceneName = playerSceneName?.trim() || playerCharacterName;
  const chapterEndByMessageId = new Map<string, string>();
  const sortedChapters = [...(chapters ?? [])].sort((left, right) => left.endsAtIndex - right.endsAtIndex);
  for (const chapter of sortedChapters) {
    if (chapter.endsAtMessageId) {
      chapterEndByMessageId.set(chapter.endsAtMessageId, chapter.label);
    }
  }
  return (
    <div className={cn("space-y-6", className)}>
      <FullStoryAudiobookControls
        messages={messages}
        playerCharacterName={playerCharacterName}
        storyTitle={storyTitle}
        chapters={chapters}
      />
      {messages.map((message) => {
        const highlight = highlightedMessageId === message.id;
        const chapterEndLabel = chapterEndByMessageId.get(message.id);
        const explicitChapterBoundary = resolveMessageChapterBoundary(message);
        const chapterBoundary =
          explicitChapterBoundary ??
          (chapterEndLabel ? { kind: "end" as const, label: chapterEndLabel } : null);

        if (chapterBoundary?.kind === "end") {
          return (
            <div
              key={message.id}
              id={`story-chapter-marker-${message.id}`}
              className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-center text-xs font-semibold uppercase tracking-[0.22em] text-ink-muted"
            >
              Chapter End · {chapterBoundary.label}
            </div>
          );
        }

        if (chapterBoundary?.kind === "start") {
          return (
            <ChapterListenBanner
              key={message.id}
              messageId={message.id}
              label={chapterBoundary.label}
              highlighted={highlight}
              messages={messages}
              playerCharacterName={playerCharacterName}
            />
          );
        }

        if (message.role === "system") {
          if (isStoryHistoryDividerMessage(message)) {
            return (
              <div
                key={message.id}
                id={`story-message-${message.id}`}
                className="rounded-2xl border border-accent/25 bg-accent/10 px-4 py-4 text-center text-sm leading-6 text-ink-soft"
              >
                {message.content}
              </div>
            );
          }

          const tag = getSpeakerTag("System", "system");
          return (
            <Fragment key={message.id}>
              <div
                id={`story-message-${message.id}`}
                className={cn(
                  tag.rowClass,
                  highlight ? "border-accent/60 bg-accent/10 ring-2 ring-accent/35" : "",
                )}
              >
                <div className="flex items-start gap-3 text-sm leading-7">
                  <div className={tag.tagClass}>{tag.label}</div>
                  <div className={cn("min-w-0 flex-1 whitespace-pre-wrap break-words", tag.contentClass)}>
                    {message.content}
                  </div>
                </div>
              </div>
            </Fragment>
          );
        }

        if (message.role === "user") {
          const lines = message.content.split("\n");
          const isAuthorDirective = isAuthorDirectiveMessage(message);
          const isContinue = isContinueMessage(message);
          const isDirector = isDirectorMessage(message);
          if (isContinue || isDirector) {
            return null;
          }
          const label = isAuthorDirective
            ? message.speakerName?.trim() || "Author"
            : message.speakerName?.trim() || effectiveSceneName || "Player";
          const tag = getSpeakerTag(
            label,
            isAuthorDirective ? "author" : "player",
          );
          return (
            <Fragment key={message.id}>
              <div
                id={`story-message-${message.id}`}
                className={cn(
                  tag.rowClass,
                  highlight ? "ring-2 ring-accent/35" : "",
                )}
              >
                <div className="flex items-start gap-3 text-sm leading-7">
                  <div className={tag.tagClass}>{tag.label}</div>
                  <div className={cn("min-w-0 flex-1 space-y-2", tag.contentClass)}>
                    {lines.map((line, index) => (
                      <div key={index}>{renderLine(line, { forceItalic: false })}</div>
                    ))}
                  </div>
                </div>
              </div>
            </Fragment>
          );
        }

        const isAssistantTranscript =
          message.role === "assistant" &&
          message.speakerType !== "director" &&
          !isDirectorSpeakerLabel(message.speakerName);
        // StoryMessage.content is canonical once saved. Transcript rendering may
        // parse its structure, but must never semantically rewrite its wording.
        const sanitized = message.content;
        const blocks = isAssistantTranscript ? parseSceneBlocks(sanitized) : [];
        return (
          <Fragment key={message.id}>
            <div
              id={`story-message-${message.id}`}
              className={cn(
                "space-y-2",
                highlight ? "rounded-2xl bg-accent/10 px-2 py-1 ring-2 ring-accent/35" : "",
              )}
            >
              {isAssistantTranscript ? blocks.map((block, blockIndex) => {
                const isNarration = !block.speakerLabel || block.speakerLabel === "Narrator";
                const lines = block.text.split("\n");
                const speakerKind: SpeakerKind = isNarration
                  ? "narrator"
                  : "npc";
                const tag = isNarration
                  ? getSpeakerTag("Narrator", "narrator")
                  : getSpeakerTag(normalizeSceneSpeakerLabel(block.speakerLabel) || "Unknown", speakerKind);
                if (isNarration) {
                  const displayLines = block.text.split("\n");
                  return (
                    <div key={blockIndex} className={tag.rowClass}>
                      <div className={cn("min-w-0 text-sm leading-7 whitespace-pre-wrap break-words", tag.contentClass)}>
                        {displayLines.map((line, index) => (
                          <div key={index}>
                            {renderLine(line, { forceItalic: true })}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={blockIndex} className={tag.rowClass}>
                    <div className="flex items-start gap-3 text-sm leading-7">
                      <div className={tag.tagClass}>{tag.label}:</div>
                      <div className={cn("min-w-0 flex-1 space-y-2 whitespace-pre-wrap break-words", tag.contentClass)}>
                        {renderInlineContent(lines.join(" ").replace(/\s+/g, " "))}
                      </div>
                    </div>
                  </div>
                );
              }) : (
                <div className="whitespace-pre-wrap break-words text-ink-soft">{message.content}</div>
              )}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
