import { describe, expect, it } from "vitest";
import {
	dialogueLooksAddressedToPlayer,
	dialogueLooksLikePlayerVoice,
	speakerLineLooksLikeMisattributedPlayer,
} from "../playerDialogueVoice";
import { repairMalformedTranscriptFormat } from "../transcriptFormatRepair";
import { getPlayerCharacterAuthorshipViolation } from "../playerProtection";
import { sanitizeAssistantTranscript } from "../transcriptSanitizer";

const CORRECT_BULLPEN = `Narrator: *Holt steps away from the briefing lectern, signaling the official conclusion of the morning meeting. Instantly, the formal atmosphere dissolves into the bullpen's usual chaotic warmth as chairs scrape back and notebooks are closed.*

Jake: *slaps both hands down on his desk and beams.* "Okay, serious police business over! Now for the actual important news—Becca is finally back in the bullpen full-time! Five weeks in high school hell is over!"

Terry: *smiles warmly and nods in agreement.* "We really missed you around here, Alvarez. The bullpen was way too rowdy without you. Peralta and Boyle almost set off a smoke detector on Tuesday."

Charles: *nods vigorously, looking thoroughly relieved.* "It's true! I swallowed a thumb tack because nobody was giving me the iconic Alvarez Stare to keep me in line!"

Amy: *shuts her organized color-coded binder with a satisfied click.* "Honestly, it still blows my mind how easily you slipped right back into high school mode, Becca. I mean, I know you taught for years before joining the department, but after five years as a detective, most people lose that instinct."

Rosa: *leans against the doorway, crossing her arms with a faint smirk.* "Not. Once a teacher, always a teacher. That's why Henderson never saw it coming—he thought she was just another faculty member he could ignore."

Rebecca: *picks up her mug and leans casually against the edge of the lectern.* "Honestly? The undercover part was easy. The hardest part was stopping myself from entirely rewriting East High's curriculum while I was sitting in faculty meetings."`;

const BULLPEN_NARRATOR = `Narrator: *Captain steps away from the briefing lectern, signaling the official conclusion of the morning meeting. Instantly, the formal atmosphere dissolves into the bullpen's usual chaotic warmth as chairs scrape back and notebooks are closed.*`;

const BULLPEN_ORPHAN_BEATS = `*slaps both hands down on his desk and beams.* "Okay, serious police business over! Now for the actual important news—Becca is finally back in the bullpen full-time! Five weeks in high school hell is over!"

*smiles warmly and nods in agreement.* "We really missed you around here, Alvarez. The bullpen was way too rowdy without you. Peralta and Boyle almost set off a smoke detector on Tuesday."

*nods vigorously, looking thoroughly relieved.* "It's true! I swallowed a thumb tack because nobody was giving me the iconic Alvarez Stare to keep me in line!"

*shuts her organized color-coded binder with a satisfied click.* "Honestly, it still blows my mind how easily you slipped right back into high school mode, Becca. I mean, I know you taught for years before joining the department, but after five years as a detective, most people lose that instinct."

*leans against the doorway, crossing her arms with a faint smirk.* "Not. Once a teacher, always a teacher. That's why Henderson never saw it coming—he thought she was just another faculty member he could ignore."

*picks up her mug and leans casually against the edge of the lectern.* "Honestly? The undercover part was easy. The hardest part was stopping myself from entirely rewriting East High's curriculum while I was sitting in faculty meetings."`;

const ALL_REBECCA_BULLPEN = `${BULLPEN_NARRATOR}

Rebecca: *slaps both hands down on his desk and beams.* "Okay, serious police business over! Now for the actual important news—Becca is finally back in the bullpen full-time! Five weeks in high school hell is over!"

Rebecca: *smiles warmly and nods in agreement.* "We really missed you around here, Alvarez. The bullpen was way too rowdy without you. Peralta and Boyle almost set off a smoke detector on Tuesday."

Rebecca: *nods vigorously, looking thoroughly relieved.* "It's true! I swallowed a thumb tack because nobody was giving me the iconic Alvarez Stare to keep me in line!"

Rebecca: *shuts her organized color-coded binder with a satisfied click.* "Honestly, it still blows my mind how easily you slipped right back into high school mode, Becca. I mean, I know you taught for years before joining the department, but after five years as a detective, most people lose that instinct."

Rebecca: *leans against the doorway, crossing her arms with a faint smirk.* "Not. Once a teacher, always a teacher. That's why Henderson never saw it coming—he thought she was just another faculty member he could ignore."

Rebecca: *picks up her mug and leans casually against the edge of the lectern.* "Honestly? The undercover part was easy. The hardest part was stopping myself from entirely rewriting East High's curriculum while I was sitting in faculty meetings."`;

describe("playerDialogueVoice", () => {
	it("detects other characters talking to Rebecca", () => {
		expect(
			dialogueLooksAddressedToPlayer(
				"We really missed you around here, Alvarez. The bullpen was way too rowdy without you.",
				"Rebecca Alvarez",
			),
		).toBe(true);
		expect(
			dialogueLooksAddressedToPlayer(
				"Okay, serious police business over! Now for the actual important news—Becca is finally back in the bullpen full-time!",
				"Rebecca Alvarez",
			),
		).toBe(true);
	});

	it("keeps Rebecca's own undercover line as player voice", () => {
		expect(
			dialogueLooksLikePlayerVoice(
				"Honestly? The undercover part was easy. The hardest part was stopping myself from entirely rewriting East High's curriculum while I was sitting in faculty meetings.",
				"Rebecca Alvarez",
			),
		).toBe(true);
	});
});

describe("bullpen speaker repair", () => {
	it("does not stamp every orphan beat as Rebecca", () => {
		const repaired = repairMalformedTranscriptFormat(`${BULLPEN_NARRATOR}\n\n${BULLPEN_ORPHAN_BEATS}`, {
			playerName: "Rebecca Alvarez",
		});

		const rebeccaLines = repaired.split("\n").filter((line) => /^Rebecca:\s/.test(line.trim()));
		expect(rebeccaLines.length).toBeLessThanOrEqual(1);
		expect(repaired).toContain(
			"Honestly? The undercover part was easy. The hardest part was stopping myself",
		);
	});

	it("strips false Rebecca labels from other characters' dialogue", () => {
		const repaired = repairMalformedTranscriptFormat(ALL_REBECCA_BULLPEN, {
			playerName: "Rebecca Alvarez",
		});

		expect(repaired).not.toContain(
			'Rebecca: *smiles warmly and nods in agreement.* "We really missed you around here, Alvarez.',
		);
		expect(repaired).toContain(
			'Rebecca: *picks up her mug and leans casually against the edge of the lectern.* "Honestly? The undercover part was easy.',
		);
	});

	it("flags misattributed player dialogue for rewrite", () => {
		const violation = getPlayerCharacterAuthorshipViolation({
			playerName: "Rebecca Alvarez",
			text: ALL_REBECCA_BULLPEN,
		});

		expect(violation?.rule).toBe("dialogue-addresses-player");
	});

	it("sanitized bullpen scene no longer reads as five Rebecca speakers", () => {
		const result = sanitizeAssistantTranscript({
			text: ALL_REBECCA_BULLPEN,
			playerName: "Rebecca Alvarez",
		});

		const rebeccaSpeakerLines = result.text
			.split("\n")
			.filter((line) => /^Rebecca:\s/.test(line.trim()));
		expect(rebeccaSpeakerLines.length).toBeLessThanOrEqual(1);
		expect(result.needsSpeakerAttributionRewrite).toBe(true);
		expect(result.text).toContain('*smiles warmly and nods in agreement.* "We really missed you around here, Alvarez.');
		expect(result.text).toContain(
			'Rebecca: *picks up her mug and leans casually against the edge of the lectern.* "Honestly? The undercover part was easy.',
		);
	});

	it("preserves a correctly attributed bullpen scene", () => {
		const result = sanitizeAssistantTranscript({
			text: CORRECT_BULLPEN,
			playerName: "Rebecca Alvarez",
		});

		expect(result.needsSpeakerAttributionRewrite).toBe(false);
		expect(result.text).toContain("Jake:");
		expect(result.text).toContain("Terry:");
		expect(result.text).toContain("Charles:");
		expect(result.text).toContain("Amy:");
		expect(result.text).toContain("Rosa:");
		expect(result.text).toMatch(/Rebecca:\s+\*picks up her mug/i);
	});
});
