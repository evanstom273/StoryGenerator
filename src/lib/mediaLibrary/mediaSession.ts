export function bindMediaSessionHandlers(handlers: {
	onPlay: () => void;
	onPause: () => void;
	onSeekBackward?: () => void;
	onSeekForward?: () => void;
}) {
	if (!("mediaSession" in navigator)) {
		return () => {};
	}

	const { mediaSession } = navigator;

	mediaSession.setActionHandler("play", () => handlers.onPlay());
	mediaSession.setActionHandler("pause", () => handlers.onPause());
	mediaSession.setActionHandler("seekbackward", handlers.onSeekBackward ?? null);
	mediaSession.setActionHandler("seekforward", handlers.onSeekForward ?? null);

	return () => {
		mediaSession.setActionHandler("play", null);
		mediaSession.setActionHandler("pause", null);
		mediaSession.setActionHandler("seekbackward", null);
		mediaSession.setActionHandler("seekforward", null);
		mediaSession.metadata = null;
	};
}

export function updateMediaSessionMetadata(metadata: {
	title: string;
	artist?: string;
	album?: string;
}) {
	if (!("mediaSession" in navigator)) {
		return;
	}

	navigator.mediaSession.metadata = new MediaMetadata({
		title: metadata.title,
		artist: metadata.artist ?? "Story Engine",
		album: metadata.album ?? "Media Library",
	});
}

export function updateMediaSessionPlaybackState(state: "none" | "paused" | "playing") {
	if (!("mediaSession" in navigator)) {
		return;
	}

	navigator.mediaSession.playbackState = state;
}

export function updateMediaSessionPositionState(args: {
	durationSec: number;
	positionSec: number;
	playbackRate?: number;
}) {
	if (!("mediaSession" in navigator) || !navigator.mediaSession.setPositionState) {
		return;
	}

	if (!Number.isFinite(args.durationSec) || args.durationSec <= 0) {
		return;
	}

	try {
		navigator.mediaSession.setPositionState({
			duration: args.durationSec,
			position: Math.max(0, Math.min(args.durationSec, args.positionSec)),
			playbackRate: args.playbackRate ?? 1,
		});
	} catch {
		/* ignore invalid position state */
	}
}
