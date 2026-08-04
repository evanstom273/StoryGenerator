import { describe, it, expect } from "vitest";
import { sanitizeAssistantTranscript } from "../transcriptSanitizer";

describe("unlabelled narration repair", () => {
  it("repairs underscore-italic narration", () => {
    const { text, autoRepairedNarration } = sanitizeAssistantTranscript({
      text: "_The room goes quiet._",
    });
    expect(text).toMatch(/^Narrator: \*The room goes quiet\.\*$/m);
    expect(autoRepairedNarration).toBe(true);
  });

  it("repairs asterisk-wrapped narration", () => {
    const { text, autoRepairedNarration } = sanitizeAssistantTranscript({
      text: "*The room goes quiet.*",
    });
    expect(text).toMatch(/^Narrator: \*The room goes quiet\.\*$/m);
    expect(autoRepairedNarration).toBe(true);
  });

  it("leaves valid character lines unchanged", () => {
    const input = 'Rosa: *smirks.* "Nice try."';
    const { text, autoRepairedNarration } = sanitizeAssistantTranscript({ text: input });
    expect(text).toContain("Rosa:");
    expect(text).not.toContain("Narrator:");
    expect(autoRepairedNarration).toBe(false);
  });

  it("leaves existing Narrator: *...* unchanged", () => {
    const { text, autoRepairedNarration } = sanitizeAssistantTranscript({
      text: "Narrator: *The room goes quiet.*",
    });
    expect(text).toMatch(/^Narrator: \*The room goes quiet\.\*$/m);
    expect(autoRepairedNarration).toBe(false);
  });

  it("does not wrap pronoun-attributed action lines as Narrator", () => {
    const input = 'She: *takes two slow, deliberate steps toward the crib.*';
    const { text, autoRepairedNarration } = sanitizeAssistantTranscript({ text: input });
    expect(text).not.toContain("Narrator:");
    expect(text).toContain("She:");
    expect(autoRepairedNarration).toBe(false);
  });

  it("repairs only the unlabelled block in mixed content", () => {
    const input = [
      'Rosa: *smirks.* "Nice try."',
      "",
      "_The muffled giggle echoes._",
      "",
      'Jake: "What was that?"',
    ].join("\n");
    const { text, autoRepairedNarration } = sanitizeAssistantTranscript({ text: input });
    expect(text).toContain("Rosa:");
    expect(text).toContain("Jake:");
    expect(text).toMatch(/Narrator: \*The muffled giggle echoes\.\*/);
    expect(autoRepairedNarration).toBe(true);
  });

  it("cleans malformed asterisks inside quoted dialogue retroactively", () => {
    const input =
      'Ellie: *gestures emphatically with a french fry.* "So then Mr. Henderson goes — \'Class, silence!\' — *.except his mic was still plugged into the cafeteria speaker system, so the entire middle school heard him burp right into the microphone!*"';
    const { text } = sanitizeAssistantTranscript({ text: input });
    expect(text).toContain("except his mic was still plugged");
    expect(text).not.toContain("*.except");
    expect(text).not.toMatch(/\*Like:\*/i);
  });
});
