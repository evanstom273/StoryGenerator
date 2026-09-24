import type {
  DirectorIntent,
  SceneParticipantCapabilities,
  SceneParticipantCapabilityOverride,
} from "../../types/models";
import { isSceneParticipantCapabilityKey } from "../sceneParticipation";

type TimeUnit = NonNullable<DirectorIntent["timeSkip"]>["unit"];

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
    default:
      return null;
  }
}

function parseUnitString(raw: string): TimeUnit {
  const s = raw.toLowerCase();
  if (s.startsWith("hour")) return "hours";
  if (s.startsWith("day")) return "days";
  if (s.startsWith("week")) return "weeks";
  return "months";
}

/** Convert a time skip to exact minutes. */
function parseTimeSkip(text: string): DirectorIntent["timeSkip"] | null {
  const normalized = text.trim().toLowerCase();

  // "X hours/days/weeks/months later" or "in X hours/days later"
  const later = normalized.match(
    /\b(?:in\s+)?(?:(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+)(hours?|days?|weeks?|months?)\s+later\b/,
  );
  if (later) {
    const amount = parseNumberToken(later[1] ?? "");
    if (!amount) return null;
    return { unit: parseUnitString(later[2] ?? ""), amount };
  }

  // "over the next X hours/days/weeks/months"
  const overNext = normalized.match(
    /\bover\s+the\s+next\s+(?:(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+)(hours?|days?|weeks?|months?)\b/,
  );
  if (overNext) {
    const amount = parseNumberToken(overNext[1] ?? "");
    if (!amount) return null;
    return { unit: parseUnitString(overNext[2] ?? ""), amount };
  }

  // "skip X hours/days/weeks/months" or "fast forward X hours/days"
  const skipForward = normalized.match(
    /\b(?:skip|fast\s*forward)\s+(?:(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+)(hours?|days?|weeks?|months?)\b/,
  );
  if (skipForward) {
    const amount = parseNumberToken(skipForward[1] ?? "");
    if (!amount) return null;
    return { unit: parseUnitString(skipForward[2] ?? ""), amount };
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

const CAPABILITY_ASSIGNMENT =
  /\b(canSpeak|canPerformPhysicalActions|canBeAddressed|canBePhysicallyInteractedWith)\s*=\s*(true|false)\b/gi;

function parseQuotedOrBareName(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const quoted = trimmed.match(/^["“](.+?)["”]$/);
  if (quoted?.[1]?.trim()) {
    return quoted[1].trim();
  }
  if (/\s/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function parseCapabilityAssignments(
  text: string,
): Partial<SceneParticipantCapabilities> | null {
  const capabilities: Partial<SceneParticipantCapabilities> = {};
  let matched = false;
  for (const match of text.matchAll(CAPABILITY_ASSIGNMENT)) {
    const key = match[1];
    const value = match[2]?.toLowerCase();
    if (!key || !isSceneParticipantCapabilityKey(key) || (value !== "true" && value !== "false")) {
      continue;
    }
    capabilities[key] = value === "true";
    matched = true;
  }
  return matched ? capabilities : null;
}

/**
 * Parse only explicit participation directive syntax.
 * Ambiguous prose such as "she sounds remote" produces nothing.
 */
export function parseParticipantCapabilityDirective(
  text: string,
): Pick<
  DirectorIntent,
  "participantCapabilityOverrides" | "clearParticipantCapabilityOverrides" | "clearedParticipantKeys"
> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const slashNamedClear = trimmed.match(
    /(?:^|(?<=\s))\/participate\s+("[^"]+"|[^\s]+)\s+clear(?=\s|$)/i,
  );
  if (slashNamedClear?.[1] && slashNamedClear[1].toLowerCase() !== "clear") {
    const participantKey = parseQuotedOrBareName(slashNamedClear[1]);
    if (!participantKey) return null;
    return { clearedParticipantKeys: [participantKey] };
  }

  const slashClearAll = trimmed.match(
    /(?:^|(?<=\s))\/participate\s+clear(?=\s|$)/i,
  );
  if (slashClearAll && !/\bcan(?:Speak|PerformPhysicalActions|BeAddressed|BePhysicallyInteractedWith)\s*=/i.test(trimmed)) {
    return { clearParticipantCapabilityOverrides: true };
  }

  const slashAssign = trimmed.match(
    /(?:^|(?<=\s))\/participate\s+("[^"]+"|[^\s]+)((?:\s+can(?:Speak|PerformPhysicalActions|BeAddressed|BePhysicallyInteractedWith)\s*=\s*(?:true|false))+)\s*$/i,
  );
  if (slashAssign?.[1] && slashAssign[2]) {
    const participantKey = parseQuotedOrBareName(slashAssign[1]);
    const capabilities = parseCapabilityAssignments(slashAssign[2]);
    if (!participantKey || !capabilities) return null;
    const override: SceneParticipantCapabilityOverride = {
      participantKey,
      capabilities,
      source: "director_instruction",
    };
    return { participantCapabilityOverrides: [override] };
  }

  const lineAssign = trimmed.match(
    /^(?:director:\s*)?participate\s+("[^"]+"|[^\s]+)((?:\s+can(?:Speak|PerformPhysicalActions|BeAddressed|BePhysicallyInteractedWith)\s*=\s*(?:true|false))+)\s*$/i,
  );
  if (lineAssign?.[1] && lineAssign[2]) {
    const participantKey = parseQuotedOrBareName(lineAssign[1]);
    const capabilities = parseCapabilityAssignments(lineAssign[2]);
    if (!participantKey || !capabilities) return null;
    return {
      participantCapabilityOverrides: [
        {
          participantKey,
          capabilities,
          source: "director_instruction",
        },
      ],
    };
  }

  return null;
}

export function detectDirectorIntent(text: string): DirectorIntent | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const timeSkip = parseTimeSkip(trimmed);
  const sceneCut = parseSceneCut(trimmed);
  const participation = parseParticipantCapabilityDirective(trimmed);

  if (!timeSkip && !sceneCut && !participation) return null;

  return {
    ...(timeSkip ? { timeSkip } : {}),
    ...(sceneCut ? { sceneCut: true, ...(sceneCut.target ? { target: sceneCut.target } : {}) } : {}),
    ...(participation ?? {}),
  };
}

/**
 * Parse a /time slash command from a message and strip it from the text.
 * Supported: /time +2h · /time +30m · /time +3d · /time +1w
 * Also accepts without the plus sign: /time 2h
 */
export function parseSlashParticipateCommand(
  text: string,
): { intent: DirectorIntent; strippedText: string } | null {
  const re =
    /(?:^|(?<=\s))\/participate\s+(?:clear|("[^"]+"|[^\s]+)(?:\s+clear|(?:\s+can(?:Speak|PerformPhysicalActions|BeAddressed|BePhysicallyInteractedWith)\s*=\s*(?:true|false))+))(?=\s|$)/i;
  const match = text.match(re);
  if (!match) return null;

  const parsed = parseParticipantCapabilityDirective(match[0] ?? "");
  if (!parsed) return null;

  const strippedText = text.replace(re, "").trim();
  return {
    intent: parsed,
    strippedText,
  };
}

export function mergeDirectorIntents(
  ...intents: Array<DirectorIntent | null | undefined>
): DirectorIntent | null {
  const merged: DirectorIntent = {};
  for (const intent of intents) {
    if (!intent) continue;
    if (intent.timeSkip) merged.timeSkip = intent.timeSkip;
    if (intent.sceneCut) merged.sceneCut = true;
    if (intent.target?.trim()) merged.target = intent.target.trim();
    if (intent.clearParticipantCapabilityOverrides) {
      merged.clearParticipantCapabilityOverrides = true;
    }
    if (intent.clearedParticipantKeys?.length) {
      merged.clearedParticipantKeys = [
        ...(merged.clearedParticipantKeys ?? []),
        ...intent.clearedParticipantKeys,
      ];
    }
    if (intent.participantCapabilityOverrides?.length) {
      merged.participantCapabilityOverrides = [
        ...(merged.participantCapabilityOverrides ?? []),
        ...intent.participantCapabilityOverrides,
      ];
    }
  }
  return Object.keys(merged).length ? merged : null;
}
