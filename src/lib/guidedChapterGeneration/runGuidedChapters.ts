import type { StoryMessage } from "../../types/models";
import type { StoryEngineRepository } from "../repository";
import { getNextChapterBannerLabel } from "../ai/chapterBannerLabel";
import { createEntityId } from "../ids";
import type { GuidedChapterGenerationEntry, GuidedChapterPlan } from "./types";
import { STORY_HISTORY_DIVIDER_MESSAGE } from "./types";
import {
	formatChapterEndMessage,
} from "./chapterLabels";
import { resolveOrCreateChapterStartMessage } from "./chapterStart";
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
	scenesPerChapter?: number;
	sceneCount?: number;
	continuityNotes?: string;
	previousChapterContext?: string;
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
	priorChapterContext?: string;
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
		const { scenes, sceneCount } = resolveScenesForChapter(
			chapter.overview,
			chapter.scenesPerChapter,
		);
		const chapterContext: GuidedChapterSendContext = {
			overallDirection: plan.overallDirection,
			chapterOverview: chapter.overview,
			chapterLabel: chapter.label,
			scenesPerChapter: chapter.scenesPerChapter,
			sceneCount,
			previousChapterContext: params.priorChapterContext,
		};

		chapterStatuses[chapterIndex]!.status = "active";
		report("generating", chapterIndex + 1, `Starting ${chapter.label}…`, chapter.label);

		const chapterStartMessage = await resolveOrCreateChapterStartMessage(
			params.repository,
			storyId,
			chapter.label,
			await params.repository.listStoryMessages(storyId),
		);
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

			const useDirectorBeat = shouldStageDirectorBeatForScene(
				chapter.overview,
				sceneIndex,
				sceneCount,
			);

			if (useDirectorBeat) {
				const directorBeat = await generateDirectorBeat({
					provider: params.provider,
					apiKey: params.apiKey,
					model: params.model,
					signal: params.signal,
					chapterLabel: chapter.label,
					chapterOverview: chapter.overview,
					sceneOverview,
					sceneIndex: sceneIndex + 1,
					sceneCount,
					overallDirection: plan.overallDirection,
					playerName,
					continuityNotes: sceneContext.continuityNotes,
					previousChapterContext:
						chapterIndex === 0 && sceneIndex === 0 ? params.priorChapterContext : undefined,
				});

				await params.sendChatMessage(storyId, formatDirectorTranscriptMessage(directorBeat), {
					signal: params.signal,
					guidedGenerationInternal: true,
					guidedChapterContext: sceneContext,
					onChunk: params.onStreamingChunk,
					onChunkReset: params.onStreamingReset,
				});
				if (params.onTranscriptChange) {
					await params.onTranscriptChange();
				}
			} else {
				await params.sendChatMessage(storyId, "Continue", {
					signal: params.signal,
					guidedGenerationInternal: true,
					guidedDirectedScene: true,
					guidedChapterContext: sceneContext,
					onChunk: params.onStreamingChunk,
					onChunkReset: params.onStreamingReset,
				});
				if (params.onTranscriptChange) {
					await params.onTranscriptChange();
				}
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
		await resolveOrCreateChapterStartMessage(params.repository, storyId, playableLabel);
		if (params.onTranscriptChange) {
			await params.onTranscriptChange();
		}
	}

	report("done", totalChapters, "Guided chapter generation complete.");
	return { dividerMessageId };
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
