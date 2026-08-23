import { describe, expect, it } from "vitest";
import { buildTransmitSafeSystemNote, makeTransmitSafe } from "../ai/transmitSafe";

describe("makeTransmitSafe", () => {
	it("softens intimacy language for mature-mode provider retries", () => {
		const result = makeTransmitSafe(
			"Becca puts the strap on, adjusting the dildo against her clit.",
			{ allowIntimacySoftening: true },
		);
		expect(result.wasModified).toBe(true);
		expect(result.transmitText).toContain("harness");
		expect(result.transmitText).toContain("toy");
		expect(result.transmitText).toContain("sensitive spot");
		expect(result.transmitText).not.toContain("dildo");
	});

	it("includes mature-fiction guidance in the transmit-safe note", () => {
		const result = makeTransmitSafe("Rosa wears the strap-on tonight.", {
			allowIntimacySoftening: true,
		});
		const note = buildTransmitSafeSystemNote(result);
		expect(note).toContain("Mature Fiction mode is enabled");
	});
});
