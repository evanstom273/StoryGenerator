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

export function MessagePlayButton({ playId, plan, className, label = "Play" }: MessagePlayButtonProps) {
	const { getItemStatus, playSpeechPlan, hasGeminiKey } = useGeminiTtsPlayback();
	const status = getItemStatus(playId);
	const disabled = !plan || !hasGeminiKey || status === "loading";
	const isPlaying = status === "playing";
	const isLoading = status === "loading";
	const missingKeyHint = !hasGeminiKey ? "Add a Gemini API key in Settings → AI" : undefined;

	return (
		<Button
			type="button"
			size="sm"
			variant="ghost"
			className={className}
			disabled={disabled}
			title={missingKeyHint}
			aria-label={isPlaying ? "Stop audio" : isLoading ? "Loading audio" : label}
			onClick={() => {
				if (!plan) {
					return;
				}
				void playSpeechPlan(playId, plan);
			}}
		>
			{isLoading ? (
				<span className="text-[11px] uppercase tracking-[0.14em]">…</span>
			) : isPlaying ? (
				<StopIcon />
			) : (
				<PlayIcon />
			)}
			<span className="hidden sm:inline">{isPlaying ? "Stop" : isLoading ? "Loading" : label}</span>
		</Button>
	);
}
