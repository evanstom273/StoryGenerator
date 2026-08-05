import { describe, expect, it } from "vitest";
import {
	CHARACTER_CONCEPT_DEFINITION,
	CHARACTER_CONCEPT_EXAMPLE,
	formatCharacterConceptGuideForPrompt,
} from "../ai/characterConceptGuide";
import { buildCharacterConceptGeneratorSystemPrompt } from "../ai/characterGenerator";

describe("characterConceptGuide", () => {
	it("stores the authoritative definition and example", () => {
		expect(CHARACTER_CONCEPT_DEFINITION).toContain("not a biography");
		expect(CHARACTER_CONCEPT_DEFINITION).toContain(
			"If this character walked into the first chapter of the story",
		);
		expect(CHARACTER_CONCEPT_EXAMPLE).toContain("Jake and Amy's son");
	});

	it("formats the guide for prompts", () => {
		const block = formatCharacterConceptGuideForPrompt();
		expect(block).toContain(CHARACTER_CONCEPT_DEFINITION);
		expect(block).toContain(CHARACTER_CONCEPT_EXAMPLE);
	});
});

describe("buildCharacterConceptGeneratorSystemPrompt", () => {
	it("embeds the internal character concept guide", () => {
		const prompt = buildCharacterConceptGeneratorSystemPrompt({});
		expect(prompt).toContain("Jake and Amy's son");
		expect(prompt).toContain("inspire the rest of the character sheet");
	});
});
