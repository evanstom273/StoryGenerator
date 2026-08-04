import { useStoryEngine } from "../../app/providers/StoryEngineProvider";
import { IndexingProgressPanel } from "./IndexingProgressPanel";
import { cn } from "../../utils/cn";

export function StoryIndexingProgressBar({
	storyId,
	className,
}: {
	storyId?: string;
	className?: string;
}) {
	const { rebuildStatus, cancelStoryIndexing } = useStoryEngine();

	if (!storyId || !rebuildStatus || rebuildStatus.storyId !== storyId) {
		return null;
	}

	if (
		rebuildStatus.phase === "idle" ||
		rebuildStatus.phase === "done" ||
		rebuildStatus.phase === "error"
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
			aria-label="Story indexing progress"
		>
			<div className="mx-auto max-w-3xl">
				<IndexingProgressPanel
					status={rebuildStatus}
					onCancel={() => void cancelStoryIndexing(storyId)}
					compact
				/>
			</div>
		</div>
	);
}
