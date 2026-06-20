export type AIErrorCode =
  | "invalid_api_key"
  | "rate_limited"
  | "provider_unavailable"
  | "timeout"
  | "safety_refusal"
  | "parsing_failed"
  | "validation_failed"
  | "request_too_large"
  | "generation_failed"
  | "unknown";

export type AIGenerationFailureKind =
  | "timeout"
  | "provider"
  | "safety"
  | "parse"
  | "validation"
  | "context"
  | "quota"
  | "unknown";

export type GenerationFailKind =
  | "input_blocked_local"
  | "provider_refusal"
  | "provider_blocked_prompt"
  | "provider_blocked_response"
  | "timeout"
  | "network"
  | "rate_limit"
  | "quota"
  | "context_too_large"
  | "parse_error"
  | "validation_error"
  | "unknown";

export type GenerationFailStage =
  | "precheck"
  | "request"
  | "response"
  | "parse"
  | "validation";

export type GenerationFailure = {
  kind: GenerationFailKind;
  stage: GenerationFailStage;
  summaryMessage: string;
  providerName?: string;
  model?: string;
  attempts: number;
  maxAttempts: number;
  diagnostic?: string;
  requestId?: string;
  transmitSafe?: {
    originalText: string;
    transmittedText: string;
    notes: string[];
  };
};

const GENERATION_AUDIT_URL = "http://127.0.0.1:7777/event";
const GENERATION_AUDIT_SESSION = "generation-pipeline-audit";

function reportGenerationFailureAudit(args: {
  hypothesisId: string;
  location: string;
  msg: string;
  traceId?: string;
  data?: Record<string, unknown>;
}) {
  // #region debug-point E:failure-report
  void fetch(GENERATION_AUDIT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: GENERATION_AUDIT_SESSION,
      runId: "pre-fix",
      hypothesisId: args.hypothesisId,
      traceId: args.traceId,
      location: args.location,
      msg: `[DEBUG] ${args.msg}`,
      data: args.data,
      ts: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

export class GenerationFailureError extends Error {
  failure: GenerationFailure;

  constructor(failure: GenerationFailure) {
    super(failure.summaryMessage);
    this.failure = failure;
  }
}

export function isGenerationFailureError(error: unknown): error is GenerationFailureError {
  return error instanceof GenerationFailureError;
}

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
    case "safety_refusal":
      return "safety";
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

  if (looksLikeSafetyRefusal(message)) {
    return new AIError("safety_refusal", message, status, {
      diagnostic,
      retryable: false,
      kind: "safety",
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

  if (looksLikeSafetyRefusal(message)) {
    return new AIError("safety_refusal", message, status, {
      diagnostic,
      retryable: false,
      kind: "safety",
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

    if (looksLikeSafetyRefusal(error.message)) {
      return new AIError("safety_refusal", error.message, undefined, {
        diagnostic: error.message,
        retryable: false,
        kind: "safety",
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
        : kind === "safety"
          ? "safety_refusal"
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
    case "safety":
      return {
        kind: "safety",
        retryable: normalized.retryable,
        diagnostic,
        message:
          "The provider refused this request under its safety rules. Story Engine supports serious fiction, but exploitative, gratuitously graphic, or instructional harm remains blocked.",
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
    "source=provider",
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

function mapGenerationKind(kind: AIGenerationFailureKind): GenerationFailKind {
  switch (kind) {
    case "timeout":
      return "timeout";
    case "provider":
      return "network";
    case "quota":
      return "rate_limit";
    case "context":
      return "context_too_large";
    case "safety":
      return "provider_refusal";
    case "parse":
      return "parse_error";
    case "validation":
      return "validation_error";
    default:
      return "unknown";
  }
}

function mapStage(kind: AIGenerationFailureKind): GenerationFailStage {
  switch (kind) {
    case "parse":
      return "parse";
    case "validation":
      return "validation";
    default:
      return "request";
  }
}

export function createGenerationFailure(error: unknown, opts: {
  providerName?: string;
  model?: string;
  attempts: number;
  maxAttempts: number;
  stage?: GenerationFailStage;
  requestId?: string;
}): GenerationFailure {
  const classified = classifyAIGenerationError(error);
  const normalized = normalizeAIError(error);
  const diagnostic = normalized.diagnostic ?? normalized.message;
  const stage = opts.stage ?? mapStage(classified.kind);
  const failure = {
    kind: mapGenerationKind(classified.kind),
    stage,
    summaryMessage: classified.message,
    providerName: opts.providerName,
    model: opts.model,
    attempts: opts.attempts,
    maxAttempts: opts.maxAttempts,
    diagnostic,
    requestId: opts.requestId,
  };
  // #region debug-point E:failure-created
  reportGenerationFailureAudit({
    hypothesisId: "E",
    location: "errors.ts:createGenerationFailure",
    msg: "generation failure normalized",
    traceId: opts.requestId,
    data: {
      providerName: opts.providerName,
      model: opts.model,
      attempts: opts.attempts,
      maxAttempts: opts.maxAttempts,
      kind: failure.kind,
      stage: failure.stage,
      diagnostic: failure.diagnostic,
      summaryMessage: failure.summaryMessage,
    },
  });
  // #endregion
  return failure;
}

export function withTransmitSafeDiagnostics(
  failure: GenerationFailure,
  transmitSafe: GenerationFailure["transmitSafe"],
): GenerationFailure {
  return {
    ...failure,
    transmitSafe,
  };
}

function looksLikeQuotaLimit(message: string) {
  return /\b(rate limit|too many requests|quota|capacity)\b/i.test(message);
}

export function looksLikeSafetyRefusal(message: string) {
  return /\b(safety|policy|disallowed|not allowed|not permitted|refus|unsafe|harmful content|content violation|violates?.*policy|sexual content involving minors|self-harm instructions)\b/i.test(
    message,
  );
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
