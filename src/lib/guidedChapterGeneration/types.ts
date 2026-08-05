export type GuidedChapterGenerationEntry = "story_history" | "workspace";

export type GuidedChapterPlanChapter = {
	label: string;
	overview: string;
	scenesPerChapter: number;
};

export type GuidedChapterPlan = {
	overallDirection?: string;
	chapters: GuidedChapterPlanChapter[];
};

export type GuidedChapterSetupScene = {
	label: string;
	overview: string;
};

export type GuidedChapterSetupSnapshot = {
	overallDirection?: string;
	chapterLabel: string;
	chapterOverview: string;
	scenesPerChapter: number;
	scenes: GuidedChapterSetupScene[];
	entry?: GuidedChapterGenerationEntry;
	generatedAt: string;
	jobId?: string;
};

export const GUIDED_CHAPTER_MIN_SCENES = 1;
export const GUIDED_CHAPTER_MAX_SCENES = 10;
export const GUIDED_CHAPTER_MIN_COUNT = 1;
export const GUIDED_CHAPTER_MAX_COUNT = 20;

export const STORY_HISTORY_DIVIDER_MESSAGE =
	"────────────────────────────\n📖 Generated Story History Complete\nThe playable story begins below.\n────────────────────────────";
