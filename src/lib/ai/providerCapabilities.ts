import type { AIProviderType } from "../../types/models";
import type { AdultContentMode } from "./adultContentMode";

export type AdultContentProviderCapability =
  | "supported"
  | "best_effort"
  | "unsupported";

export interface AdultContentProviderProfile {
  explicitConsensualAdults: AdultContentProviderCapability;
  explanation: string;
}

/**
 * These values describe Story Engine's current product integration, not a
 * permanent claim about everything a provider or individual routed model can
 * generate. Keep them conservative and review them when provider terms or the
 * selected model change.
 */
export const ADULT_CONTENT_PROVIDER_PROFILES: Readonly<
  Record<AIProviderType, AdultContentProviderProfile>
> = {
  gemini: {
    explicitConsensualAdults: "best_effort",
    explanation:
      "Gemini may continue eligible consensual-adult fiction contextually, but it may also filter a request or response. A provider safety block must be honored.",
  },
  openrouter: {
    explicitConsensualAdults: "unsupported",
    explanation:
      "Story Engine does not advertise explicit-adult support through OpenRouter until the selected routed model and provider have an explicit capability profile.",
  },
  openai: {
    explicitConsensualAdults: "unsupported",
    explanation:
      "Story Engine does not currently advertise explicit-adult generation support for this provider integration.",
  },
  anthropic: {
    explicitConsensualAdults: "unsupported",
    explanation:
      "Story Engine does not currently advertise explicit-adult generation support for this provider integration.",
  },
};

export function getAdultContentProviderProfile(
  providerType: AIProviderType,
): AdultContentProviderProfile {
  return ADULT_CONTENT_PROVIDER_PROFILES[providerType];
}

export function getAdultContentProviderCapability(
  providerType: AIProviderType,
  mode: AdultContentMode,
): AdultContentProviderCapability {
  if (mode !== "explicit_consensual_adults") {
    return "supported";
  }

  return getAdultContentProviderProfile(providerType).explicitConsensualAdults;
}
