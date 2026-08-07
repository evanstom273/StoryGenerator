import { useState } from "react";
import { useGeminiTtsPlayback } from "../../app/providers/GeminiTtsPlaybackProvider";
import { useMediaLibrary } from "../../app/providers/MediaLibraryProvider";
import { buildMediaAssetPlayId } from "../../lib/mediaLibrary/libraryKeys";
import { Button } from "../ui/Button";
import { cn } from "../../utils/cn";

interface MediaLibraryDeleteButtonProps {
	assetId: string;
	title: string;
	className?: string;
}

export function MediaLibraryDeleteButton({
	assetId,
	title,
	className,
}: MediaLibraryDeleteButtonProps) {
	const { deleteAsset } = useMediaLibrary();
	const { activeId, stop } = useGeminiTtsPlayback();
	const [isDeleting, setIsDeleting] = useState(false);

	return (
		<Button
			type="button"
			size="sm"
			variant="ghost"
			className={cn("text-white/35 hover:text-red-200", className)}
			disabled={isDeleting}
			onClick={() => {
				const confirmed = window.confirm(`Delete "${title}" from your Media Library?`);
				if (!confirmed) {
					return;
				}

				setIsDeleting(true);
				void (async () => {
					try {
						if (activeId === buildMediaAssetPlayId(assetId)) {
							stop();
						}
						await deleteAsset(assetId);
					} catch (error) {
						window.alert(
							error instanceof Error ? error.message : "Unable to delete this library item.",
						);
					} finally {
						setIsDeleting(false);
					}
				})();
			}}
		>
			{isDeleting ? "Deleting…" : "Delete"}
		</Button>
	);
}
