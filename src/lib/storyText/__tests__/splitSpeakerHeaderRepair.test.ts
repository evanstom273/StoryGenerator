import { describe, expect, it } from "vitest";
import { repairSplitSpeakerHeaderBlocks } from "../exportCleaner";
import { applyStoryLocalIdentityToAssistantTranscript } from "../transcriptSanitizer";

const USER_WINE_SCENE = `Rebecca:
Narrator: *They gentlies run a hand down her arm with a light laugh.*
"And how did the scam ring react to that?"

Narrator: *They s The movie plays on, a slow-burn thriller that neither of them is paying particularly close attention to.*

Rebecca:
Narrator: *They smile,s leaning down to press a kiss to her forehead.*
"Mostly. Maya tried to argue that spelling is an arbitrary construct designed to oppress creative freedom, but she still turned in all three pages. I called that a victory."

Rosa:
*She lets out a quiet, tired breath.*
"They looked traumatized."`;

describe("split speaker header repair", () => {
	it("merges Rebecca and Rosa header-only lines with following narrator or action blocks", () => {
		const repaired = repairSplitSpeakerHeaderBlocks(USER_WINE_SCENE);

		expect(repaired).toContain(
			'Rebecca: *They gentlies run a hand down her arm with a light laugh.* "And how did the scam ring react to that?"',
		);
		expect(repaired).toContain('Rosa: *She lets out a quiet, tired breath.* "They looked traumatized."');
		expect(repaired).not.toMatch(/Rebecca:\s*\n\s*Narrator:/i);
	});

	it("repairs the full wine-night scene through the save pipeline", () => {
		const saved = applyStoryLocalIdentityToAssistantTranscript(USER_WINE_SCENE, {
			legalName: 'Rebecca "Becca" Alvarez',
			sceneName: "Becca",
			pronouns: "she/her",
			characterGenders: {
				rebecca: "female",
				becca: "female",
				rosa: "female",
			},
		});

		expect(saved).toContain("*She gently runs a hand down her arm with a light laugh.*");
		expect(saved).toContain("*She smiles leaning down to press a kiss to her forehead.*");
		expect(saved).toContain(
			"Narrator: *The movie plays on, a slow-burn thriller that neither of them is paying particularly close attention to.*",
		);
		expect(saved).not.toMatch(/Rebecca:\s*\n\s*Narrator:/i);
		expect(saved).not.toContain("They s ");
		expect(saved).not.toContain("smile,s");
	});
});
