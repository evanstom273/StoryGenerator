export type AIErrorCode =
  | "invalid_api_key"
  | "rate_limited"
  | "provider_unavailable"
  | "generation_failed"
  | "unknown";

export class AIError extends Error {
  code: AIErrorCode;
  status?: number;

  constructor(code: AIErrorCode, message: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
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

  if (status === 401 || status === 403) {
    return new AIError("invalid_api_key", message, status);
  }

  if (status === 429) {
    return new AIError("rate_limited", message, status);
  }

  if (status >= 500) {
    return new AIError("provider_unavailable", message, status);
  }

  return new AIError("generation_failed", message, status);
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

  if (status === 401 || status === 403) {
    return new AIError("invalid_api_key", "OpenRouter API key is invalid.", status);
  }

  if (status === 429) {
    return new AIError("rate_limited", "OpenRouter rate limit exceeded.", status);
  }

  if (status === 404) {
    return new AIError("generation_failed", "OpenRouter model unavailable.", status);
  }

  if (status >= 500) {
    return new AIError("provider_unavailable", "OpenRouter provider unavailable.", status);
  }

  return new AIError("generation_failed", message, status);
}

export function normalizeAIError(error: unknown) {
  if (error instanceof AIError) {
    return error;
  }

  if (error instanceof Error) {
    return new AIError("unknown", error.message);
  }

  return new AIError("unknown", "Unknown AI error.");
}
