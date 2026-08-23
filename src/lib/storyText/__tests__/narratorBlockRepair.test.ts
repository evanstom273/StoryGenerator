import { describe, expect, it } from "vitest";
import { cleanTextForExport } from "../exportCleaner";
import { normalizeCharacterActionBeatsInTranscript } from "../playerSceneName";
import {
	repairGenericAgeDescriptorsInNarratorBlocks,
	repairNarratorPronounPseudoLabels,
	repairNarratorWrappedInnerContent,
	sanitizeNarratorInnerContent,
} from "../narratorBlockRepair";
import { formatNarratorBlockForDisplay } from "../parseSceneBlocks";
import { normalizeSpeakerNamesInTranscript } from "../speakerLabels";
import {
	applyStoryLocalIdentityToAssistantTranscript,
	prevalidateAssistantTranscript,
} from "../transcriptSanitizer";

const MAC_SPRINTS_NARRATION =
	"Outside, three blocks away, Mac sprints down the pavement, checking between parked cars and scanning every front stoop. His breath comes in sharp, heavy gasps as he checks the storefronts near the corner, his eyes darting frantically across the busy sidewalk.";

describe("narratorBlockRepair", () => {
	it("preserves They Mac in prose during speaker-name normalization", () => {
		const input = "Narrator: *They Mac bolts to the entryway.*";
		expect(normalizeSpeakerNamesInTranscript(input)).toBe(input);
	});

	it("repairs They: Mac bolts into narrator prose without a leading They", () => {
		const repaired = cleanTextForExport("They: Mac bolts to the entryway.");
		expect(repaired).toBe("Narrator: *Mac bolts to the entryway.*");
		expect(repaired).not.toContain("*They Mac");
	});

	it("keeps Mac in the prevalidate pipeline for They: Mac bolts", () => {
		const prepared = prevalidateAssistantTranscript({
			text: "They: Mac bolts to the entryway.",
			playerName: "Jamie",
			playerSceneName: "Jamie",
			latestUserMessage:
				"Director: *Jamie sprints in, breathing heavily. There's no Ellie.*",
			transcriptText:
				"Director: *Jamie sprints in, breathing heavily. There's no Ellie.*\nMac: \"Where is she?\"",
		});

		expect(prepared).toContain("Mac bolts");
		expect(prepared).not.toContain("*They Mac");
		expect(prepared).not.toMatch(/^They:/m);
	});

	it("unwraps Narrator: He: inner pronoun labels", () => {
		expect(
			repairNarratorPronounPseudoLabels(
				"Narrator: He: He is completely alone. Chest heaving violently.",
			),
		).toBe("Narrator: He is completely alone. Chest heaving violently.");
	});

	it("unwraps They narrator: pseudo labels", () => {
		expect(
			repairNarratorPronounPseudoLabels("They narrator: Mac bolts to the entryway."),
		).toBe("Narrator: Mac bolts to the entryway.");
	});

	it("strips He outside from wrapped narrator blocks", () => {
		const input = `Narrator: *He outside, three blocks away, Mac sprints down the pavement, checking between parked cars and scanning every front stoop. His breath comes in sharp, heavy gasps as he checks the storefronts near the corner, his eyes darting frantically across the busy sidewalk.*`;
		const repaired = repairNarratorWrappedInnerContent(input);

		expect(repaired).toBe(`Narrator: *${MAC_SPRINTS_NARRATION}*`);
		expect(repaired).not.toContain("*He outside");
	});

	it("strips He narrator: from inside wrapped narrator blocks", () => {
		const input = `Narrator: *He narrator: ${MAC_SPRINTS_NARRATION}*`;
		const repaired = repairNarratorWrappedInnerContent(input);

		expect(repaired).toBe(`Narrator: *${MAC_SPRINTS_NARRATION}*`);
	});

	it("repairs wrapped narrator content during save normalization", () => {
		const normalized = applyStoryLocalIdentityToAssistantTranscript(
			`Narrator: *He outside, three blocks away, Mac sprints down the pavement, checking between parked cars and scanning every front stoop. His breath comes in sharp, heavy gasps as he checks the storefronts near the corner, his eyes darting frantically across the busy sidewalk.*`,
			{
				legalName: "James Peralta",
				sceneName: "Jamie",
				pronouns: "he/him",
			},
		);

		expect(normalized).toBe(`Narrator: *${MAC_SPRINTS_NARRATION}*`);
	});

	it("repairs He narrator display artifacts in narrator prose", () => {
		const input = `Narrator: *He narrator: ${MAC_SPRINTS_NARRATION}*`;
		expect(formatNarratorBlockForDisplay(input)).toBe(MAC_SPRINTS_NARRATION);
		expect(sanitizeNarratorInnerContent(`He narrator: ${MAC_SPRINTS_NARRATION}`)).toBe(
			MAC_SPRINTS_NARRATION,
		);
	});

	it("does not run action-beat pronoun normalization on pronoun pseudo-speakers", () => {
		const normalized = normalizeCharacterActionBeatsInTranscript(
			"They: Mac bolts to the entryway.",
		);

		expect(normalized).toBe("They: Mac bolts to the entryway.");
	});

	it("replaces four year old with Ellie when Ellie is established in transcript context", () => {
		const transcript =
			"Director: *There's no Ellie.*\nAmy: \"Where is Ellie?\"\nNarrator: The four year old should be on the swing.";
		const repaired = repairGenericAgeDescriptorsInNarratorBlocks(
			"Narrator: The four year old should be on the swing.",
			{ transcriptText: transcript },
		);

		expect(repaired).toBe("Narrator: Ellie should be on the swing.");
	});

	it("applies narrator repairs during story-local identity normalization", () => {
		const transcript =
			"Director: *There's no Ellie.*\nAmy: \"Where is Ellie?\"";
		const normalized = applyStoryLocalIdentityToAssistantTranscript(
			"They: Mac bolts to the entryway.\nNarrator: The four year old giggles.",
			{
				legalName: "James Peralta",
				sceneName: "Jamie",
				pronouns: "he/him",
				transcriptText: transcript,
			},
		);

		expect(normalized).toContain("Mac bolts");
		expect(normalized).not.toMatch(/^They:/m);
		expect(normalized).toContain("Ellie giggles");
		expect(normalized).not.toContain("four year old");
	});
});
