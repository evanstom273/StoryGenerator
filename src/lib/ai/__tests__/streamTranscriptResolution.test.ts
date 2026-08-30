import { describe, expect, it, vi } from "vitest";
import {
	resolveStreamTranscript,
	type StreamTranscriptValidationLike,
} from "../streamTranscriptResolution";
import {
	STREAM_VALIDATION_MAX_ATTEMPTS,
	STREAM_VALIDATION_MAX_REWRITES,
} from "../../storyText/streamValidationPolicy";

interface TestValidation extends StreamTranscriptValidationLike {
	diagnostic: string;
}

function validateWhenExpected(text: string): TestValidation {
	return {
		valid: text === "valid",
		text,
		diagnostic: text === "valid" ? "" : "still_invalid",
	};
}

describe("resolveStreamTranscript", () => {
	it("reaches local fixed-point success without consuming a provider rewrite", async () => {
		const rewriteCandidate = vi.fn(async () => "should-not-run");
		const onProviderAttempt = vi.fn();
		const result = await resolveStreamTranscript({
			initialText: "wrong-speaker",
			repairCandidate: (text) => ({
				text: text === "wrong-speaker" ? "valid" : text,
				events: text === "wrong-speaker" ? ["Rebecca->Rosa"] : [],
			}),
			validateCandidate: validateWhenExpected,
			rewriteCandidate,
			onProviderAttempt,
		});

		expect(result).toMatchObject({
			ok: true,
			reason: "validated",
			text: "valid",
			attemptsUsed: 1,
			maxAttempts: STREAM_VALIDATION_MAX_ATTEMPTS,
			localPasses: 1,
			repairEvents: ["Rebecca->Rosa"],
			usedRecoveryPath: true,
		});
		expect(rewriteCandidate).not.toHaveBeenCalled();
		expect(onProviderAttempt).not.toHaveBeenCalled();
	});

	it("returns a valid streamed candidate verbatim without local repair", async () => {
		const streamedText = "Claude: *The rain taps against the window.*\n";
		const repairCandidate = vi.fn(() => ({ text: "mutated" }));
		const validateCandidate = vi.fn((text: string): TestValidation => ({
			valid: true,
			text: `${text}normalized`,
			diagnostic: "",
		}));

		const result = await resolveStreamTranscript({
			initialText: streamedText,
			repairCandidate,
			validateCandidate,
			rewriteCandidate: async () => "unused",
		});

		expect(result).toMatchObject({
			ok: true,
			text: streamedText,
			usedRecoveryPath: false,
			localPasses: 0,
		});
		expect(validateCandidate).toHaveBeenCalledTimes(1);
		expect(repairCandidate).not.toHaveBeenCalled();
	});

	it("reports an unresolved rewrite-disabled candidate as one of one", async () => {
		const rewriteCandidate = vi.fn(async () => "valid");
		const result = await resolveStreamTranscript({
			initialText: "invalid-explicit-scene",
			allowProviderRewrites: false,
			validateCandidate: validateWhenExpected,
			rewriteCandidate,
		});

		expect(result).toMatchObject({
			ok: false,
			reason: "provider_rewrites_disabled",
			attemptsUsed: 1,
			maxAttempts: 1,
			localStopReason: "unchanged",
		});
		expect(rewriteCandidate).not.toHaveBeenCalled();
	});

	it("uses ten total provider generations: one initial plus nine rewrites", async () => {
		const attempts: number[] = [];
		const rewriteCandidate = vi.fn(async ({ attempt }: { attempt: number }) => {
			attempts.push(attempt);
			return `invalid-${attempt}`;
		});
		const result = await resolveStreamTranscript({
			initialText: "invalid-1",
			validateCandidate: (text): TestValidation => ({
				valid: false,
				text,
				diagnostic: "still_invalid",
			}),
			rewriteCandidate,
			maxLocalRepairPasses: 2,
		});

		expect(result).toMatchObject({
			ok: false,
			reason: "provider_attempts_exhausted",
			attemptsUsed: STREAM_VALIDATION_MAX_ATTEMPTS,
			maxAttempts: STREAM_VALIDATION_MAX_ATTEMPTS,
		});
		expect(attempts).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
		expect(rewriteCandidate).toHaveBeenCalledTimes(STREAM_VALIDATION_MAX_REWRITES);
	});

	it("stops a local repair cycle when a candidate repeats", async () => {
		const repairCandidate = vi.fn((text: string) => ({
			text: text === "a" ? "b" : "a",
		}));
		const rewriteCandidate = vi.fn(async () => "unused");
		const result = await resolveStreamTranscript({
			initialText: "a",
			allowProviderRewrites: false,
			maxLocalRepairPasses: 20,
			repairCandidate,
			validateCandidate: (text): TestValidation => ({
				valid: false,
				text,
				diagnostic: "still_invalid",
			}),
			rewriteCandidate,
		});

		expect(result).toMatchObject({
			ok: false,
			reason: "provider_rewrites_disabled",
			localStopReason: "repeated_candidate",
			attemptsUsed: 1,
			localPasses: 2,
		});
		expect(repairCandidate).toHaveBeenCalledTimes(2);
		expect(rewriteCandidate).not.toHaveBeenCalled();
	});

	it("validates the exact candidate returned by local repair", async () => {
		const validatedInputs: string[] = [];
		const result = await resolveStreamTranscript({
			initialText: "raw-speaker-label",
			repairCandidate: (text) => ({
				text: text === "raw-speaker-label" ? "Rosa: repaired line" : text,
				events: text === "raw-speaker-label" ? ["Rebecca->Rosa"] : [],
			}),
			validateCandidate: (text): TestValidation => {
				validatedInputs.push(text);
				return {
					valid: text === "Rosa: repaired line",
					text,
					diagnostic: text === "Rosa: repaired line" ? "" : "still_invalid",
				};
			},
			rewriteCandidate: async () => "unused",
		});

		expect(result).toMatchObject({ ok: true, text: "Rosa: repaired line" });
		expect(validatedInputs).toEqual([
			"raw-speaker-label",
			"Rosa: repaired line",
		]);
	});

	it("distinguishes a repair/validation oscillation from an unchanged candidate", async () => {
		const repairCandidate = vi.fn((text: string) => ({
			text: text === "a" ? "b" : "a",
		}));
		const result = await resolveStreamTranscript({
			initialText: "a",
			allowProviderRewrites: false,
			repairCandidate,
			validateCandidate: (text, context): TestValidation => ({
				valid: false,
				// The validator hands the pre-repair candidate back, which would
				// otherwise be reported as a generic unchanged candidate.
				text: context.localPass === 1 ? "a" : text,
				diagnostic: "speaker_attribution",
			}),
			rewriteCandidate: async () => "unused",
		});

		expect(result).toMatchObject({
			ok: false,
			reason: "provider_rewrites_disabled",
			localStopReason: "repair_validation_oscillation",
			localPasses: 1,
		});
		expect(repairCandidate).toHaveBeenCalledTimes(1);
	});

	it("stops when a provider returns an unchanged invalid candidate", async () => {
		const result = await resolveStreamTranscript({
			initialText: "invalid",
			validateCandidate: (text): TestValidation => ({
				valid: false,
				text,
				diagnostic: "still_invalid",
			}),
			rewriteCandidate: async ({ text }) => text,
		});

		expect(result).toMatchObject({
			ok: false,
			reason: "provider_candidate_unchanged",
			attemptsUsed: 2,
			maxAttempts: STREAM_VALIDATION_MAX_ATTEMPTS,
		});
	});

	it("recognizes a previously normalized invalid provider candidate", async () => {
		const rewriteCandidate = vi
			.fn<({ attempt }: { attempt: number }) => Promise<string>>()
			.mockResolvedValueOnce("raw-two")
			.mockResolvedValueOnce("normalized-one");
		const result = await resolveStreamTranscript({
			initialText: "raw-one",
			validateCandidate: (text): TestValidation => ({
				valid: false,
				text:
					text === "raw-one"
						? "normalized-one"
						: text === "raw-two"
							? "normalized-two"
							: text,
				diagnostic: "still_invalid",
			}),
			rewriteCandidate,
		});

		expect(result).toMatchObject({
			ok: false,
			reason: "provider_candidate_repeated",
			attemptsUsed: 3,
			text: "normalized-one",
		});
		expect(rewriteCandidate).toHaveBeenCalledTimes(2);
	});

	it("starts from a caller-owned provider attempt count", async () => {
		const reported: number[] = [];
		const result = await resolveStreamTranscript({
			initialText: "invalid-shared-3",
			initialProviderAttemptsUsed: 3,
			maxProviderAttempts: 4,
			validateCandidate: (text): TestValidation => ({
				valid: false,
				text,
				diagnostic: "still_invalid",
			}),
			rewriteCandidate: async ({ attempt }) => `invalid-shared-${attempt}`,
			onProviderAttempt: ({ attempt }) => reported.push(attempt),
		});

		expect(result).toMatchObject({
			ok: false,
			reason: "provider_attempts_exhausted",
			attemptsUsed: 4,
			maxAttempts: 4,
		});
		expect(reported).toEqual([4]);
	});
});
