import { useStoryEngine } from "../../app/providers/StoryEngineProvider";
import { GuidedChapterProgressPanel } from "./GuidedChapterProgressPanel";
import { cn } from "../../utils/cn";

export function GuidedChapterProgressBar({
	storyId,
	className,
}: {
	storyId?: string;
	className?: string;
}) {
	const { guidedGenerationStatus, cancelGuidedChapterGeneration } = useStoryEngine();

	if (!storyId || !guidedGenerationStatus || guidedGenerationStatus.storyId !== storyId) {
		return null;
	}

	if (
		guidedGenerationStatus.phase === "done" ||
		guidedGenerationStatus.phase === "error"
	) {
		return null;
	}

	return (
		<div
			className={cn(
				"border-t border-divider/40 bg-app-elevated/95 px-3 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.18)] backdrop-blur-md sm:px-4",
				className,
			)}
			role="region"
			aria-label="Guided chapter generation progress"
		>
			<div className="mx-auto max-w-3xl">
				<GuidedChapterProgressPanel
					status={guidedGenerationStatus}
					onCancel={() => void cancelGuidedChapterGeneration(storyId)}
					compact
				/>
			</div>
		</div>
	);
}
