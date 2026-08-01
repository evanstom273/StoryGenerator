import { describe, expect, it } from "vitest";
import { stripNarratorBlockDisplayPrefix } from "../parseSceneBlocks";

describe("stripNarratorBlockDisplayPrefix", () => {
	it("strips Narrator and possessive prefixes in narrator blocks", () => {
		expect(stripNarratorBlockDisplayPrefix("Narrator: *The rain fell hard.*")).toBe("*The rain fell hard.*");
		expect(
			stripNarratorBlockDisplayPrefix("Jamie's: *softly runs her fingers through his hair*"),
		).toBe("*softly runs her fingers through his hair*");
	});

	it("keeps character name prefixes for dialogue lines", () => {
		expect(stripNarratorBlockDisplayPrefix("Amy: *smiles* \"Hello.\"")).toBe("Amy: *smiles* \"Hello.\"");
		expect(stripNarratorBlockDisplayPrefix("Jake: steps into the room")).toBe("Jake: steps into the room");
	});
});
