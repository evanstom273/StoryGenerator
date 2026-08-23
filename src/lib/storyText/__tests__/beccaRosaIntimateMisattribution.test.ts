import { describe, expect, it } from "vitest";
import { speakerLineLooksLikeMisattributedPlayer } from "../playerDialogueVoice";
import { validateAssistantTranscriptForSave } from "../transcriptSanitizer";

const HIDDEN_DIALOGUE_PATTERN =
	/\b(you're saying|you said|as you said|like you said|from what you said)\b/i;

const MISATTRIBUTED_INTIMATE_SCENE = `Narrator: *The living room cushions are cool against bare skin as the last of their clothes drop in a soft pile on the hardwood floor beside the coffee table.*

Rebecca: *She steps into the leather straps, pulling them up over her thighs and hipbones with practiced ease.* *She reaches down to seat the internal bulb comfortably against herself, adjusting the fit until the base rests snug and secure.*

Rebecca: *She shifts her hips slightly on the leather sofa, watching every movement with a dark, steady focus.* "You take your time on purpose. Just to make me wait."

Rebecca: *She fastens the side buckle, testing the tension against her skin before looking up.* "I like making sure everything is aligned properly. Precision is important, Detective."

Rebecca: *She lets out a low, rough laugh, her knees parting wider as she reaches out to trace her fingers up Rebecca's outer thigh.* "Precision my ass. Get over here before I drag you down."`;

describe("Becca/Rosa intimate speaker misattribution", () => {
	it("flags Rosa dialogue and action beats mislabeled as Rebecca", () => {
		expect(
			speakerLineLooksLikeMisattributedPlayer(
				'Rebecca: *She shifts her hips slightly on the leather sofa, watching every movement with a dark, steady focus.* "You take your time on purpose. Just to make me wait."',
				'Rebecca "Becca" Alvarez',
			),
		).toBe(true);
		expect(
			speakerLineLooksLikeMisattributedPlayer(
				'Rebecca: *She lets out a low, rough laugh, her knees parting wider as she reaches out to trace her fingers up Rebecca\'s outer thigh.* "Precision my ass. Get over here before I drag you down."',
				'Rebecca "Becca" Alvarez',
			),
		).toBe(true);
		expect(
			speakerLineLooksLikeMisattributedPlayer(
				'Rebecca: *She fastens the side buckle, testing the tension against her skin before looking up.* "I like making sure everything is aligned properly. Precision is important, Detective."',
				'Rebecca "Becca" Alvarez',
			),
		).toBe(false);
	});

	it("requires speaker-attribution rewrite for the misattributed intimate scene", () => {
		const result = validateAssistantTranscriptForSave({
			text: MISATTRIBUTED_INTIMATE_SCENE,
			playerName: 'Rebecca "Becca" Alvarez',
			playerSceneName: "Becca",
			playerPronouns: "she/her",
			allowDirectedPlayerControl: true,
			latestUserMessage:
				"Director: *A moment later and there's a pile of clothes on the floor as both Rosa and Becca have stripped off. Rosa is lying there, waiting, while Becca puts the strap on, adjusting the dildo so the bulb of it sits comfortably inside her clit.*",
			hiddenDialoguePattern: HIDDEN_DIALOGUE_PATTERN,
		});

		expect(result.valid).toBe(false);
		expect(result.stage).toBe("speaker_attribution");
	});
});
