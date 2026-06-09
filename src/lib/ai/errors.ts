export type AIErrorCode =
  | "invalid_api_key"
  | "rate_limited"
  | "provider_unavailable"
  | "timeout"
  | "parsing_failed"
  | "validation_failed"
  | "request_too_large"
  | "generation_failed"
  | "unknown";

export type AIGenerationFailureKind =
  | "timeout"
  | "provider"
  | "parse"
  | "validation"
  | "context"
  | "quota"
  | "unknown";

export class AIError extends Error {
  code: AIErrorCode;
  status?: number;
  diagnostic?: string;
  retryable: boolean;
  kind: AIGenerationFailureKind;

  constructor(
    code: AIErrorCode,
    message: string,
    status?: number,
    options?: {
      diagnostic?: string;
      retryable?: boolean;
      kind?: AIGenerationFailureKind;
    },
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.diagnostic = options?.diagnostic;
    this.retryable = options?.retryable ?? inferRetryable(code);
    this.kind = options?.kind ?? inferKind(code);
  }
}

export interface ClassifiedAIGenerationError {
  kind: AIGenerationFailureKind;
  message: string;
  diagnostic?: string;
  retryable: boolean;
}

function inferKind(code: AIErrorCode): AIGenerationFailureKind {
  switch (code) {
    case "rate_limited":
      return "quota";
    case "provider_unavailable":
      return "provider";
    case "timeout":
      return "timeout";
    case "parsing_failed":
      return "parse";
    case "validation_failed":
      return "validation";
    case "request_too_large":
      return "context";
    default:
      return "unknown";
  }
}

function inferRetryable(code: AIErrorCode) {
  switch (code) {
    case "rate_limited":
    case "provider_unavailable":
    case "timeout":
      return true;
    default:
      return false;
  }
}

function pickMessage(candidate: unknown, fallback: string) {
  if (typeof candidate === "string" && candidate.trim()) {
    return candidate.trim();
  }

  return fallback;
}

export async function normalizeOpenAIError(response: Response) {
  const status = response.status;
  let message = `OpenAI request failed (${status}).`;

  try {
    const payload = (await response.json()) as unknown;
    const errorMessage =
      typeof payload === "object" && payload && "error" in payload
        ? (payload as any).error?.message
        : undefined;
    message = pickMessage(errorMessage, message);
  } catch {
    message = message;
  }

  const diagnostic = `status=${status}; provider=OpenAI; raw=${message}`;

  if (status === 401 || status === 403) {
    return new AIError("invalid_api_key", message, status, { diagnostic });
  }

  if (status === 429) {
    return new AIError("rate_limited", message, status, { diagnostic });
  }

  if (status >= 500) {
    return new AIError("provider_unavailable", message, status, { diagnostic });
  }

  if (status === 400 && looksLikeContextLimit(message)) {
    return new AIError("request_too_large", message, status, {
      diagnostic,
      kind: "context",
    });
  }

  return new AIError("generation_failed", message, status, { diagnostic });
}

export async function normalizeOpenRouterError(response: Response) {
  const status = response.status;
  let message = `OpenRouter request failed (${status}).`;

  try {
    const payload = (await response.json()) as unknown;
    const errorMessage =
      typeof payload === "object" && payload && "error" in payload
        ? ((payload as any).error?.message ?? (payload as any).error)
        : (payload as any)?.message;
    message = pickMessage(errorMessage, message);
  } catch {
    message = message;
  }

  const diagnostic = `status=${status}; provider=OpenRouter; raw=${message}`;

  if (status === 401 || status === 403) {
    return new AIError("invalid_api_key", "OpenRouter API key is invalid.", status, {
      diagnostic,
    });
  }

  if (status === 429) {
    return new AIError("rate_limited", "OpenRouter rate limit exceeded.", status, {
      diagnostic,
    });
  }

  if (status === 404) {
    return new AIError("generation_failed", "OpenRouter model unavailable.", status, {
      diagnostic,
    });
  }

  if (status >= 500) {
    return new AIError("provider_unavailable", "OpenRouter provider unavailable.", status, {
      diagnostic,
    });
  }

  if (status === 400 && looksLikeContextLimit(message)) {
    return new AIError("request_too_large", message, status, {
      diagnostic,
      kind: "context",
    });
  }

  return new AIError("generation_failed", message, status, { diagnostic });
}

export function normalizeAIError(error: unknown) {
  if (error instanceof AIError) {
    return error;
  }

  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    if (error.name === "AbortError") {
      return new AIError("timeout", "The request timed out.", undefined, {
        diagnostic: error.message,
      });
    }
  }

  if (error instanceof Error) {
    if (error.name === "AbortError" || /\b(timeout|timed out|deadline exceeded)\b/i.test(error.message)) {
      return new AIError("timeout", "The request timed out.", undefined, {
        diagnostic: error.message,
      });
    }

    if (looksLikeQuotaLimit(error.message)) {
      return new AIError("rate_limited", error.message, undefined, {
        diagnostic: error.message,
      });
    }

    if (looksLikeContextLimit(error.message)) {
      return new AIError("request_too_large", error.message, undefined, {
        diagnostic: error.message,
        kind: "context",
      });
    }

    if (looksLikeProviderFailure(error.message)) {
      return new AIError("provider_unavailable", error.message, undefined, {
        diagnostic: error.message,
      });
    }

    return new AIError("unknown", error.message, undefined, {
      diagnostic: error.message,
    });
  }

  return new AIError("unknown", "Unknown AI error.");
}

export function createAIGenerationError(
  kind: AIGenerationFailureKind,
  message: string,
  options?: {
    diagnostic?: string;
    retryable?: boolean;
    status?: number;
  },
) {
  const code: AIErrorCode =
    kind === "timeout"
      ? "timeout"
      : kind === "parse"
        ? "parsing_failed"
        : kind === "validation"
          ? "validation_failed"
          : kind === "context"
            ? "request_too_large"
            : kind === "quota"
              ? "rate_limited"
              : kind === "provider"
                ? "provider_unavailable"
                : "unknown";

  return new AIError(code, message, options?.status, {
    diagnostic: options?.diagnostic,
    retryable: options?.retryable,
    kind,
  });
}

export function classifyAIGenerationError(error: unknown): ClassifiedAIGenerationError {
  const normalized = normalizeAIError(error);
  const diagnostic = normalized.diagnostic ?? normalized.message;

  switch (normalized.kind) {
    case "timeout":
      return {
        kind: "timeout",
        retryable: normalized.retryable,
        diagnostic,
        message: "The AI provider timed out after multiple attempts.",
      };
    case "quota":
      return {
        kind: "quota",
        retryable: normalized.retryable,
        diagnostic,
        message: "The provider reported a quota or rate limit problem.",
      };
    case "context":
      return {
        kind: "context",
        retryable: normalized.retryable,
        diagnostic,
        message: "This request may be too large for the current provider or model.",
      };
    case "parse":
      return {
        kind: "parse",
        retryable: normalized.retryable,
        diagnostic,
        message: "The response failed because the model output could not be parsed.",
      };
    case "validation":
      return {
        kind: "validation",
        retryable: normalized.retryable,
        diagnostic,
        message: "The response failed validation after generation.",
      };
    case "provider":
      return {
        kind: "provider",
        retryable: normalized.retryable,
        diagnostic,
        message: "The AI provider returned a temporary error.",
      };
    default:
      return {
        kind: "unknown",
        retryable: normalized.retryable,
        diagnostic,
        message: "The AI request failed for an unknown reason.",
      };
  }
}

export function formatAIGenerationError(
  error: unknown,
  options?: {
    provider?: string;
    attempts?: number;
    maxAttempts?: number;
  },
) {
  const classified = classifyAIGenerationError(error);
  const details = [
    options?.provider ? `provider=${options.provider}` : "",
    typeof options?.attempts === "number" && typeof options?.maxAttempts === "number"
      ? `attempts=${options.attempts}/${options.maxAttempts}`
      : "",
    `failure=${classified.kind}`,
    classified.diagnostic ? `raw=${classified.diagnostic}` : "",
  ].filter(Boolean);

  return [
    classified.message,
    details.length ? `Details: ${details.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function looksLikeQuotaLimit(message: string) {
  return /\b(rate limit|too many requests|quota|capacity)\b/i.test(message);
}

function looksLikeContextLimit(message: string) {
  return /\b(context length|too large|too long|maximum context|max(imum)? tokens|prompt is too long|token limit)\b/i.test(
    message,
  );
}

function looksLikeProviderFailure(message: string) {
  return /\b(network|fetch failed|failed to fetch|service unavailable|temporar(y|ily)|gateway|overloaded|connection reset)\b/i.test(
    message,
  );
}
