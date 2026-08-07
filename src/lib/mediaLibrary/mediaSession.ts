import { Capacitor } from "@capacitor/core";

type MediaSessionHandlers = {
	onPlay: () => void;
	onPause: () => void;
	onSeekBackward?: () => void;
	onSeekForward?: () => void;
	onSeekTo?: (seekTimeSec: number) => void;
};

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

let nativeMediaSessionPromise: Promise<typeof import("@capgo/capacitor-media-session").MediaSession> | null =
	null;

function usesNativeMediaSession(): boolean {
	return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

function runMediaSession(task: () => Promise<void>): void {
	void task().catch(() => {
		/* ignore unavailable media session backends */
	});
}

async function getNativeMediaSession() {
	if (!nativeMediaSessionPromise) {
		nativeMediaSessionPromise = import("@capgo/capacitor-media-session").then(
			(module) => module.MediaSession,
		);
	}
	return nativeMediaSessionPromise;
}

function withWebMediaSession(run: (mediaSession: MediaSession) => void): boolean {
	if (!("mediaSession" in navigator)) {
		return false;
	}

	run(navigator.mediaSession);
	return true;
}

function bindWebMediaSessionHandlers(handlers: MediaSessionHandlers): void {
	withWebMediaSession((mediaSession) => {
		mediaSession.setActionHandler("play", () => handlers.onPlay());
		mediaSession.setActionHandler("pause", () => handlers.onPause());
		mediaSession.setActionHandler(
			"seekbackward",
			handlers.onSeekBackward ? () => handlers.onSeekBackward?.() : null,
		);
		mediaSession.setActionHandler(
			"seekforward",
			handlers.onSeekForward ? () => handlers.onSeekForward?.() : null,
		);
		mediaSession.setActionHandler(
			"seekto",
			handlers.onSeekTo
				? (details) => {
						if (details.seekTime != null && Number.isFinite(details.seekTime)) {
							handlers.onSeekTo?.(details.seekTime);
						}
					}
				: null,
		);
		// Chrome Android PWA often surfaces prev/next instead of seek buttons.
		mediaSession.setActionHandler(
			"previoustrack",
			handlers.onSeekBackward ? () => handlers.onSeekBackward?.() : null,
		);
		mediaSession.setActionHandler(
			"nexttrack",
			handlers.onSeekForward ? () => handlers.onSeekForward?.() : null,
		);
		mediaSession.setActionHandler("stop", null);
	});
}

async function bindNativeMediaSessionHandlers(handlers: MediaSessionHandlers): Promise<void> {
	const MediaSession = await getNativeMediaSession();
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
	await MediaSession.setActionHandler(
		{ action: "previoustrack" },
		handlers.onSeekBackward ?? null,
	);
	await MediaSession.setActionHandler(
		{ action: "nexttrack" },
		handlers.onSeekForward ?? null,
	);
	await MediaSession.setActionHandler({ action: "stop" }, null);
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

export function bindMediaSessionHandlers(handlers: MediaSessionHandlers) {
	if (usesNativeMediaSession()) {
		void bindNativeMediaSessionHandlers(handlers);
	} else {
		bindWebMediaSessionHandlers(handlers);
	}

	return () => {
		if (usesNativeMediaSession()) {
			runMediaSession(async () => {
				const MediaSession = await getNativeMediaSession();
				for (const action of MEDIA_SESSION_ACTIONS) {
					await MediaSession.setActionHandler({ action }, null);
				}
			});
			return;
		}

		withWebMediaSession((mediaSession) => {
			for (const action of MEDIA_SESSION_ACTIONS) {
				mediaSession.setActionHandler(action, null);
			}
		});
	};
}

export function activateMediaSessionHandlers(handlers: MediaSessionHandlers): void {
	if (usesNativeMediaSession()) {
		void bindNativeMediaSessionHandlers(handlers);
		return;
	}

	bindWebMediaSessionHandlers(handlers);
}

export function clearMediaSession() {
	if (usesNativeMediaSession()) {
		runMediaSession(async () => {
			const MediaSession = await getNativeMediaSession();
			await MediaSession.setPlaybackState({ playbackState: "none" });
			await MediaSession.setMetadata({
				title: "",
				artist: "",
				album: "",
				artwork: [],
			});
		});
		return;
	}

	withWebMediaSession((mediaSession) => {
		mediaSession.metadata = null;
		mediaSession.playbackState = "none";
	});
}

export function updateMediaSessionMetadata(metadata: {
	title: string;
	artist?: string;
	album?: string;
}) {
	const payload = {
		title: metadata.title,
		artist: metadata.artist ?? "Story Engine",
		album: metadata.album ?? "Media Library",
		artwork: getDefaultMediaSessionArtwork(),
	};

	if (usesNativeMediaSession()) {
		runMediaSession(async () => {
			const MediaSession = await getNativeMediaSession();
			await MediaSession.setMetadata(payload);
		});
		return;
	}

	withWebMediaSession((mediaSession) => {
		mediaSession.metadata = new MediaMetadata(payload);
	});
}

export function updateMediaSessionPlaybackState(state: "none" | "paused" | "playing") {
	if (usesNativeMediaSession()) {
		runMediaSession(async () => {
			const MediaSession = await getNativeMediaSession();
			await MediaSession.setPlaybackState({ playbackState: state });
		});
		return;
	}

	withWebMediaSession((mediaSession) => {
		mediaSession.playbackState = state;
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

	const positionState = {
		duration: args.durationSec,
		position: Math.max(0, Math.min(args.durationSec, args.positionSec)),
		playbackRate: args.playbackRate ?? 1,
	};

	if (usesNativeMediaSession()) {
		runMediaSession(async () => {
			const MediaSession = await getNativeMediaSession();
			await MediaSession.setPositionState(positionState);
		});
		return;
	}

	withWebMediaSession((mediaSession) => {
		if (!mediaSession.setPositionState) {
			return;
		}

		try {
			mediaSession.setPositionState(positionState);
		} catch {
			/* ignore invalid position state */
		}
	});
}
