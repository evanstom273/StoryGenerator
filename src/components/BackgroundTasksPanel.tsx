import {
	memo,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";
import {
	countActiveBackgroundTasks,
	getBackgroundTaskRemainingLabel,
	getBackgroundTaskNavigationTarget,
	getBackgroundTaskProgressLabel,
	getBackgroundTaskProgressPercent,
	getBackgroundTaskStoryLabel,
	getBackgroundTaskTypeLabel,
	partitionBackgroundTasks,
} from "../lib/backgroundTasks";
import type { BackgroundJob } from "../types/models";
import { Button } from "./ui/Button";
import { cn } from "../utils/cn";

const PANEL_Z_INDEX = 55;
const DESKTOP_PANEL_WIDTH = 384;
const VIEWPORT_MARGIN = 8;

function computeDesktopPanelStyle(anchor: DOMRect): CSSProperties {
	const width = Math.min(DESKTOP_PANEL_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);
	const left = Math.max(
		VIEWPORT_MARGIN,
		Math.min(anchor.right - width, window.innerWidth - width - VIEWPORT_MARGIN),
	);
	const belowTop = anchor.bottom + VIEWPORT_MARGIN;
	const panelMaxHeight = Math.min(window.innerHeight * 0.7, 448);
	const fitsBelow = belowTop + panelMaxHeight <= window.innerHeight - VIEWPORT_MARGIN;
	const top = fitsBelow
		? belowTop
		: Math.max(VIEWPORT_MARGIN, anchor.top - panelMaxHeight - VIEWPORT_MARGIN);

	return {
		position: "fixed",
		top,
		left,
		width,
		zIndex: PANEL_Z_INDEX,
	};
}

function TaskProgressBar({ percent }: { percent: number | null }) {
	if (percent === null) {
		return (
			<div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
				<div className="h-full w-1/3 animate-pulse rounded-full bg-accent/50" />
			</div>
		);
	}

	return (
		<div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
			<div
				className="h-full rounded-full bg-accent/80 transition-[width] duration-300"
				style={{ width: `${percent}%` }}
			/>
		</div>
	);
}

function TaskRemainingSuffix({ job }: { job: BackgroundJob }) {
	const [nowMs, setNowMs] = useState(() => Date.now());

	useEffect(() => {
		if (job.status !== "running" && job.status !== "queued") {
			return;
		}

		const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000);
		return () => window.clearInterval(intervalId);
	}, [job.id, job.status]);

	if (job.status !== "running" && job.status !== "queued") {
		return null;
	}

	const label = getBackgroundTaskRemainingLabel(job, nowMs);
	if (!label) {
		return null;
	}

	return <> · {label}</>;
}

const TaskRow = memo(function TaskRow({
	job,
	storyLabel,
	onNavigate,
	onCancel,
	onMoveUp,
	onMoveDown,
	showCancel,
	showReorder,
	canMoveUp,
	canMoveDown,
}: {
	job: BackgroundJob;
	storyLabel: string;
	onNavigate: () => void;
	onCancel?: () => void;
	onMoveUp?: () => void;
	onMoveDown?: () => void;
	showCancel?: boolean;
	showReorder?: boolean;
	canMoveUp?: boolean;
	canMoveDown?: boolean;
}) {
	const typeLabel = getBackgroundTaskTypeLabel(job);
	const progressLabel = getBackgroundTaskProgressLabel(job);
	const percent = getBackgroundTaskProgressPercent(job);
	const isFailed = job.status === "failed";
	const isCancelled = job.status === "cancelled";
	const isComplete = job.status === "complete";

	return (
		<div
			className={cn(
				"rounded-[8px] border px-3 py-2.5",
				isFailed
					? "border-rose-400/20 bg-rose-400/5"
					: isCancelled
						? "border-white/10 bg-white/[0.02]"
						: isComplete
							? "border-emerald-400/20 bg-emerald-400/5"
							: "border-accent/20 bg-accent/5",
			)}
		>
			<button type="button" onClick={onNavigate} className="w-full text-left">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0 flex-1">
						<div className="text-sm font-medium text-ink">{typeLabel}</div>
						<div className="mt-0.5 truncate text-xs text-ink-muted">{storyLabel}</div>
						<div className="mt-1 text-xs text-ink-muted">
							{progressLabel}
							<TaskRemainingSuffix job={job} />
						</div>
						{job.status === "running" || job.status === "queued" ? (
							<div className="mt-2">
								<TaskProgressBar percent={job.status === "queued" ? null : percent} />
							</div>
						) : null}
						{isFailed && job.error ? (
							<div className="mt-1 text-xs text-rose-300/90">{job.error}</div>
						) : null}
						{isCancelled ? (
							<div className="mt-1 text-xs text-ink-muted">Cancelled</div>
						) : null}
						{isComplete ? (
							<div className="mt-1 text-xs text-emerald-300/90">Complete</div>
						) : null}
					</div>
				</div>
			</button>
			{showReorder || showCancel ? (
				<div className="mt-2 flex items-center justify-end gap-1">
					{showReorder ? (
						<div className="mr-auto flex items-center gap-1">
							<button
								type="button"
								aria-label="Move task up in queue"
								disabled={!canMoveUp}
								onClick={(event) => {
									event.stopPropagation();
									onMoveUp?.();
								}}
								className="flex h-7 w-7 items-center justify-center rounded-[6px] text-ink-muted transition hover:bg-white/[0.06] hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
							>
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
									<path d="M12 5v14" /><path d="m5 12 7-7 7 7" />
								</svg>
							</button>
							<button
								type="button"
								aria-label="Move task down in queue"
								disabled={!canMoveDown}
								onClick={(event) => {
									event.stopPropagation();
									onMoveDown?.();
								}}
								className="flex h-7 w-7 items-center justify-center rounded-[6px] text-ink-muted transition hover:bg-white/[0.06] hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
							>
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
									<path d="M12 5v14" /><path d="m5 12 7 7 7 7" />
								</svg>
							</button>
						</div>
					) : null}
					{showCancel && onCancel ? (
						<Button variant="ghost" size="sm" onClick={onCancel}>
							Cancel
						</Button>
					) : null}
				</div>
			) : null}
		</div>
	);
});

function BackgroundTasksPanelBody({
	onClose,
	className,
}: {
	onClose: () => void;
	className?: string;
}) {
	const navigate = useNavigate();
	const { backgroundJobs, stories, cancelBackgroundJob, reorderBackgroundTaskJob } = useStoryEngine();

	const storyTitleById = useMemo(
		() => (storyId: string) => stories.find((story) => story.id === storyId)?.title,
		[stories],
	);

	const { running, queued, completed } = useMemo(
		() => partitionBackgroundTasks(backgroundJobs),
		[backgroundJobs],
	);

	const navigateToJob = useCallback(
		(job: BackgroundJob) => {
			onClose();
			navigate(getBackgroundTaskNavigationTarget(job));
		},
		[navigate, onClose],
	);

	return (
		<div className={cn("flex min-h-0 flex-col", className)}>
			<div className="mb-3 flex shrink-0 items-center justify-between gap-2">
				<div className="text-sm font-semibold text-ink">Background Tasks</div>
				<button
					type="button"
					onClick={onClose}
					className="rounded-full px-2 py-1 text-xs text-ink-muted transition hover:bg-white/[0.06] hover:text-ink"
				>
					Close
				</button>
			</div>

			<div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1">
				{running.length ? (
					<section className="space-y-2">
						<div className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent-soft">
							Running
						</div>
						{running.map((job) => (
							<TaskRow
								key={job.id}
								job={job}
								storyLabel={getBackgroundTaskStoryLabel(job, storyTitleById)}
								onNavigate={() => navigateToJob(job)}
								onCancel={() => void cancelBackgroundJob(job.id)}
								showCancel
							/>
						))}
					</section>
				) : null}

				{queued.length ? (
					<section className="space-y-2">
						<div className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent-soft">
							Queued
						</div>
						{queued.map((job, index) => (
							<TaskRow
								key={job.id}
								job={job}
								storyLabel={getBackgroundTaskStoryLabel(job, storyTitleById)}
								onNavigate={() => navigateToJob(job)}
								onCancel={() => void cancelBackgroundJob(job.id)}
								onMoveUp={() => void reorderBackgroundTaskJob(job.id, "up")}
								onMoveDown={() => void reorderBackgroundTaskJob(job.id, "down")}
								showCancel
								showReorder
								canMoveUp={index > 0}
								canMoveDown={index < queued.length - 1}
							/>
						))}
					</section>
				) : null}

				{completed.length ? (
					<section className="space-y-2">
						<div className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent-soft">
							Completed
						</div>
						{completed.slice(0, 8).map((job) => (
							<TaskRow
								key={job.id}
								job={job}
								storyLabel={getBackgroundTaskStoryLabel(job, storyTitleById)}
								onNavigate={() => navigateToJob(job)}
							/>
						))}
					</section>
				) : null}

				{!running.length && !queued.length && !completed.length ? (
					<div className="rounded-[8px] border border-divider bg-white/[0.02] px-3 py-4 text-center text-sm text-ink-muted">
						No background tasks right now.
					</div>
				) : null}
			</div>
		</div>
	);
}

function BackgroundTasksPortal({
	open,
	onClose,
	anchorRef,
}: {
	open: boolean;
	onClose: () => void;
	anchorRef: RefObject<HTMLDivElement | null>;
}) {
	const desktopPanelRef = useRef<HTMLDivElement | null>(null);
	const mobilePanelRef = useRef<HTMLDivElement | null>(null);
	const [desktopStyle, setDesktopStyle] = useState<CSSProperties | null>(null);

	useLayoutEffect(() => {
		if (!open || !anchorRef.current) {
			setDesktopStyle(null);
			return;
		}

		const updatePosition = () => {
			if (!anchorRef.current) {
				return;
			}
			setDesktopStyle(computeDesktopPanelStyle(anchorRef.current.getBoundingClientRect()));
		};

		updatePosition();
		window.addEventListener("resize", updatePosition);
		window.addEventListener("scroll", updatePosition, true);
		return () => {
			window.removeEventListener("resize", updatePosition);
			window.removeEventListener("scroll", updatePosition, true);
		};
	}, [anchorRef, open]);

	useEffect(() => {
		if (!open) {
			return;
		}

		const mobileQuery = window.matchMedia("(max-width: 1023px)");
		if (!mobileQuery.matches) {
			return;
		}

		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = previousOverflow;
		};
	}, [open]);

	useEffect(() => {
		if (!open) {
			return;
		}

		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				onClose();
			}
		}

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [onClose, open]);

	useEffect(() => {
		if (!open) {
			return;
		}

		const desktopQuery = window.matchMedia("(min-width: 1024px)");
		if (!desktopQuery.matches) {
			return;
		}

		let removeListener: (() => void) | undefined;
		const timeoutId = window.setTimeout(() => {
			function handlePointerDown(event: PointerEvent) {
				const target = event.target as Node;
				if (
					anchorRef.current?.contains(target) ||
					desktopPanelRef.current?.contains(target) ||
					mobilePanelRef.current?.contains(target)
				) {
					return;
				}
				onClose();
			}

			document.addEventListener("pointerdown", handlePointerDown, true);
			removeListener = () => document.removeEventListener("pointerdown", handlePointerDown, true);
		}, 0);

		return () => {
			window.clearTimeout(timeoutId);
			removeListener?.();
		};
	}, [anchorRef, onClose, open]);

	if (!open || typeof document === "undefined") {
		return null;
	}

	return createPortal(
		<>
			<div className="fixed inset-0 z-[55] lg:hidden" role="presentation">
				<button
					type="button"
					aria-label="Close background tasks"
					className="absolute inset-0 bg-black/60 backdrop-blur-[1px]"
					onClick={onClose}
				/>
				<div
					ref={mobilePanelRef}
					role="dialog"
					aria-modal="true"
					aria-label="Background tasks"
					className="absolute inset-x-0 bottom-0 max-h-[min(85dvh,32rem)] overflow-hidden rounded-t-[14px] border border-divider bg-app-elevated p-4 shadow-hero pb-[max(1rem,env(safe-area-inset-bottom))]"
				>
					<div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-white/15" aria-hidden="true" />
					<BackgroundTasksPanelBody onClose={onClose} className="max-h-[calc(min(85dvh,32rem)-2.5rem)]" />
				</div>
			</div>

			{desktopStyle ? (
				<div
					ref={desktopPanelRef}
					role="dialog"
					aria-modal="false"
					aria-label="Background tasks"
					className="hidden rounded-[10px] border border-divider bg-app-elevated p-3 shadow-hero lg:block"
					style={desktopStyle}
				>
					<BackgroundTasksPanelBody onClose={onClose} className="max-h-[min(70vh,28rem)]" />
				</div>
			) : null}
		</>,
		document.body,
	);
}

export function BackgroundTasksButton({ className }: { className?: string }) {
	const [open, setOpen] = useState(false);
	const anchorRef = useRef<HTMLDivElement | null>(null);
	const { backgroundJobs } = useStoryEngine();
	const activeCount = countActiveBackgroundTasks(backgroundJobs);
	const close = useCallback(() => setOpen(false), []);

	return (
		<>
			<div
				ref={anchorRef}
				className={cn("relative", className)}
				onPointerDown={(event) => event.stopPropagation()}
			>
				<button
					type="button"
					aria-label={
						activeCount
							? `Background tasks (${activeCount} active)`
							: "Background tasks"
					}
					aria-expanded={open}
					aria-haspopup="dialog"
					onClick={(event) => {
						event.stopPropagation();
						setOpen((current) => !current);
					}}
					className="relative flex h-8 w-8 items-center justify-center rounded-full text-white/40 transition hover:bg-white/[0.06] hover:text-white/70"
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.8"
						strokeLinecap="round"
						strokeLinejoin="round"
						aria-hidden="true"
					>
						<path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
						<path d="M13.73 21a2 2 0 01-3.46 0" />
					</svg>
					{activeCount > 0 ? (
						<span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
							{activeCount}
						</span>
					) : null}
				</button>
			</div>
			<BackgroundTasksPortal open={open} onClose={close} anchorRef={anchorRef} />
		</>
	);
}
