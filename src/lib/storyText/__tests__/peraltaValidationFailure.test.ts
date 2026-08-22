import { describe, expect, it } from "vitest";
import {
	sanitizeAssistantTranscript,
	validateAssistantTranscriptForSave,
} from "../transcriptSanitizer";
import { repairMalformedTranscriptFormat } from "../transcriptFormatRepair";

const HIDDEN_DIALOGUE_PATTERN =
	/\b(you're saying|you said|as you said|like you said|from what you said)\b/i;

const PERALTA_BROKEN_TAIL = `Narrator: Narrator: *The living room coffee table is currently the site of a high-stakes tactical conflict. Sunlight streams through the front window, illuminating a scattered pile of colorful Uno cards.*

Jamie: *He stumbles into the living room, gripping the edge of the hallway wall to keep from falling.* "She: Mom —"

Narrator: He: He is completely alone. Chest heaving violently, his breath comes in sharp, ragged gasps that cut off his words before he can finish a full sentence. Sweat clings to his forehead, his face drained of all color, his eyes wide with unadulterated panic.

Amy: *She drops her hand of cards onto the table, crossing the room before the paper even hits the rug.* "Jamie?: breathe. Look at me, sweetie. Take a deep breath. Where is Ellie?"

Jake: *He moves in right behind her, his easygoing demeanor vanishing in a split second as his voice drops into sharp focus.* "Hey, buddy, slow down. You're hyperventilating. Look at me — deep breath in. Talk to us. What happened?"

Mac: *He steps past the coffee table, his eyes darting past his brother out the open front doorway toward the street.* "Jamie... where's Ellie? Why didn't she come in with you?"`;

describe("Peralta suburban adventures validation failure", () => {
	it("auto-repairs common Gemini speaker malformations before validation", () => {
		const repaired = repairMalformedTranscriptFormat(PERALTA_BROKEN_TAIL, {
			playerName: "James Peralta",
		});

		expect(repaired).not.toContain("Narrator: Narrator:");
		expect(repaired).not.toContain("Narrator: He:");
		expect(repaired).not.toContain('"She: Mom');
		expect(repaired).toContain('"Mom —"');
		expect(repaired).toContain('"Jamie, breathe');
	});

	it("passes stream validation after pre-validation repair", () => {
		const result = validateAssistantTranscriptForSave({
			text: PERALTA_BROKEN_TAIL,
			playerName: "James Peralta",
			hiddenDialoguePattern: HIDDEN_DIALOGUE_PATTERN,
		});

		expect(result.valid).toBe(true);
		expect(result.text).not.toContain("Narrator: Narrator:");
		expect(result.text).not.toContain("Narrator: He:");
	});

	it("passes full sanitization for the same malformed scene tail", () => {
		const sanitized = sanitizeAssistantTranscript({
			text: PERALTA_BROKEN_TAIL,
			playerName: "James Peralta",
		});

		expect(sanitized.formatValid).toBe(true);
		expect(sanitized.text).not.toContain("Narrator: Narrator:");
	});
});
