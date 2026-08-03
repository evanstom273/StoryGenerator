import { useEffect, useState } from "react";
import { Button } from "../ui/Button";
import { useGeminiTtsPlayback } from "../../app/providers/GeminiTtsPlaybackProvider";
import type { SpeechSynthesisPlan } from "../../lib/storyText/messageSpeechText";
import { cn } from "../../utils/cn";

interface MessagePlayButtonProps {
	playId: string;
	plan: SpeechSynthesisPlan | null;
	className?: string;
	label?: string;
}

function PlayIcon({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 20 20"
			fill="currentColor"
			className={cn("h-4 w-4", className)}
			aria-hidden="true"
		>
			<path d="M6.5 4.5v11l9-5.5-9-5.5z" />
		</svg>
	);
}

function StopIcon({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 20 20"
			fill="currentColor"
			className={cn("h-4 w-4", className)}
			aria-hidden="true"
		>
			<path d="M5 5h10v10H5V5z" />
		</svg>
	);
}

function LoadingSpinner({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 24 24"
			className={cn("h-4 w-4 animate-spin text-accent", className)}
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
			<path
				className="opacity-90"
				fill="currentColor"
				d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
			/>
		</svg>
	);
}

function formatElapsedSeconds(startedAtMs: number) {
	const seconds = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
	if (seconds < 60) {
		return `${seconds}s`;
	}
	const minutes = Math.floor(seconds / 60);
	const remainder = seconds % 60;
	return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export function MessagePlayButton({ playId, plan, className, label = "Play" }: MessagePlayButtonProps) {
	const { getItemStatus, getLoadingDetail, playSpeechPlan, stop, hasGeminiKey } =
		useGeminiTtsPlayback();
	const status = getItemStatus(playId);
	const loadingDetail = getLoadingDetail(playId);
	const [elapsedLabel, setElapsedLabel] = useState("0s");

	const isPlaying = status === "playing";
	const isLoading = status === "loading";
	const missingKeyHint = !hasGeminiKey ? "Add a Gemini API key in Settings → AI" : undefined;
	const disabled = !plan || !hasGeminiKey;

	useEffect(() => {
		if (!loadingDetail) {
			setElapsedLabel("0s");
			return;
		}

		const tick = () => setElapsedLabel(formatElapsedSeconds(loadingDetail.startedAtMs));
		tick();
		const intervalId = window.setInterval(tick, 1000);
		return () => window.clearInterval(intervalId);
	}, [loadingDetail]);

	const loadingLine = loadingDetail
		? `${loadingDetail.message.replace(/…$/, "")} · ${elapsedLabel}`
		: "Synthesizing voice…";

	return (
		<div className={cn("flex flex-col items-end gap-1", className)}>
			<Button
				type="button"
				size="sm"
				variant="ghost"
				className={cn(
					isLoading && "animate-pulse border border-accent/30 bg-accent/10",
					isPlaying && "border border-accent/20 bg-accent/5",
				)}
				disabled={disabled}
				title={missingKeyHint}
				aria-busy={isLoading}
				aria-live="polite"
				aria-label={
					isPlaying
						? "Stop audio"
						: isLoading
							? `Cancel voice synthesis (${elapsedLabel})`
							: label
				}
				onClick={() => {
					if (isLoading || isPlaying) {
						stop();
						return;
					}
					if (!plan) {
						return;
					}
					void playSpeechPlan(playId, plan);
				}}
			>
				{isLoading ? (
					<LoadingSpinner />
				) : isPlaying ? (
					<StopIcon />
				) : (
					<PlayIcon />
				)}
				<span className="hidden sm:inline">
					{isPlaying ? "Stop" : isLoading ? "Cancel" : label}
				</span>
			</Button>
			{isLoading ? (
				<div
					className="max-w-[min(100vw-2rem,16rem)] text-right text-[10px] leading-snug text-accent-soft"
					role="status"
				>
					<span className="font-medium">{loadingLine}</span>
					<span className="mt-0.5 block text-ink-muted">
						Gemini is generating audio — long messages can take 30s+
					</span>
				</div>
			) : null}
			{isPlaying ? (
				<div className="flex items-center gap-1 text-[10px] text-accent-soft" role="status">
					<span className="inline-flex gap-0.5">
						<span className="h-2 w-0.5 animate-pulse rounded-full bg-accent/80" />
						<span className="h-2.5 w-0.5 animate-pulse rounded-full bg-accent/80 [animation-delay:150ms]" />
						<span className="h-2 w-0.5 animate-pulse rounded-full bg-accent/80 [animation-delay:300ms]" />
					</span>
					<span>Playing</span>
				</div>
			) : null}
		</div>
	);
}
