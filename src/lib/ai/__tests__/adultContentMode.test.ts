import { describe, expect, it } from "vitest";
import {
  adultContentModeToLegacyMatureFictionMode,
  adultContentModeUsesMatureFiction,
  isAdultContentMode,
  resolveAdultContentMode,
  resolveExplicitAdultRefusalFallback,
  resolveNewStoryAdultContentMode,
} from "../adultContentMode";

describe("adult content mode compatibility", () => {
  it("maps persisted legacy mature-fiction stories to non-graphic mature mode", () => {
    expect(resolveAdultContentMode({ matureFictionMode: true })).toBe(
      "mature_non_graphic",
    );
  });

  it("maps legacy false and absent settings to standard mode", () => {
    expect(resolveAdultContentMode({ matureFictionMode: false })).toBe(
      "standard",
    );
    expect(resolveAdultContentMode({})).toBe("standard");
    expect(resolveAdultContentMode()).toBe("standard");
  });

  it("defaults new stories to mature non-graphic while honoring explicit choices", () => {
    expect(resolveNewStoryAdultContentMode()).toBe("mature_non_graphic");
    expect(resolveNewStoryAdultContentMode({ matureFictionMode: false })).toBe("standard");
    expect(
      resolveNewStoryAdultContentMode({
        adultContentMode: "explicit_consensual_adults",
      }),
    ).toBe("explicit_consensual_adults");
  });

  it("treats the new mode as authoritative over the legacy boolean", () => {
    expect(
      resolveAdultContentMode({
        adultContentMode: "explicit_consensual_adults",
        matureFictionMode: false,
      }),
    ).toBe("explicit_consensual_adults");
    expect(
      resolveAdultContentMode({
        adultContentMode: "standard",
        matureFictionMode: true,
      }),
    ).toBe("standard");
  });

  it("falls back to the legacy value for an invalid persisted new value", () => {
    expect(
      resolveAdultContentMode({
        adultContentMode: "future-mode",
        matureFictionMode: true,
      }),
    ).toBe("mature_non_graphic");
  });

  it("exposes validation and legacy projection helpers", () => {
    expect(isAdultContentMode("explicit_consensual_adults")).toBe(true);
    expect(isAdultContentMode("explicit")).toBe(false);
    expect(adultContentModeUsesMatureFiction("standard")).toBe(false);
    expect(adultContentModeUsesMatureFiction("mature_non_graphic")).toBe(true);
    expect(
      adultContentModeToLegacyMatureFictionMode(
        "explicit_consensual_adults",
      ),
    ).toBe(true);
  });
});

describe("explicit adult provider-refusal fallback", () => {
  it("allows exactly one Gemini request-stage downgrade", () => {
    expect(
      resolveExplicitAdultRefusalFallback({
        providerType: "gemini",
        mode: "explicit_consensual_adults",
        failureStage: "request",
      }),
    ).toEqual({
      eligible: true,
      retryMode: "mature_non_graphic",
      maxFallbackAttempts: 1,
    });
  });

  it("rejects response-stage, repeat, non-explicit, and non-Gemini retries", () => {
    expect(
      resolveExplicitAdultRefusalFallback({
        providerType: "gemini",
        mode: "explicit_consensual_adults",
        failureStage: "response",
      }),
    ).toMatchObject({
      eligible: false,
      reason: "refusal_not_at_request_stage",
    });
    expect(
      resolveExplicitAdultRefusalFallback({
        providerType: "gemini",
        mode: "explicit_consensual_adults",
        failureStage: "request",
        fallbackAttemptsUsed: 1,
      }),
    ).toMatchObject({ eligible: false, reason: "fallback_already_used" });
    expect(
      resolveExplicitAdultRefusalFallback({
        providerType: "gemini",
        mode: "mature_non_graphic",
        failureStage: "request",
      }),
    ).toMatchObject({ eligible: false, reason: "mode_not_explicit" });
    expect(
      resolveExplicitAdultRefusalFallback({
        providerType: "openai",
        mode: "explicit_consensual_adults",
        failureStage: "request",
      }),
    ).toMatchObject({ eligible: false, reason: "provider_not_supported" });
  });
});
