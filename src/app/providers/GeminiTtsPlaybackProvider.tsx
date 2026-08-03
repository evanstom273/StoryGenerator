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

export type GeminiTtsPlaybackStatus = "idle" | "loading" | "playing" | "error";

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

interface GeminiTtsPlaybackContextValue {
	activeId: string | null;
	status: GeminiTtsPlaybackStatus;
	errorMessage: string | null;
	getItemStatus: (playId: string) => GeminiTtsPlaybackStatus;
	getLoadingDetail: (playId: string) => GeminiTtsLoadingDetail | null;
	playSpeechPlan: (playId: string, plan: SpeechSynthesisPlan) => Promise<void>;
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
	const abortRef = useRef<AbortController | null>(null);
	const [state, setState] = useState<GeminiTtsPlaybackState>(IDLE_STATE);

	const hasGeminiKey = Boolean(aiSettings?.apiKeys?.gemini?.trim());

	const cleanupAudio = useCallback(() => {
		if (audioRef.current) {
			audioRef.current.pause();
			audioRef.current.src = "";
			audioRef.current = null;
		}
		if (objectUrlRef.current) {
			URL.revokeObjectURL(objectUrlRef.current);
			objectUrlRef.current = null;
		}
	}, []);

	const stop = useCallback(() => {
		abortRef.current?.abort();
		abortRef.current = null;
		cleanupAudio();
		setState(IDLE_STATE);
	}, [cleanupAudio]);

	useEffect(() => {
		return () => {
			abortRef.current?.abort();
			cleanupAudio();
		};
	}, [cleanupAudio]);

	const playWavBuffer = useCallback(
		async (playId: string, wavBuffer: ArrayBuffer | Uint8Array) => {
			cleanupAudio();
			const wavBytes = wavBuffer instanceof Uint8Array ? wavBuffer : new Uint8Array(wavBuffer);
			const blob = new Blob([Uint8Array.from(wavBytes)], { type: "audio/wav" });
			const url = URL.createObjectURL(blob);
			objectUrlRef.current = url;
			const audio = new Audio(url);
			audioRef.current = audio;

			audio.onended = () => {
				cleanupAudio();
				setState(IDLE_STATE);
			};
			audio.onerror = () => {
				cleanupAudio();
				setState({
					activeId: playId,
					status: "error",
					errorMessage: "Unable to play synthesized audio.",
					loadingMessage: null,
					loadingStartedAtMs: null,
				});
			};

			await audio.play();
			setState({
				activeId: playId,
				status: "playing",
				errorMessage: null,
				loadingMessage: null,
				loadingStartedAtMs: null,
			});
		},
		[cleanupAudio],
	);

	const playSpeechPlan = useCallback(
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

			if (state.activeId === playId && state.status === "playing") {
				stop();
				return;
			}

			if (state.activeId === playId && state.status === "loading") {
				stop();
				return;
			}

			stop();
			const controller = new AbortController();
			abortRef.current = controller;
			const narrationTts = resolveGeminiNarrationTtsSettings(aiSettings?.geminiNarrationTts);
			const startedAtMs = Date.now();
			const cacheDigest = await computeGeminiTtsCacheDigest(playId, plan, narrationTts.model);

			const cachedWav =
				getGeminiTtsMemoryCache(cacheDigest) ?? (await readGeminiTtsCache(cacheDigest));

			if (cachedWav && !controller.signal.aborted) {
				setState({
					activeId: playId,
					status: "loading",
					errorMessage: null,
					loadingMessage: "Loading cached audio…",
					loadingStartedAtMs: startedAtMs,
				});

				try {
					await playWavBuffer(playId, cachedWav);
				} catch {
					if (!controller.signal.aborted) {
						setState({
							activeId: playId,
							status: "error",
							errorMessage: "Unable to play cached audio.",
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

			setState({
				activeId: playId,
				status: "loading",
				errorMessage: null,
				loadingMessage: "Preparing voice synthesis…",
				loadingStartedAtMs: startedAtMs,
			});

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

				setState((current) => {
					if (current.activeId !== playId) {
						return current;
					}
					return {
						...current,
						loadingMessage: "Starting playback…",
					};
				});

				await playWavBuffer(playId, wavBuffer);
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
		[aiSettings, playWavBuffer, state.activeId, state.status, stop],
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
		playSpeechPlan,
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
