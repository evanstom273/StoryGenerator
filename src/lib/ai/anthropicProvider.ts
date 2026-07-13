import type { AIProvider, AIChatMessage } from "./types";
import { AIError, normalizeAIError, looksLikeSafetyRefusal } from "./errors";
import { buildMatureFictionPolicyBlock } from "./matureFictionPolicy";

const REQUEST_TIMEOUT_MS = 45_000;

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

interface AnthropicMessagesRequest {
  model: string;
  max_tokens: number;
  system?: string;
  messages: AnthropicMessage[];
  temperature?: number;
}

interface AnthropicMessagesResponse {
  content?: Array<{ type: string; text?: string }>;
}

function splitSystemAndMessages(messages: AIChatMessage[]): {
  system: string | undefined;
  messages: AnthropicMessage[];
} {
  const systemParts: string[] = [];
  const rest: AnthropicMessage[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemParts.push(msg.content);
    } else {
      rest.push({ role: msg.role as "user" | "assistant", content: msg.content });
    }
  }

  return {
    system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
    messages: rest,
  };
}

async function throwAnthropicHttpError(response: Response): Promise<never> {
  const status = response.status;
  let message = `Anthropic API error ${status}`;
  try {
    const errJson = (await response.json()) as { error?: { message?: string } };
    if (errJson.error?.message) message = errJson.error.message;
  } catch {
    // ignore parse error
  }
  const diagnostic = `status=${status}; provider=Anthropic; raw=${message}`;
  if (status === 401 || status === 403) {
    throw new AIError("invalid_api_key", "Anthropic API key is invalid or unauthorized.", status, { diagnostic });
  }
  if (status === 429) {
    throw new AIError("rate_limited", "Anthropic rate limit exceeded. Try again in a moment.", status, { diagnostic });
  }
  if (status >= 500) {
    throw new AIError("provider_unavailable", "Anthropic service returned a server error. Try again.", status, { diagnostic, retryable: true });
  }
  if (status === 400) {
    if (looksLikeSafetyRefusal(message)) {
      throw new AIError("safety_refusal", message, status, { diagnostic });
    }
    throw new AIError("generation_failed", `Anthropic rejected the request: ${message}`, status, { diagnostic });
  }
  throw new AIError("generation_failed", message, status, { diagnostic });
}

async function callMessages(
  apiKey: string,
  payload: AnthropicMessagesRequest,
  opts?: { timeoutMs?: number; idleTimeoutMs?: number; signal?: AbortSignal; onChunk?: (chunk: string) => void },
): Promise<string> {
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
  const headers = {
    "x-api-key": safeKey,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
    "content-type": "application/json",
  };

  try {
    if (opts?.onChunk) {
      // Streaming path
      const idleTimeoutMs = opts.idleTimeoutMs ?? 30_000;
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers,
        body: JSON.stringify({ ...payload, stream: true }),
        signal: controller.signal,
      });

      if (!response.ok) {
        await throwAnthropicHttpError(response);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";
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
            if (!raw) continue;
            try {
              const json = JSON.parse(raw) as { type?: string; delta?: { type?: string; text?: string } };
              if (json.type === "content_block_delta" && json.delta?.type === "text_delta") {
                const text = json.delta.text ?? "";
                if (text) {
                  opts.onChunk(text);
                  accumulated += text;
                }
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

      return accumulated.trim();
    }

    // Non-streaming path
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      await throwAnthropicHttpError(response);
    }

    const json = (await response.json()) as AnthropicMessagesResponse;
    const text = json.content?.find((b) => b.type === "text")?.text ?? "";
    return text.trim();
  } catch (error) {
    throw normalizeAIError(error);
  } finally {
    window.clearTimeout(timeoutId);
    opts?.signal?.removeEventListener("abort", abortListener);
  }
}

export function createAnthropicProvider(): AIProvider {
  const matureFictionSummaryPolicy = buildMatureFictionPolicyBlock({
    includeExtractionFocus: true,
  });

  return {
    async validateConnection(apiKey, model) {
      const content = await callMessages(apiKey, {
        model,
        max_tokens: 4,
        messages: [{ role: "user", content: "Reply with OK." }],
      });

      if (!content) {
        throw new Error("Anthropic validation returned an empty response.");
      }
    },

    async generateResponse({ apiKey, model, messages, maxTokens, temperature, timeoutMs, idleTimeoutMs, signal, onChunk }) {
      const { system, messages: chatMessages } = splitSystemAndMessages(messages);
      const content = await callMessages(
        apiKey,
        {
          model,
          max_tokens: maxTokens ?? 700,
          temperature: temperature ?? 0.8,
          system,
          messages: chatMessages,
        },
        { timeoutMs, idleTimeoutMs, signal, onChunk },
      );
      return { content };
    },

    async generateSummary({ apiKey, model, storyTitle, messages, existingSummary, timeoutMs, signal }) {
      const prompt = [
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

      const { messages: chatMessages } = splitSystemAndMessages(messages);

      const content = await callMessages(
        apiKey,
        {
          model,
          max_tokens: 350,
          temperature: 0.2,
          system: prompt,
          messages: chatMessages,
        },
        { timeoutMs, signal },
      );

      return content;
    },
  };
}
