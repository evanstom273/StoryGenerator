import { describe, expect, it } from "vitest";
import {
	isSubstantialTranscriptText,
	shouldAcceptStreamDespiteSpeakerAttributionFlags,
	validateAssistantTranscriptForSave,
} from "../transcriptSanitizer";

const HIDDEN_DIALOGUE_PATTERN =
	/\b(you're saying|you said|as you said|like you said|from what you said)\b/i;

const VALID_BULLPEN = `Narrator: *Holt steps away from the briefing lectern, signaling the official conclusion of the morning meeting. Instantly, the formal atmosphere dissolves into the bullpen's usual chaotic warmth as chairs scrape back and notebooks are closed.*

Jake: *slaps both hands down on his desk and beams.* "Okay, serious police business over! Now for the actual important news—Becca is finally back in the bullpen full-time! Five weeks in high school hell is over!"

Terry: *smiles warmly and nods in agreement.* "We really missed you around here, Alvarez. The bullpen was way too rowdy without you. Peralta and Boyle almost set off a smoke detector on Tuesday."

Charles: *nods vigorously, looking thoroughly relieved.* "It's true! I swallowed a thumb tack because nobody was giving me the iconic Alvarez Stare to keep me in line!"

Amy: *shuts her organized color-coded binder with a satisfied click.* "Honestly, it still blows my mind how easily you slipped right back into high school mode, Becca."

Rosa: *leans against the doorway, crossing her arms with a faint smirk.* "Not. Once a teacher, always a teacher. That's why Henderson never saw it coming—he thought she was just another faculty member he could ignore."`;

describe("validateAssistantTranscriptForSave", () => {
	it("accepts a well-formed streamed scene without transformation", () => {
		const result = validateAssistantTranscriptForSave({
			text: VALID_BULLPEN,
			playerName: "Rebecca",
			hiddenDialoguePattern: HIDDEN_DIALOGUE_PATTERN,
		});

		expect(result.valid).toBe(true);
		expect(result.stage).toBeNull();
		expect(isSubstantialTranscriptText(VALID_BULLPEN)).toBe(true);
	});

	it("rejects all-player speaker misattribution on the raw stream", () => {
		const allRebecca = VALID_BULLPEN.replace(/^Jake:|^Terry:|^Charles:|^Amy:|^Rosa:/gm, "Rebecca:");
		const result = validateAssistantTranscriptForSave({
			text: allRebecca,
			playerName: "Rebecca",
			hiddenDialoguePattern: HIDDEN_DIALOGUE_PATTERN,
		});

		expect(result.valid).toBe(false);
		expect(["speaker_attribution", "ownership"]).toContain(result.stage);
	});

	it("rejects insubstantial streamed output", () => {
		const result = validateAssistantTranscriptForSave({
			text: "Jake: hi",
			playerName: "Rebecca",
			hiddenDialoguePattern: HIDDEN_DIALOGUE_PATTERN,
		});

		expect(result.valid).toBe(false);
		expect(result.stage).toBe("insubstantial");
	});

	it("accepts well-formatted streams even when speaker attribution is flagged", () => {
		expect(
			shouldAcceptStreamDespiteSpeakerAttributionFlags({
				text: VALID_BULLPEN,
				playerName: "Rebecca",
			}),
		).toBe(true);
	});
});
