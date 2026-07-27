import type { StoryMessage, StoryMessageSpeakerType } from "../../types/models";

export const DIRECTOR_SPEAKER_LABEL = "Director";

export function isDirectorSpeakerLabel(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase() === "director";
}

export function isDirectorMessage(
  message:
    | Pick<StoryMessage, "role" | "speakerType" | "speakerName">
    | null
    | undefined,
) {
  if (!message || message.role !== "user") {
    return false;
  }

  return (
    message.speakerType === "director" || isDirectorSpeakerLabel(message.speakerName)
  );
}

export function resolveUserSpeakerType(
  speakerLabel: string | null | undefined,
  fallbackSpeakerType?: StoryMessageSpeakerType,
): StoryMessageSpeakerType {
  if (isDirectorSpeakerLabel(speakerLabel)) {
    return "director";
  }

  return fallbackSpeakerType ?? "player";
}

export function resolveUserSpeakerName(
  speakerLabel: string | null | undefined,
  fallbackSpeakerName?: string | null,
  fallbackSpeakerType?: StoryMessageSpeakerType,
) {
  if (
    isDirectorSpeakerLabel(speakerLabel) ||
    fallbackSpeakerType === "director" ||
    isDirectorSpeakerLabel(fallbackSpeakerName)
  ) {
    return DIRECTOR_SPEAKER_LABEL;
  }

  const normalizedLabel = speakerLabel?.trim();
  if (normalizedLabel) {
    return normalizedLabel;
  }

  const normalizedFallback = fallbackSpeakerName?.trim();
  return normalizedFallback || undefined;
}
