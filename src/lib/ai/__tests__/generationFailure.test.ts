import { describe, expect, it } from "vitest";
import {
  AIError,
  createGenerationFailure,
  formatProviderRefusalDiagnostic,
} from "../errors";

describe("provider refusal failure metadata", () => {
  it("reports the effective terminal attempt budget instead of the transient retry ceiling", () => {
    const failure = createGenerationFailure(
      new AIError("safety_refusal", "Gemini blocked the prompt.", 200, {
        retryable: false,
        kind: "safety",
        diagnostic: "stage=prompt; blockReason=PROHIBITED_CONTENT",
      }),
      {
        providerName: "gemini",
        model: "gemini-3.6-flash",
        attempts: 1,
        maxAttempts: 5,
      },
    );

    expect(failure).toMatchObject({
      kind: "provider_refusal",
      stage: "request",
      summaryMessage:
        "The provider declined this request under its own safeguards. Provider safeguards cannot be overridden.",
      attempts: 1,
      maxAttempts: 1,
      retryable: false,
    });
  });

  it("keeps the configured ceiling for retryable transient failures", () => {
    const failure = createGenerationFailure(
      new AIError("timeout", "Timed out", undefined, { retryable: true }),
      { attempts: 2, maxAttempts: 5 },
    );

    expect(failure).toMatchObject({
      kind: "timeout",
      attempts: 2,
      maxAttempts: 5,
      retryable: true,
    });
  });

  it("reports a provider-blocked candidate at the response stage", () => {
    const failure = createGenerationFailure(
      new AIError("safety_refusal", "Gemini blocked the response.", 200, {
        retryable: false,
        kind: "safety",
        diagnostic: "stage=response; finishReason=PROHIBITED_CONTENT",
      }),
      { attempts: 1, maxAttempts: 5 },
    );

    expect(failure).toMatchObject({
      kind: "provider_refusal",
      stage: "response",
      attempts: 1,
      maxAttempts: 1,
    });
  });

  it("preserves only bounded provider metadata and fingerprints refusal prose", () => {
    const diagnostic = formatProviderRefusalDiagnostic(
      "status=200; provider=Gemini; stage=prompt; blockReason=PROHIBITED_CONTENT; raw=private scene text",
    );

    expect(diagnostic).toContain("status=200");
    expect(diagnostic).toContain("stage=prompt");
    expect(diagnostic).toContain("blockReason=PROHIBITED_CONTENT");
    expect(diagnostic).toMatch(/\[redacted length=\d+ fingerprint=fnv1a:[0-9a-f]{8}\]/);
    expect(diagnostic).not.toContain("private scene text");
  });

  it("does not fingerprint an already redacted diagnostic again", () => {
    const diagnostic = "[redacted length=73 fingerprint=fnv1a:4d39258d]";
    expect(formatProviderRefusalDiagnostic(diagnostic)).toBe(diagnostic);
  });
});
