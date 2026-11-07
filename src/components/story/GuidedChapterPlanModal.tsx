import { useEffect, useMemo, useState } from "react";
import { Field, SelectInput, TextAreaInput } from "../forms/Fields";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Panel";
import { BOTTOM_SHEET_PANEL_CLASS, OVERLAY_BACKDROP_CLASS } from "../../app/ui/motion";
import { cn } from "../../utils/cn";
import {
	GUIDED_CHAPTER_MAX_COUNT,
	GUIDED_CHAPTER_MAX_SCENES,
	GUIDED_CHAPTER_MIN_COUNT,
	GUIDED_CHAPTER_MIN_SCENES,
} from "../../lib/guidedChapterGeneration/types";
import type { GuidedChapterPlan, GuidedChapterPlanChapter } from "../../lib/guidedChapterGeneration/types";
import {
	hydrateSceneOverviews,
	sceneIndexToLabel,
	serializeSceneOverviews,
} from "../../lib/guidedChapterGeneration/parsePlanText";

type ChapterRow = {
	label: string;
	scenesPerChapter: number;
	sceneOverviews: string[];
};

function createChapterRow(
	label: string,
	scenesPerChapter: number,
	overview = "",
): ChapterRow {
	const clampedScenes = clampScenes(scenesPerChapter);
	return {
		label,
		scenesPerChapter: clampedScenes,
		sceneOverviews: hydrateSceneOverviews(overview, clampedScenes),
	};
}

function clampScenes(value: number) {
	return Math.min(GUIDED_CHAPTER_MAX_SCENES, Math.max(GUIDED_CHAPTER_MIN_SCENES, value));
}

function chapterHasSceneContent(chapter: ChapterRow) {
	return chapter.sceneOverviews.some((scene) => scene.trim());
}

export function GuidedChapterPlanModal(props: {
	open: boolean;
	onClose: () => void;
	title: string;
	description?: string;
	submitLabel: string;
	initialOverallDirection?: string;
	initialChapterCount?: number;
	initialChapters?: Array<{
		label: string;
		overview: string;
		scenesPerChapter: number;
	}>;
	resolveChapterLabels: (count: number) => string[];
	onGeneratePlan?: (input: {
		overallDirection: string;
		chapterLabels: string[];
		chapters: Array<{
			label: string;
			overview: string;
			scenesPerChapter: number;
		}>;
	}) => Promise<GuidedChapterPlanChapter[] | null>;
	onSubmit: (plan: GuidedChapterPlan) => Promise<void>;
}) {
	const [overallDirection, setOverallDirection] = useState(props.initialOverallDirection ?? "");
	const [chapterCount, setChapterCount] = useState(
		Math.min(
			GUIDED_CHAPTER_MAX_COUNT,
			Math.max(GUIDED_CHAPTER_MIN_COUNT, props.initialChapterCount ?? 3),
		),
	);
	const [chapters, setChapters] = useState<ChapterRow[]>([]);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const chapterLabels = useMemo(
		() => props.resolveChapterLabels(chapterCount),
		[chapterCount, props.resolveChapterLabels],
	);

	useEffect(() => {
		if (!props.open) {
			return;
		}

		setOverallDirection(props.initialOverallDirection ?? "");
		setChapterCount(
			Math.min(
				GUIDED_CHAPTER_MAX_COUNT,
				Math.max(GUIDED_CHAPTER_MIN_COUNT, props.initialChapterCount ?? 3),
			),
		);
		setErrorMessage(null);
		setIsGeneratingPlan(false);
		setIsSubmitting(false);
	}, [props.open, props.initialChapterCount, props.initialOverallDirection]);

	useEffect(() => {
		if (!props.open) {
			return;
		}

		const labels = props.resolveChapterLabels(chapterCount);
		setChapters((current) =>
			labels.map((label, index) => {
				const existing = current[index];
				const seeded = props.initialChapters?.[index];
				const scenesPerChapter =
					existing?.scenesPerChapter ?? seeded?.scenesPerChapter ?? 3;
				const overview = existing
					? serializeSceneOverviews(existing.sceneOverviews)
					: (seeded?.overview ?? "");

				return createChapterRow(label, scenesPerChapter, overview);
			}),
		);
	}, [chapterCount, props.initialChapters, props.open, props.resolveChapterLabels]);

	function updateChapter(index: number, updater: (chapter: ChapterRow) => ChapterRow) {
		setChapters((current) =>
			current.map((row, rowIndex) => (rowIndex === index ? updater(row) : row)),
		);
	}

	function buildChapterPayload(chapter: ChapterRow) {
		return {
			label: chapter.label,
			overview: serializeSceneOverviews(chapter.sceneOverviews),
			scenesPerChapter: clampScenes(chapter.scenesPerChapter),
		};
	}

	async function handleGeneratePlan() {
		if (!props.onGeneratePlan) {
			return;
		}

		const hasChapterContent = chapters.some((chapter) => chapterHasSceneContent(chapter));
		if (!overallDirection.trim() && !hasChapterContent) {
			setErrorMessage(
				"Enter an overall direction or fill in at least one chapter scene before generating a plan.",
			);
			return;
		}

		setIsGeneratingPlan(true);
		setErrorMessage(null);

		try {
			const generated = await props.onGeneratePlan({
				overallDirection,
				chapterLabels,
				chapters: chapters.map((chapter) => buildChapterPayload(chapter)),
			});
			if (!generated?.length) {
				setErrorMessage("Plan generation returned no chapters. Try again or fill chapters manually.");
				return;
			}

			setChapters((current) =>
				chapterLabels.map((label, index) => {
					const existing = current[index];
					const generatedChapter = generated[index];
					const scenesPerChapter = clampScenes(
						existing?.scenesPerChapter ?? generatedChapter?.scenesPerChapter ?? 3,
					);
					const overview = generatedChapter?.overview ?? existing
						? serializeSceneOverviews(existing?.sceneOverviews ?? [])
						: "";

					return createChapterRow(label, scenesPerChapter, overview);
				}),
			);
		} catch (error) {
			setErrorMessage(
				error instanceof Error ? error.message : "Unable to generate the chapter plan.",
			);
		} finally {
			setIsGeneratingPlan(false);
		}
	}

	async function handleSubmit() {
		const missingChapter = chapters.find((chapter) => !chapterHasSceneContent(chapter));
		if (missingChapter) {
			setErrorMessage(`Add at least one scene for ${missingChapter.label}.`);
			return;
		}

		setIsSubmitting(true);
		setErrorMessage(null);

		try {
			await props.onSubmit({
				overallDirection: overallDirection.trim() || undefined,
				chapters: chapters.map((chapter) => buildChapterPayload(chapter)),
			});
			props.onClose();
		} catch (error) {
			setErrorMessage(
				error instanceof Error ? error.message : "Unable to start guided chapter generation.",
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<div
			className={cn(
				"fixed inset-0 z-[85]",
				props.open ? "pointer-events-auto" : "pointer-events-none",
			)}
			aria-hidden={!props.open}
		>
			<button
				type="button"
				aria-label="Close guided chapter planner"
				className={cn(
					"absolute inset-0 bg-app/80 backdrop-blur-sm",
					OVERLAY_BACKDROP_CLASS,
					props.open ? "opacity-100" : "opacity-0",
				)}
				onClick={props.onClose}
			/>
			<div
				className={cn(
					"absolute inset-x-0 bottom-0 flex max-h-[92vh] flex-col overflow-hidden rounded-t-[18px] border border-divider bg-app shadow-hero sm:inset-0 sm:mx-auto sm:my-8 sm:max-w-3xl sm:rounded-[18px]",
					BOTTOM_SHEET_PANEL_CLASS,
					"transition-opacity duration-[280ms] ease-out sm:transition-[transform,opacity]",
					props.open ? "translate-y-0 opacity-100" : "translate-y-full sm:translate-y-4 sm:opacity-0",
				)}
			>
				<Panel variant="flat" padding="lg" className="flex min-h-0 flex-1 flex-col overflow-hidden border-0">
					<div className="shrink-0">
						<div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
							Guided Chapters
						</div>
						<h2 className="mt-2 text-xl font-semibold text-ink">{props.title}</h2>
						{props.description ? (
							<p className="mt-2 text-sm leading-7 text-ink-muted">{props.description}</p>
						) : null}
					</div>

					<div className="mt-6 min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
						<Field
							label="Overall direction"
							hint="Optional · use when you want a high-level arc across all chapters"
							help="Optional arc spanning all chapters. Leave blank to plan each chapter individually below."
						>
							<TextAreaInput
								value={overallDirection}
								onChange={(event) => setOverallDirection(event.target.value)}
								placeholder="Optional. e.g. Continue from the end of the previous chapter, or leave blank and plan each chapter below."
							/>
						</Field>

						<div className="grid gap-4 sm:grid-cols-2">
							<Field
								label="Chapter count"
								help="How many chapters to generate in one batch. Each becomes a playable section in the transcript."
							>
								<SelectInput
									value={String(chapterCount)}
									onChange={(event) => setChapterCount(Number(event.target.value))}
								>
									{Array.from({ length: GUIDED_CHAPTER_MAX_COUNT }, (_, index) => {
										const value = index + GUIDED_CHAPTER_MIN_COUNT;
										return (
											<option key={value} value={value}>
												{value} {value === 1 ? "chapter" : "chapters"}
											</option>
										);
									})}
								</SelectInput>
							</Field>
							{props.onGeneratePlan ? (
								<div className="flex items-end">
									<Button
										type="button"
										variant="secondary"
										onClick={() => void handleGeneratePlan()}
										disabled={isGeneratingPlan || isSubmitting}
									>
										{isGeneratingPlan ? "Generating plan…" : "Generate Chapter Plan"}
									</Button>
								</div>
							) : null}
						</div>

						<div className="space-y-4">
							{chapters.map((chapter, index) => (
								<Panel
									key={chapter.label}
									variant="flat"
									className="border border-white/8 bg-white/[0.03]"
									padding="md"
								>
									<div className="text-sm font-semibold text-ink">{chapter.label}</div>
									<div className="mt-4">
										<Field
											label="Scenes in this chapter"
											hint={`${GUIDED_CHAPTER_MIN_SCENES}–${GUIDED_CHAPTER_MAX_SCENES} scene beats`}
											help="Number of scene beats the AI will write for this chapter. More beats mean a longer chapter."
										>
											<SelectInput
												value={String(chapter.scenesPerChapter)}
												onChange={(event) => {
													const nextCount = clampScenes(Number(event.target.value));
													updateChapter(index, (row) => ({
														...row,
														scenesPerChapter: nextCount,
														sceneOverviews: hydrateSceneOverviews(
															serializeSceneOverviews(row.sceneOverviews),
															nextCount,
														),
													}));
												}}
											>
												{Array.from(
													{
														length:
															GUIDED_CHAPTER_MAX_SCENES -
															GUIDED_CHAPTER_MIN_SCENES +
															1,
													},
													(_, sceneIndex) => {
														const value = sceneIndex + GUIDED_CHAPTER_MIN_SCENES;
														return (
															<option key={value} value={value}>
																{value} {value === 1 ? "scene" : "scenes"}
															</option>
														);
													},
												)}
											</SelectInput>
										</Field>
									</div>

									<div className="mt-4 space-y-4">
										{chapter.sceneOverviews.map((sceneOverview, sceneIndex) => (
											<Field
												key={`${chapter.label}-${sceneIndex}`}
												label={sceneIndexToLabel(sceneIndex)}
												hint={
													chapter.scenesPerChapter === 1
														? "Required · what should happen in this chapter"
														: "What should happen in this scene beat"
												}
												help="Brief beat the AI should dramatise — who is involved, what changes, and where it happens."
											>
												<TextAreaInput
													value={sceneOverview}
													onChange={(event) =>
														updateChapter(index, (row) => ({
															...row,
															sceneOverviews: row.sceneOverviews.map(
																(currentScene, currentSceneIndex) =>
																	currentSceneIndex === sceneIndex
																		? event.target.value
																		: currentScene,
															),
														}))
													}
													placeholder={
														sceneIndex === 0
															? "The protagonist meets the station commander in her office."
															: "What happens next in this chapter?"
													}
												/>
											</Field>
										))}
									</div>
								</Panel>
							))}
						</div>
					</div>

					{errorMessage ? (
						<div className="mt-4 shrink-0 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
							{errorMessage}
						</div>
					) : null}

					<div className="mt-6 flex shrink-0 flex-col gap-3 sm:flex-row sm:justify-end">
						<Button type="button" variant="ghost" onClick={props.onClose} disabled={isSubmitting}>
							Cancel
						</Button>
						<Button type="button" onClick={() => void handleSubmit()} disabled={isSubmitting || isGeneratingPlan}>
							{isSubmitting ? "Starting…" : props.submitLabel}
						</Button>
					</div>
				</Panel>
			</div>
		</div>
	);
}
