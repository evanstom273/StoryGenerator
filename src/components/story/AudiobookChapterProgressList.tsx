import { useEffect, useState } from "react";
import {
	formatElapsedSeconds,
	type AudiobookChapterProgressItem,
	type StoryAudiobookProgress,
} from "../../lib/ai/storyAudiobookProgress";
import { cn } from "../../utils/cn";

function ChapterStatusIcon({ chapter }: { chapter: AudiobookChapterProgressItem }) {
	if (chapter.status === "done" || chapter.status === "cached") {
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

	if (chapter.status === "synthesizing") {
		return (
			<svg
				viewBox="0 0 24 24"
				className="h-4 w-4 animate-spin text-accent"
				aria-hidden="true"
			>
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

function ChapterProgressRow({
	chapter,
	compact,
}: {
	chapter: AudiobookChapterProgressItem;
	compact?: boolean;
}) {
	const [elapsedLabel, setElapsedLabel] = useState("0s");

	useEffect(() => {
		if (chapter.status !== "synthesizing" || !chapter.startedAtMs) {
			return;
		}

		const tick = () => {
			setElapsedLabel(formatElapsedSeconds(chapter.startedAtMs!));
		};
		tick();
		const intervalId = window.setInterval(tick, 1000);
		return () => window.clearInterval(intervalId);
	}, [chapter.status, chapter.startedAtMs]);

	const isComplete = chapter.status === "done" || chapter.status === "cached";
	const durationLabel =
		isComplete && chapter.startedAtMs
			? formatElapsedSeconds(
					chapter.startedAtMs,
					chapter.completedAtMs ?? chapter.startedAtMs,
				)
			: null;

	return (
		<li
			className={cn(
				"flex items-center gap-2 rounded-lg px-2 py-1",
				chapter.status === "synthesizing" && "bg-accent/10",
				isComplete && "text-ink-muted",
				compact && "py-0.5",
			)}
		>
			<ChapterStatusIcon chapter={chapter} />
			<div className="min-w-0 flex-1">
				<p className={cn("truncate font-medium text-ink", compact && "text-xs")}>
					{chapter.displayLabel}
				</p>
				{chapter.status === "synthesizing" && chapter.detail ? (
					<p className="truncate text-[10px] text-ink-muted">{chapter.detail}</p>
				) : chapter.status === "cached" ? (
					<p className="text-[10px] text-ink-muted">From cache</p>
				) : null}
			</div>
			<span className="shrink-0 text-[10px] tabular-nums text-ink-muted">
				{chapter.status === "synthesizing" ? elapsedLabel : durationLabel}
			</span>
		</li>
	);
}

export function AudiobookChapterProgressList({
	progress,
	compact,
	className,
}: {
	progress: StoryAudiobookProgress;
	compact?: boolean;
	className?: string;
}) {
	return (
		<ul className={cn("flex flex-col gap-0.5", className)} aria-live="polite">
			{progress.chapters.map((chapter) => (
				<ChapterProgressRow key={chapter.segmentId} chapter={chapter} compact={compact} />
			))}
		</ul>
	);
}
