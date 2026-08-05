import type { StoryChapter, StoryMessage } from "../../types/models";
import { useStoryEngine } from "../../app/providers/StoryEngineProvider";
import { useStorySpeechSetup } from "../../hooks/useStorySpeechSetup";
import { listStoryAudiobookChapterSegments } from "../../lib/ai/storyAudiobook";
import { clampAudiobookParallelChapters } from "../../lib/ai/storyAudiobookParallel";
import { buildChapterSpeechPlan } from "../../lib/storyText/messageSpeechText";
import { getMessagesForChapterStartingAt } from "../../lib/storyText/chapterNavigation";
import { cn } from "../../utils/cn";
import { MessagePlayButton } from "./MessagePlayButton";
import { useGeminiTtsPlayback } from "../../app/providers/GeminiTtsPlaybackProvider";
import { Button } from "../ui/Button";
import { ChapterPlanButton } from "./GuidedChapterSetupModal";

interface ChapterListenBannerProps {
	messageId: string;
	label: string;
	highlighted: boolean;
	messages: StoryMessage[];
	playerCharacterName: string;
	className?: string;
}

export function ChapterListenBanner({
	messageId,
	label,
	highlighted,
	messages,
	playerCharacterName,
	className,
}: ChapterListenBannerProps) {
	const { narrationTts, characterRegistry, audiobookPerformanceMode } = useStorySpeechSetup(
		messages,
		playerCharacterName,
	);

	const chapterMessages = getMessagesForChapterStartingAt(messages, messageId);
	const plan = buildChapterSpeechPlan(chapterMessages, {
		playerName: playerCharacterName,
		narrationTts,
		characterRegistry,
		allStoryMessages: messages,
		chapterTitle: label,
		audiobookPerformanceMode,
	});
	const chapterMessage = messages.find((message) => message.id === messageId);
	const guidedChapterSetup = chapterMessage?.guidedChapterSetup;

	return (
		<div
			id={`story-chapter-start-${messageId}`}
			className={cn(
				"max-lg:scroll-mt-[6.5rem] lg:scroll-mt-10 rounded-2xl border border-accent/20 bg-accent/8 px-3 py-3 text-center text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft",
				highlighted ? "ring-2 ring-accent/35" : "",
				className,
			)}
		>
			<div className="flex flex-wrap items-center justify-center gap-3">
				<span>{label}</span>
				<ChapterPlanButton setup={guidedChapterSetup} />
				{plan ? (
					<MessagePlayButton
						playId={`chapter-${messageId}`}
						plan={plan}
						label="Listen"
						playerTitle={label}
						className="normal-case tracking-normal"
					/>
				) : null}
			</div>
		</div>
	);
}

interface FullStoryAudiobookControlsProps {
	messages: StoryMessage[];
	playerCharacterName: string;
	storyTitle: string;
	chapters?: StoryChapter[];
	className?: string;
}

export function FullStoryAudiobookControls({
	messages,
	playerCharacterName,
	storyTitle,
	chapters,
	className,
}: FullStoryAudiobookControlsProps) {
	const {
		narrationTts,
		storyId,
		characterRegistry,
		hasGeminiKey,
		audiobookParallelChapters,
		audiobookPerformanceMode,
	} = useStorySpeechSetup(messages, playerCharacterName);
	const { getStoryAIConfig } = useStoryEngine();
	const { prepareStoryAudiobook, getItemStatus, playPreparedSpeech, stop, cancelStoryAudiobookPreparation } =
		useGeminiTtsPlayback();

	const segments = listStoryAudiobookChapterSegments(messages, {
		playerName: playerCharacterName,
		narrationTts,
		characterRegistry,
		chapters,
		audiobookPerformanceMode,
	});

	const playId = storyId ? `story-audiobook-${storyId}` : "story-audiobook";
	const status = getItemStatus(playId);
	const isLoading = status === "loading";
	const isReady = status === "ready";
	const isPlaying = status === "playing";
	const disabled = !hasGeminiKey || segments.length === 0;

	return (
		<div
			className={cn(
				"flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/20 bg-accent/8 px-3 py-3",
				className,
			)}
		>
			<div className="min-w-0">
					<p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
						Story Audiobook
					</p>
					<p className="text-sm text-ink-muted">
						{segments.length > 1
							? `${segments.length} chapters — uses cached audio where available`
							: "Full story playback"}
					</p>
				</div>
				<Button
				type="button"
				size="sm"
				variant="ghost"
				className="border border-accent/20"
				disabled={disabled}
				aria-busy={isLoading}
				onClick={() => {
					if (isLoading) {
						cancelStoryAudiobookPreparation(playId);
						return;
					}
					if (isPlaying) {
						stop();
						return;
					}
					if (isReady) {
						void playPreparedSpeech(playId);
						return;
					}
					void (async () => {
						let parallel = audiobookParallelChapters;
						if (storyId) {
							const config = await getStoryAIConfig(storyId);
							parallel = clampAudiobookParallelChapters(
								config?.audiobookParallelChapters ?? parallel,
							);
						}
						void prepareStoryAudiobook(playId, segments, storyTitle, {
							parallelChapters: parallel,
						});
					})();
				}}
			>
				{isLoading
					? "Cancel"
					: isPlaying
						? "Stop"
						: isReady
							? "Play story"
							: "Listen to full story"}
			</Button>
		</div>
	);
}
