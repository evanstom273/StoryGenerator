import type { AIProviderType, StoryAdultContentMode } from "../../types/models";

export const ADULT_CONTENT_MODES = [
  "standard",
  "mature_non_graphic",
  "explicit_consensual_adults",
] as const satisfies readonly StoryAdultContentMode[];

export type AdultContentMode = StoryAdultContentMode;

export const EXPLICIT_ADULT_REFUSAL_FALLBACK_MAX_ATTEMPTS = 1 as const;

export type AdultContentRefusalStage =
  | "precheck"
  | "request"
  | "response"
  | "parse"
  | "validation";

export type ExplicitAdultRefusalFallbackIneligibleReason =
  | "mode_not_explicit"
  | "provider_not_supported"
  | "refusal_not_at_request_stage"
  | "fallback_already_used";

export type ExplicitAdultRefusalFallbackDecision =
  | {
      eligible: true;
      retryMode: "mature_non_graphic";
      maxFallbackAttempts: typeof EXPLICIT_ADULT_REFUSAL_FALLBACK_MAX_ATTEMPTS;
    }
  | {
      eligible: false;
      retryMode: null;
      maxFallbackAttempts: typeof EXPLICIT_ADULT_REFUSAL_FALLBACK_MAX_ATTEMPTS;
      reason: ExplicitAdultRefusalFallbackIneligibleReason;
    };

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

/**
 * A provider refusal is authoritative: this decision never retries the same
 * explicit request. It only permits Gemini's request-stage refusal to fall
 * back once to the product's existing mature, non-graphic mode.
 *
 * Response-stage refusals are deliberately excluded because a response may
 * contain a partial generated draft, which must not be sent back to the
 * provider as retry input.
 */
export function resolveExplicitAdultRefusalFallback(options: {
  providerType: AIProviderType;
  mode: AdultContentMode;
  failureStage: AdultContentRefusalStage;
  fallbackAttemptsUsed?: number;
}): ExplicitAdultRefusalFallbackDecision {
  const common = {
    retryMode: null,
    maxFallbackAttempts: EXPLICIT_ADULT_REFUSAL_FALLBACK_MAX_ATTEMPTS,
  } as const;

  if (options.mode !== "explicit_consensual_adults") {
    return { eligible: false, reason: "mode_not_explicit", ...common };
  }

  if (options.providerType !== "gemini") {
    return { eligible: false, reason: "provider_not_supported", ...common };
  }

  if (options.failureStage !== "request") {
    return {
      eligible: false,
      reason: "refusal_not_at_request_stage",
      ...common,
    };
  }

  const fallbackAttemptsUsed = Number.isFinite(options.fallbackAttemptsUsed)
    ? Math.max(0, Math.floor(options.fallbackAttemptsUsed ?? 0))
    : 0;
  if (fallbackAttemptsUsed >= EXPLICIT_ADULT_REFUSAL_FALLBACK_MAX_ATTEMPTS) {
    return { eligible: false, reason: "fallback_already_used", ...common };
  }

  return {
    eligible: true,
    retryMode: "mature_non_graphic",
    maxFallbackAttempts: EXPLICIT_ADULT_REFUSAL_FALLBACK_MAX_ATTEMPTS,
  };
}
