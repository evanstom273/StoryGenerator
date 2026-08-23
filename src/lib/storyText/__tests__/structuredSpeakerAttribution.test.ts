import { describe, expect, it } from "vitest";
import { speakerLineLooksLikeMisattributedPlayer } from "../playerDialogueVoice";
import {
	analyzeSpeakerAttributionIssues,
	needsSpeakerAttributionRewrite,
} from "../transcriptFormatRepair";
import { validateAssistantTranscriptForSave } from "../transcriptSanitizer";

const PLAYER = 'Rebecca "Becca" Alvarez';
const HIDDEN_DIALOGUE_PATTERN = /hidden-dialogue-pattern-that-never-matches/i;

const MIXED_PLAYER_LINES = `Narrator: *Late-afternoon light spreads across the quiet apartment while Rebecca and Rosa sit together near the window.*

Rebecca: *She reaches for Rosa's hand.* "You look beautiful from here."

Rebecca: *She traces Rebecca's wrist while leaning closer.* "Come and sit beside me."`;

describe("structured speaker-attribution analysis", () => {
	it("keeps legitimate player second-person dialogue while identifying the invalid player-labelled line", () => {
		expect(
			speakerLineLooksLikeMisattributedPlayer(
				'Rebecca: *She reaches for Rosa\'s hand.* "You look beautiful from here."',
				PLAYER,
			),
		).toBe(false);

		const analysis = analyzeSpeakerAttributionIssues(MIXED_PLAYER_LINES, PLAYER);

		expect(analysis.needsRewrite).toBe(true);
		expect(analysis.counts).toEqual({
			misattributed_player: 1,
			unlabelled_dialogue: 0,
			total: 1,
		});
		expect(analysis.issues).toEqual([
			{
				kind: "misattributed_player",
				line: 5,
				block: 3,
				currentSpeaker: "Rebecca",
				evidence: "action_player_name_possessive",
				confidence: "high",
				reason: "player-labelled action refers to the player by possessive name",
			},
		]);
	});

	it("retains strong bullpen name-address evidence", () => {
		const analysis = analyzeSpeakerAttributionIssues(
			'Rebecca: *smiles warmly and nods.* "We really missed you around here, Alvarez."',
			"Rebecca Alvarez",
		);

		expect(analysis.issues[0]).toMatchObject({
			kind: "misattributed_player",
			evidence: "dialogue_player_name_address",
			confidence: "high",
		});
	});

	it("reports each unlabelled dialogue line separately but preserves the two-line rewrite threshold", () => {
		const oneLine = 'Narrator: *The room falls quiet.*\n\n"Only one unlabelled line remains."';
		const twoLines = `${oneLine}\n\n*Someone shifts near the door.* "A second voice answers."`;

		const oneLineAnalysis = analyzeSpeakerAttributionIssues(oneLine, PLAYER);
		expect(oneLineAnalysis.counts.unlabelled_dialogue).toBe(1);
		expect(oneLineAnalysis.needsRewrite).toBe(false);
		expect(needsSpeakerAttributionRewrite(oneLine, PLAYER)).toBe(false);

		const twoLineAnalysis = analyzeSpeakerAttributionIssues(twoLines, PLAYER);
		expect(twoLineAnalysis.needsRewrite).toBe(true);
		expect(twoLineAnalysis.counts).toEqual({
			misattributed_player: 0,
			unlabelled_dialogue: 2,
			total: 2,
		});
		expect(twoLineAnalysis.issues).toEqual([
			expect.objectContaining({
				kind: "unlabelled_dialogue",
				line: 3,
				block: 2,
				currentSpeaker: null,
				evidence: "unlabelled_quoted_dialogue",
			}),
			expect.objectContaining({
				kind: "unlabelled_dialogue",
				line: 5,
				block: 3,
				currentSpeaker: null,
				evidence: "unlabelled_quoted_dialogue",
			}),
		]);
	});
});

describe("speaker-attribution validation diagnostics", () => {
	it("exposes structured misattribution details without transcript prose in the diagnostic", () => {
		const result = validateAssistantTranscriptForSave({
			text: MIXED_PLAYER_LINES,
			playerName: PLAYER,
			hiddenDialoguePattern: HIDDEN_DIALOGUE_PATTERN,
		});

		expect(result.valid).toBe(false);
		expect(result.stage).toBe("speaker_attribution");
		expect(result.speakerAttributionIssues).toHaveLength(1);
		expect(result.speakerAttributionIssues[0]).toMatchObject({
			kind: "misattributed_player",
			line: 5,
			evidence: "action_player_name_possessive",
		});
		expect(result.diagnostic).toContain("issue_kind=misattributed_player");
		expect(result.diagnostic).toContain("issue_count=1");
		expect(result.diagnostic).toContain("lines=5");
		expect(result.diagnostic).toContain("evidence=action_player_name_possessive");
		expect(result.diagnostic).not.toContain("Rebecca");
		expect(result.diagnostic).not.toContain("Rosa");
		expect(result.diagnostic).not.toContain("Come and sit beside me");
	});

	it("distinguishes unlabelled dialogue in both structured details and diagnostics", () => {
		const text = `Narrator: *The long corridor remains still while footsteps approach from beyond the closed apartment door.*

"The first unlabelled character speaks from the doorway."

*Another figure turns toward the sound.* "The second unlabelled character answers."`;
		const result = validateAssistantTranscriptForSave({
			text,
			playerName: PLAYER,
			hiddenDialoguePattern: HIDDEN_DIALOGUE_PATTERN,
		});

		expect(result.valid).toBe(false);
		expect(result.stage).toBe("speaker_attribution");
		expect(result.speakerAttributionIssues.map((issue) => issue.kind)).toEqual([
			"unlabelled_dialogue",
			"unlabelled_dialogue",
		]);
		expect(result.diagnostic).toContain("issue_kind=unlabelled_dialogue");
		expect(result.diagnostic).toContain("unlabelled_dialogue_count=2");
		expect(result.diagnostic).toContain("lines=3,5");
		expect(result.diagnostic).toContain("evidence=unlabelled_quoted_dialogue");
		expect(result.diagnostic).not.toContain("doorway");
		expect(result.diagnostic).not.toContain("answers");
	});
});
