import { MediaSession } from "@capgo/capacitor-media-session";

const MEDIA_SESSION_ACTIONS = [
	"play",
	"pause",
	"seekbackward",
	"seekforward",
	"seekto",
	"previoustrack",
	"nexttrack",
	"stop",
] as const;

function runMediaSession(task: () => Promise<void>): void {
	void task().catch(() => {
		/* ignore unavailable media session backends */
	});
}

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
	runMediaSession(async () => {
		await MediaSession.setActionHandler({ action: "play" }, () => handlers.onPlay());
		await MediaSession.setActionHandler({ action: "pause" }, () => handlers.onPause());
		await MediaSession.setActionHandler(
			{ action: "seekbackward" },
			handlers.onSeekBackward ?? null,
		);
		await MediaSession.setActionHandler(
			{ action: "seekforward" },
			handlers.onSeekForward ?? null,
		);
		await MediaSession.setActionHandler(
			{ action: "seekto" },
			handlers.onSeekTo
				? (details) => {
						if (details.seekTime != null && Number.isFinite(details.seekTime)) {
							handlers.onSeekTo?.(details.seekTime);
						}
					}
				: null,
		);
		await MediaSession.setActionHandler({ action: "previoustrack" }, null);
		await MediaSession.setActionHandler({ action: "nexttrack" }, null);
		await MediaSession.setActionHandler({ action: "stop" }, null);
	});

	return () => {
		runMediaSession(async () => {
			for (const action of MEDIA_SESSION_ACTIONS) {
				await MediaSession.setActionHandler({ action }, null);
			}
		});
	};
}

export function clearMediaSession() {
	runMediaSession(async () => {
		await MediaSession.setPlaybackState({ playbackState: "none" });
		await MediaSession.setMetadata({
			title: "",
			artist: "",
			album: "",
			artwork: [],
		});
	});
}

export function updateMediaSessionMetadata(metadata: {
	title: string;
	artist?: string;
	album?: string;
}) {
	runMediaSession(async () => {
		await MediaSession.setMetadata({
			title: metadata.title,
			artist: metadata.artist ?? "Story Engine",
			album: metadata.album ?? "Media Library",
			artwork: getDefaultMediaSessionArtwork(),
		});
	});
}

export function updateMediaSessionPlaybackState(state: "none" | "paused" | "playing") {
	runMediaSession(async () => {
		await MediaSession.setPlaybackState({ playbackState: state });
	});
}

export function updateMediaSessionPositionState(args: {
	durationSec: number;
	positionSec: number;
	playbackRate?: number;
}) {
	if (!Number.isFinite(args.durationSec) || args.durationSec <= 0) {
		return;
	}

	runMediaSession(async () => {
		await MediaSession.setPositionState({
			duration: args.durationSec,
			position: Math.max(0, Math.min(args.durationSec, args.positionSec)),
			playbackRate: args.playbackRate ?? 1,
		});
	});
}
