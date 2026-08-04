import { useEffect, useState } from "react";
import { useGeminiTtsPlayback } from "../../app/providers/GeminiTtsPlaybackProvider";
import { AudiobookChapterProgressList } from "./AudiobookChapterProgressList";
import { Button } from "../ui/Button";
import { cn } from "../../utils/cn";

function formatClock(seconds: number) {
	if (!Number.isFinite(seconds) || seconds < 0) {
		return "0:00";
	}

	const total = Math.floor(seconds);
	const minutes = Math.floor(total / 60);
	const remainder = total % 60;
	return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export function StoryAudioPlayerBar({ className }: { className?: string }) {
	const {
		activeId,
		status,
		playerTitle,
		currentTimeSec,
		durationSec,
		isPaused,
		togglePlaybackPause,
		skipBackward,
		skipForward,
		seekTo,
		stop,
		getLoadingDetail,
		backgroundAudiobookJob,
	} = useGeminiTtsPlayback();
	const loadingDetail = activeId ? getLoadingDetail(activeId) : null;
	const backgroundLoadingDetail = backgroundAudiobookJob
		? getLoadingDetail(backgroundAudiobookJob.playId)
		: null;
	const [elapsedLabel, setElapsedLabel] = useState("0s");
	const [chaptersExpanded, setChaptersExpanded] = useState(false);

	const isAudiobookPreparing = Boolean(backgroundAudiobookJob && backgroundLoadingDetail);
	const audiobookProgress =
		backgroundLoadingDetail?.audiobookProgress ?? loadingDetail?.audiobookProgress;
	const audiobookSummary =
		backgroundLoadingDetail?.message ?? loadingDetail?.message ?? "Preparing audiobook…";

	const visible =
		status === "loading" ||
		status === "ready" ||
		status === "playing" ||
		status === "error" ||
		isAudiobookPreparing;

	useEffect(() => {
		const detail = backgroundLoadingDetail ?? loadingDetail;
		if (!detail) {
			setElapsedLabel("0s");
			return;
		}

		const tick = () => {
			const seconds = Math.max(0, Math.floor((Date.now() - detail.startedAtMs) / 1000));
			setElapsedLabel(`${seconds}s`);
		};
		tick();
		const intervalId = window.setInterval(tick, 1000);
		return () => window.clearInterval(intervalId);
	}, [backgroundLoadingDetail, loadingDetail]);

	useEffect(() => {
		if (!isAudiobookPreparing) {
			setChaptersExpanded(false);
		}
	}, [isAudiobookPreparing]);

	if (!visible || (!activeId && !isAudiobookPreparing)) {
		return null;
	}

	const progress =
		durationSec > 0 ? Math.min(100, (currentTimeSec / durationSec) * 100) : 0;
	const isLoading = status === "loading";
	const isPlaying = status === "playing" && !isPaused;
	const isPrimaryAudiobookLoading =
		isLoading && activeId && activeId === backgroundAudiobookJob?.playId;
	const showPlaybackRow = Boolean(activeId && !isPrimaryAudiobookLoading);
	const showPlaybackControls = showPlaybackRow && !isLoading && status !== "error";
	const showChapterProgress = isAudiobookPreparing && audiobookProgress;

	return (
		<div
			className={cn(
				"border-t border-divider/40 bg-app-elevated/95 px-3 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.18)] backdrop-blur-md sm:px-4",
				className,
			)}
			role="region"
			aria-label="Story audio player"
		>
			<div className="mx-auto flex max-w-3xl flex-col gap-2">
				{isAudiobookPreparing ? (
					<div className="flex items-start justify-between gap-2">
						<div className="min-w-0 flex-1">
							<p className="truncate text-sm font-medium text-ink">
								{backgroundAudiobookJob?.playerTitle ?? "Story audiobook"}
							</p>
							<p className="text-xs text-ink-muted">
								{audiobookSummary} · {elapsedLabel}
							</p>
						</div>
						{showChapterProgress ? (
							<Button
								type="button"
								size="sm"
								variant="ghost"
								className="shrink-0 text-xs"
								aria-expanded={chaptersExpanded}
								onClick={() => setChaptersExpanded((current) => !current)}
							>
								{chaptersExpanded ? "Hide chapters" : "Show chapters"}
							</Button>
						) : null}
					</div>
				) : null}

				{showChapterProgress && chaptersExpanded ? (
					<AudiobookChapterProgressList
						progress={audiobookProgress!}
						compact
						className="max-h-32 overflow-y-auto rounded-lg border border-divider/30 bg-panel-muted/30 py-1"
					/>
				) : null}

				{showPlaybackRow ? (
					<div className="flex items-center justify-between gap-3">
						<div className="min-w-0 flex-1">
							<p className="truncate text-sm font-medium text-ink">
								{playerTitle ?? "Story audio"}
							</p>
							{isLoading ? (
								<p className="text-xs text-ink-muted">
									{loadingDetail?.message ?? "Preparing audio…"} · {elapsedLabel}
								</p>
							) : (
								<p className="text-xs text-ink-muted">
									{formatClock(currentTimeSec)} / {formatClock(durationSec)}
								</p>
							)}
						</div>
						<div className="flex items-center gap-1">
							<Button
								type="button"
								size="sm"
								variant="ghost"
								disabled={!showPlaybackControls}
								aria-label="Skip back 5 seconds"
								onClick={() => skipBackward(5)}
							>
								-5s
							</Button>
							<Button
								type="button"
								size="sm"
								variant="ghost"
								disabled={!showPlaybackControls}
								aria-label={isPlaying ? "Pause" : "Play"}
								onClick={() => void togglePlaybackPause()}
							>
								{isPlaying ? "Pause" : "Play"}
							</Button>
							<Button
								type="button"
								size="sm"
								variant="ghost"
								disabled={!showPlaybackControls}
								aria-label="Skip forward 5 seconds"
								onClick={() => skipForward(5)}
							>
								+5s
							</Button>
							<Button
								type="button"
								size="sm"
								variant="ghost"
								aria-label="Close player"
								onClick={() => stop()}
							>
								Close
							</Button>
						</div>
					</div>
				) : null}

				{showPlaybackRow ? (
					<>
						<input
							type="range"
							min={0}
							max={durationSec > 0 ? durationSec : 1}
							step={0.1}
							value={Math.min(currentTimeSec, durationSec || 0)}
							disabled={!showPlaybackControls || durationSec <= 0}
							className="h-1.5 w-full cursor-pointer accent-accent"
							aria-label="Playback position"
							onChange={(event) => {
								const next = Number.parseFloat(event.target.value);
								if (Number.isFinite(next)) {
									seekTo(next);
								}
							}}
						/>
						<div className="h-1 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
							<div
								className="h-full rounded-full bg-accent transition-[width] duration-150"
								style={{ width: `${progress}%` }}
							/>
						</div>
					</>
				) : null}
			</div>
		</div>
	);
}
