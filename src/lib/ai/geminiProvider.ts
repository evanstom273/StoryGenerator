import type { AIProvider, AIChatMessage } from "./types";
import type { GeminiThinkingSettings } from "./geminiThinking";
import { normalizeAIError, AIError, looksLikeSafetyRefusal } from "./errors";
import { buildMatureFictionPolicyBlock } from "./matureFictionPolicy";

const REQUEST_TIMEOUT_MS = 45_000;

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
    responseMimeType?: string;
    thinkingConfig?: {
      thinkingBudget?: number;
      thinkingLevel?: string;
    };
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

function buildGeminiRequest(
  messages: AIChatMessage[],
  opts?: {
    maxTokens?: number;
    temperature?: number;
    jsonMode?: boolean;
    thinking?: GeminiThinkingSettings;
  },
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
  if (opts?.jsonMode) generationConfig.responseMimeType = "application/json";
  if (opts?.thinking) {
    generationConfig.thinkingConfig = {};
    if (opts.thinking.thinkingLevel) {
      generationConfig.thinkingConfig.thinkingLevel = opts.thinking.thinkingLevel;
    } else if (opts.thinking.thinkingBudget != null) {
      generationConfig.thinkingConfig.thinkingBudget = opts.thinking.thinkingBudget;
    }
  }

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

function throwGeminiHttpError(response: Response, message: string) {
  if (response.status === 401 || response.status === 403) {
    throw new AIError("invalid_api_key", "Gemini API key is invalid.", response.status);
  }
  if (response.status === 429) {
    throw new AIError("rate_limited", "Gemini rate limit exceeded.", response.status);
  }
  if (response.status >= 500) {
    throw new AIError("provider_unavailable", "Gemini provider unavailable.", response.status);
  }
  if (looksLikeSafetyRefusal(message)) {
    throw new AIError("safety_refusal", message, response.status, { retryable: false, kind: "safety" });
  }
  throw new AIError("generation_failed", message, response.status);
}

async function callGenerateContent(
  apiKey: string,
  model: string,
  messages: AIChatMessage[],
  opts?: {
    timeoutMs?: number;
    idleTimeoutMs?: number;
    signal?: AbortSignal;
    maxTokens?: number;
    temperature?: number;
    jsonMode?: boolean;
    thinking?: GeminiThinkingSettings;
    onChunk?: (chunk: string) => void;
  },
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

  const safeKey = apiKey.replace(/[^\x00-\xFF]/g, "");
  const requestBody = JSON.stringify(
    buildGeminiRequest(messages, {
      maxTokens: opts?.maxTokens,
      temperature: opts?.temperature,
      jsonMode: opts?.jsonMode,
      thinking: opts?.thinking,
    }),
  );

  try {
    if (opts?.onChunk) {
      let streamAccumulated = "";
      try {
        const idleTimeoutMs = opts.idleTimeoutMs ?? 30_000;
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": safeKey },
            body: requestBody,
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          const message = await extractGeminiErrorMessage(response);
          throwGeminiHttpError(response, message);
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let idleTimer: number | null = null;

        const resetIdleTimer = () => {
          if (idleTimer !== null) window.clearTimeout(idleTimer);
          idleTimer = window.setTimeout(() => controller.abort(), idleTimeoutMs);
        };

        resetIdleTimer();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            resetIdleTimer();
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const raw = line.slice(6).trim();
              if (!raw || raw === "[DONE]") continue;
              try {
                const json = JSON.parse(raw) as GeminiGenerateContentResponse;
                const text = (json.candidates?.[0]?.content?.parts ?? [])
                  .filter((part) => !part.thought)
                  .map((part) => part.text ?? "")
                  .join("");
                if (text) {
                  opts.onChunk(text);
                  streamAccumulated += text;
                }
              } catch {
                // malformed SSE chunk — skip
              }
            }
          }
          // flush remaining buffer
          if (buffer.startsWith("data: ")) {
            const raw = buffer.slice(6).trim();
            if (raw && raw !== "[DONE]") {
              try {
                const json = JSON.parse(raw) as GeminiGenerateContentResponse;
                const text = (json.candidates?.[0]?.content?.parts ?? [])
                  .filter((part) => !part.thought)
                  .map((part) => part.text ?? "")
                  .join("");
                if (text) {
                  opts.onChunk(text);
                  streamAccumulated += text;
                }
              } catch {
                // ignore
              }
            }
          }
        } finally {
          if (idleTimer !== null) window.clearTimeout(idleTimer);
          reader.releaseLock();
        }

        return streamAccumulated.trim();
      } catch (streamErr) {
        if (streamAccumulated !== "") throw streamErr;
        // No chunks delivered — fall through to non-streaming path
      }
    }

    // Non-streaming path (also reached as streaming fallback when no chunks were delivered)
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": safeKey },
        body: requestBody,
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const message = await extractGeminiErrorMessage(response);
      throwGeminiHttpError(response, message);
    }

    const json = (await response.json()) as GeminiGenerateContentResponse;
    const content = (json.candidates?.[0]?.content?.parts ?? [])
      .filter((part) => !part.thought)
      .map((part) => part.text ?? "")
      .join("") ?? "";
    return content.trim();
  } catch (error) {
    throw normalizeAIError(error, { userCancelled: opts?.signal?.aborted });
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
    async generateResponse({ apiKey, model, messages, maxTokens, temperature, jsonMode, thinking, timeoutMs, idleTimeoutMs, signal, onChunk }) {
      const content = await callGenerateContent(apiKey, model, messages, {
        timeoutMs,
        idleTimeoutMs,
        signal,
        maxTokens,
        temperature,
        jsonMode,
        thinking,
        onChunk,
      });
      return { content };
    },
    async generateSummary({ apiKey, model, storyTitle, messages, existingSummary, timeoutMs, signal }) {
      const summaryInstruction = [
        `You are a story summarizer. Summarize the story "${storyTitle}" for continuity.`,
        "Write in present tense.",
        "Keep it concise but specific.",
        "Preserve three layers: core premise, current situation, and recent developments.",
        "Keep the player character grounded in the summary, but preserve ensemble structure when present: note who the story is fundamentally about, the active co-leads or group dynamic, and the current condition/status of the player character and other scene-critical characters.",
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
