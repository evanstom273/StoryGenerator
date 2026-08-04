import { describe, expect, it } from "vitest";
import { dedupeStatusBullets } from "../characterStatus";

describe("dedupeStatusBullets", () => {
	it("collapses near-duplicate Jake waiting bullets", () => {
		const deduped = dedupeStatusBullets([
			"Sitting in the bullpen furiously twirling a pen",
			"Impatiently counting down the 15 minutes until 3:00 PM Wands at Four",
			"Sitting in the bullpen counting down to Wands at Four",
		]);
		expect(deduped.length).toBeLessThanOrEqual(2);
		expect(deduped.join(" ").toLowerCase()).toContain("wands at four");
	});
});
