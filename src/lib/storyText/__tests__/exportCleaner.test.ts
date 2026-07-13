import { describe, it, expect } from "vitest";
import { cleanTextForExport } from "../exportCleaner";

describe("cleanTextForExport", () => {
  // --- Encoding glitches ---
  it("fixes encoding glitch apostrophe (Rosa?s → Rosa's)", () => {
    expect(cleanTextForExport("Rosa?s smile faded.")).toBe("Rosa's smile faded.");
  });

  it("fixes multiple apostrophe glitches in one line", () => {
    expect(cleanTextForExport("He?s fine, it?s okay.")).toBe("He's fine, it's okay.");
  });

  it("does not corrupt digit-? sequences", () => {
    // "3?4" should not become "3'4" — only letter?letter triggers
    expect(cleanTextForExport("3?4")).toBe("3?4");
  });

  // --- Malformed quote endings ---
  it("fixes malformed quote ending: double-quote open + punctuation + *", () => {
    expect(cleanTextForExport('"Nice try?*')).toBe('"Nice try?"');
  });

  it("fixes malformed quote ending ending with !*", () => {
    expect(cleanTextForExport('"Watch out!*')).toBe('"Watch out!"');
  });

  it("leaves well-formed quoted lines alone", () => {
    const input = '"Nice try."';
    expect(cleanTextForExport(input)).toBe(input);
  });

  // --- Pronoun pseudo-speakers ---
  it("converts She: *action* to Narrator: *She action.*", () => {
    expect(cleanTextForExport("She: *slips out the door.*")).toBe(
      "Narrator: *She slips out the door.*",
    );
  });

  it("converts He: plain text to Narrator: *He plain text.*", () => {
    expect(cleanTextForExport("He: runs away")).toBe(
      "Narrator: *He runs away.*",
    );
  });

  it("converts They: *action.* to Narrator: *They action.*", () => {
    expect(cleanTextForExport("They: *exchange a glance.*")).toBe(
      "Narrator: *They exchange a glance.*",
    );
  });

  it("does not add extra period when content already ends with punctuation", () => {
    expect(cleanTextForExport("She: *nods slowly.*")).toBe(
      "Narrator: *She nods slowly.*",
    );
  });

  // --- Duplicate Narrator labels ---
  it("collapses Narrator: Narrator: text", () => {
    expect(cleanTextForExport("Narrator: Narrator: The room falls silent.")).toBe(
      "Narrator: The room falls silent.",
    );
  });

  // --- Wrapped character labels ---
  it("unwraps Narrator: Jason: text to Jason: text", () => {
    expect(cleanTextForExport('Narrator: Jason: *smirks.* "Hello."')).toBe(
      'Jason: *smirks.* "Hello."',
    );
  });

  it("does not unwrap Narrator: She: (pronoun stays as Narrator)", () => {
    expect(cleanTextForExport("Narrator: She: *sighs.*")).toBe(
      "Narrator: *She sighs.*",
    );
  });

  // --- Mixed content (multi-paragraph) ---
  it("cleans only affected lines in a multi-line block", () => {
    const input = [
      'Rosa: *smirks.* "Nice try?*',
      "",
      "She: *steps back.*",
      "",
      'Jake: "What was that?"',
    ].join("\n");
    const result = cleanTextForExport(input);
    expect(result).toContain('Rosa: *smirks.* "Nice try?"');
    expect(result).toContain("Narrator: *She steps back.*");
    expect(result).toContain('Jake: "What was that?"');
  });
});
