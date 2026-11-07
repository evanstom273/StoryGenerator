import { describe, expect, it } from "vitest";
import type { GenerationFailure } from "../../../lib/ai/errors";
import {
  formatFailureDetails,
  getGenerationFailurePresentation,
} from "../GenerationFailureModal";

const refusal: GenerationFailure = {
  kind: "provider_refusal",
  stage: "request",
  summaryMessage: "Gemini filtered this request.",
  providerName: "gemini",
  model: "gemini-3.6-flash",
  attempts: 1,
  maxAttempts: 1,
  retryable: false,
  diagnostic: "[redacted length=73 fingerprint=fnv1a:4d39258d]",
};

describe("GenerationFailureModal refusal presentation", () => {
  it("explains supported recovery choices without pretending safeguards can be bypassed", () => {
    const presentation = getGenerationFailurePresentation(refusal);

    expect(presentation.title).toBe("The provider declined this request");
    expect(presentation.recovery).toContain("cannot be overridden");
    expect(presentation.recovery).toContain("mature non-graphic mode");
    expect(presentation.recovery).toContain("another configured provider");
    expect(presentation.retryLabel).toBe("Retry original request");
  });

  it("reports when the separate non-graphic fallback was already attempted", () => {
    const presentation = getGenerationFailurePresentation({
      ...refusal,
      diagnostic: `${refusal.diagnostic}; fallback=content_minimized_mature_non_graphic`,
    });

    expect(presentation.recovery).toContain("was attempted once");
    expect(presentation.recovery).toContain("no further automatic request");
    expect(presentation.recovery).not.toContain("was not retried automatically");
  });

  it("shows that automatic retry stopped and keeps diagnostics redacted", () => {
    const details = formatFailureDetails(refusal);

    expect(details).toContain("attempts=1/1");
    expect(details).toContain("automaticRetry=stopped");
    expect(details).toContain(refusal.diagnostic);
  });

  it("retains the generic presentation for other failures", () => {
    expect(
      getGenerationFailurePresentation({ ...refusal, kind: "timeout", retryable: true }),
    ).toMatchObject({ title: "Why it failed", retryLabel: "Retry", recovery: null });
  });
});
