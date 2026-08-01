import { describe, expect, it } from "vitest";
import { stripNarratorBlockDisplayPrefix } from "../parseSceneBlocks";

describe("stripNarratorBlockDisplayPrefix", () => {
	it("strips Narrator and repairs possessive pseudo-labels in narrator blocks", () => {
		expect(stripNarratorBlockDisplayPrefix("Narrator: *The rain fell hard.*")).toBe("*The rain fell hard.*");
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

	it("keeps character name prefixes for dialogue lines", () => {
		expect(stripNarratorBlockDisplayPrefix("Amy: *smiles* \"Hello.\"")).toBe("Amy: *smiles* \"Hello.\"");
		expect(stripNarratorBlockDisplayPrefix("Jake: steps into the room")).toBe("Jake: steps into the room");
	});
});
