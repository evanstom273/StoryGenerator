import type { DirectorIntent } from "../../types/models";

function parseNumberToken(token: string): number | null {
  const normalized = token.trim().toLowerCase();
  const asInt = Number.parseInt(normalized, 10);
  if (Number.isFinite(asInt)) {
    return Math.max(1, asInt);
  }

  switch (normalized) {
    case "a":
    case "an":
    case "one":
      return 1;
    case "two":
      return 2;
    case "three":
      return 3;
    case "four":
      return 4;
    case "five":
      return 5;
    case "six":
      return 6;
    case "seven":
      return 7;
    case "eight":
      return 8;
    case "nine":
      return 9;
    case "ten":
      return 10;
    case "few":
      return 3;
    default:
      return null;
  }
}

function parseTimeSkip(text: string): DirectorIntent["timeSkip"] | null {
  const normalized = text.trim().toLowerCase();

  const later = normalized.match(
    /\b(?:in\s+)?(?:(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+)?(few\s+)?(hours?|days?|weeks?|months?)\s+later\b/,
  );
  if (later) {
    const token = later[1] ?? (later[2] ? "few" : "1");
    const amount = parseNumberToken(token);
    if (!amount) return null;
    const unitRaw = later[3] ?? "";
    const unit =
      unitRaw.startsWith("hour") ? "hours" : unitRaw.startsWith("day") ? "days" : unitRaw.startsWith("week") ? "weeks" : "months";
    return { unit, amount };
  }

  const overNext = normalized.match(
    /\bover\s+the\s+next\s+(?:(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+)?(few\s+)?(hours?|days?|weeks?|months?)\b/,
  );
  if (overNext) {
    const token = overNext[1] ?? (overNext[2] ? "few" : "1");
    const amount = parseNumberToken(token);
    if (!amount) return null;
    const unitRaw = overNext[3] ?? "";
    const unit =
      unitRaw.startsWith("hour") ? "hours" : unitRaw.startsWith("day") ? "days" : unitRaw.startsWith("week") ? "weeks" : "months";
    return { unit, amount };
  }

  return null;
}

function parseSceneCut(text: string): { sceneCut: true; target?: string } | null {
  const normalized = text.trim();
  const lower = normalized.toLowerCase();

  if (/\b(meanwhile|cut back to)\b/.test(lower)) {
    const target = normalized.match(/\b(?:cut back to)\s+(.+?)(?:[.!?]|$)/i)?.[1]?.trim();
    return { sceneCut: true, ...(target ? { target } : {}) };
  }

  const cutTo = normalized.match(/\b(?:the\s+scene\s+cuts\s+to|scene\s+cuts\s+to|cut\s+to)\s+(.+?)(?:[.!?]|$)/i);
  if (cutTo?.[1]?.trim()) {
    return { sceneCut: true, target: cutTo[1].trim() };
  }

  return null;
}

export function detectDirectorIntent(text: string): DirectorIntent | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const timeSkip = parseTimeSkip(trimmed);
  const sceneCut = parseSceneCut(trimmed);

  if (!timeSkip && !sceneCut) return null;

  return {
    ...(timeSkip ? { timeSkip } : {}),
    ...(sceneCut ? { sceneCut: true, ...(sceneCut.target ? { target: sceneCut.target } : {}) } : {}),
  };
}

