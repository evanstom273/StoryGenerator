import { describe, expect, it } from "vitest";
import { validateAssistantTranscriptForSave } from "../../storyText/transcriptSanitizer";
import { resolveSemanticSpeakerAttribution } from "../../storyText/semanticSpeakerResolver";
import { repairAssistantTranscript } from "../../storyText/transcriptRepairPipeline";
import { formatResolvedParticipationPrompt } from "../promptProjection";
import { resolveSceneParticipants } from "../resolveSceneParticipants";
import { toSemanticSpeakerIdentities } from "../generation";

const HIDDEN_DIALOGUE_PATTERN =
	/\b(you're saying|you said|as you said|like you said|from what you said)\b/i;

function dialogueOnlyRosa() {
	return resolveSceneParticipants({
		playerIdentity: { canonicalName: "Rebecca", aliases: ["Becca"] },
		storyState: {
			updatedAt: "2026-01-01T00:00:00.000Z",
			characters: { rosa: { canonicalName: "Rosa Diaz", narrativeName: "Rosa" } },
			worldFacts: [],
			unresolvedThreads: [],
			scene: {
				activeParticipants: ["Rosa"],
				participantCapabilityOverrides: [
					{
						participantKey: "Rosa",
						capabilities: {
							canSpeak: true,
							canPerformPhysicalActions: false,
							canBeAddressed: true,
							canBePhysicallyInteractedWith: false,
						},
						source: "director_instruction",
					},
				],
			},
		},
	});
}

describe("consumer participation consistency", () => {
	it("accepts dialogue-only Name: blocks for a speaking participant without action capability", () => {
		const participants = dialogueOnlyRosa();
		const result = validateAssistantTranscriptForSave({
			text:
				'Rosa: "Stay where you are. I can hear you, and I need you to keep talking until I know you are safe."',
			playerName: "Rebecca",
			hiddenDialoguePattern: HIDDEN_DIALOGUE_PATTERN,
			resolvedParticipants: participants,
		});

		expect(result.valid).toBe(true);
		expect(result.stage).toBeNull();
	});

	it("rejects physical actions for a participant who cannot act", () => {
		const participants = dialogueOnlyRosa();
		const result = validateAssistantTranscriptForSave({
			text:
				'Rosa: *She grabs Rebecca\'s wrist and pulls her closer.* "Stay where you are until I finish talking."',
			playerName: "Rebecca",
			hiddenDialoguePattern: HIDDEN_DIALOGUE_PATTERN,
			resolvedParticipants: participants,
		});

		expect(result.valid).toBe(false);
		expect(result.stage).toBe("participation");
	});

	it("preserves conventional physical transcripts when defaults apply", () => {
		const participants = resolveSceneParticipants({
			playerIdentity: { canonicalName: "Rebecca", aliases: ["Becca"] },
			storyState: {
				updatedAt: "2026-01-01T00:00:00.000Z",
				characters: { rosa: { canonicalName: "Rosa Diaz", narrativeName: "Rosa" } },
				worldFacts: [],
				unresolvedThreads: [],
				scene: { activeParticipants: ["Rosa"] },
			},
		});
		const text =
			'Rosa: *She folds her arms and leans against the doorway.* "Really? You thought I would not notice that?"';
		const result = validateAssistantTranscriptForSave({
			text,
			playerName: "Rebecca",
			hiddenDialoguePattern: HIDDEN_DIALOGUE_PATTERN,
			resolvedParticipants: participants,
		});

		expect(result.valid).toBe(true);
		expect(result.text).toContain("*She folds her arms.*");
	});

	it("does not treat absent physical evidence as weak dialogue ownership", () => {
		const participants = dialogueOnlyRosa();
		const result = resolveSemanticSpeakerAttribution({
			text: 'Rebecca: "You should stay on the line."',
			player: { name: "Rebecca", aliases: ["Becca"] },
			eligibleSpeakers: toSemanticSpeakerIdentities(participants, "Rebecca"),
		});

		expect(result.diagnostics[0]?.reason).not.toBe("insufficient-semantic-evidence");
		expect(result.text).toBe('Rosa: "You should stay on the line."');
	});

	it("strips unsupported action synthesis while preserving dialogue", () => {
		const participants = dialogueOnlyRosa();
		const repaired = repairAssistantTranscript(
			'Rosa: *She walks across the room.* "Stay on the line."',
			{
				identity: {
					legalName: "Rebecca Alvarez",
					sceneName: "Rebecca",
					pronouns: "she/her",
					aliases: ["Becca"],
				},
				repairSpeakerAttribution: false,
				resolvedParticipants: participants,
			},
		);

		expect(repaired).toContain('"Stay on the line."');
		expect(repaired).not.toMatch(/\*She walks across the room\.\*/);
	});

	it("describes the same capability constraints in prompt projection", () => {
		const participants = dialogueOnlyRosa();
		const prompt = formatResolvedParticipationPrompt(
			participants,
			{ canonicalName: "Rebecca", aliases: ["Becca"] },
			false,
		);

		expect(prompt).toContain("Dialogue-only participants (Rosa)");
		expect(prompt).toContain('Name: "Dialogue."');
		expect(prompt).not.toMatch(/phone|remote|AI|hologram/i);
	});
});
