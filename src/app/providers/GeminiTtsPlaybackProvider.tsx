import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react";
import { useStoryEngine } from "./StoryEngineProvider";
import {
	computeGeminiTtsCacheDigest,
	getGeminiTtsMemoryCache,
	readGeminiTtsCache,
	writeGeminiTtsCache,
} from "../../lib/ai/geminiTtsCache";
import {
	synthesizeStoryAudiobookWav,
	type StoryAudiobookChapterSegment,
	computeStoryAudiobookPreparedDigest,
} from "../../lib/ai/storyAudiobook";
import type { StoryAudiobookProgress } from "../../lib/ai/storyAudiobookProgress";
import {
	audiobookProgressToBackgroundJobProgress,
	backgroundJobProgressFromSteps,
	findAudiobookListenJobForPlayId,
} from "../../lib/backgroundTasks";
import { synthesizeGeminiSpeechPlan } from "../../lib/ai/geminiTtsSynthesis";
import { resolveGeminiNarrationTtsSettings } from "../../lib/ai/geminiTtsVoices";
import type { SpeechSynthesisPlan } from "../../lib/storyText/messageSpeechText";
import type { MediaAsset, MediaAssetCategory } from "../../types/models";
import { createAudioBlobUrl, readAudioElementBytes } from "../../lib/mediaLibrary/audioPlayback";
import { ingestStoryAudio } from "../../lib/mediaLibrary/ingestStoryAudio";
import {
	buildMediaAssetPlayId,
	buildStoryAudiobookLibraryKey,
	buildStoryChapterLibraryKey,
	parseMediaAssetPlayId,
	parseChapterPlayId,
} from "../../lib/mediaLibrary/libraryKeys";
import {
	activateMediaSessionHandlers,
	bindMediaSessionHandlers,
	clearMediaSession,
	updateMediaSessionMetadata,
	updateMediaSessionPlaybackState,
	updateMediaSessionPositionState,
} from "../../lib/mediaLibrary/mediaSession";
import {
	findMediaAssetByLibraryKey,
	updateMediaAssetPlaybackPosition,
} from "../../lib/mediaLibrary/store";

export type GeminiTtsPlaybackStatus = "idle" | "loading" | "ready" | "playing" | "error";

interface GeminiTtsPlaybackState {
	activeId: string | null;
	status: GeminiTtsPlaybackStatus;
	errorMessage: string | null;
	loadingMessage: string | null;
	loadingAudiobookProgress: StoryAudiobookProgress | null;
	loadingStartedAtMs: number | null;
	playerTitle: string | null;
	currentTimeSec: number;
	durationSec: number;
}

export interface GeminiTtsLoadingDetail {
	message: string;
	startedAtMs: number;
	audiobookProgress?: StoryAudiobookProgress;
}

export interface BackgroundAudiobookJob {
	playId: string;
	playerTitle: string;
	startedAtMs: number;
	progress: StoryAudiobookProgress | null;
	backgroundTaskJobId?: string;
}

interface PreparedSpeechAudio {
	audio: HTMLAudioElement;
	objectUrl: string;
	sourceBytes: Uint8Array;
	sourceMimeType: string;
}

interface ActiveSynthesis {
	playId: string;
	jobId?: string;
	kind: "speech_plan" | "story_audiobook";
	controller: AbortController;
	startedAtMs: number;
	playerTitle: string | null;
	loadingMessage: string | null;
	audiobookProgress: StoryAudiobookProgress | null;
}

type PendingSpeechPlanWork = {
	kind: "speech_plan";
	jobId: string;
	playId: string;
	plan: SpeechSynthesisPlan;
	title?: string;
};

type PendingStoryAudiobookWork = {
	kind: "story_audiobook";
	jobId: string;
	playId: string;
	segments: StoryAudiobookChapterSegment[];
	title: string;
	parallelChapters?: number;
};

type PendingListenWork = PendingSpeechPlanWork | PendingStoryAudiobookWork;

type PlaybackSaveContext = {
	category: Extract<MediaAssetCategory, "audiobook" | "chapter">;
	storyId: string;
	storyTitle: string;
	chapterMessageId?: string;
	chapterTitle?: string;
	contentDigest?: string;
};

export type LibrarySaveState =
	| { status: "unavailable" }
	| { status: "ready" }
	| { status: "saved"; assetId: string }
	| { status: "replace"; assetId: string };

interface GeminiTtsPlaybackContextValue {
	activeId: string | null;
	status: GeminiTtsPlaybackStatus;
	errorMessage: string | null;
	playerTitle: string | null;
	currentTimeSec: number;
	durationSec: number;
	isPaused: boolean;
	getItemStatus: (playId: string) => GeminiTtsPlaybackStatus;
	getLoadingDetail: (playId: string) => GeminiTtsLoadingDetail | null;
	backgroundAudiobookJob: BackgroundAudiobookJob | null;
	cancelStoryAudiobookPreparation: (playId: string) => void;
	prepareSpeechPlan: (
		playId: string,
		plan: SpeechSynthesisPlan,
		options?: {
			title?: string;
			storyId?: string;
			storyTitle?: string;
			chapterMessageId?: string;
			saveCategory?: Extract<MediaAssetCategory, "audiobook" | "chapter">;
		},
	) => Promise<void>;
	prepareStoryAudiobook: (
		playId: string,
		segments: StoryAudiobookChapterSegment[],
		title: string,
		options?: {
			parallelChapters?: number;
			storyId?: string;
			storyTitle?: string;
		},
	) => Promise<void>;
	playMediaAsset: (asset: MediaAsset) => Promise<void>;
	playPreparedSpeech: (playId: string) => Promise<void>;
	getLibrarySaveState: (playId?: string | null) => Promise<LibrarySaveState>;
	saveActiveAudioToLibrary: (replaceExisting?: boolean) => Promise<MediaAsset>;
	togglePlaybackPause: () => Promise<void>;
	seekTo: (seconds: number) => void;
	skipForward: (seconds?: number) => void;
	skipBackward: (seconds?: number) => void;
	invalidatePreparedSpeechIfStale: (playId: string, plan: SpeechSynthesisPlan) => Promise<void>;
	stop: () => void;
	hasGeminiKey: boolean;
}

const GeminiTtsPlaybackContext = createContext<GeminiTtsPlaybackContextValue | null>(null);

const IDLE_STATE: GeminiTtsPlaybackState = {
	activeId: null,
	status: "idle",
	errorMessage: null,
	loadingMessage: null,
	loadingAudiobookProgress: null,
	loadingStartedAtMs: null,
	playerTitle: null,
	currentTimeSec: 0,
	durationSec: 0,
};

export function GeminiTtsPlaybackProvider({ children }: { children: ReactNode }) {
	const {
		aiSettings,
		backgroundJobs,
		beginAudiobookPlaybackBackgroundTask,
		updateAudiobookPlaybackBackgroundTask,
		finishAudiobookPlaybackBackgroundTask,
	} = useStoryEngine();
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const objectUrlRef = useRef<string | null>(null);
	const preparedRef = useRef<Map<string, PreparedSpeechAudio>>(new Map());
	const preparedDigestRef = useRef<Map<string, string>>(new Map());
	const activeSynthesisRef = useRef<Map<string, ActiveSynthesis>>(new Map());
	const pendingListenWorkRef = useRef<PendingListenWork[]>([]);
	const [state, setState] = useState<GeminiTtsPlaybackState>(IDLE_STATE);
	const [synthesisTick, setSynthesisTick] = useState(0);
	const playbackSaveContextRef = useRef<Map<string, PlaybackSaveContext>>(new Map());
	const positionPersistTimerRef = useRef<number | null>(null);
	const positionPersistAssetRef = useRef<string | null>(null);
	const mediaSessionArtistRef = useRef<string | undefined>(undefined);
	const mediaSessionPositionSyncRef = useRef(0);
	const mediaSessionHandlersRef = useRef({
		onPlay: () => {},
		onPause: () => {},
		onSeekBackward: () => {},
		onSeekForward: () => {},
		onSeekTo: (_seekTimeSec: number) => {},
	});

	const scheduleMediaAssetPositionPersist = useCallback((assetId: string, positionMs: number) => {
		positionPersistAssetRef.current = assetId;
		if (positionPersistTimerRef.current !== null) {
			window.clearTimeout(positionPersistTimerRef.current);
		}

		positionPersistTimerRef.current = window.setTimeout(() => {
			positionPersistTimerRef.current = null;
			void updateMediaAssetPlaybackPosition(assetId, positionMs);
		}, 1500);
	}, []);

	const registerPlaybackSaveContext = useCallback((playId: string, context: PlaybackSaveContext) => {
		playbackSaveContextRef.current.set(playId, context);
	}, []);

	const bumpSynthesisUi = useCallback(() => {
		setSynthesisTick((value) => value + 1);
	}, []);

	const hasGeminiKey = Boolean(aiSettings?.apiKeys?.gemini?.trim());

	const backgroundAudiobookJob = useMemo((): BackgroundAudiobookJob | null => {
		for (const synthesis of activeSynthesisRef.current.values()) {
			if (synthesis.kind !== "story_audiobook") {
				continue;
			}
			return {
				playId: synthesis.playId,
				playerTitle: synthesis.playerTitle ?? "Story audiobook",
				startedAtMs: synthesis.startedAtMs,
				progress: synthesis.audiobookProgress,
				backgroundTaskJobId: synthesis.jobId,
			};
		}
		return null;
	}, [synthesisTick]);

	const releasePreparedAudio = useCallback((playId: string) => {
		const prepared = preparedRef.current.get(playId);
		if (!prepared) {
			return;
		}

		prepared.audio.pause();
		prepared.audio.src = "";
		prepared.audio.remove();
		URL.revokeObjectURL(prepared.objectUrl);
		preparedRef.current.delete(playId);
		preparedDigestRef.current.delete(playId);
	}, []);

	const cleanupActiveAudio = useCallback(() => {
		if (audioRef.current) {
			audioRef.current.pause();
			audioRef.current = null;
		}
		objectUrlRef.current = null;
	}, []);

	const clearSynthesis = useCallback(
		(playId: string) => {
			activeSynthesisRef.current.delete(playId);
			bumpSynthesisUi();
		},
		[bumpSynthesisUi],
	);

	const abortSynthesisForPlayId = useCallback(
		(playId: string) => {
			const synthesis = activeSynthesisRef.current.get(playId);
			if (!synthesis) {
				return;
			}
			synthesis.controller.abort();
			clearSynthesis(playId);
		},
		[clearSynthesis],
	);

	const attachAudioHandlers = useCallback(
		(audio: HTMLAudioElement, playId: string) => {
			const syncTimeline = () => {
				setState((current) => {
					if (current.activeId !== playId) {
						return current;
					}

					return {
						...current,
						currentTimeSec: audio.currentTime,
						durationSec: Number.isFinite(audio.duration) ? audio.duration : current.durationSec,
					};
				});
			};

			audio.onloadedmetadata = () => {
				syncTimeline();
				if (Number.isFinite(audio.duration) && audio.duration > 0) {
					updateMediaSessionPositionState({
						durationSec: audio.duration,
						positionSec: audio.currentTime,
					});
				}
			};
			audio.onplay = () => {
				updateMediaSessionPlaybackState("playing");
			};
			audio.onpause = () => {
				updateMediaSessionPlaybackState("paused");
			};
			audio.ontimeupdate = () => {
				syncTimeline();
				const mediaAssetId = parseMediaAssetPlayId(playId);
				if (mediaAssetId) {
					scheduleMediaAssetPositionPersist(mediaAssetId, audio.currentTime * 1000);
				}

				const now = Date.now();
				if (
					now - mediaSessionPositionSyncRef.current >= 1000 &&
					Number.isFinite(audio.duration) &&
					audio.duration > 0
				) {
					mediaSessionPositionSyncRef.current = now;
					updateMediaSessionPositionState({
						durationSec: audio.duration,
						positionSec: audio.currentTime,
					});
				}
			};
			audio.onended = () => {
				cleanupActiveAudio();
				setState((current) => {
					if (current.activeId !== playId) {
						return current;
					}

					return {
						...current,
						status: "ready",
						currentTimeSec: Number.isFinite(audio.duration) ? audio.duration : current.currentTimeSec,
						loadingMessage: null,
						loadingStartedAtMs: null,
					};
				});
			};
			audio.onerror = () => {
				cleanupActiveAudio();
				setState({
					activeId: playId,
					status: "error",
					errorMessage: "Unable to play synthesized audio.",
					loadingMessage: null,
					loadingAudiobookProgress: null,
					loadingStartedAtMs: null,
					playerTitle: state.playerTitle,
					currentTimeSec: 0,
					durationSec: 0,
				});
			};
		},
		[cleanupActiveAudio, scheduleMediaAssetPositionPersist, state.playerTitle],
	);

	const updateSynthesisMeta = useCallback(
		(playId: string, patch: Partial<ActiveSynthesis>) => {
			const current = activeSynthesisRef.current.get(playId);
			if (!current) {
				return;
			}
			activeSynthesisRef.current.set(playId, { ...current, ...patch });
			bumpSynthesisUi();
		},
		[bumpSynthesisUi],
	);

	const setForegroundLoadingState = useCallback(
		(
			playId: string,
			patch: Partial<GeminiTtsPlaybackState> & {
				playerTitle?: string | null;
			},
		) => {
			setState((current) => {
				if (current.activeId !== playId) {
					return current;
				}
				return { ...current, ...patch };
			});
		},
		[],
	);

	const stop = useCallback(() => {
		const activeId = state.activeId;
		const wasLoading = state.status === "loading";

		if (wasLoading && activeId) {
			const synthesis = activeSynthesisRef.current.get(activeId);
			if (synthesis?.jobId) {
				void finishAudiobookPlaybackBackgroundTask(synthesis.jobId, "cancelled");
			}
			abortSynthesisForPlayId(activeId);
			releasePreparedAudio(activeId);
			setState(IDLE_STATE);
			return;
		}

		cleanupActiveAudio();

		if (state.status === "playing" && activeId && preparedRef.current.has(activeId)) {
			setState({
				activeId,
				status: "ready",
				errorMessage: null,
				loadingMessage: null,
				loadingAudiobookProgress: null,
				loadingStartedAtMs: null,
				playerTitle: state.playerTitle,
				currentTimeSec: audioRef.current?.currentTime ?? state.currentTimeSec,
				durationSec: state.durationSec,
			});
			return;
		}

		setState(IDLE_STATE);
	}, [
		abortSynthesisForPlayId,
		cleanupActiveAudio,
		finishAudiobookPlaybackBackgroundTask,
		releasePreparedAudio,
		state.activeId,
		state.currentTimeSec,
		state.durationSec,
		state.playerTitle,
		state.status,
	]);

	const cancelStoryAudiobookPreparation = useCallback(
		(playId: string) => {
			const synthesis = activeSynthesisRef.current.get(playId);
			if (!synthesis || synthesis.kind !== "story_audiobook") {
				return;
			}

			if (synthesis.jobId) {
				void finishAudiobookPlaybackBackgroundTask(synthesis.jobId, "cancelled");
			}
			abortSynthesisForPlayId(playId);
			pendingListenWorkRef.current = pendingListenWorkRef.current.filter(
				(work) => work.playId !== playId,
			);

			if (state.activeId === playId && state.status === "loading") {
				releasePreparedAudio(playId);
				setState(IDLE_STATE);
			}
		},
		[
			abortSynthesisForPlayId,
			finishAudiobookPlaybackBackgroundTask,
			releasePreparedAudio,
			state.activeId,
			state.status,
		],
	);

	useEffect(() => {
		for (const synthesis of [...activeSynthesisRef.current.values()]) {
			if (!synthesis.jobId) {
				continue;
			}
			const job = backgroundJobs.find((entry) => entry.id === synthesis.jobId);
			if (job?.status !== "cancelled") {
				continue;
			}

			abortSynthesisForPlayId(synthesis.playId);
			pendingListenWorkRef.current = pendingListenWorkRef.current.filter(
				(work) => work.playId !== synthesis.playId,
			);

			if (state.activeId === synthesis.playId && state.status === "loading") {
				releasePreparedAudio(synthesis.playId);
				setState(IDLE_STATE);
			}
		}
	}, [
		abortSynthesisForPlayId,
		backgroundJobs,
		releasePreparedAudio,
		state.activeId,
		state.status,
	]);

	useEffect(() => {
		return () => {
			for (const synthesis of activeSynthesisRef.current.values()) {
				synthesis.controller.abort();
			}
			activeSynthesisRef.current.clear();
			cleanupActiveAudio();
			for (const playId of preparedRef.current.keys()) {
				releasePreparedAudio(playId);
			}
		};
	}, [cleanupActiveAudio, releasePreparedAudio]);

	const loadPreparedAudio = useCallback(
		(
			playId: string,
			audioBytes: ArrayBuffer | Uint8Array,
			mimeType: string,
			digest: string,
		) => {
			releasePreparedAudio(playId);

			const bytes = audioBytes instanceof Uint8Array ? audioBytes : new Uint8Array(audioBytes);
			const { url } = createAudioBlobUrl(bytes, mimeType);
			const audio = document.createElement("audio");
			audio.src = url;
			audio.preload = "auto";
			audio.setAttribute("playsinline", "");
			audio.style.display = "none";
			document.body.appendChild(audio);
			attachAudioHandlers(audio, playId);

			preparedRef.current.set(playId, {
				audio,
				objectUrl: url,
				sourceBytes: bytes,
				sourceMimeType: mimeType,
			});
			preparedDigestRef.current.set(playId, digest);
		},
		[attachAudioHandlers, releasePreparedAudio],
	);

	const loadPreparedSpeech = useCallback(
		(playId: string, wavBuffer: ArrayBuffer | Uint8Array, digest: string) => {
			loadPreparedAudio(playId, wavBuffer, "audio/wav", digest);
		},
		[loadPreparedAudio],
	);

	const runSpeechPlanSynthesis = useCallback(
		async (work: PendingSpeechPlanWork) => {
			const apiKey = aiSettings?.apiKeys?.gemini?.trim() ?? "";
			if (!apiKey) {
				return;
			}

			const { playId, plan, jobId, title } = work;
			if (activeSynthesisRef.current.has(playId)) {
				return;
			}

			const narrationTts = resolveGeminiNarrationTtsSettings(aiSettings?.geminiNarrationTts);
			const cacheDigest = await computeGeminiTtsCacheDigest(playId, plan, narrationTts.model);
			const controller = new AbortController();
			const startedAtMs = Date.now();

			activeSynthesisRef.current.set(playId, {
				playId,
				jobId,
				kind: "speech_plan",
				controller,
				startedAtMs,
				playerTitle: title ?? null,
				loadingMessage: "Preparing voice synthesis…",
				audiobookProgress: null,
			});
			bumpSynthesisUi();

			setState((current) => ({
				...current,
				activeId: playId,
				status: "loading",
				errorMessage: null,
				loadingMessage: "Preparing voice synthesis…",
				loadingAudiobookProgress: null,
				loadingStartedAtMs: startedAtMs,
				playerTitle: title ?? current.playerTitle,
				currentTimeSec: 0,
				durationSec: 0,
			}));

			try {
				const wavBuffer = await synthesizeGeminiSpeechPlan({
					apiKey,
					plan,
					model: narrationTts.model,
					signal: controller.signal,
					onProgress: (message) => {
						if (controller.signal.aborted) {
							return;
						}
						updateSynthesisMeta(playId, { loadingMessage: message });
						if (jobId) {
							void updateAudiobookPlaybackBackgroundTask(
								jobId,
								backgroundJobProgressFromSteps("Prepare Chapter Audio", [
									{
										id: "synthesis",
										label: title ? `Preparing ${title}` : "Preparing chapter audio",
										status: "running",
									},
								]),
							);
						}
						setForegroundLoadingState(playId, {
							loadingMessage: message,
							loadingStartedAtMs: startedAtMs,
						});
					},
				});

				if (controller.signal.aborted) {
					if (jobId) {
						void finishAudiobookPlaybackBackgroundTask(jobId, "cancelled");
					}
					clearSynthesis(playId);
					return;
				}

				await writeGeminiTtsCache(cacheDigest, playId, wavBuffer);
				loadPreparedSpeech(playId, wavBuffer, cacheDigest);
				if (jobId) {
					void updateAudiobookPlaybackBackgroundTask(
						jobId,
						backgroundJobProgressFromSteps("Prepare Chapter Audio", [
							{
								id: "synthesis",
								label: title ? `Preparing ${title}` : "Preparing chapter audio",
								status: "done",
							},
						]),
					);
					void finishAudiobookPlaybackBackgroundTask(jobId, "complete");
				}
				clearSynthesis(playId);

				setState((current) => {
					if (current.activeId !== playId) {
						return current;
					}
					return {
						activeId: playId,
						status: "ready",
						errorMessage: null,
						loadingMessage: null,
						loadingAudiobookProgress: null,
						loadingStartedAtMs: null,
						playerTitle: title ?? current.playerTitle,
						currentTimeSec: 0,
						durationSec: 0,
					};
				});
			} catch (error) {
				if (controller.signal.aborted) {
					if (jobId) {
						void finishAudiobookPlaybackBackgroundTask(jobId, "cancelled");
					}
					clearSynthesis(playId);
					return;
				}
				if (jobId) {
					void finishAudiobookPlaybackBackgroundTask(
						jobId,
						"failed",
						error instanceof Error ? error.message : "Unable to synthesize speech audio.",
					);
				}
				clearSynthesis(playId);
				setState((current) => {
					if (current.activeId !== playId) {
						return current;
					}
					return {
						activeId: playId,
						status: "error",
						errorMessage:
							error instanceof Error ? error.message : "Unable to synthesize speech audio.",
						loadingMessage: null,
						loadingAudiobookProgress: null,
						loadingStartedAtMs: null,
						playerTitle: title ?? null,
						currentTimeSec: 0,
						durationSec: 0,
					};
				});
			}
		},
		[
			aiSettings,
			bumpSynthesisUi,
			clearSynthesis,
			finishAudiobookPlaybackBackgroundTask,
			loadPreparedSpeech,
			setForegroundLoadingState,
			updateAudiobookPlaybackBackgroundTask,
			updateSynthesisMeta,
		],
	);

	const runStoryAudiobookSynthesis = useCallback(
		async (work: PendingStoryAudiobookWork) => {
			const apiKey = aiSettings?.apiKeys?.gemini?.trim() ?? "";
			if (!apiKey) {
				return;
			}

			const { playId, segments, jobId, title, parallelChapters } = work;
			if (activeSynthesisRef.current.has(playId)) {
				return;
			}

			const narrationTts = resolveGeminiNarrationTtsSettings(aiSettings?.geminiNarrationTts);
			const cacheDigest = await computeStoryAudiobookPreparedDigest(playId, segments, narrationTts.model);
			const controller = new AbortController();
			const startedAtMs = Date.now();

			activeSynthesisRef.current.set(playId, {
				playId,
				jobId,
				kind: "story_audiobook",
				controller,
				startedAtMs,
				playerTitle: title,
				loadingMessage: "Preparing story audiobook…",
				audiobookProgress: null,
			});
			bumpSynthesisUi();

			setState((current) => ({
				...current,
				activeId: playId,
				status: "loading",
				errorMessage: null,
				loadingMessage: "Preparing story audiobook…",
				loadingAudiobookProgress: null,
				loadingStartedAtMs: startedAtMs,
				playerTitle: title,
				currentTimeSec: 0,
				durationSec: 0,
			}));

			try {
				const wavBuffer = await synthesizeStoryAudiobookWav({
					apiKey,
					segments,
					model: narrationTts.model,
					parallelChapters,
					signal: controller.signal,
					onProgress: (progress) => {
						if (controller.signal.aborted) {
							return;
						}
						updateSynthesisMeta(playId, {
							loadingMessage: progress.summary,
							audiobookProgress: progress,
						});
						if (jobId) {
							void updateAudiobookPlaybackBackgroundTask(
								jobId,
								audiobookProgressToBackgroundJobProgress(progress, "Prepare Audiobook"),
							);
						}
						setForegroundLoadingState(playId, {
							loadingMessage: progress.summary,
							loadingAudiobookProgress: progress,
							loadingStartedAtMs: startedAtMs,
						});
					},
				});

				if (controller.signal.aborted) {
					if (jobId) {
						void finishAudiobookPlaybackBackgroundTask(jobId, "cancelled");
					}
					clearSynthesis(playId);
					return;
				}

				loadPreparedSpeech(playId, wavBuffer, cacheDigest);
				if (jobId) {
					void finishAudiobookPlaybackBackgroundTask(jobId, "complete");
				}
				clearSynthesis(playId);

				setState((current) => {
					if (current.activeId !== playId) {
						return current;
					}
					return {
						activeId: playId,
						status: "ready",
						errorMessage: null,
						loadingMessage: null,
						loadingAudiobookProgress: null,
						loadingStartedAtMs: null,
						playerTitle: title,
						currentTimeSec: 0,
						durationSec: 0,
					};
				});
			} catch (error) {
				if (controller.signal.aborted) {
					if (jobId) {
						void finishAudiobookPlaybackBackgroundTask(jobId, "cancelled");
					}
					clearSynthesis(playId);
					return;
				}
				if (jobId) {
					void finishAudiobookPlaybackBackgroundTask(
						jobId,
						"failed",
						error instanceof Error ? error.message : "Unable to synthesize story audiobook.",
					);
				}
				clearSynthesis(playId);
				setState((current) => {
					if (current.activeId !== playId) {
						return current;
					}
					return {
						activeId: playId,
						status: "error",
						errorMessage:
							error instanceof Error ? error.message : "Unable to synthesize story audiobook.",
						loadingMessage: null,
						loadingAudiobookProgress: null,
						loadingStartedAtMs: null,
						playerTitle: title,
						currentTimeSec: 0,
						durationSec: 0,
					};
				});
			}
		},
		[
			aiSettings,
			bumpSynthesisUi,
			clearSynthesis,
			finishAudiobookPlaybackBackgroundTask,
			loadPreparedSpeech,
			setForegroundLoadingState,
			updateAudiobookPlaybackBackgroundTask,
			updateSynthesisMeta,
		],
	);

	useEffect(() => {
		const stillPending: PendingListenWork[] = [];

		for (const work of pendingListenWorkRef.current) {
			const job = backgroundJobs.find((entry) => entry.id === work.jobId);
			if (
				job?.status === "running" &&
				!activeSynthesisRef.current.has(work.playId)
			) {
				if (work.kind === "speech_plan") {
					void runSpeechPlanSynthesis(work);
				} else {
					void runStoryAudiobookSynthesis(work);
				}
				continue;
			}

			if (job && (job.status === "queued" || job.status === "running")) {
				stillPending.push(work);
			}
		}

		pendingListenWorkRef.current = stillPending;
	}, [backgroundJobs, runSpeechPlanSynthesis, runStoryAudiobookSynthesis]);

	const playPreparedSpeech = useCallback(
		async (playId: string) => {
			const prepared = preparedRef.current.get(playId);
			if (!prepared) {
				setState({
					activeId: playId,
					status: "error",
					errorMessage: "Audio is not ready yet. Prepare playback first.",
					loadingMessage: null,
					loadingAudiobookProgress: null,
					loadingStartedAtMs: null,
					playerTitle: state.playerTitle,
					currentTimeSec: 0,
					durationSec: 0,
				});
				return;
			}

			cleanupActiveAudio();
			audioRef.current = prepared.audio;
			objectUrlRef.current = prepared.objectUrl;
			attachAudioHandlers(prepared.audio, playId);

			const saveContext = playbackSaveContextRef.current.get(playId);
			if (state.playerTitle) {
				updateMediaSessionMetadata({
					title: state.playerTitle,
					artist: mediaSessionArtistRef.current ?? saveContext?.storyTitle,
				});
			}

			activateMediaSessionHandlers({
				onPlay: () => {
					void mediaSessionHandlersRef.current.onPlay();
				},
				onPause: () => {
					mediaSessionHandlersRef.current.onPause();
				},
				onSeekBackward: () => {
					mediaSessionHandlersRef.current.onSeekBackward();
				},
				onSeekForward: () => {
					mediaSessionHandlersRef.current.onSeekForward();
				},
				onSeekTo: (seekTimeSec) => {
					mediaSessionHandlersRef.current.onSeekTo(seekTimeSec);
				},
			});

			try {
				await prepared.audio.play();
				const durationSec = Number.isFinite(prepared.audio.duration)
					? prepared.audio.duration
					: state.durationSec;
				setState((current) => ({
					...current,
					activeId: playId,
					status: "playing",
					errorMessage: null,
					loadingMessage: null,
					loadingAudiobookProgress: null,
					loadingStartedAtMs: null,
					currentTimeSec: prepared.audio.currentTime,
					durationSec: Number.isFinite(prepared.audio.duration)
						? prepared.audio.duration
						: current.durationSec,
				}));
				updateMediaSessionPlaybackState("playing");
				updateMediaSessionPositionState({
					durationSec,
					positionSec: prepared.audio.currentTime,
				});
			} catch {
				cleanupActiveAudio();
				setState({
					activeId: playId,
					status: "error",
					errorMessage: "Unable to start playback.",
					loadingMessage: null,
					loadingAudiobookProgress: null,
					loadingStartedAtMs: null,
					playerTitle: state.playerTitle,
					currentTimeSec: 0,
					durationSec: 0,
				});
			}
		},
		[attachAudioHandlers, cleanupActiveAudio, state.durationSec, state.playerTitle],
	);

	const togglePlaybackPause = useCallback(async () => {
		const audio = audioRef.current;
		const playId = state.activeId;
		if (!audio || !playId) {
			if (playId && state.status === "ready") {
				await playPreparedSpeech(playId);
			}
			return;
		}

		if (audio.paused) {
			try {
				activateMediaSessionHandlers({
					onPlay: () => {
						void mediaSessionHandlersRef.current.onPlay();
					},
					onPause: () => {
						mediaSessionHandlersRef.current.onPause();
					},
					onSeekBackward: () => {
						mediaSessionHandlersRef.current.onSeekBackward();
					},
					onSeekForward: () => {
						mediaSessionHandlersRef.current.onSeekForward();
					},
					onSeekTo: (seekTimeSec) => {
						mediaSessionHandlersRef.current.onSeekTo(seekTimeSec);
					},
				});
				await audio.play();
				setState((current) => ({ ...current, status: "playing" }));
				updateMediaSessionPlaybackState("playing");
			} catch {
				/* ignore */
			}
			return;
		}

		audio.pause();
		updateMediaSessionPlaybackState("paused");
		setState((current) => ({ ...current, status: "playing" }));
	}, [playPreparedSpeech, state.activeId, state.status]);

	const seekTo = useCallback(
		(seconds: number) => {
			const audio = audioRef.current ?? preparedRef.current.get(state.activeId ?? "")?.audio;
			if (!audio || !Number.isFinite(seconds)) {
				return;
			}

			const clamped = Math.max(0, Math.min(audio.duration || seconds, seconds));
			audio.currentTime = clamped;
			setState((current) => ({ ...current, currentTimeSec: clamped }));
		},
		[state.activeId],
	);

	const skipForward = useCallback(
		(seconds = 10) => {
			const audio = audioRef.current ?? preparedRef.current.get(state.activeId ?? "")?.audio;
			if (!audio) {
				return;
			}
			seekTo(audio.currentTime + seconds);
			updateMediaSessionPositionState({
				durationSec: audio.duration || state.durationSec,
				positionSec: audio.currentTime,
			});
		},
		[seekTo, state.activeId, state.durationSec],
	);

	const skipBackward = useCallback(
		(seconds = 10) => {
			const audio = audioRef.current ?? preparedRef.current.get(state.activeId ?? "")?.audio;
			if (!audio) {
				return;
			}
			seekTo(audio.currentTime - seconds);
			updateMediaSessionPositionState({
				durationSec: audio.duration || state.durationSec,
				positionSec: audio.currentTime,
			});
		},
		[seekTo, state.activeId, state.durationSec],
	);

	const invalidatePreparedSpeechIfStale = useCallback(
		async (playId: string, plan: SpeechSynthesisPlan) => {
			const narrationTts = resolveGeminiNarrationTtsSettings(aiSettings?.geminiNarrationTts);
			const digest = await computeGeminiTtsCacheDigest(playId, plan, narrationTts.model);
			const preparedDigest = preparedDigestRef.current.get(playId);

			if (!preparedDigest || preparedDigest === digest) {
				return;
			}

			releasePreparedAudio(playId);
			cleanupActiveAudio();

			setState((current) => {
				if (current.activeId !== playId) {
					return current;
				}

				return IDLE_STATE;
			});
		},
		[aiSettings, cleanupActiveAudio, releasePreparedAudio],
	);

	const prepareSpeechPlan = useCallback(
		async (
			playId: string,
			plan: SpeechSynthesisPlan,
			options?: {
				title?: string;
				storyId?: string;
				storyTitle?: string;
				chapterMessageId?: string;
				saveCategory?: Extract<MediaAssetCategory, "audiobook" | "chapter">;
			},
		) => {
			const apiKey = aiSettings?.apiKeys?.gemini?.trim() ?? "";
			if (!apiKey) {
				setState({
					activeId: playId,
					status: "error",
					errorMessage: "Add a Gemini API key in Settings → AI to play audio.",
					loadingMessage: null,
					loadingAudiobookProgress: null,
					loadingStartedAtMs: null,
					playerTitle: options?.title ?? null,
					currentTimeSec: 0,
					durationSec: 0,
				});
				return;
			}

			const narrationTts = resolveGeminiNarrationTtsSettings(aiSettings?.geminiNarrationTts);
			const cacheDigest = await computeGeminiTtsCacheDigest(playId, plan, narrationTts.model);

			if (options?.storyId && options.storyTitle) {
				const chapterMessageId = options.chapterMessageId ?? parseChapterPlayId(playId) ?? undefined;
				registerPlaybackSaveContext(playId, {
					category: options.saveCategory ?? "chapter",
					storyId: options.storyId,
					storyTitle: options.storyTitle,
					chapterMessageId,
					chapterTitle: options.title,
					contentDigest: cacheDigest,
				});
			}

			if (activeSynthesisRef.current.has(playId)) {
				const synthesis = activeSynthesisRef.current.get(playId);
				if (synthesis?.jobId) {
					void finishAudiobookPlaybackBackgroundTask(synthesis.jobId, "cancelled");
				}
				abortSynthesisForPlayId(playId);
			}

			if (state.activeId === playId && state.status === "playing") {
				stop();
			}

			if (
				preparedDigestRef.current.get(playId) === cacheDigest &&
				preparedRef.current.has(playId)
			) {
				return;
			}

			const cachedWav =
				getGeminiTtsMemoryCache(cacheDigest) ?? (await readGeminiTtsCache(cacheDigest));

			if (cachedWav) {
				if (state.activeId === playId) {
					cleanupActiveAudio();
				}
				loadPreparedSpeech(playId, cachedWav, cacheDigest);
				setState((current) => ({
					...current,
					activeId: playId,
					status: "ready",
					errorMessage: null,
					loadingMessage: null,
					loadingAudiobookProgress: null,
					loadingStartedAtMs: null,
					playerTitle: options?.title ?? current.playerTitle,
					currentTimeSec: 0,
					durationSec: 0,
				}));
				return;
			}

			if (!options?.storyId) {
				await runSpeechPlanSynthesis({
					kind: "speech_plan",
					jobId: "",
					playId,
					plan,
					title: options?.title,
				});
				return;
			}

			const { job, shouldStartNow } = await beginAudiobookPlaybackBackgroundTask({
				storyId: options.storyId,
				playId,
				purpose: "chapter_listen",
				progressLabel: options.title
					? `Preparing ${options.title}…`
					: "Preparing chapter audio…",
			});

			const work: PendingSpeechPlanWork = {
				kind: "speech_plan",
				jobId: job.id,
				playId,
				plan,
				title: options.title,
			};

			if (!shouldStartNow) {
				pendingListenWorkRef.current = [
					...pendingListenWorkRef.current.filter((entry) => entry.playId !== playId),
					work,
				];
				bumpSynthesisUi();
				return;
			}

			await runSpeechPlanSynthesis(work);
		},
		[
			abortSynthesisForPlayId,
			aiSettings,
			beginAudiobookPlaybackBackgroundTask,
			bumpSynthesisUi,
			cleanupActiveAudio,
			finishAudiobookPlaybackBackgroundTask,
			loadPreparedSpeech,
			runSpeechPlanSynthesis,
			state.activeId,
			state.status,
			stop,
		],
	);

	const prepareStoryAudiobook = useCallback(
		async (
			playId: string,
			segments: StoryAudiobookChapterSegment[],
			title: string,
			options?: { parallelChapters?: number; storyId?: string; storyTitle?: string },
		) => {
			const apiKey = aiSettings?.apiKeys?.gemini?.trim() ?? "";
			if (!apiKey) {
				setState({
					activeId: playId,
					status: "error",
					errorMessage: "Add a Gemini API key in Settings → AI to play audio.",
					loadingMessage: null,
					loadingAudiobookProgress: null,
					loadingStartedAtMs: null,
					playerTitle: title,
					currentTimeSec: 0,
					durationSec: 0,
				});
				return;
			}

			if (!segments.length) {
				setState({
					activeId: playId,
					status: "error",
					errorMessage: "No speakable story content for audiobook playback.",
					loadingMessage: null,
					loadingAudiobookProgress: null,
					loadingStartedAtMs: null,
					playerTitle: title,
					currentTimeSec: 0,
					durationSec: 0,
				});
				return;
			}

			const narrationTts = resolveGeminiNarrationTtsSettings(aiSettings?.geminiNarrationTts);
			const cacheDigest = await computeStoryAudiobookPreparedDigest(playId, segments, narrationTts.model);

			if (options?.storyId && options.storyTitle) {
				registerPlaybackSaveContext(playId, {
					category: "audiobook",
					storyId: options.storyId,
					storyTitle: options.storyTitle,
					contentDigest: cacheDigest,
				});
			}

			if (activeSynthesisRef.current.has(playId)) {
				cancelStoryAudiobookPreparation(playId);
				return;
			}

			if (
				preparedDigestRef.current.get(playId) === cacheDigest &&
				preparedRef.current.has(playId)
			) {
				return;
			}

			if (!options?.storyId) {
				await runStoryAudiobookSynthesis({
					kind: "story_audiobook",
					jobId: "",
					playId,
					segments,
					title,
					parallelChapters: options?.parallelChapters,
				});
				return;
			}

			const { job, shouldStartNow } = await beginAudiobookPlaybackBackgroundTask({
				storyId: options.storyId,
				playId,
				chapterCount: segments.length,
				purpose: "playback",
			});

			const work: PendingStoryAudiobookWork = {
				kind: "story_audiobook",
				jobId: job.id,
				playId,
				segments,
				title,
				parallelChapters: options?.parallelChapters,
			};

			if (!shouldStartNow) {
				pendingListenWorkRef.current = [
					...pendingListenWorkRef.current.filter((entry) => entry.playId !== playId),
					work,
				];
				bumpSynthesisUi();
				return;
			}

			await runStoryAudiobookSynthesis(work);
		},
		[
			aiSettings,
			beginAudiobookPlaybackBackgroundTask,
			bumpSynthesisUi,
			cancelStoryAudiobookPreparation,
			runStoryAudiobookSynthesis,
		],
	);

	const getItemStatus = useCallback(
		(playId: string): GeminiTtsPlaybackStatus => {
			if (activeSynthesisRef.current.has(playId)) {
				return "loading";
			}

			const queuedJob = findAudiobookListenJobForPlayId(backgroundJobs, playId);
			if (queuedJob?.status === "queued" || queuedJob?.status === "running") {
				return "loading";
			}

			if (state.activeId !== playId) {
				if (preparedRef.current.has(playId)) {
					return "ready";
				}
				return "idle";
			}
			return state.status;
		},
		[backgroundJobs, state.activeId, state.status, synthesisTick],
	);

	const getLoadingDetail = useCallback(
		(playId: string): GeminiTtsLoadingDetail | null => {
			const synthesis = activeSynthesisRef.current.get(playId);
			if (synthesis) {
				return {
					message:
						synthesis.audiobookProgress?.summary ??
						synthesis.loadingMessage ??
						(synthesis.kind === "story_audiobook"
							? "Preparing story audiobook…"
							: "Synthesizing voice…"),
					startedAtMs: synthesis.startedAtMs,
					audiobookProgress: synthesis.audiobookProgress ?? undefined,
				};
			}

			const queuedJob = findAudiobookListenJobForPlayId(backgroundJobs, playId);
			if (queuedJob?.status === "queued") {
				return {
					message: queuedJob.progress?.label ?? "Queued for synthesis…",
					startedAtMs: new Date(queuedJob.createdAt).getTime(),
				};
			}

			if (state.activeId !== playId || state.status !== "loading") {
				return null;
			}
			return {
				message: state.loadingMessage ?? "Synthesizing voice…",
				startedAtMs: state.loadingStartedAtMs ?? Date.now(),
				audiobookProgress: state.loadingAudiobookProgress ?? undefined,
			};
		},
		[
			backgroundJobs,
			state.activeId,
			state.loadingAudiobookProgress,
			state.loadingMessage,
			state.loadingStartedAtMs,
			state.status,
			synthesisTick,
		],
	);

	const playMediaAsset = useCallback(
		async (asset: MediaAsset) => {
			const playId = buildMediaAssetPlayId(asset.id);
			loadPreparedAudio(
				playId,
				asset.audioBytes,
				asset.mimeType,
				asset.contentDigest ?? asset.id,
			);

			const prepared = preparedRef.current.get(playId);
			if (prepared && asset.lastPositionMs > 0) {
				prepared.audio.currentTime = asset.lastPositionMs / 1000;
			}

			mediaSessionArtistRef.current = asset.subtitle;

			setState({
				activeId: playId,
				status: "ready",
				errorMessage: null,
				loadingMessage: null,
				loadingAudiobookProgress: null,
				loadingStartedAtMs: null,
				playerTitle: asset.title,
				currentTimeSec: asset.lastPositionMs / 1000,
				durationSec: asset.durationMs / 1000,
			});

			await playPreparedSpeech(playId);
		},
		[loadPreparedAudio, playPreparedSpeech],
	);

	const getLibrarySaveState = useCallback(
		async (playId: string | null = state.activeId): Promise<LibrarySaveState> => {
			if (!playId) {
				return { status: "unavailable" };
			}

			const mediaAssetId = parseMediaAssetPlayId(playId);
			if (mediaAssetId) {
				return { status: "saved", assetId: mediaAssetId };
			}

			const saveContext = playbackSaveContextRef.current.get(playId);
			if (!saveContext || !preparedRef.current.has(playId)) {
				return { status: "unavailable" };
			}

			const libraryKey =
				saveContext.category === "audiobook"
					? buildStoryAudiobookLibraryKey(saveContext.storyId)
					: buildStoryChapterLibraryKey(
							saveContext.storyId,
							saveContext.chapterMessageId ?? "",
						);

			const existing = await findMediaAssetByLibraryKey(libraryKey);
			if (!existing) {
				return { status: "ready" };
			}

			if (saveContext.contentDigest && existing.contentDigest === saveContext.contentDigest) {
				return { status: "saved", assetId: existing.id };
			}

			return { status: "replace", assetId: existing.id };
		},
		[state.activeId],
	);

	const saveActiveAudioToLibrary = useCallback(
		async (replaceExisting = false): Promise<MediaAsset> => {
			const playId = state.activeId;
			if (!playId) {
				throw new Error("No active audio to save.");
			}

			const saveContext = playbackSaveContextRef.current.get(playId);
			if (!saveContext) {
				throw new Error("This audio cannot be saved to the library.");
			}

			const prepared = preparedRef.current.get(playId);
			if (!prepared) {
				throw new Error("Audio is not ready yet.");
			}

			const bytes =
				prepared.sourceMimeType === "audio/wav"
					? prepared.sourceBytes
					: await readAudioElementBytes(prepared.audio);
			if (!bytes) {
				throw new Error("Unable to read prepared audio.");
			}

			const result = await ingestStoryAudio({
				category: saveContext.category,
				storyId: saveContext.storyId,
				storyTitle: saveContext.storyTitle,
				chapterMessageId: saveContext.chapterMessageId,
				chapterTitle: saveContext.chapterTitle,
				wavBytes: bytes,
				contentDigest: saveContext.contentDigest,
				replaceExisting,
			});

			return result.asset;
		},
		[state.activeId],
	);

	useEffect(() => {
		mediaSessionHandlersRef.current = {
			onPlay: async () => {
				const audio = audioRef.current;
				const playId = state.activeId;
				if (!audio || !playId) {
					if (playId && state.status === "ready") {
						await playPreparedSpeech(playId);
					}
					return;
				}

				if (!audio.paused) {
					return;
				}

				try {
					await audio.play();
					setState((current) => ({ ...current, status: "playing" }));
					updateMediaSessionPlaybackState("playing");
				} catch {
					/* ignore */
				}
			},
			onPause: () => {
				const audio = audioRef.current;
				if (!audio || audio.paused) {
					return;
				}

				audio.pause();
				updateMediaSessionPlaybackState("paused");
			},
			onSeekBackward: () => skipBackward(10),
			onSeekForward: () => skipForward(10),
			onSeekTo: (seekTimeSec) => seekTo(seekTimeSec),
		};
	}, [
		playPreparedSpeech,
		seekTo,
		skipBackward,
		skipForward,
		state.activeId,
		state.status,
	]);

	useEffect(() => {
		return bindMediaSessionHandlers({
			onPlay: () => {
				void mediaSessionHandlersRef.current.onPlay();
			},
			onPause: () => {
				mediaSessionHandlersRef.current.onPause();
			},
			onSeekBackward: () => {
				mediaSessionHandlersRef.current.onSeekBackward();
			},
			onSeekForward: () => {
				mediaSessionHandlersRef.current.onSeekForward();
			},
			onSeekTo: (seekTimeSec) => {
				mediaSessionHandlersRef.current.onSeekTo(seekTimeSec);
			},
		});
	}, []);

	useEffect(() => {
		const isActive =
			state.status === "playing" || state.status === "ready" || state.status === "loading";

		if (!isActive || !state.playerTitle) {
			clearMediaSession();
			mediaSessionArtistRef.current = undefined;
			return;
		}

		const saveContext = state.activeId
			? playbackSaveContextRef.current.get(state.activeId)
			: undefined;

		updateMediaSessionMetadata({
			title: state.playerTitle,
			artist: mediaSessionArtistRef.current ?? saveContext?.storyTitle,
		});
		updateMediaSessionPlaybackState(
			state.status === "playing" && !audioRef.current?.paused ? "playing" : "paused",
		);
		updateMediaSessionPositionState({
			durationSec: state.durationSec,
			positionSec: state.currentTimeSec,
		});
	}, [state.durationSec, state.playerTitle, state.status]);

	const isPaused =
		state.status === "playing" && Boolean(audioRef.current?.paused || !audioRef.current);

	const value: GeminiTtsPlaybackContextValue = {
		activeId: state.activeId,
		status: state.status,
		errorMessage: state.errorMessage,
		playerTitle: state.playerTitle,
		currentTimeSec: state.currentTimeSec,
		durationSec: state.durationSec,
		isPaused,
		getItemStatus,
		getLoadingDetail,
		backgroundAudiobookJob,
		cancelStoryAudiobookPreparation,
		prepareSpeechPlan,
		prepareStoryAudiobook,
		playMediaAsset,
		playPreparedSpeech,
		getLibrarySaveState,
		saveActiveAudioToLibrary,
		togglePlaybackPause,
		seekTo,
		skipForward,
		skipBackward,
		invalidatePreparedSpeechIfStale,
		stop,
		hasGeminiKey,
	};

	return (
		<GeminiTtsPlaybackContext.Provider value={value}>{children}</GeminiTtsPlaybackContext.Provider>
	);
}

export function useGeminiTtsPlayback() {
	const context = useContext(GeminiTtsPlaybackContext);
	if (!context) {
		throw new Error("useGeminiTtsPlayback must be used within GeminiTtsPlaybackProvider");
	}
	return context;
}
