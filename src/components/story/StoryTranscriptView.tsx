import type { StoryMessage } from "../../types/models";
import { cn } from "../../utils/cn";
import { parseActionSegments } from "../../lib/storyText/parseActionSegments";
import { parseSceneBlocks } from "../../lib/storyText/parseSceneBlocks";
import { sanitizeAssistantTranscript } from "../../lib/storyText/transcriptSanitizer";

type StoryTranscriptViewProps = {
  messages: StoryMessage[];
  playerCharacterName: string;
  className?: string;
};

function stripSurroundingAsterisks(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("*") && trimmed.endsWith("*") && trimmed.length > 2) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function renderLine(value: string, { forceItalic }: { forceItalic: boolean }) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const isFullLineAction = trimmed.startsWith("*") && trimmed.endsWith("*") && trimmed.length > 2;

  if (isFullLineAction) {
    return (
      <div className="italic text-ink-muted">{stripSurroundingAsterisks(trimmed)}</div>
    );
  }

  if (forceItalic) {
    return <div className="italic text-ink-muted">{trimmed}</div>;
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
}: StoryTranscriptViewProps) {
  return (
    <div className={cn("space-y-6 text-[16px] leading-8 sm:text-[15px] sm:leading-7", className)}>
      {messages.map((message) => {
        if (message.role === "system") {
          return (
            <div
              key={message.id}
              className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-ink-muted"
            >
              {message.content}
            </div>
          );
        }

        if (message.role === "user") {
          const lines = message.content.split("\n");
          return (
            <div key={message.id} className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                {playerCharacterName}
              </div>
              <div className="space-y-2">
                {lines.map((line, index) => (
                  <div key={index}>{renderLine(line, { forceItalic: false })}</div>
                ))}
              </div>
            </div>
          );
        }

        const sanitized = sanitizeAssistantTranscript({ text: message.content }).text;
        const blocks = parseSceneBlocks(sanitized);
        return (
          <div key={message.id} className="space-y-4">
            {blocks.map((block, blockIndex) => {
              const isNarration = !block.speakerLabel || block.speakerLabel === "Narrator";
              const lines = block.text.split("\n");
              return (
                <div key={blockIndex} className="space-y-2">
                  {isNarration ? null : (
                    <div className="text-sm font-semibold text-accent">
                      {block.speakerLabel}
                    </div>
                  )}
                  <div className="space-y-2">
                    {lines.map((line, index) => (
                      <div key={index}>{renderLine(line, { forceItalic: isNarration })}</div>
                    ))}
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
