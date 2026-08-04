import type { StoryMessage } from "../../types/models";
import type { StoryEngineRepository } from "../repository";
import { getNextChapterBannerLabel } from "../ai/chapterBannerLabel";
import { createEntityId } from "../ids";
import type { GuidedChapterGenerationEntry, GuidedChapterPlan } from "./types";
import {
	GUIDED_MAX_CONTINUE_PER_SCENE,
	STORY_HISTORY_DIVIDER_MESSAGE,
} from "./types";
import {
	formatChapterEndMessage,
	formatChapterStartMessage,
} from "./chapterLabels";
import { generateDirectorBeat } from "./directorBeat";
import type { AIProvider } from "../ai/types";
import { parseOverallChapterDirections, resolveScenesForChapter, shouldStageDirectorBeatForScene, stripChapterHeadingPrefix } from "./parsePlanText";
import { buildContinuityNotesForChapter } from "./guidedChapterContinuity";

export type GuidedChapterProgressChapter = {
	label: string;
	status: "pending" | "active" | "done";
};

export type GuidedChapterProgressUpdate = {
	phase: "generating" | "indexing" | "done" | "error";
	currentChapter: number;
	totalChapters: number;
	chapterLabel?: string;
	message?: string;
	chapters: GuidedChapterProgressChapter[];
};

export type GuidedChapterSendContext = {
	overallDirection?: string;
	chapterOverview?: string;
	chapterLabel?: string;
	sceneOverview?: string;
	continuityNotes?: string;
};

type SendChatMessageFn = (
	storyId: string,
	content: string,
	opts?: {
		signal?: AbortSignal;
		guidedGenerationInternal?: boolean;
		directorStagingNote?: string;
		guidedDirectedScene?: boolean;
		guidedChapterContext?: GuidedChapterSendContext;
		onChunk?: (chunk: string) => void;
		onChunkReset?: () => void;
	},
) => Promise<unknown>;

type RunDeepIndexFn = (
	storyId: string,
	opts?: { signal?: AbortSignal; trigger?: "manual" | "auto"; incremental?: boolean; jobId?: string },
) => Promise<string>;

function normalizeChapterBoundaryLabel(label: string): string {
	return label.trim().replace(/\.$/, "");
}

function formatDirectorTranscriptMessage(beat: string): string {
	return `Director: ${beat.trim()}`;
}

export async function runGuidedChapterGeneration(params: {
	storyId: string;
	plan: GuidedChapterPlan;
	entry: GuidedChapterGenerationEntry;
	playerName: string;
	repository: StoryEngineRepository;
	provider: AIProvider;
	apiKey: string;
	model: string;
	sendChatMessage: SendChatMessageFn;
	runDeepIndex: RunDeepIndexFn;
	signal?: AbortSignal;
	jobId?: string;
	onProgress?: (update: GuidedChapterProgressUpdate) => void;
	onStreamingChunk?: (chunk: string) => void;
	onStreamingReset?: () => void;
	onTranscriptChange?: () => Promise<void>;
}): Promise<{ dividerMessageId?: string }> {
	const { plan, storyId, entry, playerName } = params;
	const totalChapters = plan.chapters.length;
	const chapterStatuses: GuidedChapterProgressChapter[] = plan.chapters.map((chapter) => ({
		label: chapter.label,
		status: "pending",
	}));

	const report = (
		phase: GuidedChapterProgressUpdate["phase"],
		currentChapter: number,
		message?: string,
		chapterLabel?: string,
	) => {
		params.onProgress?.({
			phase,
			currentChapter,
			totalChapters,
			chapterLabel,
			message,
			chapters: chapterStatuses.map((chapter) => ({ ...chapter })),
		});
	};

	const chapterDirections = parseOverallChapterDirections(plan.overallDirection ?? "");

	for (let chapterIndex = 0; chapterIndex < plan.chapters.length; chapterIndex += 1) {
		if (params.signal?.aborted) {
			throw new Error("Guided chapter generation aborted.");
		}

		const rawChapter = plan.chapters[chapterIndex]!;
		const normalizedChapter = stripChapterHeadingPrefix(rawChapter.label, rawChapter.overview);
		const chapter = {
			...rawChapter,
			label: normalizedChapter.label || rawChapter.label,
			overview:
				chapterDirections[normalizedChapter.label] ||
				normalizedChapter.overview ||
				rawChapter.overview,
		};
		const chapterContext: GuidedChapterSendContext = {
			overallDirection: plan.overallDirection,
			chapterOverview: chapter.overview,
			chapterLabel: chapter.label,
		};

		chapterStatuses[chapterIndex]!.status = "active";
		report("generating", chapterIndex + 1, `Starting ${chapter.label}…`, chapter.label);

		const chapterStartMessage = await saveChapterStartSystemMessage(params.repository, storyId, chapter.label);
		if (params.onTranscriptChange) {
			await params.onTranscriptChange();
		}

		const chapterStartMessageId = chapterStartMessage.id;

		const refreshContext = async (
			base: Omit<GuidedChapterSendContext, "continuityNotes"> & { sceneOverview?: string },
		) =>
			buildContinuityNotesForChapter(
				() => params.repository.listStoryMessages(storyId),
				chapterStartMessageId,
				base,
			);

		const { scenes, sceneCount } = resolveScenesForChapter(
			chapter.overview,
			chapter.scenesPerChapter,
		);
		for (let sceneIndex = 0; sceneIndex < sceneCount; sceneIndex += 1) {
			if (params.signal?.aborted) {
				throw new Error("Guided chapter generation aborted.");
			}

			report(
				"generating",
				chapterIndex + 1,
				`${chapter.label}: scene ${sceneIndex + 1}/${sceneCount}`,
				chapter.label,
			);

			const sceneOverview = scenes[sceneIndex] ?? chapter.overview;
			const sceneContext = await refreshContext({
				...chapterContext,
				sceneOverview,
			});

			const useDirectorBeat = shouldStageDirectorBeatForScene(chapter.overview, sceneIndex);

			if (useDirectorBeat) {
				const directorBeat = await generateDirectorBeat({
					provider: params.provider,
					apiKey: params.apiKey,
					model: params.model,
					chapterLabel: chapter.label,
					chapterOverview: chapter.overview,
					sceneOverview,
					sceneIndex: sceneIndex + 1,
					sceneCount,
					overallDirection: plan.overallDirection,
					playerName,
					continuityNotes: sceneContext.continuityNotes,
				});

				await params.sendChatMessage(storyId, formatDirectorTranscriptMessage(directorBeat), {
					signal: params.signal,
					guidedGenerationInternal: true,
					guidedChapterContext: sceneContext,
					onChunk: params.onStreamingChunk,
					onChunkReset: params.onStreamingReset,
				});
			} else {
				await params.sendChatMessage(storyId, "Continue", {
					signal: params.signal,
					guidedGenerationInternal: true,
					guidedDirectedScene: true,
					guidedChapterContext: sceneContext,
					onChunk: params.onStreamingChunk,
					onChunkReset: params.onStreamingReset,
				});
			}

			let continueCount = 0;
			while (continueCount < GUIDED_MAX_CONTINUE_PER_SCENE) {
				const messages = await params.repository.listStoryMessages(storyId);
				const last = messages[messages.length - 1];
				if (!last || last.role !== "assistant") {
					break;
				}
				const assistantWords = last.content.split(/\s+/).filter(Boolean).length;
				if (assistantWords >= 80 || sceneIndex === sceneCount - 1) {
					break;
				}
				const continueContext = await refreshContext(chapterContext);
				await params.sendChatMessage(storyId, "Continue", {
					signal: params.signal,
					guidedGenerationInternal: true,
					guidedDirectedScene: true,
					guidedChapterContext: continueContext,
					onChunk: params.onStreamingChunk,
					onChunkReset: params.onStreamingReset,
				});
				continueCount += 1;
			}
		}

		const chapterEndContext = await refreshContext(chapterContext);
		await params.sendChatMessage(
			storyId,
			`${playerName}: *${formatChapterEndMessage(chapter.label)}.*`,
			{
				signal: params.signal,
				guidedGenerationInternal: true,
				guidedChapterContext: chapterEndContext,
				onChunk: params.onStreamingChunk,
				onChunkReset: params.onStreamingReset,
			},
		);

		chapterStatuses[chapterIndex]!.status = "done";
		report("indexing", chapterIndex + 1, `Indexing ${chapter.label}…`, chapter.label);

		await params.runDeepIndex(storyId, {
			signal: params.signal,
			trigger: "manual",
			incremental: true,
			jobId: params.jobId,
		});
	}

	let dividerMessageId: string | undefined;

	if (entry === "story_history") {
		const divider = await saveSystemMessage(params.repository, storyId, STORY_HISTORY_DIVIDER_MESSAGE);
		dividerMessageId = divider.id;
		const lastLabel = plan.chapters[plan.chapters.length - 1]?.label ?? "Chapter I";
		const playableLabel = getNextChapterBannerLabel(lastLabel);
		await saveChapterStartSystemMessage(params.repository, storyId, playableLabel);
		if (params.onTranscriptChange) {
			await params.onTranscriptChange();
		}
	}

	report("done", totalChapters, "Guided chapter generation complete.");
	return { dividerMessageId };
}

async function saveChapterStartSystemMessage(
	repository: StoryEngineRepository,
	storyId: string,
	label: string,
): Promise<StoryMessage> {
	const boundaryLabel = normalizeChapterBoundaryLabel(label);
	const message: StoryMessage = {
		id: createEntityId("story-message"),
		storyId,
		role: "system",
		content: formatChapterStartMessage(boundaryLabel),
		timestamp: new Date().toISOString(),
		speakerType: "system",
		chapterBoundary: {
			kind: "start",
			label: boundaryLabel,
		},
	};
	await repository.saveStoryMessage(message);
	return message;
}

async function saveSystemMessage(
	repository: StoryEngineRepository,
	storyId: string,
	content: string,
): Promise<StoryMessage> {
	const message: StoryMessage = {
		id: createEntityId("story-message"),
		storyId,
		role: "system",
		content,
		timestamp: new Date().toISOString(),
		speakerType: "system",
	};
	await repository.saveStoryMessage(message);
	return message;
}

export async function insertStoryHistoryDivider(
	repository: StoryEngineRepository,
	storyId: string,
): Promise<StoryMessage> {
	return saveSystemMessage(repository, storyId, STORY_HISTORY_DIVIDER_MESSAGE);
}
