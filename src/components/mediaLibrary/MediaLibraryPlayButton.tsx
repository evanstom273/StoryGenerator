import { useGeminiTtsPlayback } from "../../app/providers/GeminiTtsPlaybackProvider";
import type { MediaAssetView } from "../../app/providers/MediaLibraryProvider";
import { buildMediaAssetPlayId } from "../../lib/mediaLibrary/libraryKeys";
import { Button } from "../ui/Button";
import { cn } from "../../utils/cn";

interface MediaLibraryPlayButtonProps {
	asset: MediaAssetView;
	size?: "sm" | "md";
	className?: string;
}

export function MediaLibraryPlayButton({
	asset,
	size = "sm",
	className,
}: MediaLibraryPlayButtonProps) {
	const { playMediaAsset, getItemStatus, togglePlaybackPause, activeId } = useGeminiTtsPlayback();
	const playId = buildMediaAssetPlayId(asset.id);
	const status = getItemStatus(playId);
	const isActive = activeId === playId;
	const isPlaying = isActive && status === "playing";

	return (
		<Button
			type="button"
			size={size}
			variant="ghost"
			className={cn("border border-accent/20", className)}
			onClick={() => {
				if (isPlaying) {
					void togglePlaybackPause();
					return;
				}

				if (isActive && (status === "ready" || status === "playing")) {
					void togglePlaybackPause();
					return;
				}

				void playMediaAsset(asset);
			}}
		>
			{isPlaying ? "Pause" : isActive && status === "ready" ? "Play" : "Listen"}
		</Button>
	);
}
