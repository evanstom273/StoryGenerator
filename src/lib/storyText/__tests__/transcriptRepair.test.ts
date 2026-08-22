import { describe, it, expect } from "vitest";
import { detectSceneStateRenarration, sanitizeAssistantTranscript } from "../transcriptSanitizer";

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

	it("does not turn a weekday heading into a speaker label", () => {
		const result = sanitizeAssistantTranscript({
			text: "Saturday\n*He stumbles into the living room.* \"Mom?\"",
			playerName: "Jamie Peralta",
		});

		expect(result.text).not.toMatch(/^Saturday:/m);
		expect(result.text).toContain("Narrator:");
	});

	it("converts pronoun pseudo-speaker action lines into narrator prose", () => {
		const input = 'She: *takes two slow, deliberate steps toward the crib.*';
		const { text, autoRepairedNarration } = sanitizeAssistantTranscript({ text: input });
		expect(text).toContain("Narrator:");
		expect(text).toContain("She takes two slow, deliberate steps toward the crib.");
		expect(autoRepairedNarration).toBe(false);
	});

	it("preserves name-led narrator prose instead of converting to character dialogue", () => {
		const { text, autoRepairedNarration } = sanitizeAssistantTranscript({
			text: "Narrator: Ed walked into the bar and looked around.",
		});
		expect(text).toBe("Narrator: *Ed walked into the bar and looked around.*");
		expect(text).not.toMatch(/^Ed:/m);
		expect(autoRepairedNarration).toBe(false);
	});

	it("still strips generic plain-text narrator labels for repair wrapping", () => {
		const { text, autoRepairedNarration } = sanitizeAssistantTranscript({
			text: "Narrator: The room goes quiet.",
		});
		expect(text).toMatch(/^Narrator: \*The room goes quiet\.\*$/m);
		expect(autoRepairedNarration).toBe(true);
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

describe("detectSceneStateRenarration", () => {
	it("flags paraphrased player scene-state re-narration", () => {
		const result = detectSceneStateRenarration({
			latestUserMessage:
				"Jake and Amy talk quietly in the kitchen about Jamie before he wakes up in his bedroom.",
			assistantText:
				"Jake and Amy are talking quietly in the kitchen about Jamie. A few minutes later, the hallway creaks.",
		});

		expect(result.triggered).toBe(true);
	});
});
