export function getDefaultMediaSessionArtwork(): MediaImage[] {
	const origin =
		typeof globalThis.location?.origin === "string" ? globalThis.location.origin : "";
	if (!origin) {
		return [];
	}

	return [
		{
			src: `${origin}/pwa-512x512.png`,
			sizes: "512x512",
			type: "image/png",
		},
		{
			src: `${origin}/pwa-192x192.png`,
			sizes: "192x192",
			type: "image/png",
		},
		{
			src: `${origin}/apple-touch-icon.png`,
			sizes: "180x180",
			type: "image/png",
		},
	];
}

export function bindMediaSessionHandlers(handlers: {
	onPlay: () => void;
	onPause: () => void;
	onSeekBackward?: () => void;
	onSeekForward?: () => void;
	onSeekTo?: (seekTimeSec: number) => void;
}) {
	if (!("mediaSession" in navigator)) {
		return () => {};
	}

	const { mediaSession } = navigator;

	mediaSession.setActionHandler("play", () => handlers.onPlay());
	mediaSession.setActionHandler("pause", () => handlers.onPause());
	mediaSession.setActionHandler("seekbackward", handlers.onSeekBackward ?? null);
	mediaSession.setActionHandler("seekforward", handlers.onSeekForward ?? null);
	mediaSession.setActionHandler(
		"seekto",
		handlers.onSeekTo
			? (details) => {
					if (details?.seekTime != null && Number.isFinite(details.seekTime)) {
						handlers.onSeekTo?.(details.seekTime);
					}
				}
			: null,
	);

	return () => {
		mediaSession.setActionHandler("play", null);
		mediaSession.setActionHandler("pause", null);
		mediaSession.setActionHandler("seekbackward", null);
		mediaSession.setActionHandler("seekforward", null);
		mediaSession.setActionHandler("seekto", null);
	};
}

export function clearMediaSession() {
	if (!("mediaSession" in navigator)) {
		return;
	}

	navigator.mediaSession.metadata = null;
	navigator.mediaSession.playbackState = "none";
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
		artwork: getDefaultMediaSessionArtwork(),
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
