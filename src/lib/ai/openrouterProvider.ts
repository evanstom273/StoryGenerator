import type { AIProvider, AIChatMessage } from "./types";
import { normalizeAIError, normalizeOpenRouterError } from "./errors";
import { buildMatureFictionPolicyBlock } from "./matureFictionPolicy";

const REQUEST_TIMEOUT_MS = 45_000;

interface OpenRouterChatCompletionRequest {
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  max_tokens?: number;
}

interface OpenRouterChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

function toChatMessages(messages: AIChatMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

async function callChatCompletions(
  apiKey: string,
  payload: OpenRouterChatCompletionRequest,
  opts?: { timeoutMs?: number; idleTimeoutMs?: number; signal?: AbortSignal; onChunk?: (chunk: string) => void },
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
  try {
    if (opts?.onChunk) {
      let streamAccumulated = "";
      try {
        const idleTimeoutMs = opts.idleTimeoutMs ?? 30_000;
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${safeKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, stream: true }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw await normalizeOpenRouterError(response);
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
                const json = JSON.parse(raw) as { choices?: Array<{ delta?: { content?: string } }> };
                const text = json.choices?.[0]?.delta?.content ?? "";
                if (text) {
                  opts.onChunk(text);
                  streamAccumulated += text;
                }
              } catch {
                // malformed SSE chunk — skip
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
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${safeKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw await normalizeOpenRouterError(response);
    }

    const json = (await response.json()) as OpenRouterChatCompletionResponse;
    const content = json.choices?.[0]?.message?.content ?? "";
    return content.trim();
  } catch (error) {
    throw normalizeAIError(error, { userCancelled: opts?.signal?.aborted });
  } finally {
    window.clearTimeout(timeoutId);
    opts?.signal?.removeEventListener("abort", abortListener);
  }
}

export function createOpenRouterProvider(): AIProvider {
  const matureFictionSummaryPolicy = buildMatureFictionPolicyBlock({
    includeExtractionFocus: true,
  });

  return {
    async validateConnection(apiKey, model) {
      const content = await callChatCompletions(apiKey, {
        model,
        messages: [{ role: "user", content: "Reply with OK." }],
        max_tokens: 4,
        temperature: 0,
      });

      if (!content) {
        throw new Error("OpenRouter validation returned an empty response.");
      }
    },
    async generateResponse({ apiKey, model, messages, maxTokens, temperature, timeoutMs, idleTimeoutMs, signal, onChunk }) {
      const content = await callChatCompletions(apiKey, {
        model,
        messages: toChatMessages(messages),
        temperature: temperature ?? 0.8,
        max_tokens: maxTokens ?? 700,
      }, { timeoutMs, idleTimeoutMs, signal, onChunk });

      return { content };
    },
    async generateSummary({ apiKey, model, storyTitle, messages, existingSummary, timeoutMs, signal }) {
      const prompt = [
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

      const content = await callChatCompletions(apiKey, {
        model,
        messages: [{ role: "system", content: prompt }, ...toChatMessages(messages)],
        temperature: 0.2,
        max_tokens: 350,
      }, { timeoutMs, signal });

      return content;
    },
  };
}
