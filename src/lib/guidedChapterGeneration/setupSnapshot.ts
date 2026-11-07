import type { EntityId } from "../../types/models";
import type {
	GuidedChapterGenerationEntry,
	GuidedChapterPlan,
	GuidedChapterPlanChapter,
	GuidedChapterSetupSnapshot,
} from "./types";
import { resolveScenesForChapter, sceneIndexToLabel } from "./parsePlanText";

export function buildGuidedChapterSetupSnapshot(params: {
	plan: GuidedChapterPlan;
	chapter: GuidedChapterPlanChapter;
	chapterOverview: string;
	entry: GuidedChapterGenerationEntry;
	jobId?: EntityId;
	generatedAt?: string;
}): GuidedChapterSetupSnapshot {
	const { scenes, sceneCount } = resolveScenesForChapter(
		params.chapterOverview,
		params.chapter.scenesPerChapter,
	);

	return {
		overallDirection: params.plan.overallDirection?.trim() || undefined,
		chapterLabel: params.chapter.label,
		chapterOverview: params.chapterOverview.trim(),
		scenesPerChapter: params.chapter.scenesPerChapter,
		scenes: scenes.slice(0, sceneCount).map((overview, index) => ({
			label: sceneIndexToLabel(index),
			overview: overview.trim(),
		})),
		entry: params.entry,
		generatedAt: params.generatedAt ?? new Date().toISOString(),
		jobId: params.jobId,
	};
}