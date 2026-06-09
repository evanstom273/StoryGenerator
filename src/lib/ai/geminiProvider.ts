import type { AIProvider, AIChatMessage } from "./types";
import { normalizeAIError, AIError } from "./errors";

const REQUEST_TIMEOUT_MS = 45_000;

interface GeminiGenerateContentRequest {
  contents: Array<{
    role?: "user" | "model";
    parts: Array<{ text: string }>;
  }>;
  systemInstruction?: {
    parts: Array<{ text: string }>;
  };
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

function buildGeminiRequest(messages: AIChatMessage[]): GeminiGenerateContentRequest {
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

  return {
    contents,
    systemInstruction: systemText ? { parts: [{ text: systemText }] } : undefined,
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

async function callGenerateContent(apiKey: string, model: string, messages: AIChatMessage[]) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model,
      )}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(buildGeminiRequest(messages)),
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
      throw new AIError("generation_failed", message, response.status);
    }

    const json = (await response.json()) as GeminiGenerateContentResponse;
    const content = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return content.trim();
  } catch (error) {
    throw normalizeAIError(error);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function createGeminiProvider(): AIProvider {
  return {
    async validateConnection(apiKey, model) {
      const content = await callGenerateContent(apiKey, model, [
        { role: "user", content: "Reply with OK." },
      ]);

      if (!content) {
        throw new Error("Gemini validation returned an empty response.");
      }
    },
    async generateResponse({ apiKey, model, messages }) {
      const content = await callGenerateContent(apiKey, model, messages);
      return { content };
    },
    async generateSummary({ apiKey, model, storyTitle, messages, existingSummary }) {
      const summaryInstruction = [
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

      const content = await callGenerateContent(apiKey, model, [
        { role: "system", content: summaryInstruction },
        ...messages,
      ]);

      return content;
    },
  };
}
