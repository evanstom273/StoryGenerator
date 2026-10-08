import { describe, expect, it, vi } from "vitest";
import { compactMemory, buildConversationMessages } from "../memory";
import {
  createResponseGenerator,
  METACHAT_SYSTEM_PROMPT,
} from "../responseGenerator";
import { newConversation } from "../conversationService";
import type { AISettings } from "../../../types/models";
import { now } from "./fixtures";

const settings: AISettings = {
  id: "ai-settings",
  activeProviderType: "gemini",
  apiKeys: { gemini: "fixture-only" },
  defaultModels: { gemini: "story-director-model" },
  metachatModels: { gemini: "chat-model" },
  createdAt: now,
  updatedAt: now,
};
describe("conversation memory and provider isolation", () => {
  it("compacts earlier discussion, preserves significant exact corrections and keeps full history", async () => {
    const chat = newConversation();
    chat.messages = Array.from({ length: 50 }, (_, i) => ({
      id: `message-${i}`,
      role: i % 2 ? ("assistant" as const) : ("user" as const),
      content:
        i === 0
          ? "Correction: Jamie uses they/them. We decided to keep the apology awkward."
          : `Discussion turn ${i}`,
      createdAt: now,
    }));
    const summarize = vi.fn(
      async () => "We decided the apology stays awkward; Jamie uses they/them.",
    );
    chat.memory = await compactMemory(
      chat,
      summarize,
      new AbortController().signal,
    );
    const prompt = JSON.stringify(
      buildConversationMessages(chat, "What did we decide about the apology?"),
    );
    expect(prompt).toContain("Correction: Jamie uses they/them");
    expect(prompt).toContain("apology stays awkward");
    expect(chat.messages).toHaveLength(50);
    expect(summarize.mock.calls[0][0][0].content).toContain(
      "never story canon",
    );
    expect(
      await compactMemory(chat, summarize, new AbortController().signal),
    ).toEqual(chat.memory);
    expect(summarize).toHaveBeenCalledTimes(1);
  });
  it("falls back to saved exact excerpts if compaction fails", async () => {
    const chat = newConversation();
    chat.messages = Array.from({ length: 30 }, (_, i) => ({
      id: String(i),
      role: "user" as const,
      content: `Important earlier topic ${i}`,
      createdAt: now,
    }));
    const memory = await compactMemory(
      chat,
      async () => {
        throw new Error("Offline");
      },
      new AbortController().signal,
    );
    expect(memory?.summary).toContain("Important earlier topic");
    expect(chat.messages).toHaveLength(30);
  });
  it("uses the independent MetaChat role and sends the user turn once", async () => {
    const generateResponse = vi.fn(async () => ({
      content: JSON.stringify({ reply: "That Doctor 😂", actions: [] }),
    }));
    const provider = {
      generateResponse,
      generateSummary: vi.fn(),
      validateConnection: vi.fn(),
    };
    const generate = createResponseGenerator(
      async () => settings,
      () => provider,
    );
    const chat = newConversation();
    chat.messages.push({
      id: "u",
      role: "user",
      content: "So... The Doctor, eh? 🤣",
      createdAt: now,
    });
    const context = {
      intent: "casual" as const,
      text: "",
      resources: [],
      limitations: [],
    };
    expect(
      (
        await generate.generate(
          chat,
          context,
          { stories: [], characters: [], universes: [] },
          new AbortController().signal,
        )
      ).reply,
    ).toContain("😂");
    const request = generateResponse.mock.calls[0][0];
    expect(request.model).toBe("chat-model");
    expect(
      request.messages.filter((item) => item.role === "user"),
    ).toHaveLength(1);
    expect(request.messages[0].content).toBe(METACHAT_SYSTEM_PROMPT);
    expect(request.messages[0].content).toContain("Director commands");
    expect(request.messages[0].content).toContain(
      "No action on story resources",
    );
    delete settings.metachatModels;
    await generate.generate(
      chat,
      context,
      { stories: [], characters: [], universes: [] },
      new AbortController().signal,
    );
    expect(generateResponse.mock.calls[1][0].model).toBe("gemini-2.5-flash");
    expect(settings.defaultModels.gemini).toBe("story-director-model");
  });
  it("does not auto-retry a terminal provider refusal", async () => {
    const generateResponse = vi.fn(async () => {
      throw new Error("Provider safety refusal");
    });
    const generate = createResponseGenerator(
      async () => settings,
      () => ({
        generateResponse,
        generateSummary: vi.fn(),
        validateConnection: vi.fn(),
      }),
    );
    await expect(
      generate.summarize([], new AbortController().signal),
    ).rejects.toThrow("refusal");
    expect(generateResponse).toHaveBeenCalledTimes(1);
  });
});
