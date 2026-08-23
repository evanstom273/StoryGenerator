import type { StoryAdultContentMode } from "../../types/models";

export const ADULT_CONTENT_MODES = [
  "standard",
  "mature_non_graphic",
  "explicit_consensual_adults",
] as const satisfies readonly StoryAdultContentMode[];

export type AdultContentMode = StoryAdultContentMode;

/**
 * The structural shape deliberately accepts persisted records from both sides of
 * the adult-content-mode migration. Once `adultContentMode` has been written, it
 * is authoritative. Older stories continue to use `matureFictionMode`.
 */
export interface AdultContentModeSource {
  adultContentMode?: AdultContentMode | string | null;
  matureFictionMode?: boolean | null;
}

export function isAdultContentMode(value: unknown): value is AdultContentMode {
  return (
    typeof value === "string" &&
    (ADULT_CONTENT_MODES as readonly string[]).includes(value)
  );
}

export function resolveAdultContentMode(
  source?: AdultContentModeSource | null,
): AdultContentMode {
  if (isAdultContentMode(source?.adultContentMode)) {
    return source.adultContentMode;
  }

  return source?.matureFictionMode
    ? "mature_non_graphic"
    : "standard";
}

/** New stories keep the historical product default of mature, non-graphic fiction. */
export function resolveNewStoryAdultContentMode(
  source?: AdultContentModeSource | null,
): AdultContentMode {
  if (isAdultContentMode(source?.adultContentMode)) {
    return source.adultContentMode;
  }
  if (source?.matureFictionMode === false) {
    return "standard";
  }
  return "mature_non_graphic";
}

export function adultContentModeUsesMatureFiction(
  mode: AdultContentMode,
): boolean {
  return mode !== "standard";
}

export function adultContentModeToLegacyMatureFictionMode(
  mode: AdultContentMode,
): boolean {
  return adultContentModeUsesMatureFiction(mode);
}
