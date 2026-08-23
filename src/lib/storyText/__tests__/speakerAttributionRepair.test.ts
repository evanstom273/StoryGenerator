import { describe, expect, it } from "vitest";
import { repairMisattributedPlayerSpeakerLabels } from "../speakerAttributionRepair";
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

const ALL_REBECCA_BULLPEN = `Narrator: *Captain steps away from the briefing lectern.*

Rebecca: *smiles warmly and nods in agreement.* "We really missed you around here, Alvarez."

Rebecca: *leans against the doorway, crossing her arms with a faint smirk.* "Not. Once a teacher, always a teacher."`;

describe("repairMisattributedPlayerSpeakerLabels", () => {
	it("reassigns Rosa lines in a two-person intimate scene", () => {
		const repaired = repairMisattributedPlayerSpeakerLabels(USER_REPORTED_SCENE, {
			playerName: 'Rebecca "Becca" Alvarez',
			knownTies: ["Rosa"],
		});

		expect(repaired.repaired).toBe(true);
		expect(repaired.repairedCount).toBe(2);
		expect(repaired.text).toContain(
			'Rosa: *She hers eyes trace the strap-on against Rebecca\'s hips',
		);
		expect(repaired.text).toContain(
			'Rosa: *She reaches out, her hands coming up to grip Rebecca\'s hips',
		);
		expect(repaired.text).toContain(
			'Rebecca: *She steps over the low coffee table, placing a knee on the edge of the cushion right between Rosa\'s open thighs.*',
		);
	});

	it("passes validation after local speaker repair for the user-reported scene", () => {
		const repaired = repairMisattributedPlayerSpeakerLabels(USER_REPORTED_SCENE, {
			playerName: 'Rebecca "Becca" Alvarez',
			knownTies: ["Rosa"],
		});

		const result = validateAssistantTranscriptForSave({
			text: repaired.text,
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

	it("does not guess speakers when multiple NPCs are present", () => {
		const repaired = repairMisattributedPlayerSpeakerLabels(ALL_REBECCA_BULLPEN, {
			playerName: "Rebecca Alvarez",
		});

		expect(repaired.repaired).toBe(false);
		expect(repaired.text).toContain(
			'Rebecca: *smiles warmly and nods in agreement.* "We really missed you around here, Alvarez."',
		);
	});
});
