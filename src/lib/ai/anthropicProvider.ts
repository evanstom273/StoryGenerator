import type { AIProvider, AIChatMessage } from "./types";
import { normalizeAIError } from "./errors";
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

async function callMessages(
  apiKey: string,
  payload: AnthropicMessagesRequest,
  opts?: { timeoutMs?: number; signal?: AbortSignal },
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
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": safeKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      let message = `Anthropic API error ${response.status}`;
      try {
        const errJson = (await response.json()) as { error?: { message?: string } };
        if (errJson.error?.message) message = errJson.error.message;
      } catch {
        // ignore parse error
      }
      throw new Error(message);
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

    async generateResponse({ apiKey, model, messages, maxTokens, timeoutMs, signal }) {
      const { system, messages: chatMessages } = splitSystemAndMessages(messages);
      const content = await callMessages(
        apiKey,
        {
          model,
          max_tokens: maxTokens ?? 700,
          temperature: 0.8,
          system,
          messages: chatMessages,
        },
        { timeoutMs, signal },
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
