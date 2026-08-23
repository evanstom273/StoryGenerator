import { describe, expect, it } from "vitest";
import { repairSpeakerLabelArtifacts } from "../exportCleaner";
import { applyStoryLocalIdentityToAssistantTranscript } from "../transcriptSanitizer";
import { normalizeCharacterActionBeatsInTranscript } from "../playerSceneName";

describe("Becca and Rosa pronoun regressions", () => {
	it("unwraps Rebecca: Narrator: embedded labels", () => {
		const repaired = repairSpeakerLabelArtifacts(
			'Rebecca: Narrator: *Tilt their head up slightly to look at her.* "A soup spoon?"',
		);

		expect(repaired).toBe(
			'Rebecca: *Tilt their head up slightly to look at her.* "A soup spoon?"',
		);
		expect(repaired).not.toContain("Narrator:");
	});

	it("formats Rebecca action beats with she/her instead of their", () => {
		const normalized = normalizeCharacterActionBeatsInTranscript(
			'Rebecca: *Tilt their head up slightly to look at her.* "A soup spoon?"',
			{
				characterGenders: {
					rebecca: "female",
					rosa: "female",
				},
			},
		);

		expect(normalized).toContain("*She tilts her head up slightly to look at her.*");
		expect(normalized).not.toContain("their");
	});

	it("repairs Rebecca narrator malformation through the save pipeline", () => {
		const saved = applyStoryLocalIdentityToAssistantTranscript(
			'Rebecca: Narrator: *Tilt their head up slightly to look at her.* "A soup spoon? Did he think it was sharper than it was, or was it a style choice?"',
			{
				legalName: 'Rebecca "Becca" Alvarez',
				sceneName: "Becca",
				pronouns: "she/her",
				characterGenders: {
					rebecca: "female",
					becca: "female",
					rosa: "female",
				},
			},
		);

		expect(saved).toContain('Becca: *She tilts her head up slightly to look at her.*');
		expect(saved).not.toContain("Narrator:");
		expect(saved).not.toContain("their");
	});
});
