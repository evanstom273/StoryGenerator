import { useEffect, useState } from "react";
import {
	formatGuidedChapterProgressSummary,
	formatGuidedElapsedLabel,
	getGuidedChapterProgressPercent,
	type GuidedChapterUiStatus,
} from "../../lib/guidedChapterGeneration/guidedGenerationProgress";
import { Button } from "../ui/Button";
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

function ChapterStatusIcon({
	status,
}: {
	status: GuidedChapterUiStatus["chapters"][number]["status"];
}) {
	if (status === "done") {
		return (
			<span className="flex h-5 w-5 items-center justify-center text-accent" aria-hidden="true">
				<svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
					<path
						fillRule="evenodd"
						d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
						clipRule="evenodd"
					/>
				</svg>
			</span>
		);
	}

	if (status === "active") {
		return (
			<svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin text-accent" aria-hidden="true">
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

	return <span className="h-4 w-4 rounded-full border border-white/20" aria-hidden="true" />;
}

export function GuidedChapterProgressPanel({
	status,
	onCancel,
	className,
	compact,
}: {
	status: GuidedChapterUiStatus;
	onCancel?: () => void;
	className?: string;
	compact?: boolean;
}) {
	const [elapsedLabel, setElapsedLabel] = useState("0s");
	const [chaptersExpanded, setChaptersExpanded] = useState(false);
	const isActive = status.phase === "generating" || status.phase === "indexing";
	const isError = status.phase === "error";
	const isDone = status.phase === "done";

	useEffect(() => {
		if (!status.startedAtMs) {
			setElapsedLabel("0s");
			return;
		}

		const tick = () => setElapsedLabel(formatGuidedElapsedLabel(status.startedAtMs));
		tick();
		const intervalId = window.setInterval(tick, 1000);
		return () => window.clearInterval(intervalId);
	}, [status.startedAtMs]);

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
				<div className="font-medium text-rose-300">Guided chapter generation failed</div>
				<div className="mt-1 text-xs text-rose-300/80">{status.error ?? "An unknown error occurred."}</div>
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
				<div className="text-emerald-300">✓ {status.message ?? "Guided chapter generation complete."}</div>
			</div>
		);
	}

	if (!isActive) {
		return null;
	}

	const percent = getGuidedChapterProgressPercent(status);
	const summary = formatGuidedChapterProgressSummary(status);

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
						<span className="font-medium text-ink">Generating chapters</span>
					</div>
					<p className="text-xs text-ink-muted">
						{summary} · {elapsedLabel}
					</p>
					<div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
						<div
							className="h-full rounded-full bg-accent/80 transition-all duration-500"
							style={{ width: `${percent}%` }}
						/>
					</div>
					<p className="text-[10px] text-ink-muted">
						Chapter {status.currentChapter} of {status.totalChapters}
						{status.phase === "indexing" ? " · Indexing after chapter" : " · Director beats + narration"}
					</p>
				</div>
				<div className="flex shrink-0 flex-col items-end gap-2">
					{status.chapters.length > 0 ? (
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
			{chaptersExpanded ? (
				<ul
					className={cn(
						"mt-3 max-h-32 space-y-1 overflow-y-auto rounded-lg border border-divider/30 bg-panel-muted/30 py-1",
						compact ? "text-xs" : "text-sm",
					)}
				>
					{status.chapters.map((chapter) => (
						<li
							key={chapter.label}
							className="flex items-center gap-2 px-3 py-1.5 text-ink-soft"
						>
							<ChapterStatusIcon status={chapter.status} />
							<span className="truncate">{chapter.label}</span>
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}
