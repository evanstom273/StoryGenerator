import { describe, expect, it } from "vitest";
import { stripDisplaySpeakerPrefix } from "../parseSceneBlocks";

describe("stripDisplaySpeakerPrefix", () => {
	it("strips Narrator and character prefixes", () => {
		expect(stripDisplaySpeakerPrefix("Narrator: *The rain fell hard.*")).toBe("*The rain fell hard.*");
		expect(stripDisplaySpeakerPrefix("Amy: *smiles* \"Hello.\"")).toBe("*smiles* \"Hello.\"");
		expect(stripDisplaySpeakerPrefix("Jamie's: *softly runs her fingers through his hair*")).toBe(
			"*softly runs her fingers through his hair*",
		);
	});

	it("leaves plain dialogue unchanged", () => {
		expect(stripDisplaySpeakerPrefix("\"Hey. Shh, it's okay.\"")).toBe("\"Hey. Shh, it's okay.\"");
	});
});
