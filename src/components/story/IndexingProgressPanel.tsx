import { useEffect, useState } from "react";
import {
	formatElapsedSeconds,
	getIndexingProgressPercent,
	resolveIndexingDisplayProgress,
	type StoryIndexingUiStatus,
} from "../../lib/ai/storyIndexingProgress";
import { Button } from "../ui/Button";
import { IndexingChapterProgressList } from "./IndexingChapterProgressList";
import { cn } from "../../utils/cn";

function LoadingSpinner({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" className={cn("h-4 w-4 animate-spin text-accent", className)} aria-hidden="true">
			<circle
				className="opacity-25"
				cx="12"
				cy="12"
				r="10"
				stroke="currentColor"
				strokeWidth="3"
				fill="none"
			/>
			<path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
		</svg>
	);
}

export function IndexingProgressPanel({
	status,
	onCancel,
	className,
	compact,
	showChapterList = true,
}: {
	status: StoryIndexingUiStatus;
	onCancel?: () => void;
	className?: string;
	compact?: boolean;
	showChapterList?: boolean;
}) {
	const [elapsedLabel, setElapsedLabel] = useState("0s");
	const [chaptersExpanded, setChaptersExpanded] = useState(false);
	const progress = resolveIndexingDisplayProgress(status);
	const isActive =
		status.phase === "loading" || status.phase === "extracting" || status.phase === "saving";
	const isError = status.phase === "error";
	const isDone = status.phase === "done";

	useEffect(() => {
		if (!progress) {
			setElapsedLabel("0s");
			return;
		}

		const tick = () => setElapsedLabel(formatElapsedSeconds(progress.startedAtMs));
		tick();
		const intervalId = window.setInterval(tick, 1000);
		return () => window.clearInterval(intervalId);
	}, [progress]);

	useEffect(() => {
		if (!isActive) {
			setChaptersExpanded(false);
		}
	}, [isActive]);

	if (isError) {
		return (
			<div
				className={cn(
					"rounded-[8px] border border-rose-400/20 bg-rose-400/10 px-3.5 py-3 text-sm",
					className,
				)}
			>
				<div className="font-medium text-rose-300">Indexing failed</div>
				<div className="mt-1 text-xs text-rose-300/80">
					{status.error || "An unknown error occurred."}
				</div>
			</div>
		);
	}

	if (isDone) {
		return (
			<div
				className={cn(
					"rounded-[8px] border border-emerald-400/20 bg-emerald-400/10 px-3.5 py-3 text-sm",
					className,
				)}
			>
				<div className="text-emerald-300">✓ {status.message || "Indexing complete."}</div>
				{status.warning ? (
					<div className="mt-1 text-xs text-amber-300/80">⚠ {status.warning}</div>
				) : null}
			</div>
		);
	}

	if (!isActive || !progress) {
		return null;
	}

	const percent = getIndexingProgressPercent(progress);
	const showChapterProgress =
		showChapterList &&
		progress.stage === "chapter-reviews" &&
		progress.chapterReviews &&
		progress.chapterReviews.length > 0;

	return (
		<div
			className={cn(
				"rounded-[8px] border border-accent/20 bg-accent/5 px-3.5 py-3 text-sm",
				className,
			)}
			role="status"
			aria-live="polite"
			aria-busy="true"
		>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0 flex-1 space-y-2">
					<div className="flex items-center gap-2">
						<LoadingSpinner />
						<span className="font-medium text-ink">Indexing story</span>
					</div>
					<p className="text-xs text-ink-muted">
						{progress.summary} · {elapsedLabel}
					</p>
					<div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
						<div
							className="h-full rounded-full bg-accent/80 transition-all duration-500"
							style={{ width: `${percent}%` }}
						/>
					</div>
					<p className="text-[10px] text-ink-muted">
						{progress.total > 0
							? `${progress.processed} / ${progress.total}`
							: "Preparing…"}
						{progress.stage === "messages"
							? " · Per-message extraction can take several minutes on long stories"
							: progress.stage === "chapter-reviews"
								? " · Rebuilding archive chapter reviews"
								: null}
					</p>
					{status.warning ? (
						<p className="text-xs text-amber-300/80">⚠ {status.warning}</p>
					) : null}
				</div>
				<div className="flex shrink-0 flex-col items-end gap-2">
					{showChapterProgress ? (
						<Button
							type="button"
							size="sm"
							variant="ghost"
							className="text-xs"
							aria-expanded={chaptersExpanded}
							onClick={() => setChaptersExpanded((current) => !current)}
						>
							{chaptersExpanded ? "Hide chapters" : "Show chapters"}
						</Button>
					) : null}
					{onCancel ? (
						<Button type="button" size="sm" variant="ghost" onClick={onCancel}>
							Cancel
						</Button>
					) : null}
				</div>
			</div>
			{showChapterProgress && chaptersExpanded ? (
				<IndexingChapterProgressList
					chapters={progress.chapterReviews!}
					compact={compact}
					className="mt-3 max-h-32 overflow-y-auto rounded-lg border border-divider/30 bg-panel-muted/30 py-1"
				/>
			) : null}
		</div>
	);
}
