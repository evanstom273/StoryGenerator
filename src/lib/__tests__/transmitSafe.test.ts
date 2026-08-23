import { describe, expect, it } from "vitest";
import { makeTransmitSafe } from "../ai/transmitSafe";

describe("makeTransmitSafe", () => {
	it("does not soften intimacy language", () => {
		const result = makeTransmitSafe(
			"Becca puts the strap on, adjusting the dildo against her clit.",
			{ allowPainSoftening: true },
		);
		expect(result.wasModified).toBe(false);
		expect(result.transmitText).toContain("dildo");
		expect(result.transmitText).toContain("clit");
	});
});
