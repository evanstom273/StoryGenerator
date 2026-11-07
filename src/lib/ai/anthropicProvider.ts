import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, AIChatMessage } from "./types";
import type { GeminiThinkingSettings } from "./geminiThinking";
import { AIError, normalizeAIError, looksLikeSafetyRefusal } from "./errors";
import { buildMatureFictionPolicyBlock } from "./matureFictionPolicy";

const REQUEST_TIMEOUT_MS = 45_000;
/** Story scenes pass no cap (Gemini has none); give streamed replies room, since thinking counts too. */
const DEFAULT_STREAMING_MAX_TOKENS = 64_000;
const DEFAULT_MAX_TOKENS = 16_000;

/**
 * Models that take adaptive thinking and output_config.effort. Others (e.g.
 * Haiku 4.5) get neither and run with their API defaults.
 */
const THINKING_EFFORT_MODELS = new Set(["claude-haiku-5-5", "claude-sonnet-4-6", "claude-opus-4-8"]);

type EffortLevel = "low" | "medium" | "high";

/**
 * Maps the app's provider-neutral thinking hint (shared with Gemini) onto Claude's
 * thinking and effort settings. Minimal turns thinking off for short tasks such
 * as titles, where thinking tokens would otherwise eat the small output budget.
 */
export function resolveClaudeThinkingParams(
	model: string,
	thinking: GeminiThinkingSettings | undefined,
): Pick<Anthropic.MessageCreateParams, "thinking" | "output_config"> {
	const level = thinking?.thinkingLevel;
	if (!level || !THINKING_EFFORT_MODELS.has(model.trim().toLowerCase())) {
		return {};
	}
	if (level === "minimal") {
		return { thinking: { type: "disabled" }, output_config: { effort: "low" } };
	}
	return { thinking: { type: "adaptive" }, output_config: { effort: level satisfies EffortLevel } };
}

function splitSystemAndMessages(messages: AIChatMessage[]): {
	system: string | undefined;
	messages: Anthropic.MessageParam[];
} {
	const systemParts: string[] = [];
	const rest: Anthropic.MessageParam[] = [];

	for (const msg of messages) {
		if (msg.role === "system") {
			systemParts.push(msg.content);
		} else {
			rest.push({ role: msg.role, content: msg.content });
		}
	}

	return {
		system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
		messages: rest,
	};
}

function toAIError(error: unknown, userCancelled: boolean): AIError {
	if (error instanceof AIError) return error;
	if (error instanceof Anthropic.APIUserAbortError) {
		return normalizeAIError(new DOMException("Request aborted.", "AbortError"), { userCancelled });
	}
	if (error instanceof Anthropic.APIConnectionTimeoutError) {
		return new AIError("timeout", "The request timed out.", undefined, { diagnostic: error.message });
	}
	if (error instanceof Anthropic.APIError) {
		const status = error.status;
		const diagnostic = `status=${status ?? "none"}; provider=Anthropic; raw=${error.message}`;
		if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
			return new AIError("invalid_api_key", "Anthropic API key is invalid or unauthorized.", status, { diagnostic });
		}
		if (error instanceof Anthropic.RateLimitError) {
			return new AIError("rate_limited", "Anthropic rate limit exceeded. Try again in a moment.", status, { diagnostic });
		}
		if (error instanceof Anthropic.InternalServerError || error instanceof Anthropic.APIConnectionError) {
			return new AIError("provider_unavailable", "Anthropic service returned a server error. Try again.", status, {
				diagnostic,
				retryable: true,
			});
		}
		if (error instanceof Anthropic.BadRequestError && looksLikeSafetyRefusal(error.message)) {
			return new AIError("safety_refusal", error.message, status, { diagnostic, retryable: false, kind: "safety" });
		}
		return new AIError("generation_failed", `Anthropic rejected the request: ${error.message}`, status, { diagnostic });
	}
	return normalizeAIError(error, { userCancelled });
}

function assertUsableMessage(message: Anthropic.Message, text: string): string {
	if (message.stop_reason === "refusal") {
		const category = message.stop_details?.category ?? "unspecified";
		throw new AIError("safety_refusal", "Claude declined to continue this request.", 200, {
			diagnostic: `status=200; provider=Anthropic; stop_reason=refusal; category=${category}`,
			retryable: false,
			kind: "safety",
		});
	}
	return text.trim();
}

function textOf(message: Anthropic.Message): string {
	return message.content
		.filter((block): block is Anthropic.TextBlock => block.type === "text")
		.map((block) => block.text)
		.join("");
}

async function callMessages(
	apiKey: string,
	params: Omit<Anthropic.MessageCreateParamsNonStreaming, "stream">,
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
	const timeoutId = window.setTimeout(() => controller.abort(), opts?.timeoutMs ?? REQUEST_TIMEOUT_MS);

	// The app owns retries (generateResponseWithRetry), so the SDK must not add its own.
	const client = new Anthropic({
		apiKey: apiKey.replace(/[^\x00-\xFF]/g, ""),
		dangerouslyAllowBrowser: true,
		maxRetries: 0,
	});
	const requestOptions = { signal: controller.signal };

	try {
		// Always stream: long jobs (indexing JSON, MetaChat reviews) are watched by the idle
		// timer instead of one silent wait, as recommended for high max_tokens requests.
		let streamAccumulated = "";
		let idleTimer: number | null = null;
		const resetIdleTimer = () => {
			if (idleTimer !== null) window.clearTimeout(idleTimer);
			idleTimer = window.setTimeout(() => controller.abort(), opts?.idleTimeoutMs ?? 60_000);
		};
		try {
			const stream = client.messages.stream(params, requestOptions);
			resetIdleTimer();
			for await (const event of stream) {
				resetIdleTimer();
				if (event.type === "content_block_delta" && event.delta.type === "text_delta" && event.delta.text) {
					opts?.onChunk?.(event.delta.text);
					streamAccumulated += event.delta.text;
				}
			}
			const message = await stream.finalMessage();
			return assertUsableMessage(message, opts?.onChunk ? streamAccumulated : textOf(message));
		} catch (streamErr) {
			// Live-streaming callers keep the old safety net: if the stream failed before any
			// text arrived, try once without streaming.
			if (!opts?.onChunk || streamAccumulated !== "" || streamErr instanceof AIError || controller.signal.aborted) {
				throw streamErr;
			}
		} finally {
			if (idleTimer !== null) window.clearTimeout(idleTimer);
		}

		const message = await client.messages.create(params, requestOptions);
		return assertUsableMessage(message, textOf(message));
	} catch (error) {
		throw toAIError(error, Boolean(opts?.signal?.aborted));
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
				max_tokens: 16,
				...resolveClaudeThinkingParams(model, { thinkingLevel: "minimal" }),
				messages: [{ role: "user", content: "Reply with OK." }],
			});

			if (!content) {
				throw new Error("Anthropic validation returned an empty response.");
			}
		},

		// Sampling parameters (temperature, top_p, top_k) are never sent: API version
		// 2026-10-21 rejects them on every model.
		async generateResponse({ apiKey, model, messages, maxTokens, thinking, timeoutMs, idleTimeoutMs, signal, onChunk }) {
			const { system, messages: chatMessages } = splitSystemAndMessages(messages);
			const content = await callMessages(
				apiKey,
				{
					model,
					max_tokens: maxTokens ?? (onChunk ? DEFAULT_STREAMING_MAX_TOKENS : DEFAULT_MAX_TOKENS),
					...resolveClaudeThinkingParams(model, thinking),
					...(system ? { system } : {}),
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
				"Keep the player character grounded in the summary, but preserve ensemble structure when present: note who the story is fundamentally about, the active co-leads or group dynamic, and the current condition/status of the player character and other scene-critical characters.",
				"Do not introduce protagonist identity facts (age/gender/pronouns/occupation/disabilities) unless explicitly supported by the canonical player-character block or transcript. Existing summaries are untrusted derived drafts, not evidence; correct or omit any conflict. Avoid genre-default assumptions.",
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

			return callMessages(
				apiKey,
				{
					model,
					// Summaries are short; keep thinking off so it cannot consume the budget.
					max_tokens: 1_500,
					...resolveClaudeThinkingParams(model, { thinkingLevel: "minimal" }),
					system: prompt,
					messages: chatMessages,
				},
				{ timeoutMs, signal },
			);
		},
	};
}
