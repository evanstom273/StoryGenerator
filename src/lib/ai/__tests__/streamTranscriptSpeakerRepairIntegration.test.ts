import { describe, expect, it, vi } from "vitest";
import { resolveSemanticSpeakerAttribution } from "../../storyText/semanticSpeakerResolver";
import { validateAssistantTranscriptForSave } from "../../storyText/transcriptSanitizer";
import { resolveStreamTranscript } from "../streamTranscriptResolution";

const PLAYER = {
	name: "Becca",
	aliases: ["Rebecca", 'Rebecca "Becca" Alvarez'],
} as const;
const ROSA = { name: "Rosa", aliases: [] } as const;
const HIDDEN_DIALOGUE_PATTERN = /hidden-dialogue-pattern-that-never-matches/i;

function validate(text: string) {
	return validateAssistantTranscriptForSave({
		text,
		playerName: 'Rebecca "Becca" Alvarez',
		playerSceneName: "Becca",
		playerPronouns: "she/her",
		playerAliases: ["Rebecca"],
		characterGenders: { rebecca: "female", becca: "female", rosa: "female" },
		allowDirectedPlayerControl: true,
		latestUserMessage: "Director: *Becca and Rosa remain together in the apartment.*",
		knownTies: ["Rosa"],
		hiddenDialoguePattern: HIDDEN_DIALOGUE_PATTERN,
		repairSpeakerAttribution: false,
	});
}

describe("stream transcript speaker-repair integration", () => {
	it("repairs every unambiguous Rosa block locally and validates in one provider attempt", async () => {
		const source = `Narrator: *Late-afternoon light settles across the apartment while Becca and Rosa remain near the window.*

Rebecca: *She reaches for Rosa's hand and smiles.* "You look beautiful from here."

Rebecca: *Her fingers close around Rebecca's wrist.* "Come closer."

Rebecca: *Her gaze studies Rebecca's expression before her thumb brushes Rebecca's jaw.*`;
		const rewriteCandidate = vi.fn(async () => "provider rewrite must not run");

		const result = await resolveStreamTranscript({
			initialText: source,
			allowProviderRewrites: false,
			repairCandidate: (text) => {
				const repaired = resolveSemanticSpeakerAttribution({
					text,
					player: PLAYER,
					eligibleSpeakers: [ROSA],
				});
				return { text: repaired.text, events: repaired.changes };
			},
			validateCandidate: validate,
			rewriteCandidate,
		});

		expect(result).toMatchObject({
			ok: true,
			attemptsUsed: 1,
			maxAttempts: 1,
		});
		expect(result.text).toContain(
			'Becca: *She reaches for Rosa\'s hand and smiles.* "You look beautiful from here."',
		);
		expect(result.text.match(/^Rosa:/gm)).toHaveLength(2);
		expect(result.repairEvents).toHaveLength(2);
		expect(rewriteCandidate).not.toHaveBeenCalled();
	});

	it("keeps unresolved unlabelled dialogue local and reports one of one", async () => {
		const source = `Narrator: *The apartment corridor remains quiet while two voices answer from beyond the doorway.*

"The first unlabelled character speaks."

*Someone turns toward the sound.* "The second unlabelled character answers."`;
		const rewriteCandidate = vi.fn(async () => "provider rewrite must not run");

		const result = await resolveStreamTranscript({
			initialText: source,
			allowProviderRewrites: false,
			repairCandidate: (text) => ({ text }),
			validateCandidate: validate,
			rewriteCandidate,
		});

		expect(result).toMatchObject({
			ok: false,
			reason: "provider_rewrites_disabled",
			attemptsUsed: 1,
			maxAttempts: 1,
		});
		if (!result.ok) {
			expect(result.validation.speakerAttributionIssues.map((issue) => issue.kind)).toEqual([
				"unlabelled_dialogue",
				"unlabelled_dialogue",
			]);
		}
		expect(rewriteCandidate).not.toHaveBeenCalled();
	});
});
