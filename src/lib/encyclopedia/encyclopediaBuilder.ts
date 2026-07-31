import type { StoryEngineRepository } from "../repository";
import type { AIProvider } from "../ai/types";
import type { StoryEncyclopedia } from "../../types/models";
import { sortByTimestampAsc } from "../dates";
import { AIError } from "../ai/errors";
import { safeParseStoryStateData } from "../storyStateV2";
import { buildEncyclopediaExtractionPrompt, parseEncyclopediaDelta } from "./encyclopediaExtractor";
import { mergeEncyclopediaEntries } from "./encyclopediaMerge";
import { resolveLatestChapterLabel } from "./encyclopediaTranscript";

const ENCYCLOPEDIA_REQUEST_TIMEOUT_MS = 180_000;
const ENCYCLOPEDIA_MAX_ATTEMPTS = 3;
const CHUNK_SIZE = 25;

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

function chunkMessages<T>(messages: T[], chunkSize: number): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < messages.length; i += chunkSize) {
		chunks.push(messages.slice(i, i + chunkSize));
	}
	return chunks;
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

	const chunks = chunkMessages(targetMessages, CHUNK_SIZE);
	const startOffset = params.rebuild || !params.incremental ? 0 : lastIndexed;
	let processed = startOffset;

	params.onProgress?.({
		processed,
		total,
		message: params.rebuild
			? `Indexing full transcript… 0/${total} messages`
			: params.incremental
				? `Updating encyclopedia from ${targetMessages.length} new message${targetMessages.length === 1 ? "" : "s"}…`
				: `Indexing transcript… 0/${total} messages`,
	});

	for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
		const chunk = chunks[chunkIndex]!;
		if (params.signal?.aborted) throw new Error("Encyclopedia indexing aborted.");

		const messageNumberStart = startOffset + chunkIndex * CHUNK_SIZE + 1;
		const accumulatedJson = JSON.stringify({
			characters: accumulated.characters,
			locations: accumulated.locations,
			events: accumulated.events,
			objects: accumulated.objects,
			organizations: accumulated.organizations,
			rules: accumulated.rules,
			technology: accumulated.technology,
		});

		const prompt = buildEncyclopediaExtractionPrompt({
			playerName: playerCharacter.name,
			transcriptChunk: chunk,
			messageNumberStart,
			messageNumberTotal: total,
			accumulatedEncyclopediaJson: chunkIndex > 0 ? accumulatedJson : undefined,
		});

		const raw = await generateWithRetry(params.provider, {
			apiKey: params.apiKey,
			model: params.model,
			messages: prompt,
			maxTokens: 8000,
			temperature: 0.2,
			jsonMode: true,
			timeoutMs: ENCYCLOPEDIA_REQUEST_TIMEOUT_MS,
			signal: params.signal,
		});

		const delta = parseEncyclopediaDelta(raw);
		if (delta) {
			accumulated = mergeEncyclopediaEntries(accumulated, delta);
		}

		processed = startOffset + Math.min((chunkIndex + 1) * CHUNK_SIZE, targetMessages.length);
		params.onProgress?.({
			processed,
			total,
			message: `Indexed ${processed}/${total} messages…`,
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
