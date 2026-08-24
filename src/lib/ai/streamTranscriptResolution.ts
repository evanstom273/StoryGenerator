import {
	getStreamValidationAttemptLimit,
	STREAM_VALIDATION_MAX_LOCAL_REPAIR_PASSES,
} from "../storyText/streamValidationPolicy";

export interface StreamTranscriptValidationLike {
	valid: boolean;
	text: string;
}

export interface StreamTranscriptLocalRepairResult<TRepairEvent = never> {
	text: string;
	events?: readonly TRepairEvent[];
}

export interface StreamTranscriptResolutionContext {
	providerAttempt: number;
	maxProviderAttempts: number;
	localPass: number;
	maxLocalPasses: number;
}

export interface StreamTranscriptRewriteContext<TValidation> {
	text: string;
	validation: TValidation;
	attempt: number;
	maxAttempts: number;
}

export interface StreamTranscriptProviderAttemptEvent {
	attempt: number;
	maxAttempts: number;
	kind: "validation_rewrite";
}

export interface StreamTranscriptLocalRepairEvent<TRepairEvent> {
	beforeText: string;
	repairedText: string;
	providerAttempt: number;
	localPass: number;
	events: readonly TRepairEvent[];
}

export type StreamTranscriptLocalStopReason =
	| "unchanged"
	| "repeated_candidate"
	| "repair_validation_oscillation"
	| "pass_limit";

export type StreamTranscriptFailureReason =
	| "provider_rewrites_disabled"
	| "provider_rewrite_not_allowed"
	| "provider_attempts_exhausted"
	| "provider_candidate_unchanged"
	| "provider_candidate_repeated";

interface StreamTranscriptResolutionBase<
	TValidation extends StreamTranscriptValidationLike,
	TRepairEvent,
> {
	text: string;
	validation: TValidation;
	attemptsUsed: number;
	maxAttempts: number;
	localPasses: number;
	repairEvents: TRepairEvent[];
}

export interface StreamTranscriptResolutionSuccess<
	TValidation extends StreamTranscriptValidationLike,
	TRepairEvent,
> extends StreamTranscriptResolutionBase<TValidation, TRepairEvent> {
	ok: true;
	reason: "validated";
}

export interface StreamTranscriptResolutionFailure<
	TValidation extends StreamTranscriptValidationLike,
	TRepairEvent,
> extends StreamTranscriptResolutionBase<TValidation, TRepairEvent> {
	ok: false;
	reason: StreamTranscriptFailureReason;
	localStopReason: StreamTranscriptLocalStopReason;
}

export type StreamTranscriptResolutionResult<
	TValidation extends StreamTranscriptValidationLike,
	TRepairEvent = never,
> =
	| StreamTranscriptResolutionSuccess<TValidation, TRepairEvent>
	| StreamTranscriptResolutionFailure<TValidation, TRepairEvent>;

type Awaitable<T> = T | Promise<T>;

function defaultFingerprint(text: string): string {
	return text;
}

function validateIntegerOption(name: string, value: number, minimum: number): void {
	if (!Number.isInteger(value) || value < minimum) {
		throw new RangeError(`${name} must be an integer greater than or equal to ${minimum}.`);
	}
}

/**
 * Resolves one streamed provider response without coupling the attempt policy
 * to a provider, transcript validator, or repair implementation.
 *
 * `initialProviderAttemptsUsed` defaults to one because `initialText` normally
 * came from the initial provider generation. A caller with a shared attempt
 * counter can pass its current value instead. Local repair and validation
 * passes never increment that count. `onProviderAttempt` fires only for a new
 * provider rewrite, so callers that already reported the initial generation do
 * not double-report it.
 */
export async function resolveStreamTranscript<
	TValidation extends StreamTranscriptValidationLike,
	TRepairEvent = never,
>(args: {
	initialText: string;
	initialProviderAttemptsUsed?: number;
	allowProviderRewrites?: boolean;
	maxProviderAttempts?: number;
	maxLocalRepairPasses?: number;
	repairCandidate?: (
		text: string,
		context: StreamTranscriptResolutionContext,
	) => Awaitable<StreamTranscriptLocalRepairResult<TRepairEvent>>;
	validateCandidate: (
		text: string,
		context: StreamTranscriptResolutionContext,
	) => Awaitable<TValidation>;
	shouldRewrite?: (validation: TValidation) => boolean;
	rewriteCandidate: (
		context: StreamTranscriptRewriteContext<TValidation>,
	) => Promise<string>;
	fingerprint?: (text: string) => string;
	onLocalRepair?: (event: StreamTranscriptLocalRepairEvent<TRepairEvent>) => void;
	onProviderAttempt?: (event: StreamTranscriptProviderAttemptEvent) => void;
}): Promise<StreamTranscriptResolutionResult<TValidation, TRepairEvent>> {
	const maxAttempts = getStreamValidationAttemptLimit({
		allowProviderRewrites: args.allowProviderRewrites,
		requestedMaxAttempts: args.maxProviderAttempts,
	});
	let attemptsUsed = args.initialProviderAttemptsUsed ?? 1;
	const maxLocalPasses =
		args.maxLocalRepairPasses ?? STREAM_VALIDATION_MAX_LOCAL_REPAIR_PASSES;

	validateIntegerOption("initialProviderAttemptsUsed", attemptsUsed, 0);
	validateIntegerOption("maxLocalRepairPasses", maxLocalPasses, 1);
	if (attemptsUsed > maxAttempts) {
		throw new RangeError(
			`initialProviderAttemptsUsed (${attemptsUsed}) cannot exceed maxAttempts (${maxAttempts}).`,
		);
	}

	const fingerprint = args.fingerprint ?? defaultFingerprint;
	const providerCandidateFingerprints = new Set<string>([
		fingerprint(args.initialText),
	]);
	const repairEvents: TRepairEvent[] = [];
	let localPasses = 0;
	let candidate = args.initialText;

	while (true) {
		const localCandidateFingerprints = new Set<string>([fingerprint(candidate)]);
		let validation: TValidation | undefined;
		let localStopReason: StreamTranscriptLocalStopReason = "pass_limit";

		for (let localPass = 1; localPass <= maxLocalPasses; localPass += 1) {
			localPasses += 1;
			const context: StreamTranscriptResolutionContext = {
				providerAttempt: attemptsUsed,
				maxProviderAttempts: maxAttempts,
				localPass,
				maxLocalPasses,
			};
			const beforeText = candidate;
			const repair = args.repairCandidate
				? await args.repairCandidate(beforeText, context)
				: { text: beforeText, events: [] as readonly TRepairEvent[] };
			const events = repair.events ?? [];
			if (events.length) repairEvents.push(...events);
			if (repair.text !== beforeText || events.length) {
				args.onLocalRepair?.({
					beforeText,
					repairedText: repair.text,
					providerAttempt: attemptsUsed,
					localPass,
					events,
				});
			}

			// Keep the repair result as the source of truth for this handoff. In
			// particular, do not validate `candidate` here: validators are allowed
			// to return a normalized text value, but that value is not the text that
			// the local repair just produced.
			const repairedCandidate = repair.text;
			validation = await args.validateCandidate(repairedCandidate, context);
			candidate = validation.text;
			if (validation.valid) {
				return {
					ok: true,
					reason: "validated",
					text: candidate,
					validation,
					attemptsUsed,
					maxAttempts,
					localPasses,
					repairEvents,
				};
			}

			const beforeFingerprint = fingerprint(beforeText);
			const repairedFingerprint = fingerprint(repairedCandidate);
			const candidateFingerprint = fingerprint(candidate);
			if (candidateFingerprint === beforeFingerprint) {
				if (repairedFingerprint !== beforeFingerprint) {
					localStopReason = "repair_validation_oscillation";
					break;
				}
				localStopReason = "unchanged";
				break;
			}
			if (localCandidateFingerprints.has(candidateFingerprint)) {
				localStopReason = "repeated_candidate";
				break;
			}

			localCandidateFingerprints.add(candidateFingerprint);
			if (localPass === maxLocalPasses) {
				localStopReason = "pass_limit";
			}
		}

		if (!validation) {
			throw new Error("Transcript validation did not run.");
		}

		const failure = (reason: StreamTranscriptFailureReason) =>
			({
				ok: false,
				reason,
				localStopReason,
				text: candidate,
				validation,
				attemptsUsed,
				maxAttempts,
				localPasses,
				repairEvents,
			}) satisfies StreamTranscriptResolutionFailure<TValidation, TRepairEvent>;

		if (args.allowProviderRewrites === false) {
			return failure("provider_rewrites_disabled");
		}
		if (args.shouldRewrite && !args.shouldRewrite(validation)) {
			return failure("provider_rewrite_not_allowed");
		}
		if (attemptsUsed >= maxAttempts) {
			return failure("provider_attempts_exhausted");
		}

		// Validation may normalize or locally repair the provider's raw output.
		// Remember that effective invalid candidate as well as each raw provider
		// response so a later rewrite cannot restart the same failed cycle.
		providerCandidateFingerprints.add(fingerprint(candidate));

		const nextAttempt = attemptsUsed + 1;
		attemptsUsed = nextAttempt;
		args.onProviderAttempt?.({
			attempt: nextAttempt,
			maxAttempts,
			kind: "validation_rewrite",
		});
		const rewritten = await args.rewriteCandidate({
			text: candidate,
			validation,
			attempt: nextAttempt,
			maxAttempts,
		});
		const rewrittenFingerprint = fingerprint(rewritten);
		if (rewrittenFingerprint === fingerprint(candidate)) {
			candidate = rewritten;
			return failure("provider_candidate_unchanged");
		}
		if (providerCandidateFingerprints.has(rewrittenFingerprint)) {
			candidate = rewritten;
			return failure("provider_candidate_repeated");
		}

		providerCandidateFingerprints.add(rewrittenFingerprint);
		candidate = rewritten;
	}
}
