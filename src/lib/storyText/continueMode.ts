import type { StoryMessage, StoryMessageSpeakerType } from "../../types/models";

export const CONTINUE_SPEAKER_LABEL = "Continue";

function unwrapWrappedAsterisks(value: string) {
  let current = value.trim();

  while (
    current.startsWith("*") &&
    current.endsWith("*") &&
    current.length >= 2
  ) {
    current = current.slice(1, -1).trim();
  }

  return current;
}

export function normalizeContinueInstructionText(
  value: string | null | undefined,
) {
  const unwrapped = unwrapWrappedAsterisks(value ?? "");
  return unwrapped.replace(/\.+$/, "").trim().toLowerCase();
}

export function isContinueInstructionText(
  value: string | null | undefined,
) {
  return normalizeContinueInstructionText(value) === "continue";
}

export function isContinueSpeakerLabel(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase() === "continue";
}

export function isContinueMessage(
  message:
    | Pick<StoryMessage, "role" | "speakerType" | "speakerName" | "content">
    | null
    | undefined,
) {
  if (!message || message.role !== "user") {
    return false;
  }

  return (
    message.speakerType === "continue" ||
    isContinueSpeakerLabel(message.speakerName) ||
    isContinueInstructionText(message.content)
  );
}

export function resolveUserSpeakerTypeForContinue(
  isContinueInstruction: boolean,
  fallbackSpeakerType?: StoryMessageSpeakerType,
): StoryMessageSpeakerType | undefined {
  if (isContinueInstruction) {
    return "continue";
  }

  return fallbackSpeakerType;
}

export function resolveUserSpeakerNameForContinue(
  isContinueInstruction: boolean,
  fallbackSpeakerName?: string | null,
) {
  if (isContinueInstruction) {
    return CONTINUE_SPEAKER_LABEL;
  }

  const trimmed = fallbackSpeakerName?.trim();
  return trimmed || undefined;
}
