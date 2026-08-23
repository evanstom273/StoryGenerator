import { describe, expect, it } from "vitest";
import { makeTransmitSafe } from "../ai/transmitSafe";
import { buildMatureFictionTransmitSafeSystemNote } from "../ai/transmitSafe";

describe("makeTransmitSafe", () => {
	it("does not soften intimacy language by default", () => {
		const result = makeTransmitSafe(
			"Becca puts the strap on, adjusting the dildo against her clit.",
			{ allowPainSoftening: true },
		);
		expect(result.wasModified).toBe(false);
		expect(result.transmitText).toContain("dildo");
		expect(result.transmitText).toContain("clit");
	});

	it("softens intimacy language only when explicitly enabled", () => {
		const result = makeTransmitSafe(
			"Becca puts the strap on, adjusting the dildo against her clit.",
			{ allowIntimacySoftening: true },
		);
		expect(result.wasModified).toBe(true);
		expect(result.transmitText).toContain("harness");
		expect(result.transmitText).not.toContain("dildo");
	});
});

describe("buildMatureFictionTransmitSafeSystemNote", () => {
	it("includes canonical director staging for explicit output", () => {
		const original =
			"Director: *Becca puts the strap on, adjusting the dildo against her clit.*";
		const transmitSafe = makeTransmitSafe(original, { allowIntimacySoftening: true });
		const note = buildMatureFictionTransmitSafeSystemNote(transmitSafe, original);
		expect(note).toContain("Canonical Director staging");
		expect(note).toContain("dildo");
		expect(note).toContain("clit");
	});
});
