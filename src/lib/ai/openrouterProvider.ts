import type { AIProvider, AIChatMessage } from "./types";
import { normalizeAIError, normalizeOpenRouterError } from "./errors";

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
) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
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
    throw normalizeAIError(error);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function createOpenRouterProvider(): AIProvider {
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
    async generateResponse({ apiKey, model, messages }) {
      const content = await callChatCompletions(apiKey, {
        model,
        messages: toChatMessages(messages),
        temperature: 0.8,
        max_tokens: 700,
      });

      return { content };
    },
    async generateSummary({ apiKey, model, storyTitle, messages, existingSummary }) {
      const prompt = [
        `You are a story summarizer. Summarize the story "${storyTitle}" for continuity.`,
        "Write in present tense.",
        "Keep it concise but specific.",
        "Include: key events, current goals, unresolved threads, and relevant character details.",
        "Explicitly track changes to: preferred names, aliases, pronouns, ranks/titles, relationships, injuries/recoveries, and major world events.",
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
      });

      return content;
    },
  };
}
