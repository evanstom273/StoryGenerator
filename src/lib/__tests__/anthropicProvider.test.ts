import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAnthropicProvider, resolveClaudeThinkingParams } from "../ai/anthropicProvider";
import { AIError } from "../ai/errors";
import { resolveProviderThinkingSettings } from "../ai/geminiThinking";
import { withStoryThinkingLevel } from "../ai/storyThinking";
import { getIndexingRequestConfig, getModelStreamConfig, getProviderDefaultModel, getProviderModels } from "../ai/models";
import type { AIProvider } from "../ai/types";

const message = (text: string, stopReason = "end_turn", stopDetails: unknown = null) => ({
	id: "msg_1",
	type: "message",
	role: "assistant",
	model: "claude-haiku-5-5",
	content: text ? [{ type: "text", text }] : [],
	stop_reason: stopReason,
	stop_details: stopDetails,
	stop_sequence: null,
	usage: { input_tokens: 10, output_tokens: 5 },
});

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function sseResponse(chunks: string[], end: { stopReason?: string; stopDetails?: unknown } = {}) {
	const events: Array<[string, unknown]> = [
		["message_start", { type: "message_start", message: { ...message(""), content: [], stop_reason: null } }],
		["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
		...chunks.map(
			(text) =>
				["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }] as [string, unknown],
		),
		["content_block_stop", { type: "content_block_stop", index: 0 }],
		[
			"message_delta",
			{
				type: "message_delta",
				delta: { stop_reason: end.stopReason ?? "end_turn", stop_sequence: null, stop_details: end.stopDetails ?? null },
				usage: { output_tokens: 5 },
			},
		],
		["message_stop", { type: "message_stop" }],
	];
	const body = events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("");
	return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

function sentBody(fetchMock: ReturnType<typeof vi.fn>, call = 0) {
	const init = fetchMock.mock.calls[call]?.[1] as RequestInit;
	return JSON.parse(String(init.body));
}

describe("Anthropic provider", () => {
	beforeEach(() => {
		vi.stubGlobal("window", globalThis);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	const base = {
		apiKey: "sk-ant-test",
		model: "claude-haiku-5-5",
		messages: [
			{ role: "system" as const, content: "Scene Direction" },
			{ role: "user" as const, content: "Hello" },
			{ role: "system" as const, content: "Memory" },
		],
	};

	it("streams story text, merges system messages, never sends sampling params, and uses a large output cap", async () => {
		const fetchMock = vi.fn().mockResolvedValue(sseResponse(["Rosa: ", '"Morning."']));
		vi.stubGlobal("fetch", fetchMock);
		const chunks: string[] = [];

		const result = await createAnthropicProvider().generateResponse({
			...base,
			temperature: 0.95,
			thinking: { thinkingLevel: "low" },
			onChunk: (chunk) => chunks.push(chunk),
		});

		expect(result.content).toBe('Rosa: "Morning."');
		expect(chunks).toEqual(["Rosa: ", '"Morning."']);
		const body = sentBody(fetchMock);
		expect(body).toMatchObject({
			model: "claude-haiku-5-5",
			max_tokens: 64000,
			stream: true,
			system: "Scene Direction\n\nMemory",
			messages: [{ role: "user", content: "Hello" }],
			thinking: { type: "adaptive" },
			output_config: { effort: "low" },
		});
		expect(body).not.toHaveProperty("temperature");
		expect(body).not.toHaveProperty("top_p");
		expect(body).not.toHaveProperty("top_k");
	});

	it("streams internally for callers without onChunk, with the non-live default cap", async () => {
		const fetchMock = vi.fn().mockResolvedValue(sseResponse(['{"chapterSummary":', '"Breakfast."}']));
		vi.stubGlobal("fetch", fetchMock);
		const result = await createAnthropicProvider().generateResponse({ ...base });
		expect(result.content).toBe('{"chapterSummary":"Breakfast."}');
		expect(sentBody(fetchMock)).toMatchObject({ stream: true, max_tokens: 16000 });
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("turns a refusal stop reason into a safety refusal", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				sseResponse([], { stopReason: "refusal", stopDetails: { type: "refusal", category: "cyber", explanation: "x" } }),
			),
		);
		const error = await createAnthropicProvider().generateResponse({ ...base }).catch((caught) => caught);
		expect(error).toBeInstanceOf(AIError);
		expect(error).toMatchObject({ code: "safety_refusal", retryable: false });
		expect((error as AIError).diagnostic).toContain("category=cyber");
	});

	it("maps an invalid key to invalid_api_key", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				jsonResponse({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, 401),
			),
		);
		await expect(createAnthropicProvider().generateResponse({ ...base })).rejects.toMatchObject({ code: "invalid_api_key" });
	});

	it("keeps thinking off and the output small when validating a key", async () => {
		const fetchMock = vi.fn().mockResolvedValue(sseResponse(["OK"]));
		vi.stubGlobal("fetch", fetchMock);
		await createAnthropicProvider().validateConnection("sk-ant-test", "claude-haiku-5-5");
		expect(sentBody(fetchMock)).toMatchObject({ max_tokens: 16, thinking: { type: "disabled" } });
	});
});

describe("Claude thinking mapping", () => {
	it("maps StoryEngine thinking levels onto Haiku 5.5 thinking and effort", () => {
		expect(resolveClaudeThinkingParams("claude-haiku-5-5", { thinkingLevel: "minimal" })).toEqual({
			thinking: { type: "disabled" },
			output_config: { effort: "low" },
		});
		expect(resolveClaudeThinkingParams("claude-haiku-5-5", { thinkingLevel: "medium" })).toEqual({
			thinking: { type: "adaptive" },
			output_config: { effort: "medium" },
		});
		expect(resolveClaudeThinkingParams("claude-haiku-5-5", { thinkingLevel: "high" }).output_config).toEqual({
			effort: "high",
		});
		expect(resolveClaudeThinkingParams("claude-haiku-5-5", undefined)).toEqual({});
	});

	it("sends no thinking or effort to models without those controls", () => {
		expect(resolveClaudeThinkingParams("claude-haiku-4-5-20251001", { thinkingLevel: "high" })).toEqual({});
	});

	it("gives Claude the same per-task defaults and preferences as Gemini 3 Flash", () => {
		expect(resolveProviderThinkingSettings("anthropic", "claude-haiku-5-5", "story")).toEqual({ thinkingLevel: "low" });
		expect(resolveProviderThinkingSettings("anthropic", "claude-haiku-5-5", "minimal")).toEqual({ thinkingLevel: "minimal" });
		expect(resolveProviderThinkingSettings("anthropic", "claude-haiku-5-5", "default")).toBeUndefined();
		expect(resolveProviderThinkingSettings("anthropic", "claude-haiku-5-5", "story", "high")).toEqual({ thinkingLevel: "high" });
		expect(resolveProviderThinkingSettings("anthropic", "claude-haiku-5-5", "minimal", "high")).toEqual({ thinkingLevel: "minimal" });
		expect(resolveProviderThinkingSettings("gemini", "gemini-3.6-flash", "story")).toEqual({ thinkingLevel: "low" });
		expect(resolveProviderThinkingSettings("gemini", "gemini-3.6-flash", "minimal")).toEqual({ thinkingLevel: "minimal" });
		expect(resolveProviderThinkingSettings("openai", "gpt-5", "story")).toBeUndefined();
	});

	it("applies a story's thinking level to Claude story calls", async () => {
		const generateResponse = vi.fn().mockResolvedValue({ content: "ok" });
		const provider = { validateConnection: vi.fn(), generateResponse, generateSummary: vi.fn() } as AIProvider;
		await withStoryThinkingLevel(provider, "anthropic", "high").generateResponse({
			apiKey: "k",
			model: "claude-haiku-5-5",
			messages: [],
			onChunk: vi.fn(),
		});
		expect(generateResponse.mock.calls[0]?.[0].thinking).toEqual({ thinkingLevel: "high" });
	});
});

describe("Claude Haiku 5.5 model registration", () => {
	it("is listed first, is the Anthropic default, and has long-generation configs", () => {
		expect(getProviderModels("anthropic")[0]).toEqual({ id: "claude-haiku-5-5", label: "Claude Haiku 5.5" });
		expect(getProviderDefaultModel("anthropic")).toBe("claude-haiku-5-5");
		expect(getModelStreamConfig("claude-haiku-5-5").totalTimeoutMs).toBe(300_000);
		expect(getIndexingRequestConfig("claude-haiku-5-5").maxTokens).toBe(16_384);
	});
});
