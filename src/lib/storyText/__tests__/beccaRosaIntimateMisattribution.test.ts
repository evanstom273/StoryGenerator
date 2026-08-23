import { describe, expect, it } from "vitest";
import { speakerLineLooksLikeMisattributedPlayer } from "../playerDialogueVoice";
import { normalizeCharacterActionBeatsInTranscript } from "../playerSceneName";
import { validateAssistantTranscriptForSave } from "../transcriptSanitizer";

const HIDDEN_DIALOGUE_PATTERN =
	/\b(you're saying|you said|as you said|like you said|from what you said)\b/i;

const USER_REPORTED_SCENE = `Narrator: *Chapter.*

Narrator: *The living room rug becomes a temporary landing pad for discarded denim, cotton, and leather as both of them strip down without a second thought. Rosa sprawls back against the cushions, her dark hair scattered over the armrest, her breathing still quick and uneven as she waits, her gaze fixed entirely on Rebecca.*

Rebecca: *She steps into the leather straps, pulling them taut over her hips and adjusting the back until the fit is snug and familiar.*

Narrator: *Rebecca secures the harness around her waist, taking a moment to position the attached dildo so the inner contoured bulb settles firmly inside her, pressing directly against her clit with every movement.*

Rebecca: *She hers eyes trace the strap-on against Rebecca's hips, her throat shifting as she swallows.* "You look entirely too pleased with yourself right now."

Rebecca: *She steps over the low coffee table, placing a knee on the edge of the cushion right between Rosa's open thighs.* "That's because I know exactly how much you're going to like this."

Rebecca: *She reaches out, her hands coming up to grip Rebecca's hips, her fingers digging into the leather straps.* "Then stop standing there looking pretty and bring it here."`;

describe("Becca/Rosa intimate speaker misattribution", () => {
	it("flags Rosa lines that reference Rebecca in third person on a Rebecca label", () => {
		expect(
			speakerLineLooksLikeMisattributedPlayer(
				'Rebecca: *She hers eyes trace the strap-on against Rebecca\'s hips, her throat shifting as she swallows.* "You look entirely too pleased with yourself right now."',
				'Rebecca "Becca" Alvarez',
			),
		).toBe(true);
		expect(
			speakerLineLooksLikeMisattributedPlayer(
				'Rebecca: *She reaches out, her hands coming up to grip Rebecca\'s hips, her fingers digging into the leather straps.* "Then stop standing there looking pretty and bring it here."',
				'Rebecca "Becca" Alvarez',
			),
		).toBe(true);
	});

	it("keeps Rebecca lines that use first-person voice toward Rosa", () => {
		expect(
			speakerLineLooksLikeMisattributedPlayer(
				'Rebecca: *She steps over the low coffee table, placing a knee on the edge of the cushion right between Rosa\'s open thighs.* "That\'s because I know exactly how much you\'re going to like this."',
				'Rebecca "Becca" Alvarez',
			),
		).toBe(false);
	});

	it("requires speaker-attribution rewrite before local repair for the user-reported scene", () => {
		const result = validateAssistantTranscriptForSave({
			text: USER_REPORTED_SCENE,
			playerName: 'Rebecca "Becca" Alvarez',
			playerSceneName: "Becca",
			playerPronouns: "she/her",
			characterGenders: {
				rebecca: "female",
				becca: "female",
				rosa: "female",
			},
			allowDirectedPlayerControl: true,
			latestUserMessage:
				"Director: *Both Rosa and Becca strip down. Rosa waits on the couch while Becca puts on the strap-on.*",
			hiddenDialoguePattern: HIDDEN_DIALOGUE_PATTERN,
		});

		expect(result.valid).toBe(false);
		expect(result.stage).toBe("speaker_attribution");
	});

	it("passes validation after prevalidate repair for the user-reported scene", () => {
		const result = validateAssistantTranscriptForSave({
			text: USER_REPORTED_SCENE,
			playerName: 'Rebecca "Becca" Alvarez',
			playerSceneName: "Becca",
			playerPronouns: "she/her",
			characterGenders: {
				rebecca: "female",
				becca: "female",
				rosa: "female",
			},
			allowDirectedPlayerControl: true,
			latestUserMessage:
				"Director: *Both Rosa and Becca strip down. Rosa waits on the couch while Becca puts on the strap-on.*",
			hiddenDialoguePattern: HIDDEN_DIALOGUE_PATTERN,
			knownTies: ["Rosa"],
		});

		expect(result.valid).toBe(true);
	});

	it("repairs Hers eyes corruption from possessive determiner normalization", () => {
		const normalized = normalizeCharacterActionBeatsInTranscript(
			"Rebecca: *Her eyes trace the strap-on against Rebecca's hips.*",
			{
				playerSceneName: "Becca",
				playerLegalName: 'Rebecca "Becca" Alvarez',
				playerPronouns: "she/her",
				characterGenders: {
					rebecca: "female",
					becca: "female",
					rosa: "female",
				},
			},
		);

		expect(normalized).toContain("*She lets her eyes trace");
		expect(normalized).not.toMatch(/\bhers eyes\b/i);
	});
});
