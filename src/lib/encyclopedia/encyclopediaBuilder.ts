import type { StoryEngineRepository } from "../repository";
import type { AIProvider } from "../ai/types";
import type { StoryEncyclopedia } from "../../types/models";
import { sortByTimestampAsc } from "../dates";
import { AIError } from "../ai/errors";
import { safeParseStoryStateData } from "../storyStateV2";
import {
	buildEncyclopediaEntityIndex,
	buildSingleMessageEncyclopediaPrompt,
	parseEncyclopediaDelta,
} from "./encyclopediaExtractor";
import { mergeEncyclopediaEntries } from "./encyclopediaMerge";
import {
	resolveChapterLabelAtMessage,
	resolveLatestChapterLabel,
	shouldIndexMessageForEncyclopedia,
} from "./encyclopediaTranscript";

const ENCYCLOPEDIA_REQUEST_TIMEOUT_MS = 120_000;
const ENCYCLOPEDIA_MAX_ATTEMPTS = 3;

async function generateWithRetry(
	provider: AIProvider,
	params: {
		apiKey: string;
		model: string;
		messages: Parameters<AIProvider["generateResponse"]>[0]["messages"];
		maxTokens: number;
		temperature: number;
		jsonMode: boolean;
		timeoutMs: number;
		signal?: AbortSignal;
	},
): Promise<string> {
	let lastError: unknown;
	for (let attempt = 1; attempt <= ENCYCLOPEDIA_MAX_ATTEMPTS; attempt++) {
		if (params.signal?.aborted) throw new Error("Encyclopedia indexing aborted.");
		try {
			const result = await provider.generateResponse(params);
			return result.content;
		} catch (error) {
			lastError = error;
			const retryable =
				error instanceof AIError
					? error.code === "provider_unavailable" || error.code === "rate_limited" || error.code === "timeout"
					: false;
			if (!retryable || attempt >= ENCYCLOPEDIA_MAX_ATTEMPTS) throw error;
			await new Promise<void>((resolve, reject) => {
				const id = setTimeout(resolve, 500 * Math.pow(2, attempt - 1));
				params.signal?.addEventListener(
					"abort",
					() => {
						clearTimeout(id);
						reject(new Error("Encyclopedia indexing aborted."));
					},
					{ once: true },
				);
			});
		}
	}
	throw lastError;
}

export async function buildEncyclopediaFromTranscript(params: {
	storyId: string;
	repository: StoryEngineRepository;
	provider: AIProvider;
	apiKey: string;
	model: string;
	rebuild?: boolean;
	incremental?: boolean;
	onProgress?: (p: { processed: number; total: number; message?: string }) => void;
	signal?: AbortSignal;
}): Promise<{ encyclopedia: StoryEncyclopedia; messageCount: number }> {
	const story = await params.repository.getStory(params.storyId);
	if (!story) throw new Error("Story not found.");

	const [storyState, rawMessages, chapters, playerCharacter] = await Promise.all([
		params.repository.getStoryState(params.storyId),
		params.repository.listStoryMessages(params.storyId),
		params.repository.listStoryChapters(params.storyId),
		params.repository.getPlayerCharacter(story.playerCharacterId),
	]);

	if (!playerCharacter) throw new Error("Story references missing player character.");

	const messages = sortByTimestampAsc(rawMessages);
	const total = messages.length;
	const parsedState = storyState?.stateJson ? safeParseStoryStateData(storyState.stateJson) : null;
	const existing = params.rebuild ? undefined : parsedState?.encyclopedia;

	const lastIndexed = params.incremental && existing?.lastUpdatedMessageCount
		? existing.lastUpdatedMessageCount
		: params.incremental && existing?.indexedMessageCount
			? existing.indexedMessageCount
			: 0;

	const targetMessages = params.rebuild || !params.incremental
		? messages
		: messages.slice(lastIndexed);

	if (params.incremental && !params.rebuild && targetMessages.length === 0) {
		params.onProgress?.({ processed: total, total, message: "Encyclopedia is already up to date." });
		return {
			encyclopedia: existing ?? { version: "1.0" },
			messageCount: total,
		};
	}

	let accumulated: StoryEncyclopedia = params.rebuild
		? { version: "1.0" }
		: existing
			? { ...existing }
			: { version: "1.0" };

	const startOffset = params.rebuild || !params.incremental ? 0 : lastIndexed;

	params.onProgress?.({
		processed: startOffset,
		total,
		message: params.rebuild
			? `Reading transcript message by message… 0/${total}`
			: params.incremental
				? `Updating from ${targetMessages.length} new message${targetMessages.length === 1 ? "" : "s"}…`
				: `Reading transcript message by message… 0/${total}`,
	});

	for (let index = 0; index < targetMessages.length; index++) {
		const message = targetMessages[index]!;
		const messageNumber = startOffset + index + 1;

		if (params.signal?.aborted) throw new Error("Encyclopedia indexing aborted.");

		if (!shouldIndexMessageForEncyclopedia(message)) {
			params.onProgress?.({
				processed: messageNumber,
				total,
				message: `Skipped meta message ${messageNumber}/${total}…`,
			});
			continue;
		}

		const chapterLabel = resolveChapterLabelAtMessage(messageNumber, messages, chapters);
		const entityIndex = buildEncyclopediaEntityIndex(accumulated);

		const prompt = buildSingleMessageEncyclopediaPrompt({
			playerName: playerCharacter.name,
			message,
			messageNumber,
			messageNumberTotal: total,
			chapterLabel,
			entityIndex,
		});

		const raw = await generateWithRetry(params.provider, {
			apiKey: params.apiKey,
			model: params.model,
			messages: prompt,
			maxTokens: 3000,
			temperature: 0.1,
			jsonMode: true,
			timeoutMs: ENCYCLOPEDIA_REQUEST_TIMEOUT_MS,
			signal: params.signal,
		});

		const delta = parseEncyclopediaDelta(raw);
		if (delta) {
			accumulated = mergeEncyclopediaEntries(accumulated, delta);
		}

		params.onProgress?.({
			processed: messageNumber,
			total,
			message: `Read message ${messageNumber}/${total}…`,
		});
	}

	const now = new Date().toISOString();
	const latestChapter = resolveLatestChapterLabel(messages, chapters);

	const encyclopedia: StoryEncyclopedia = {
		...accumulated,
		version: "1.0",
		indexedAt: params.rebuild || !existing?.indexedAt ? now : existing.indexedAt,
		lastUpdatedAt: now,
		lastUpdatedChapter: latestChapter,
		lastUpdatedMessageCount: total,
		indexedMessageCount: total,
	};

	return { encyclopedia, messageCount: total };
}
