import { describe, expect, it } from "vitest";
import { formatNarratorBlockForDisplay, stripNarratorBlockDisplayPrefix } from "../parseSceneBlocks";

describe("stripNarratorBlockDisplayPrefix", () => {
	it("strips Narrator labels entirely from narrator blocks", () => {
		expect(stripNarratorBlockDisplayPrefix("Narrator: *The rain fell hard.*")).toBe("*The rain fell hard.*");
		expect(
			stripNarratorBlockDisplayPrefix("Narrator: Amy shifts closer on the mattress, wrapping her arms around both of them."),
		).toBe("Amy shifts closer on the mattress, wrapping her arms around both of them.");
		expect(
			stripNarratorBlockDisplayPrefix("Narrator: Amy: shifts closer on the mattress."),
		).toBe("Amy shifts closer on the mattress.");
	});

	it("removes colons from name pseudo-labels but keeps the name", () => {
		expect(
			stripNarratorBlockDisplayPrefix("Amy: shifts closer on the mattress, wrapping her arms around both of them."),
		).toBe("Amy shifts closer on the mattress, wrapping her arms around both of them.");
		expect(
			stripNarratorBlockDisplayPrefix("Jamie's: eyelashes fluttered open, his vision slowly adjusting."),
		).toBe("Jamie's eyelashes fluttered open, his vision slowly adjusting.");
		expect(
			stripNarratorBlockDisplayPrefix("Jamie's: *softly runs her fingers through his hair*"),
		).toBe("Jamie's *softly runs her fingers through his hair*");
	});

	it("leaves natural possessive prose unchanged", () => {
		expect(
			stripNarratorBlockDisplayPrefix("Jamie's eyelashes fluttered open, his vision slowly adjusting."),
		).toBe("Jamie's eyelashes fluttered open, his vision slowly adjusting.");
	});

	it("joins labels split across lines", () => {
		expect(
			formatNarratorBlockForDisplay("Jamie's:\neyelashes fluttered open, his vision slowly adjusting."),
		).toBe("Jamie's eyelashes fluttered open, his vision slowly adjusting.");
		expect(
			formatNarratorBlockForDisplay("Amy:\nshifts closer on the mattress, wrapping her arms around both of them."),
		).toBe("Amy shifts closer on the mattress, wrapping her arms around both of them.");
	});

	it("does not strip narrative pronoun lines", () => {
		expect(stripNarratorBlockDisplayPrefix("She shifts closer on the mattress.")).toBe(
			"She shifts closer on the mattress.",
		);
	});

	it("strips time-skip number pseudo-labels in narrator blocks", () => {
		expect(
			stripNarratorBlockDisplayPrefix(
				"Fifteen: minutes later, the neon sign of Shaw's Bar glows warmly against the dimming Brooklyn skyline.",
			),
		).toBe(
			"Fifteen minutes later, the neon sign of Shaw's Bar glows warmly against the dimming Brooklyn skyline.",
		);
		expect(
			formatNarratorBlockForDisplay(
				"*Fifteen: minutes later, the neon sign of Shaw's Bar glows warmly.*",
			),
		).toBe("Fifteen minutes later, the neon sign of Shaw's Bar glows warmly.");
	});

	it("strips Narrator prefix from name-led prose without adding a speaker colon", () => {
		expect(
			formatNarratorBlockForDisplay("Narrator: Ed walked into the bar and looked around."),
		).toBe("Ed walked into the bar and looked around.");
		expect(
			stripNarratorBlockDisplayPrefix("Narrator: Ed: walked into the bar."),
		).toBe("Ed walked into the bar.");
	});
});
