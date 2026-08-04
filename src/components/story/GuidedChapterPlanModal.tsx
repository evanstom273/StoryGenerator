import { useEffect, useMemo, useState } from "react";
import { Field, SelectInput, TextAreaInput } from "../forms/Fields";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Panel";
import { cn } from "../../utils/cn";
import {
	GUIDED_CHAPTER_MAX_COUNT,
	GUIDED_CHAPTER_MAX_SCENES,
	GUIDED_CHAPTER_MIN_COUNT,
	GUIDED_CHAPTER_MIN_SCENES,
} from "../../lib/guidedChapterGeneration/types";
import type { GuidedChapterPlan, GuidedChapterPlanChapter } from "../../lib/guidedChapterGeneration/types";

type ChapterRow = {
	label: string;
	overview: string;
	scenesPerChapter: number;
};

export function GuidedChapterPlanModal(props: {
	open: boolean;
	onClose: () => void;
	title: string;
	description?: string;
	submitLabel: string;
	initialOverallDirection?: string;
	initialChapterCount?: number;
	initialChapters?: ChapterRow[];
	resolveChapterLabels: (count: number) => string[];
	onGeneratePlan?: (input: {
		overallDirection: string;
		chapterLabels: string[];
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
		setChapters((current) => {
			const next: ChapterRow[] = labels.map((label, index) => {
				const existing = current[index];
				const seeded = props.initialChapters?.[index];
				return {
					label,
					overview: existing?.overview ?? seeded?.overview ?? "",
					scenesPerChapter:
						existing?.scenesPerChapter ??
						seeded?.scenesPerChapter ??
						3,
				};
			});
			return next;
		});
	}, [chapterCount, props.initialChapters, props.open, props.resolveChapterLabels]);

	function clampScenes(value: number) {
		return Math.min(GUIDED_CHAPTER_MAX_SCENES, Math.max(GUIDED_CHAPTER_MIN_SCENES, value));
	}

	async function handleGeneratePlan() {
		if (!props.onGeneratePlan) {
			return;
		}

		if (!overallDirection.trim()) {
			setErrorMessage("Enter an overall direction before generating a chapter plan.");
			return;
		}

		setIsGeneratingPlan(true);
		setErrorMessage(null);

		try {
			const generated = await props.onGeneratePlan({
				overallDirection,
				chapterLabels,
			});
			if (!generated?.length) {
				setErrorMessage("Plan generation returned no chapters. Try again or fill chapters manually.");
				return;
			}

			setChapters(
				chapterLabels.map((label, index) => ({
					label,
					overview: generated[index]?.overview ?? "",
					scenesPerChapter: clampScenes(generated[index]?.scenesPerChapter ?? 3),
				})),
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
		if (!overallDirection.trim()) {
			setErrorMessage("Enter an overall direction for the generated chapters.");
			return;
		}

		const missingOverview = chapters.find((chapter) => !chapter.overview.trim());
		if (missingOverview) {
			setErrorMessage(`Add an overview for ${missingOverview.label}.`);
			return;
		}

		setIsSubmitting(true);
		setErrorMessage(null);

		try {
			await props.onSubmit({
				overallDirection: overallDirection.trim(),
				chapters: chapters.map((chapter) => ({
					label: chapter.label,
					overview: chapter.overview.trim(),
					scenesPerChapter: clampScenes(chapter.scenesPerChapter),
				})),
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
					"absolute inset-0 bg-black/60 transition-opacity",
					props.open ? "opacity-100" : "opacity-0",
				)}
				onClick={props.onClose}
			/>
			<div
				className={cn(
					"absolute inset-x-0 bottom-0 flex max-h-[92vh] flex-col overflow-hidden rounded-t-[18px] border border-divider bg-app shadow-hero transition-transform sm:inset-0 sm:mx-auto sm:my-8 sm:max-w-3xl sm:rounded-[18px]",
					props.open ? "translate-y-0" : "translate-y-full sm:translate-y-4 sm:opacity-0",
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
						<Field label="Overall direction" hint="Required">
							<TextAreaInput
								value={overallDirection}
								onChange={(event) => setOverallDirection(event.target.value)}
								placeholder="What should these chapters accomplish together?"
							/>
						</Field>

						<div className="grid gap-4 sm:grid-cols-2">
							<Field label="Chapter count">
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
									<div className="mt-4 grid gap-4 lg:grid-cols-[1fr_140px]">
										<Field label="Chapter overview" hint="Required">
											<TextAreaInput
												value={chapter.overview}
												onChange={(event) =>
													setChapters((current) =>
														current.map((row, rowIndex) =>
															rowIndex === index
																? { ...row, overview: event.target.value }
																: row,
														),
													)
												}
												placeholder="Key beats and outcomes for this chapter only."
											/>
										</Field>
										<Field label="Scenes per chapter" hint={`${GUIDED_CHAPTER_MIN_SCENES}–${GUIDED_CHAPTER_MAX_SCENES}`}>
											<SelectInput
												value={String(chapter.scenesPerChapter)}
												onChange={(event) =>
													setChapters((current) =>
														current.map((row, rowIndex) =>
															rowIndex === index
																? {
																		...row,
																		scenesPerChapter: clampScenes(
																			Number(event.target.value),
																		),
																	}
																: row,
														),
													)
												}
											>
												{Array.from(
													{ length: GUIDED_CHAPTER_MAX_SCENES - GUIDED_CHAPTER_MIN_SCENES + 1 },
													(_, sceneIndex) => {
														const value =
															sceneIndex + GUIDED_CHAPTER_MIN_SCENES;
														return (
															<option key={value} value={value}>
																{value} scenes
															</option>
														);
													},
												)}
											</SelectInput>
										</Field>
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
