import { describe, expect, it } from "vitest";
import {
  ADULT_CONTENT_PROVIDER_PROFILES,
  getAdultContentProviderCapability,
  getAdultContentProviderProfile,
} from "../providerCapabilities";

describe("adult-content provider capabilities", () => {
  it("classifies Gemini explicit generation as best effort", () => {
    expect(
      getAdultContentProviderCapability(
        "gemini",
        "explicit_consensual_adults",
      ),
    ).toBe("best_effort");
    expect(getAdultContentProviderProfile("gemini").explanation).toContain(
      "may also filter",
    );
  });

  it("reports ordinary and non-graphic modes as supported", () => {
    expect(getAdultContentProviderCapability("gemini", "standard")).toBe(
      "supported",
    );
    expect(
      getAdultContentProviderCapability("anthropic", "mature_non_graphic"),
    ).toBe("supported");
  });

  it("does not advertise unverified explicit provider integrations", () => {
    expect(
      getAdultContentProviderCapability("openai", "explicit_consensual_adults"),
    ).toBe("unsupported");
    expect(
      getAdultContentProviderCapability("anthropic", "explicit_consensual_adults"),
    ).toBe("unsupported");
    expect(
      getAdultContentProviderCapability("openrouter", "explicit_consensual_adults"),
    ).toBe("unsupported");
  });

  it("uses only the three public capability values", () => {
    const allowed = new Set(["supported", "best_effort", "unsupported"]);

    for (const profile of Object.values(ADULT_CONTENT_PROVIDER_PROFILES)) {
      expect(allowed.has(profile.explicitConsensualAdults)).toBe(true);
    }
  });
});
