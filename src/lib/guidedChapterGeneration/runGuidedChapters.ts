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

type SendChatMessageFn = (
	storyId: string,
	content: string,
	opts?: {
		signal?: AbortSignal;
		guidedGenerationInternal?: boolean;
	},
) => Promise<unknown>;

type RunDeepIndexFn = (
	storyId: string,
	opts?: { signal?: AbortSignal; trigger?: "manual" | "auto"; incremental?: boolean; jobId?: string },
) => Promise<string>;

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

	for (let chapterIndex = 0; chapterIndex < plan.chapters.length; chapterIndex += 1) {
		if (params.signal?.aborted) {
			throw new Error("Guided chapter generation aborted.");
		}

		const chapter = plan.chapters[chapterIndex]!;
		chapterStatuses[chapterIndex]!.status = "active";
		report("generating", chapterIndex + 1, `Starting ${chapter.label}…`, chapter.label);

		await params.sendChatMessage(
			storyId,
			formatChapterStartMessage(chapter.label),
			{ signal: params.signal, guidedGenerationInternal: true },
		);

		const scenes = Math.max(1, Math.min(10, chapter.scenesPerChapter));
		for (let sceneIndex = 0; sceneIndex < scenes; sceneIndex += 1) {
			if (params.signal?.aborted) {
				throw new Error("Guided chapter generation aborted.");
			}

			report(
				"generating",
				chapterIndex + 1,
				`${chapter.label}: scene ${sceneIndex + 1}/${scenes}`,
				chapter.label,
			);

			const directorBeat = await generateDirectorBeat({
				provider: params.provider,
				apiKey: params.apiKey,
				model: params.model,
				chapterLabel: chapter.label,
				chapterOverview: chapter.overview,
				sceneIndex: sceneIndex + 1,
				sceneCount: scenes,
				overallDirection: plan.overallDirection,
				playerName,
			});

			await params.sendChatMessage(storyId, `Director: ${directorBeat}`, {
				signal: params.signal,
				guidedGenerationInternal: true,
			});

			let continueCount = 0;
			while (continueCount < GUIDED_MAX_CONTINUE_PER_SCENE) {
				const messages = await params.repository.listStoryMessages(storyId);
				const last = messages[messages.length - 1];
				if (!last || last.role !== "assistant") {
					break;
				}
				const assistantWords = last.content.split(/\s+/).filter(Boolean).length;
				if (assistantWords >= 80 || sceneIndex === scenes - 1) {
					break;
				}
				await params.sendChatMessage(storyId, "Continue", {
					signal: params.signal,
					guidedGenerationInternal: true,
				});
				continueCount += 1;
			}
		}

		await params.sendChatMessage(
			storyId,
			`${playerName}: *${formatChapterEndMessage(chapter.label)}.*`,
			{ signal: params.signal, guidedGenerationInternal: true },
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
		await params.sendChatMessage(
			storyId,
			formatChapterStartMessage(playableLabel),
			{ signal: params.signal, guidedGenerationInternal: true },
		);
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
