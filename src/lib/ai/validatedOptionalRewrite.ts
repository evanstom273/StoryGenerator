export interface ValidatedTextResult {
	text: string;
}

export interface OptionalValidatedRewriteOutcome<T extends ValidatedTextResult> {
	result: T;
	attempted: boolean;
	applied: boolean;
	fallbackError?: unknown;
}

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
	if (signal?.aborted) return true;
	return error instanceof Error && error.name === "AbortError";
}

/**
 * Validate the provider's original response before attempting an optional
 * transformation. Once a valid candidate exists, an optional rewrite may
 * replace it only if that rewritten candidate also validates successfully.
 */
export async function applyOptionalValidatedRewrite<T extends ValidatedTextResult>(args: {
	initialText: string;
	validate: (text: string) => Promise<T>;
	shouldRewrite: (validated: T) => boolean;
	rewrite: (validatedText: string) => Promise<string>;
	signal?: AbortSignal;
	onFallback?: (validated: T, error: unknown) => void;
}): Promise<OptionalValidatedRewriteOutcome<T>> {
	const validatedOriginal = await args.validate(args.initialText);
	if (!args.shouldRewrite(validatedOriginal)) {
		return {
			result: validatedOriginal,
			attempted: false,
			applied: false,
		};
	}

	try {
		const rewrittenText = await args.rewrite(validatedOriginal.text);
		const validatedRewrite = await args.validate(rewrittenText);
		return {
			result: validatedRewrite,
			attempted: true,
			applied: true,
		};
	} catch (error) {
		if (isAbortError(error, args.signal)) throw error;
		args.onFallback?.(validatedOriginal, error);
		return {
			result: validatedOriginal,
			attempted: true,
			applied: false,
			fallbackError: error,
		};
	}
}
