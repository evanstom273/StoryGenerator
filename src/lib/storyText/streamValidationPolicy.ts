/**
 * Maximum number of provider generations used to produce one valid streamed
 * transcript. The initial response is attempt one; validation rewrites may use
 * the remaining attempts.
 */
export const STREAM_VALIDATION_MAX_ATTEMPTS = 10;

/** The initial generation consumes one of the total provider attempts. */
export const STREAM_VALIDATION_MAX_REWRITES =
	STREAM_VALIDATION_MAX_ATTEMPTS - 1;

/**
 * Safety bound for deterministic, local repair passes applied to one provider
 * candidate. Callers may choose a smaller, candidate-derived bound.
 */
export const STREAM_VALIDATION_MAX_LOCAL_REPAIR_PASSES = 8;

/**
 * Provider rewrites are forbidden for modes whose generated content must stay
 * local. In those modes only the already-produced initial response counts.
 */
export function getStreamValidationAttemptLimit(args?: {
	allowProviderRewrites?: boolean;
	requestedMaxAttempts?: number;
}): number {
	if (args?.allowProviderRewrites === false) return 1;

	const requested = args?.requestedMaxAttempts ?? STREAM_VALIDATION_MAX_ATTEMPTS;
	if (!Number.isFinite(requested)) return STREAM_VALIDATION_MAX_ATTEMPTS;

	return Math.max(
		1,
		Math.min(STREAM_VALIDATION_MAX_ATTEMPTS, Math.floor(requested)),
	);
}
