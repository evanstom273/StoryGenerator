import { describe, expect, it } from "vitest";
import { buildMatureFictionPolicyBlock } from "../matureFictionPolicy";

describe("mature-fiction policy modes", () => {
  it("keeps standard mode non-graphic without claiming mature mode is enabled", () => {
    const policy = buildMatureFictionPolicyBlock({ mode: "standard" });

    expect(policy).toContain("Adult content mode: standard.");
    expect(policy).toContain("Do not introduce graphic sexual content");
    expect(policy).not.toContain("mature fiction (non-graphic)");
    expect(policy).not.toContain("explicit consensual-adult fiction");
  });

  it("allows mature themes while keeping mature non-graphic mode non-graphic", () => {
    const policy = buildMatureFictionPolicyBlock({
      mode: "mature_non_graphic",
      includeParity: true,
    });

    expect(policy).toContain("Adult content mode: mature fiction (non-graphic).");
    expect(policy).toContain("Keep sexual intimacy non-graphic.");
    expect(policy).toContain("Maintain narrative parity");
    expect(policy).not.toContain("explicit consensual-adult fiction");
  });

  it("requires confirmed fictional adults and ongoing consent in explicit mode", () => {
    const policy = buildMatureFictionPolicyBlock({
      mode: "explicit_consensual_adults",
      providerCapability: "best_effort",
    });

    expect(policy).toContain("explicit consensual-adult fiction");
    expect(policy).toContain("every sexual participant is fictional and an adult");
    expect(policy).toContain("ongoing and revocable");
    expect(policy).toContain("minors or characters of ambiguous age");
    expect(policy).toContain("best effort");
    expect(policy).toContain("do not evade, weaken, or bypass provider safeguards");
    expect(policy).not.toContain("Keep sexual intimacy non-graphic.");
  });

  it("falls back to non-graphic output when the provider is unsupported", () => {
    const policy = buildMatureFictionPolicyBlock({
      mode: "explicit_consensual_adults",
      providerCapability: "unsupported",
    });

    expect(policy).toContain("unsupported for explicit detail");
    expect(policy).toContain("Continue non-graphically or fade to black");
  });

  it("preserves non-graphic mature behaviour for unmigrated callers", () => {
    const policy = buildMatureFictionPolicyBlock();

    expect(policy).toContain("Adult content mode: mature fiction (non-graphic).");
    expect(policy).not.toContain("explicit consensual-adult fiction");
  });
});
