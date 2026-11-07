import { describe, expect, it } from "vitest";
import { speakerLineLooksLikeMisattributedPlayer } from "../playerDialogueVoice";
import { repairMisattributedPlayerSpeakerLabels } from "../speakerAttributionRepair";
import { validateAssistantTranscriptForSave } from "../transcriptSanitizer";

const HIDDEN_DIALOGUE_PATTERN =
	/\b(you're saying|you said|as you said|like you said|from what you said)\b/i;

const PLAYER = 'Rebecca "Becca" Alvarez';

const USER_LIVING_ROOM_SCENE = `Narrator: *Chapter.*

The living room floor quickly accumulates a discarded heap of denim, soft cotton, and dark wool as both of them shed their clothes into the shadows beside the couch. The room is quiet now save for the faint background noise of the television screen and the steady, heavy breathing between them. Rosa lies back across the dark leather cushions of the sofa, her dark hair splayed over the armrest, her long legs uncoiled as she watches Rebecca in the flickering blue light.

Rebecca: *She steps into the leather harness, pulling the straps up over her hips and cinching her snug against her waist before adjusting the base.*

Narrator: *She positions the dildo carefully against the strap, settling the inner bulb of the harness so it sits directly and comfortably against her clit. The sudden, firm counter-pressure sends a sharp jolt of warmth straight through her core before she even takes a step.*

Rebecca: *She watches every movement, her dark eyes following the line of Rebecca's hips as her hand reaches out to lightly touch Rebecca's thigh.* "You look ridiculous standing there like that in the middle of the living room, you know that?"

Rebecca: *She adjusts the buckle at her lower back, letting out a small, unsteady breath as the pressure hits her just right.* "You didn't seem to mind it two minutes ago when I brought it out."

Rebecca: *She pulls Rebecca toward the couch by her hips, her fingers digging gently into her skin as she draws her down over her.* "I don't mind it now either. Stop hovering and get down here."`;

describe("Becca/Rosa living room speaker misattribution", () => {
	const rosaLine1 =
		'Rebecca: *She watches every movement, her dark eyes following the line of Rebecca\'s hips as her hand reaches out to lightly touch Rebecca\'s thigh.* "You look ridiculous standing there like that in the middle of the living room, you know that?"';
	const rebeccaLine =
		'Rebecca: *She adjusts the buckle at her lower back, letting out a small, unsteady breath as the pressure hits her just right.* "You didn\'t seem to mind it two minutes ago when I brought it out."';
	const rosaLine2 =
		'Rebecca: *She pulls Rebecca toward the couch by her hips, her fingers digging gently into her skin as she draws her down over her.* "I don\'t mind it now either. Stop hovering and get down here."';

	it("flags Rosa lines but keeps Rebecca first-person line", () => {
		expect(speakerLineLooksLikeMisattributedPlayer(rosaLine1, PLAYER)).toBe(true);
		expect(speakerLineLooksLikeMisattributedPlayer(rebeccaLine, PLAYER)).toBe(false);
		expect(speakerLineLooksLikeMisattributedPlayer(rosaLine2, PLAYER)).toBe(true);
	});

	it("repairs all Rosa lines in the living room scene", () => {
		const repaired = repairMisattributedPlayerSpeakerLabels(USER_LIVING_ROOM_SCENE, {
			playerName: PLAYER,
			knownTies: ["Rosa"],
		});

		expect(repaired.repairedCount).toBe(2);
		expect(repaired.text).toContain("Rosa: *She watches every movement");
		expect(repaired.text).toContain("Rosa: *She pulls Rebecca toward the couch");
		expect(repaired.text).toContain(
			'Rebecca: *She adjusts the buckle at her lower back',
		);

		const result = validateAssistantTranscriptForSave({
			text: repaired.text,
			playerName: PLAYER,
			playerSceneName: "Becca",
			playerPronouns: "she/her",
			characterGenders: { rebecca: "female", becca: "female", rosa: "female" },
			allowDirectedPlayerControl: true,
			latestUserMessage: "Director: *Rosa waits on the couch while Becca puts on the strap-on.*",
			hiddenDialoguePattern: HIDDEN_DIALOGUE_PATTERN,
			knownTies: ["Rosa"],
		});

		expect(result.valid).toBe(true);
	});

	it("infers Rosa from narrator prose when known ties are absent", () => {
		const repaired = repairMisattributedPlayerSpeakerLabels(USER_LIVING_ROOM_SCENE, {
			playerName: PLAYER,
		});

		expect(repaired.repairedCount).toBe(2);
		expect(repaired.text).toContain("Rosa: *She pulls Rebecca toward the couch");
	});
});
