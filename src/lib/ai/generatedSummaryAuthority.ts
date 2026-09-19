import type { PlayerCharacter, StoryMessage } from "../../types/models";
import { getPlayerCharacterNameVariants } from "../playerCharacterPrompt";

const NUMBER_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
  "eighteen", "nineteen", "twenty",
] as const;

function parseAge(value: string) {
  const digit = value.match(/\b(\d{1,3})\b/);
  if (digit) return Number(digit[1]);
  const normalized = value.trim().toLowerCase();
  const index = NUMBER_WORDS.indexOf(normalized as (typeof NUMBER_WORDS)[number]);
  return index >= 0 ? index : null;
}

function ageClaimPattern() {
  const wordAlternatives = NUMBER_WORDS.slice(1).join("|");
  return new RegExp(
    `\\b(?:(at|aged?)\\s+)?(\\d{1,3}|${wordAlternatives})(?=(?:\\s*[-\\u2013\\u2014]\\s*year[- ]old|\\s+years?\\s+old)\\b)`,
    "gi",
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function segmentNamesPlayer(segment: string, variants: string[]) {
  if (/\b(?:player character|protagonist)\b/i.test(segment)) return true;
  return variants.some((variant) =>
    new RegExp(`\\b${escapeRegExp(variant)}\\b`, "i").test(segment),
  );
}

function transcriptSupportsPlayerAge(
  age: number,
  messages: StoryMessage[],
  variants: string[],
) {
  return messages.some((message) => {
    const segments = (message.content ?? "").split(/(?<=[.!?\n])\s+/);
    return segments.some((segment) => {
      if (!segmentNamesPlayer(segment, variants)) return false;
      const claims = Array.from(segment.matchAll(ageClaimPattern()));
      if (claims.some((claim) => parseAge(claim[2] ?? "") === age)) return true;
      const transition = segment.match(/\b(?:turns?|turned|becomes?|became)\s+(\d{1,3}|[a-z]+)\b/i);
      return parseAge(transition?.[1] ?? "") === age;
    });
  });
}

function formatCanonicalAge(original: string, age: number) {
  const wasWord = /^\p{L}+$/u.test(original);
  if (wasWord && NUMBER_WORDS[age]) {
    const replacement = NUMBER_WORDS[age];
    return /^[A-Z]/.test(original)
      ? `${replacement[0]?.toUpperCase()}${replacement.slice(1)}`
      : replacement;
  }
  return String(age);
}

/**
 * Generated archive prose is a derived view, never a source of canonical player facts.
 * Correct unsupported age drift before it can be persisted and later fed back to a model.
 */
export function protectGeneratedSummaryPlayerFacts(
  summary: string,
  playerCharacter: Pick<PlayerCharacter, "name" | "aliases" | "age">,
  messages: StoryMessage[],
) {
  const canonicalAge = parseAge(playerCharacter.age);
  if (canonicalAge === null || !summary.trim()) return summary;

  const variants = getPlayerCharacterNameVariants(playerCharacter);
  return summary
    .split(/(?<=[.!?\n])\s+/)
    .map((segment) => {
      if (!segmentNamesPlayer(segment, variants)) return segment;
      return segment.replace(ageClaimPattern(), (full, prefix: string | undefined, rawAge: string) => {
        const claimedAge = parseAge(rawAge);
        if (
          claimedAge === null ||
          claimedAge === canonicalAge ||
          transcriptSupportsPlayerAge(claimedAge, messages, variants)
        ) {
          return full;
        }
        const corrected = formatCanonicalAge(rawAge, canonicalAge);
        return `${prefix ? `${prefix} ` : ""}${corrected}`;
      });
    })
    .join(" ");
}
