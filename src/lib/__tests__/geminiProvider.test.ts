import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AIError, looksLikeSafetyRefusal } from "../ai/errors";
import {
	createGeminiProvider,
	extractGeminiGenerateContentResponse,
	extractGeminiResponseText,
} from "../ai/geminiProvider";

describe("extractGeminiResponseText", () => {
	it("prefers non-thought parts", () => {
		expect(
			extractGeminiResponseText([
				{ text: "Narrator: *The room is quiet.*", thought: false },
				{ text: "planning notes", thought: true },
			]),
		).toBe("Narrator: *The room is quiet.*");
	});

	it("falls back to thought parts when visible output is empty", () => {
		expect(
			extractGeminiResponseText([
				{ text: "Narrator: *The room is quiet.*", thought: true },
			]),
		).toBe("Narrator: *The room is quiet.*");
	});
});

describe("extractGeminiGenerateContentResponse", () => {
	it("captures finishReason and blockReason metadata", () => {
		expect(
			extractGeminiGenerateContentResponse({
				candidates: [
					{
						finishReason: "STOP",
						content: {
							parts: [{ text: "Narrator: *The room is quiet.*" }],
						},
					},
				],
				promptFeedback: { blockReason: "SAFETY" },
			}),
		).toEqual({
			text: "Narrator: *The room is quiet.*",
			finishReason: "STOP",
			blockReason: "SAFETY",
		});
	});
});

function jsonResponse(payload: unknown) {
	return new Response(JSON.stringify(payload), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}

function sseResponse(events: unknown[]) {
	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const event of events) {
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
			}
			controller.close();
		},
	});
	return new Response(stream, {
		status: 200,
		headers: { "Content-Type": "text/event-stream" },
	});
}

async function expectSafetyRefusal(promise: Promise<unknown>) {
	try {
		await promise;
		throw new Error("Expected Gemini generation to reject.");
	} catch (error) {
		expect(error).toBeInstanceOf(AIError);
		expect(error).toMatchObject({
			code: "safety_refusal",
			kind: "safety",
			retryable: false,
			status: 200,
		});
		return error as AIError;
	}
}

describe("Gemini blocked responses", () => {
	beforeEach(() => {
		vi.stubGlobal("window", globalThis);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("turns an HTTP-200 blocked prompt with no candidates into a safety refusal", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			jsonResponse({
				promptFeedback: {
					blockReason: "PROHIBITED_CONTENT",
					blockReasonMessage: "The prompt could not be processed.",
					safetyRatings: [{ category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", blocked: true }],
				},
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const error = await expectSafetyRefusal(
			createGeminiProvider().generateResponse({
				apiKey: "test-key",
				model: "gemini-test",
				messages: [{ role: "user", content: "test" }],
			}),
		);

		expect(error.message).toBe("Gemini blocked the prompt (PROHIBITED_CONTENT).");
		expect(error.diagnostic).toContain("stage=prompt");
		expect(error.diagnostic).toContain("blockReason=PROHIBITED_CONTENT");
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("rejects non-stream content when its finish reason is blocked", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				jsonResponse({
					candidates: [
						{
							finishReason: "RECITATION",
							finishMessage: "Possible recitation detected.",
							content: { parts: [{ text: "A partial answer" }] },
						},
					],
				}),
			),
		);

		const error = await expectSafetyRefusal(
			createGeminiProvider().generateResponse({
				apiKey: "test-key",
				model: "gemini-test",
				messages: [{ role: "user", content: "test" }],
			}),
		);

		expect(error.message).toBe("Gemini blocked the response (RECITATION).");
		expect(error.diagnostic).toContain("stage=response");
		expect(error.diagnostic).toContain("finishReason=RECITATION");
	});

	it("rejects a streamed prompt block without falling back to another request", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			sseResponse([{ promptFeedback: { blockReason: "SAFETY" } }]),
		);
		vi.stubGlobal("fetch", fetchMock);

		const error = await expectSafetyRefusal(
			createGeminiProvider().generateResponse({
				apiKey: "test-key",
				model: "gemini-test",
				messages: [{ role: "user", content: "test" }],
				onChunk: vi.fn(),
			}),
		);

		expect(error.message).toBe("Gemini blocked the prompt (SAFETY).");
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("rejects streamed partial text followed by a blocked finish reason", async () => {
		const onChunk = vi.fn();
		const fetchMock = vi.fn().mockResolvedValue(
			sseResponse([
				{ candidates: [{ content: { parts: [{ text: "Partial text" }] } }] },
				{
					candidates: [
						{
							finishReason: "PROHIBITED_CONTENT",
							safetyRatings: [{ category: "HARM_CATEGORY_DANGEROUS_CONTENT", blocked: true }],
						},
					],
				},
			]),
		);
		vi.stubGlobal("fetch", fetchMock);

		const error = await expectSafetyRefusal(
			createGeminiProvider().generateResponse({
				apiKey: "test-key",
				model: "gemini-test",
				messages: [{ role: "user", content: "test" }],
				onChunk,
			}),
		);

		expect(error.message).toBe("Gemini blocked the response (PROHIBITED_CONTENT).");
		expect(error.diagnostic).toContain("finishReason=PROHIBITED_CONTENT");
		expect(onChunk).toHaveBeenCalledOnce();
		expect(onChunk).toHaveBeenCalledWith("Partial text");
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("continues to accept a normal non-stream STOP response", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				jsonResponse({
					candidates: [
						{
							finishReason: "STOP",
							content: { parts: [{ text: "Rosa: \"All good.\"" }] },
						},
					],
				}),
			),
		);

		const result = await createGeminiProvider().generateResponse({
			apiKey: "test-key",
			model: "gemini-test",
			messages: [{ role: "user", content: "test" }],
		});

		expect(result.content).toBe('Rosa: "All good."');
	});
});

describe("looksLikeSafetyRefusal", () => {
	it.each([
		"PROHIBITED_CONTENT",
		"prohibited-content",
		"prohibited content",
		"IMAGE_PROHIBITED_CONTENT",
	])("recognizes Gemini prohibited-content variant %s", (message) => {
		expect(looksLikeSafetyRefusal(message)).toBe(true);
	});
});
