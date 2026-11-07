import { describe, expect, it } from "vitest";
import {
	buildContentMinimizedAdultRefusalRetryPlan,
	buildMatureFictionTransmitSafeSystemNote,
	makeTransmitSafe,
} from "../ai/transmitSafe";

describe("makeTransmitSafe", () => {
	it("does not soften intimacy language by default", () => {
		const result = makeTransmitSafe(
			"Becca puts the strap on, adjusting the dildo against her clit.",
			{ allowPainSoftening: true },
		);
		expect(result.wasModified).toBe(false);
		expect(result.transmitText).toContain("dildo");
		expect(result.transmitText).toContain("clit");
	});

	it("softens intimacy language only when explicitly enabled", () => {
		const result = makeTransmitSafe(
			"Becca puts the strap on, adjusting the dildo against her clit.",
			{ allowIntimacySoftening: true },
		);
		expect(result.wasModified).toBe(true);
		expect(result.transmitText).toContain("harness");
		expect(result.transmitText).not.toContain("dildo");
	});
});

describe("buildMatureFictionTransmitSafeSystemNote", () => {
	it("does not reinsert canonical director staging after softening", () => {
		const original =
			"Director: *Becca puts the strap on, adjusting the dildo against her clit.*";
		const transmitSafe = makeTransmitSafe(original, { allowIntimacySoftening: true });
		const note = buildMatureFictionTransmitSafeSystemNote(transmitSafe, original);
		expect(note).toContain("mature, non-graphic level");
		expect(note).not.toContain("Canonical Director staging");
		expect(note).not.toContain("dildo");
		expect(note).not.toContain("clit");
	});
});

describe("buildContentMinimizedAdultRefusalRetryPlan", () => {
	it("builds one non-graphic Gemini request-stage retry without source prose", () => {
		const sourceSecret = "SOURCE_EXPLICIT_STAGING_7f91";
		const generatedSecret = "PARTIAL_GENERATED_SCENE_29cd";
		const plan = buildContentMinimizedAdultRefusalRetryPlan({
			providerType: "gemini",
			mode: "explicit_consensual_adults",
			failureStage: "request",
		});

		expect(plan).toMatchObject({
			retryMode: "mature_non_graphic",
			maxAttempts: 1,
			contextPolicy: {
				includeOriginalRefusedTurn: false,
				includePriorAssistantProse: false,
				includePartialAssistantDraft: false,
			},
		});
		const serialized = JSON.stringify(plan);
		expect(serialized).not.toContain(sourceSecret);
		expect(serialized).not.toContain(generatedSecret);
		expect(plan?.latestUserMessage).toContain("mature, non-graphic");
		expect(plan?.systemNote).toContain("Honor the refusal");
		expect(plan?.systemNote).toContain("If this minimized request is also refused, stop");
	});

	it("does not build a retry for response blocks or repeat attempts", () => {
		expect(
			buildContentMinimizedAdultRefusalRetryPlan({
				providerType: "gemini",
				mode: "explicit_consensual_adults",
				failureStage: "response",
			}),
		).toBeNull();
		expect(
			buildContentMinimizedAdultRefusalRetryPlan({
				providerType: "gemini",
				mode: "explicit_consensual_adults",
				failureStage: "request",
				fallbackAttemptsUsed: 1,
			}),
		).toBeNull();
	});
});
