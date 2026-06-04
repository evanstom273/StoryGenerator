import type {
  MemoryArchitectureVersion,
  StoryStateData,
  StoryStateDataV2,
} from "../types/models";
import { safeParseJsonObject } from "./ai/json";

export function safeParseStoryStateData(json: string): StoryStateData | null {
  const parsed = safeParseJsonObject<StoryStateDataV2>(json.trim());
  if (!parsed) {
    return null;
  }

  if (!parsed.updatedAt || typeof parsed.updatedAt !== "string") {
    return null;
  }

  if (!parsed.characters || typeof parsed.characters !== "object") {
    return null;
  }

  if (!Array.isArray(parsed.worldFacts) || !Array.isArray(parsed.unresolvedThreads)) {
    return null;
  }

  if (parsed.sceneState && !Array.isArray(parsed.sceneState)) {
    return null;
  }

  if (parsed.significantMemories && !Array.isArray(parsed.significantMemories)) {
    return null;
  }

  if (parsed.relationshipState && !Array.isArray(parsed.relationshipState)) {
    return null;
  }

  if (parsed.relationships && typeof parsed.relationships !== "object") {
    return null;
  }

  if (parsed.npcs && typeof parsed.npcs !== "object") {
    return null;
  }

  if (parsed.locations && typeof parsed.locations !== "object") {
    return null;
  }

  if (parsed.summaries && typeof parsed.summaries !== "object") {
    return null;
  }

  return parsed as StoryStateData;
}

export function normalizeStoryStateToV2(data: StoryStateData | null): StoryStateDataV2 {
  if (!data) {
    return { memoryArchitectureVersion: "2.0" };
  }

  const memoryArchitectureVersion: MemoryArchitectureVersion =
    data.memoryArchitectureVersion ?? "1.0";

  const indexes =
    data.indexes && typeof data.indexes === "object" && !Array.isArray(data.indexes)
      ? data.indexes
      : undefined;
  const scene =
    data.scene && typeof data.scene === "object" && !Array.isArray(data.scene)
      ? data.scene
      : undefined;
  const threads =
    data.threads && typeof data.threads === "object" && !Array.isArray(data.threads)
      ? data.threads
      : undefined;

  return {
    ...data,
    memoryArchitectureVersion,
    indexes,
    scene,
    threads,
  };
}

export function withIndexedMetadata(
  data: StoryStateDataV2,
  opts?: { indexedAt?: string; memoryArchitectureVersion?: "2.0" },
): StoryStateDataV2 {
  const indexedAt = opts?.indexedAt ?? new Date().toISOString();

  return {
    ...data,
    indexedAt,
    memoryArchitectureVersion: opts?.memoryArchitectureVersion ?? "2.0",
  };
}

