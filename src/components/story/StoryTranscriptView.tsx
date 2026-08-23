import { Fragment } from "react";
import type { RpConfig, RpTimeState, StoryChapter, StoryMessage } from "../../types/models";
import { formatTimeShort, timesDiffer } from "../../lib/rpTime";
import { cn } from "../../utils/cn";
import { parseActionSegments } from "../../lib/storyText/parseActionSegments";
import { parseSceneBlocks, formatNarratorBlockForDisplay } from "../../lib/storyText/parseSceneBlocks";
import { isAuthorDirectiveMessage } from "../../lib/storyText/authorDirectives";
import { isContinueMessage } from "../../lib/storyText/continueMode";
import { sanitizeMessageForDisplay } from "../../lib/storyText/transcriptSanitizer";
import type { CharacterTtsGenderMap } from "../../lib/ai/characterTtsVoices";
import { isDirectorMessage } from "../../lib/storyText/directorMode";
import { resolveMessageChapterBoundary, resolveChapterEndMessageIndex } from "../../lib/storyText/chapterNavigation";
import { isStoryHistoryDividerMessage } from "../../lib/guidedChapterGeneration/storyHistoryDivider";
import { ChapterListenBanner, FullStoryAudiobookControls } from "./StorySpeechControls";

type StoryTranscriptViewProps = {
  messages: StoryMessage[];
  playerCharacterName: string;
  playerLegalName?: string;
  playerSceneName?: string;
  playerPronouns?: string;
  playerAliases?: string[];
  characterGenders?: CharacterTtsGenderMap;
  storyTitle?: string;
  chapters?: StoryChapter[];
  className?: string;
  highlightedMessageId?: string | null;
  rpConfig?: RpConfig;
};

type SpeakerKind =
  | "player"
  | "author"
  | "continue"
  | "director"
  | "narrator"
  | "npc"
  | "system";

const NUMBER_WORDS = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
  "Twenty",
];

function parseRomanNumeral(value: string) {
  const roman = value.trim().toUpperCase();
  if (!roman || !/^[IVXLCDM]+$/.test(roman)) {
    return null;
  }

  const numerals: Record<string, number> = {
    I: 1,
    V: 5,
    X: 10,
    L: 50,
    C: 100,
    D: 500,
    M: 1000,
  };

  let total = 0;
  for (let index = 0; index < roman.length; index += 1) {
    const current = numerals[roman[index]];
    const next = numerals[roman[index + 1]] ?? 0;
    total += current < next ? -current : current;
  }
  return total > 0 ? total : null;
}

function toRomanNumeral(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  const table: Array<[number, string]> = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];

  let remaining = Math.trunc(value);
  let result = "";
  for (const [amount, token] of table) {
    while (remaining >= amount) {
      result += token;
      remaining -= amount;
    }
  }

  return result || null;
}

function getNextChapterBannerLabel(label: string) {
  const match = label.trim().match(/^Chapter\s+(.+)$/i);
  if (!match?.[1]) {
    return "Next Chapter";
  }

  const token = match[1].trim();
  if (/^\d+$/.test(token)) {
    return `Chapter ${Number.parseInt(token, 10) + 1}`;
  }

  const roman = parseRomanNumeral(token);
  if (roman) {
    return `Chapter ${toRomanNumeral(roman + 1) ?? roman + 1}`;
  }

  const wordIndex = NUMBER_WORDS.findIndex((word) => word.toLowerCase() === token.toLowerCase());
  if (wordIndex >= 1 && wordIndex + 1 < NUMBER_WORDS.length) {
    return `Chapter ${NUMBER_WORDS[wordIndex + 1]}`;
  }

  return "Next Chapter";
}

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
  playerLegalName,
  playerSceneName,
  playerPronouns,
  playerAliases,
  characterGenders,
  storyTitle = "Story",
  chapters,
  className,
  highlightedMessageId,
  rpConfig,
}: StoryTranscriptViewProps) {
  const effectiveLegalName = playerLegalName?.trim() || playerCharacterName;
  const effectiveSceneName = playerSceneName?.trim() || playerCharacterName;
  let latestUserMessage: string | null = null;
  let prevStoryTime: RpTimeState | undefined = undefined;
  const chapterEndByMessageId = new Map<string, string>();
  const chapterStartBeforeMessage = new Map<number, string>();
  const sortedChapters = [...(chapters ?? [])].sort((left, right) => left.endsAtIndex - right.endsAtIndex);
  for (const chapter of sortedChapters) {
    if (chapter.endsAtMessageId) {
      chapterEndByMessageId.set(chapter.endsAtMessageId, chapter.label);
    }

    const endIndex = resolveChapterEndMessageIndex(messages, chapter);
    if (endIndex !== null) {
      let hasExplicitNextStart = false;
      for (let index = endIndex + 1; index < messages.length; index += 1) {
        const boundary = resolveMessageChapterBoundary(messages[index]!);
        if (boundary?.kind === "start") {
          hasExplicitNextStart = true;
          break;
        }
      }

      if (!hasExplicitNextStart && endIndex + 1 < messages.length) {
        chapterStartBeforeMessage.set(endIndex + 2, getNextChapterBannerLabel(chapter.label));
      }
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
      {messages.map((message, messageIndex) => {
        const highlight = highlightedMessageId === message.id;
        const chapterEndLabel = chapterEndByMessageId.get(message.id);
        const explicitChapterBoundary = resolveMessageChapterBoundary(message);
        const chapterBoundary =
          explicitChapterBoundary ??
          (chapterEndLabel ? { kind: "end" as const, label: chapterEndLabel } : null);
        const chapterStartLabel = chapterStartBeforeMessage.get(messageIndex + 1);

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
              {chapterStartLabel ? (
                <ChapterListenBanner
                  messageId={message.id}
                  label={chapterStartLabel}
                  highlighted={highlight}
                  messages={messages}
                  playerCharacterName={playerCharacterName}
                />
              ) : null}
              <div
                id={`story-message-${message.id}`}
                className={cn(
                  tag.rowClass,
                  highlight && !chapterStartLabel ? "border-accent/60 bg-accent/10 ring-2 ring-accent/35" : "",
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
          latestUserMessage = message.content;
          const lines = message.content.split("\n");
          const isAuthorDirective = isAuthorDirectiveMessage(message);
          const isContinue = isContinueMessage(message);
          const isDirector = isDirectorMessage(message);
          if (isContinue || isDirector) {
            return chapterStartLabel ? (
              <Fragment key={message.id}>
                <ChapterListenBanner
                  messageId={message.id}
                  label={chapterStartLabel}
                  highlighted={highlight}
                  messages={messages}
                  playerCharacterName={playerCharacterName}
                />
              </Fragment>
            ) : null;
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
              {chapterStartLabel ? (
                <ChapterListenBanner
                  messageId={message.id}
                  label={chapterStartLabel}
                  highlighted={highlight}
                  messages={messages}
                  playerCharacterName={playerCharacterName}
                />
              ) : null}
              <div
                id={`story-message-${message.id}`}
                className={cn(
                  tag.rowClass,
                  highlight && !chapterStartLabel ? "ring-2 ring-accent/35" : "",
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

        const sanitized = sanitizeMessageForDisplay({
          message,
          latestUserMessage,
          playerName: effectiveLegalName,
          playerSceneName: effectiveSceneName,
          playerPronouns,
          playerAliases,
          characterGenders,
        });
        const blocks = parseSceneBlocks(sanitized);
        const showTimeChip = rpConfig && message.storyTime &&
          (!prevStoryTime || timesDiffer(prevStoryTime, message.storyTime));
        if (message.storyTime) prevStoryTime = message.storyTime;
        return (
          <Fragment key={message.id}>
            {chapterStartLabel ? (
              <ChapterListenBanner
                messageId={message.id}
                label={chapterStartLabel}
                highlighted={highlight}
                messages={messages}
                playerCharacterName={playerCharacterName}
              />
            ) : null}
            {showTimeChip && rpConfig && message.storyTime ? (
              <div className="select-none py-1 text-center text-[10px] text-white/25">
                {formatTimeShort(message.storyTime, rpConfig)}
              </div>
            ) : null}
            <div
              id={`story-message-${message.id}`}
              className={cn(
                "space-y-2",
                highlight && !chapterStartLabel ? "rounded-2xl bg-accent/10 px-2 py-1 ring-2 ring-accent/35" : "",
              )}
            >
              {blocks.map((block, blockIndex) => {
                const isNarration = !block.speakerLabel || block.speakerLabel === "Narrator";
                const lines = block.text.split("\n");
                const tag = isNarration
                  ? getSpeakerTag("Narrator", "narrator")
                  : getSpeakerTag(block.speakerLabel?.trim() || "Unknown", "npc");
                if (isNarration) {
                  const displayText = formatNarratorBlockForDisplay(block.text);
                  const displayLines = displayText.split("\n");
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
              })}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
