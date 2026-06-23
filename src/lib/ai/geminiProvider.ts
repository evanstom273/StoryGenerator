import type { AIProvider, AIChatMessage } from "./types";
import { normalizeAIError, AIError, looksLikeSafetyRefusal } from "./errors";
import { buildMatureFictionPolicyBlock } from "./matureFictionPolicy";

const REQUEST_TIMEOUT_MS = 45_000;
const GENERATION_AUDIT_URL = "http://127.0.0.1:7777/event";
const GENERATION_AUDIT_SESSION = "generation-pipeline-audit";

interface GeminiGenerateContentRequest {
  contents: Array<{
    role?: "user" | "model";
    parts: Array<{ text: string }>;
  }>;
  systemInstruction?: {
    parts: Array<{ text: string }>;
  };
  generationConfig?: {
    maxOutputTokens?: number;
    temperature?: number;
  };
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    finishReason?: string;
    safetyRatings?: unknown;
    content?: {
      parts?: Array<{ text?: string; thought?: boolean }>;
    };
  }>;
  promptFeedback?: unknown;
}

function clipGeminiAuditText(value: string | null | undefined, max = 400) {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  if (!normalized) {
    return "";
  }
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function reportGeminiAudit(args: {
  hypothesisId: string;
  location: string;
  msg: string;
  data?: Record<string, unknown>;
}) {
  // #region debug-point A:gemini-report
  void fetch(GENERATION_AUDIT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: GENERATION_AUDIT_SESSION,
      runId: "pre-fix",
      hypothesisId: args.hypothesisId,
      location: args.location,
      msg: `[DEBUG] ${args.msg}`,
      data: args.data,
      ts: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

function buildGeminiRequest(
  messages: AIChatMessage[],
  opts?: { maxTokens?: number; temperature?: number },
): GeminiGenerateContentRequest {
  const systemText = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join("\n\n");

  const contents = messages
    .filter((message) => message.role !== "system")
    .map(
      (message): GeminiGenerateContentRequest["contents"][number] => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      }),
    );

  const generationConfig: GeminiGenerateContentRequest["generationConfig"] = {};
  if (opts?.maxTokens != null) generationConfig.maxOutputTokens = opts.maxTokens;
  if (opts?.temperature != null) generationConfig.temperature = opts.temperature;

  return {
    contents,
    systemInstruction: systemText ? { parts: [{ text: systemText }] } : undefined,
    ...(Object.keys(generationConfig).length ? { generationConfig } : {}),
  };
}

async function extractGeminiErrorMessage(response: Response) {
  const status = response.status;
  let message = `Gemini request failed (${status}).`;

  try {
    const payload = (await response.json()) as any;
    const candidate =
      payload?.error?.message ?? payload?.message ?? payload?.error ?? undefined;
    if (typeof candidate === "string" && candidate.trim()) {
      message = candidate.trim();
    }
  } catch {
    message = message;
  }

  return message;
}

async function callGenerateContent(
  apiKey: string,
  model: string,
  messages: AIChatMessage[],
  opts?: { timeoutMs?: number; signal?: AbortSignal; maxTokens?: number; temperature?: number },
) {
  const controller = new AbortController();
  const abortListener = () => controller.abort();
  if (opts?.signal) {
    if (opts.signal.aborted) {
      controller.abort();
    } else {
      opts.signal.addEventListener("abort", abortListener, { once: true });
    }
  }
  const timeoutMs = opts?.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  // #region debug-point A:gemini-request
  reportGeminiAudit({
    hypothesisId: "A",
    location: "geminiProvider.ts:callGenerateContent:start",
    msg: "Gemini request dispatched",
    data: {
      model,
      timeoutMs,
      messageCount: messages.length,
      systemCount: messages.filter((message) => message.role === "system").length,
      lastUserPreview: clipGeminiAuditText(
        [...messages].reverse().find((message) => message.role === "user")?.content,
      ),
    },
  });
  // #endregion

  const safeKey = apiKey.replace(/[^\x00-\xFF]/g, "");
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model,
      )}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": safeKey,
        },
        body: JSON.stringify(buildGeminiRequest(messages, { maxTokens: opts?.maxTokens, temperature: opts?.temperature })),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new AIError("invalid_api_key", "Gemini API key is invalid.", response.status);
      }

      if (response.status === 429) {
        throw new AIError("rate_limited", "Gemini rate limit exceeded.", response.status);
      }

      if (response.status >= 500) {
        throw new AIError("provider_unavailable", "Gemini provider unavailable.", response.status);
      }

      const message = await extractGeminiErrorMessage(response);
      // #region debug-point A:gemini-http-error
      reportGeminiAudit({
        hypothesisId: "A",
        location: "geminiProvider.ts:callGenerateContent:http-error",
        msg: "Gemini request returned an HTTP error",
        data: {
          model,
          status: response.status,
          errorMessage: message,
        },
      });
      // #endregion
      if (looksLikeSafetyRefusal(message)) {
        throw new AIError("safety_refusal", message, response.status, {
          retryable: false,
          kind: "safety",
        });
      }
      throw new AIError("generation_failed", message, response.status);
    }

    const json = (await response.json()) as GeminiGenerateContentResponse;
    const content = (json.candidates?.[0]?.content?.parts ?? [])
      .filter((part) => !part.thought)
      .map((part) => part.text ?? "")
      .join("") ?? "";
    // #region debug-point A:gemini-response
    reportGeminiAudit({
      hypothesisId: "A",
      location: "geminiProvider.ts:callGenerateContent:success",
      msg: "Gemini response received",
      data: {
        model,
        finishReason: json.candidates?.[0]?.finishReason ?? null,
        promptFeedback: json.promptFeedback ?? null,
        safetyRatings: json.candidates?.[0]?.safetyRatings ?? null,
        rawOutput: content,
      },
    });
    // #endregion
    return content.trim();
  } catch (error) {
    // #region debug-point A:gemini-catch
    reportGeminiAudit({
      hypothesisId: "A",
      location: "geminiProvider.ts:callGenerateContent:catch",
      msg: "Gemini request threw before returning usable content",
      data: {
        model,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    });
    // #endregion
    throw normalizeAIError(error);
  } finally {
    window.clearTimeout(timeoutId);
    opts?.signal?.removeEventListener("abort", abortListener);
  }
}

export function createGeminiProvider(): AIProvider {
  const matureFictionSummaryPolicy = buildMatureFictionPolicyBlock({
    includeExtractionFocus: true,
  });

  return {
    async validateConnection(apiKey, model) {
      const content = await callGenerateContent(apiKey, model, [
        { role: "user", content: "Reply with OK." },
      ]);

      if (!content) {
        throw new Error("Gemini validation returned an empty response.");
      }
    },
    async generateResponse({ apiKey, model, messages, maxTokens, temperature, timeoutMs, signal }) {
      const content = await callGenerateContent(apiKey, model, messages, { timeoutMs, signal, maxTokens, temperature });
      return { content };
    },
    async generateSummary({ apiKey, model, storyTitle, messages, existingSummary, timeoutMs, signal }) {
      const summaryInstruction = [
        `You are a story summarizer. Summarize the story "${storyTitle}" for continuity.`,
        "Write in present tense.",
        "Keep it concise but specific.",
        "Preserve three layers: core premise, current situation, and recent developments.",
        "Keep the protagonist central: who they are, what the story is fundamentally about, and what condition/status they are in now.",
        "Do not introduce protagonist identity facts (age/gender/pronouns/occupation/disabilities) unless explicitly supported by the transcript or existing summary. Avoid genre-default assumptions.",
        "Include: key events, current goals, unresolved threads, and relevant character details.",
        "Explicitly track changes to: preferred names, aliases, pronouns, ranks/titles, relationships, injuries/recoveries, and major world events.",
        "Major life-changing events should outweigh trivial recent beats.",
        matureFictionSummaryPolicy,
        "Do not invent new facts.",
        existingSummary?.trim()
          ? `Existing summary (update/extend it):\n${existingSummary.trim()}`
          : undefined,
      ]
        .filter(Boolean)
        .join("\n\n");

      const content = await callGenerateContent(apiKey, model, [
        { role: "system", content: summaryInstruction },
        ...messages,
      ], { timeoutMs, signal });

      return content;
    },
  };
}
