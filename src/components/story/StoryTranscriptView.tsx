import type { StoryMessage } from "../../types/models";
import { cn } from "../../utils/cn";
import { parseActionSegments } from "../../lib/storyText/parseActionSegments";
import { parseSceneBlocks } from "../../lib/storyText/parseSceneBlocks";
import { sanitizeAssistantTranscript } from "../../lib/storyText/transcriptSanitizer";

type StoryTranscriptViewProps = {
  messages: StoryMessage[];
  playerCharacterName: string;
  className?: string;
  highlightedMessageId?: string | null;
};

type SpeakerKind = "player" | "narrator" | "npc" | "system";

function getSpeakerTag(label: string, kind: SpeakerKind) {
  const baseTagClass = "shrink-0 font-semibold";
  const baseRowClass = "rounded-2xl px-3 py-2";

  if (kind === "player") {
    return {
      label,
      kind,
      tagClass: cn(baseTagClass, "text-blue-200"),
      rowClass: cn(baseRowClass, "ml-3 border-l-2 border-blue-400/40 bg-blue-500/10"),
      contentClass: "text-ink",
    };
  }

  if (kind === "narrator") {
    return {
      label,
      kind,
      tagClass: cn(baseTagClass, "text-zinc-300"),
      rowClass: cn(baseRowClass, "bg-white/[0.02]"),
      contentClass: "text-zinc-300 italic",
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
    rowClass: cn(baseRowClass, "bg-transparent"),
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
  className,
  highlightedMessageId,
}: StoryTranscriptViewProps) {
  let latestUserMessage: string | null = null;
  return (
    <div className={cn("space-y-6", className)}>
      {messages.map((message) => {
        const highlight = highlightedMessageId === message.id;
        if (message.role === "system") {
          const tag = getSpeakerTag("System", "system");
          return (
            <div
              key={message.id}
              id={`story-message-${message.id}`}
              className={cn(
                tag.rowClass,
                highlight ? "border-accent/60 bg-accent/10 ring-2 ring-accent/35" : "",
              )}
            >
              <div className="flex items-start gap-3 text-sm leading-7">
                <div className={tag.tagClass}>{tag.label}:</div>
                <div className={cn("min-w-0 flex-1 whitespace-pre-wrap break-words", tag.contentClass)}>
                  {message.content}
                </div>
              </div>
            </div>
          );
        }

        if (message.role === "user") {
          latestUserMessage = message.content;
          const lines = message.content.split("\n");
          const label = message.speakerName?.trim() || playerCharacterName || "Player";
          const tag = getSpeakerTag(label, "player");
          return (
            <div
              key={message.id}
              id={`story-message-${message.id}`}
              className={cn(
                tag.rowClass,
                highlight ? "ring-2 ring-accent/35" : "",
              )}
            >
              <div className="flex items-start gap-3 text-sm leading-7">
                <div className={tag.tagClass}>{tag.label}:</div>
                <div className={cn("min-w-0 flex-1 space-y-2", tag.contentClass)}>
                  {lines.map((line, index) => (
                    <div key={index}>{renderLine(line, { forceItalic: false })}</div>
                  ))}
                </div>
              </div>
            </div>
          );
        }

        const sanitized = sanitizeAssistantTranscript({
          text: message.content,
          latestUserMessage,
          playerName: playerCharacterName,
        }).text;
        const blocks = parseSceneBlocks(sanitized);
        return (
          <div
            key={message.id}
            id={`story-message-${message.id}`}
            className={cn(
              "space-y-4",
              highlight ? "rounded-2xl bg-accent/10 px-2 py-1 ring-2 ring-accent/35" : "",
            )}
          >
            {blocks.map((block, blockIndex) => {
              const isNarration = !block.speakerLabel || block.speakerLabel === "Narrator";
              const lines = block.text.split("\n");
              const tag = isNarration
                ? getSpeakerTag("Narrator", "narrator")
                : getSpeakerTag(block.speakerLabel?.trim() || "Unknown", "npc");
              return (
                <div key={blockIndex} className={tag.rowClass}>
                  <div className="flex items-start gap-3 text-sm leading-7">
                    <div className={tag.tagClass}>{tag.label}:</div>
                    <div className={cn("min-w-0 flex-1 space-y-2 whitespace-pre-wrap break-words", tag.contentClass)}>
                      {isNarration
                        ? lines.map((line, index) => (
                            <div key={index}>{renderLine(line, { forceItalic: true })}</div>
                          ))
                        : renderInlineContent(lines.join(" ").replace(/\s+/g, " "))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
