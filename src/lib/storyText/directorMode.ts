import type { StoryMessage, StoryMessageSpeakerType } from "../../types/models";
import { isAuthorDirectiveMessage } from "./authorDirectives";
import { isContinueMessage } from "./continueMode";
import { extractSpeakerPrefix } from "./extractSpeakerPrefix";
import { isLegalNameReference } from "./playerSceneName";

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

export function isPlayerLegalNameDirectorBeat(
  message: Pick<StoryMessage, "role" | "speakerType" | "speakerName" | "content">,
  legalName: string,
  sceneName: string,
): boolean {
  if (message.role !== "user") {
    return false;
  }

  if (
    isDirectorMessage(message) ||
    isAuthorDirectiveMessage(message) ||
    isContinueMessage(message)
  ) {
    return false;
  }

  const legal = legalName.trim();
  const scene = sceneName.trim();
  if (!legal || !scene || legal.toLowerCase() === scene.toLowerCase()) {
    return false;
  }

  const speaker =
    message.speakerName?.trim() || extractSpeakerPrefix(message.content)?.speakerLabel?.trim() || "";
  if (!speaker || !isLegalNameReference(speaker, legal)) {
    return false;
  }

  return true;
}

export function resolveUserTranscriptSpeaker(
  message: Pick<StoryMessage, "role" | "speakerType" | "speakerName" | "content">,
  opts: { legalName: string; sceneName?: string },
): string {
  if (message.role !== "user") {
    return "";
  }

  if (isAuthorDirectiveMessage(message)) {
    return message.speakerName?.trim() || "Author";
  }

  if (isContinueMessage(message)) {
    return "Continue";
  }

  if (isDirectorMessage(message)) {
    return DIRECTOR_SPEAKER_LABEL;
  }

  const legalName = opts.legalName.trim();
  const sceneName = opts.sceneName?.trim() || legalName;
  if (isPlayerLegalNameDirectorBeat(message, legalName, sceneName)) {
    return DIRECTOR_SPEAKER_LABEL;
  }

  return message.speakerName?.trim() || sceneName;
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
