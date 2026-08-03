import {
	createContext,
	useCallback,
	useContext,
	useEffect,
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
import { synthesizeGeminiSpeechPlan } from "../../lib/ai/geminiTtsSynthesis";
import { resolveGeminiNarrationTtsSettings } from "../../lib/ai/geminiTtsVoices";
import type { SpeechSynthesisPlan } from "../../lib/storyText/messageSpeechText";

export type GeminiTtsPlaybackStatus = "idle" | "loading" | "ready" | "playing" | "error";

interface GeminiTtsPlaybackState {
	activeId: string | null;
	status: GeminiTtsPlaybackStatus;
	errorMessage: string | null;
	loadingMessage: string | null;
	loadingStartedAtMs: number | null;
}

export interface GeminiTtsLoadingDetail {
	message: string;
	startedAtMs: number;
}

interface PreparedSpeechAudio {
	audio: HTMLAudioElement;
	objectUrl: string;
}

interface GeminiTtsPlaybackContextValue {
	activeId: string | null;
	status: GeminiTtsPlaybackStatus;
	errorMessage: string | null;
	getItemStatus: (playId: string) => GeminiTtsPlaybackStatus;
	getLoadingDetail: (playId: string) => GeminiTtsLoadingDetail | null;
	prepareSpeechPlan: (playId: string, plan: SpeechSynthesisPlan) => Promise<void>;
	playPreparedSpeech: (playId: string) => Promise<void>;
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
	loadingStartedAtMs: null,
};

export function GeminiTtsPlaybackProvider({ children }: { children: ReactNode }) {
	const { aiSettings } = useStoryEngine();
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const objectUrlRef = useRef<string | null>(null);
	const preparedRef = useRef<Map<string, PreparedSpeechAudio>>(new Map());
	const preparedDigestRef = useRef<Map<string, string>>(new Map());
	const abortRef = useRef<AbortController | null>(null);
	const [state, setState] = useState<GeminiTtsPlaybackState>(IDLE_STATE);

	const hasGeminiKey = Boolean(aiSettings?.apiKeys?.gemini?.trim());

	const releasePreparedAudio = useCallback((playId: string) => {
		const prepared = preparedRef.current.get(playId);
		if (!prepared) {
			return;
		}

		prepared.audio.pause();
		prepared.audio.src = "";
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

	const stop = useCallback(() => {
		const wasLoading = state.status === "loading";
		const activeId = state.activeId;

		abortRef.current?.abort();
		abortRef.current = null;
		cleanupActiveAudio();

		if (wasLoading && activeId) {
			releasePreparedAudio(activeId);
			setState(IDLE_STATE);
			return;
		}

		if (state.status === "playing" && activeId && preparedRef.current.has(activeId)) {
			setState({
				activeId,
				status: "ready",
				errorMessage: null,
				loadingMessage: null,
				loadingStartedAtMs: null,
			});
			return;
		}

		setState(IDLE_STATE);
	}, [cleanupActiveAudio, releasePreparedAudio, state.activeId, state.status]);

	useEffect(() => {
		return () => {
			abortRef.current?.abort();
			cleanupActiveAudio();
			for (const playId of preparedRef.current.keys()) {
				releasePreparedAudio(playId);
			}
		};
	}, [cleanupActiveAudio, releasePreparedAudio]);

	const loadPreparedSpeech = useCallback(
		(playId: string, wavBuffer: ArrayBuffer | Uint8Array, digest: string) => {
			releasePreparedAudio(playId);

			const wavBytes = wavBuffer instanceof Uint8Array ? wavBuffer : new Uint8Array(wavBuffer);
			const blob = new Blob([Uint8Array.from(wavBytes)], { type: "audio/wav" });
			const url = URL.createObjectURL(blob);
			const audio = new Audio(url);

			preparedRef.current.set(playId, { audio, objectUrl: url });
			preparedDigestRef.current.set(playId, digest);
		},
		[releasePreparedAudio],
	);

	const playPreparedSpeech = useCallback(
		async (playId: string) => {
			const prepared = preparedRef.current.get(playId);
			if (!prepared) {
				setState({
					activeId: playId,
					status: "error",
					errorMessage: "Audio is not ready yet. Prepare playback first.",
					loadingMessage: null,
					loadingStartedAtMs: null,
				});
				return;
			}

			cleanupActiveAudio();
			audioRef.current = prepared.audio;
			objectUrlRef.current = prepared.objectUrl;

			prepared.audio.onended = () => {
				cleanupActiveAudio();
				setState({
					activeId: playId,
					status: "ready",
					errorMessage: null,
					loadingMessage: null,
					loadingStartedAtMs: null,
				});
			};
			prepared.audio.onerror = () => {
				cleanupActiveAudio();
				setState({
					activeId: playId,
					status: "error",
					errorMessage: "Unable to play synthesized audio.",
					loadingMessage: null,
					loadingStartedAtMs: null,
				});
			};

			try {
				await prepared.audio.play();
				setState({
					activeId: playId,
					status: "playing",
					errorMessage: null,
					loadingMessage: null,
					loadingStartedAtMs: null,
				});
			} catch {
				cleanupActiveAudio();
				setState({
					activeId: playId,
					status: "error",
					errorMessage: "Unable to start playback.",
					loadingMessage: null,
					loadingStartedAtMs: null,
				});
			}
		},
		[cleanupActiveAudio],
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
		async (playId: string, plan: SpeechSynthesisPlan) => {
			const apiKey = aiSettings?.apiKeys?.gemini?.trim() ?? "";
			if (!apiKey) {
				setState({
					activeId: playId,
					status: "error",
					errorMessage: "Add a Gemini API key in Settings → AI to play audio.",
					loadingMessage: null,
					loadingStartedAtMs: null,
				});
				return;
			}

			const narrationTts = resolveGeminiNarrationTtsSettings(aiSettings?.geminiNarrationTts);
			const cacheDigest = await computeGeminiTtsCacheDigest(playId, plan, narrationTts.model);

			if (state.activeId === playId && state.status === "loading") {
				stop();
				return;
			}

			if (state.activeId === playId && state.status === "playing") {
				stop();
				return;
			}

			if (
				state.activeId === playId &&
				state.status === "ready" &&
				preparedDigestRef.current.get(playId) === cacheDigest
			) {
				return;
			}

			abortRef.current?.abort();
			cleanupActiveAudio();
			const controller = new AbortController();
			abortRef.current = controller;
			const startedAtMs = Date.now();

			setState({
				activeId: playId,
				status: "loading",
				errorMessage: null,
				loadingMessage: "Preparing voice synthesis…",
				loadingStartedAtMs: startedAtMs,
			});

			const cachedWav =
				getGeminiTtsMemoryCache(cacheDigest) ?? (await readGeminiTtsCache(cacheDigest));

			if (cachedWav && !controller.signal.aborted) {
				setState((current) => {
					if (current.activeId !== playId || controller.signal.aborted) {
						return current;
					}
					return {
						...current,
						loadingMessage: "Loading cached audio…",
					};
				});

				try {
					loadPreparedSpeech(playId, cachedWav, cacheDigest);
					if (!controller.signal.aborted) {
						setState({
							activeId: playId,
							status: "ready",
							errorMessage: null,
							loadingMessage: null,
							loadingStartedAtMs: null,
						});
					}
				} catch {
					if (!controller.signal.aborted) {
						setState({
							activeId: playId,
							status: "error",
							errorMessage: "Unable to load cached audio.",
							loadingMessage: null,
							loadingStartedAtMs: null,
						});
					}
				}

				if (abortRef.current === controller) {
					abortRef.current = null;
				}
				return;
			}

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
						setState((current) => {
							if (current.activeId !== playId || current.status !== "loading") {
								return current;
							}
							return {
								...current,
								loadingMessage: message,
								loadingStartedAtMs: current.loadingStartedAtMs ?? startedAtMs,
							};
						});
					},
				});

				if (controller.signal.aborted) {
					return;
				}

				await writeGeminiTtsCache(cacheDigest, playId, wavBuffer);
				loadPreparedSpeech(playId, wavBuffer, cacheDigest);

				setState({
					activeId: playId,
					status: "ready",
					errorMessage: null,
					loadingMessage: null,
					loadingStartedAtMs: null,
				});
			} catch (error) {
				if (controller.signal.aborted) {
					return;
				}
				setState({
					activeId: playId,
					status: "error",
					errorMessage:
						error instanceof Error ? error.message : "Unable to synthesize speech audio.",
					loadingMessage: null,
					loadingStartedAtMs: null,
				});
			} finally {
				if (abortRef.current === controller) {
					abortRef.current = null;
				}
			}
		},
		[aiSettings, cleanupActiveAudio, loadPreparedSpeech, state.activeId, state.status, stop],
	);

	const getItemStatus = useCallback(
		(playId: string): GeminiTtsPlaybackStatus => {
			if (state.activeId !== playId) {
				return "idle";
			}
			return state.status;
		},
		[state.activeId, state.status],
	);

	const getLoadingDetail = useCallback(
		(playId: string): GeminiTtsLoadingDetail | null => {
			if (state.activeId !== playId || state.status !== "loading") {
				return null;
			}
			return {
				message: state.loadingMessage ?? "Synthesizing voice…",
				startedAtMs: state.loadingStartedAtMs ?? Date.now(),
			};
		},
		[state.activeId, state.loadingMessage, state.loadingStartedAtMs, state.status],
	);

	const value: GeminiTtsPlaybackContextValue = {
		activeId: state.activeId,
		status: state.status,
		errorMessage: state.errorMessage,
		getItemStatus,
		getLoadingDetail,
		prepareSpeechPlan,
		playPreparedSpeech,
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
