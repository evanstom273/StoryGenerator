import { describe, expect, it } from "vitest";
import { repairSpeakerLabelArtifacts } from "../exportCleaner";
import {
	applyStoryLocalIdentityToAssistantTranscript,
	validateAssistantTranscriptForSave,
} from "../transcriptSanitizer";
import { normalizeCharacterActionBeatsInTranscript } from "../playerSceneName";
import { speakerLineLooksLikeMisattributedPlayer } from "../playerDialogueVoice";

const HIDDEN_DIALOGUE_PATTERN =
	/\b(you're saying|you said|as you said|like you said|from what you said)\b/i;

const BECCA_ROSA_MALFORMED = `Narrator: Narrator: *The apartment was quiet, the only sound the soft hum of the refrigerator.*
Rosa: *was still wearing her dark t-shirt from the day before.*
Rebecca: Narrator: *Tilt their head up slightly to look at her.* "A soup spoon? Did he think it was sharper than it was, or was it a style choice?"
Rebecca: Narrator: *Reach for their glass of wine.*
Narrator: Narrator: *She moved her hand down...against their shirt.*`;

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

	it("does not flag valid player third-person dialogue as misattributed", () => {
		expect(
			speakerLineLooksLikeMisattributedPlayer(
				'Rebecca: *Tilt their head up slightly to look at her.* "A soup spoon? Did he think it was sharper than it was, or was it a style choice?"',
				'Rebecca "Becca" Alvarez',
			),
		).toBe(false);
	});

	it("passes stream validation for malformed Becca/Rosa scene without rewrite retries", () => {
		const result = validateAssistantTranscriptForSave({
			text: BECCA_ROSA_MALFORMED,
			playerName: 'Rebecca "Becca" Alvarez',
			playerSceneName: "Becca",
			playerPronouns: "she/her",
			characterGenders: {
				rebecca: "female",
				becca: "female",
				rosa: "female",
			},
			allowDirectedPlayerControl: true,
			latestUserMessage: "Director: *Becca and Rosa are in the apartment.*",
			hiddenDialoguePattern: HIDDEN_DIALOGUE_PATTERN,
		});

		expect(result.valid).toBe(true);
		expect(result.text).toContain("Becca: *She tilts her head up slightly to look at her.*");
		expect(result.text).not.toContain("Rebecca: Narrator:");
		expect(result.text).not.toContain("Narrator: Narrator:");
		expect(result.text).not.toMatch(/^(?:Becca|Rebecca|Rosa):.*\btheir\b/im);
	});
});
