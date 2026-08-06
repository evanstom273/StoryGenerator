import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";
import {
	countActiveBackgroundTasks,
	getBackgroundTaskElapsedLabel,
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
				className="h-full rounded-full bg-accent/80 transition-all duration-500"
				style={{ width: `${percent}%` }}
			/>
		</div>
	);
}

function TaskRow({
	job,
	storyLabel,
	elapsedLabel,
	onNavigate,
	onCancel,
	showCancel,
}: {
	job: BackgroundJob;
	storyLabel: string;
	elapsedLabel: string;
	onNavigate: () => void;
	onCancel?: () => void;
	showCancel?: boolean;
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
			<button
				type="button"
				onClick={onNavigate}
				className="w-full text-left"
			>
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0 flex-1">
						<div className="text-sm font-medium text-ink">{typeLabel}</div>
						<div className="mt-0.5 truncate text-xs text-ink-muted">{storyLabel}</div>
						<div className="mt-1 text-xs text-ink-muted">
							{progressLabel}
							{job.status === "running" ? ` · ${elapsedLabel}` : null}
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
			{showCancel && onCancel ? (
				<div className="mt-2 flex justify-end">
					<Button variant="ghost" size="sm" onClick={onCancel}>
						Cancel
					</Button>
				</div>
			) : null}
		</div>
	);
}

export function BackgroundTasksPanel({
	open,
	onClose,
	className,
}: {
	open: boolean;
	onClose: () => void;
	className?: string;
}) {
	const navigate = useNavigate();
	const panelRef = useRef<HTMLDivElement | null>(null);
	const { backgroundJobs, stories, cancelBackgroundJob } = useStoryEngine();
	const [, setTick] = useState(0);

	useEffect(() => {
		if (!open) {
			return;
		}

		const intervalId = window.setInterval(() => setTick((value) => value + 1), 1000);
		return () => window.clearInterval(intervalId);
	}, [open]);

	useEffect(() => {
		if (!open) {
			return;
		}

		function handlePointerDown(event: MouseEvent) {
			if (!panelRef.current?.contains(event.target as Node)) {
				onClose();
			}
		}

		document.addEventListener("mousedown", handlePointerDown);
		return () => document.removeEventListener("mousedown", handlePointerDown);
	}, [onClose, open]);

	const storyTitleById = useMemo(
		() => (storyId: string) => stories.find((story) => story.id === storyId)?.title,
		[stories],
	);

	const { running, queued, completed } = useMemo(
		() => partitionBackgroundTasks(backgroundJobs),
		[backgroundJobs],
	);

	if (!open) {
		return null;
	}

	function navigateToJob(job: BackgroundJob) {
		onClose();
		navigate(getBackgroundTaskNavigationTarget(job));
	}

	return (
		<div
			ref={panelRef}
			className={cn(
				"absolute right-0 top-full z-50 mt-2 w-[min(92vw,24rem)] rounded-[10px] border border-divider bg-app-elevated p-3 shadow-hero",
				className,
			)}
		>
			<div className="mb-3 flex items-center justify-between gap-2">
				<div className="text-sm font-semibold text-ink">Background Tasks</div>
				<button
					type="button"
					onClick={onClose}
					className="rounded-full px-2 py-1 text-xs text-ink-muted transition hover:bg-white/[0.06] hover:text-ink"
				>
					Close
				</button>
			</div>

			<div className="max-h-[min(70vh,28rem)] space-y-4 overflow-y-auto pr-1">
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
								elapsedLabel={getBackgroundTaskElapsedLabel(job)}
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
						{queued.map((job) => (
							<TaskRow
								key={job.id}
								job={job}
								storyLabel={getBackgroundTaskStoryLabel(job, storyTitleById)}
								elapsedLabel={getBackgroundTaskElapsedLabel(job)}
								onNavigate={() => navigateToJob(job)}
								onCancel={() => void cancelBackgroundJob(job.id)}
								showCancel
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
								elapsedLabel={getBackgroundTaskElapsedLabel(job)}
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

export function BackgroundTasksButton({ className }: { className?: string }) {
	const [open, setOpen] = useState(false);
	const { backgroundJobs } = useStoryEngine();
	const activeCount = countActiveBackgroundTasks(backgroundJobs);

	return (
		<div className={cn("relative", className)}>
			<button
				type="button"
				aria-label={
					activeCount
						? `Background tasks (${activeCount} active)`
						: "Background tasks"
				}
				onClick={() => setOpen((current) => !current)}
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
					<path d="M12 2v2" />
					<path d="M12 20v2" />
					<path d="M4.93 4.93l1.41 1.41" />
					<path d="M17.66 17.66l1.41 1.41" />
					<path d="M2 12h2" />
					<path d="M20 12h2" />
					<path d="M4.93 19.07l1.41-1.41" />
					<path d="M17.66 6.34l1.41-1.41" />
					<circle cx="12" cy="12" r="4" />
				</svg>
				{activeCount > 0 ? (
					<span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
						{activeCount}
					</span>
				) : null}
			</button>
			<BackgroundTasksPanel open={open} onClose={() => setOpen(false)} />
		</div>
	);
}
