import type { StoryState } from "../types/models";
import { safeParseStoryStateData } from "./storyStateV2";

export const ARCHIVE_EXPORT_REINDEX_MAX_AGE_MS = 5 * 60_000;

function toTimestampMs(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : null;
}

export function getArchiveIndexStatus(
  storyState: StoryState | null | undefined,
  opts?: { nowMs?: number; maxAgeMs?: number },
) {
  const nowMs = opts?.nowMs ?? Date.now();
  const maxAgeMs = opts?.maxAgeMs ?? ARCHIVE_EXPORT_REINDEX_MAX_AGE_MS;
  const parsed = storyState?.stateJson ? safeParseStoryStateData(storyState.stateJson) : null;

  const indexedAt =
    parsed?.lastDeepIndexedAt ??
    parsed?.indexedAt ??
    parsed?.lastIndexedAt ??
    storyState?.updatedAt ??
    null;

  const indexedAtMs = toTimestampMs(indexedAt);

  if (indexedAtMs == null) {
    return {
      indexedAt: null,
      ageMs: null,
      isFresh: false,
      needsRefresh: true,
      reason: "missing" as const,
    };
  }

  const ageMs = Math.max(0, nowMs - indexedAtMs);
  const isFresh = ageMs <= maxAgeMs;

  return {
    indexedAt,
    ageMs,
    isFresh,
    needsRefresh: !isFresh,
    reason: isFresh ? ("fresh" as const) : ("stale" as const),
  };
}
