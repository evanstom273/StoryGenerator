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
import { synthesizeGeminiSpeechPlan } from "../../lib/ai/geminiTtsSynthesis";
import { resolveGeminiNarrationTtsSettings } from "../../lib/ai/geminiTtsVoices";
import type { SpeechSynthesisPlan } from "../../lib/storyText/messageSpeechText";

export type GeminiTtsPlaybackStatus = "idle" | "loading" | "playing" | "error";

interface GeminiTtsPlaybackState {
	activeId: string | null;
	status: GeminiTtsPlaybackStatus;
	errorMessage: string | null;
}

interface GeminiTtsPlaybackContextValue {
	activeId: string | null;
	status: GeminiTtsPlaybackStatus;
	errorMessage: string | null;
	getItemStatus: (playId: string) => GeminiTtsPlaybackStatus;
	playSpeechPlan: (playId: string, plan: SpeechSynthesisPlan) => Promise<void>;
	stop: () => void;
	hasGeminiKey: boolean;
}

const GeminiTtsPlaybackContext = createContext<GeminiTtsPlaybackContextValue | null>(null);

export function GeminiTtsPlaybackProvider({ children }: { children: ReactNode }) {
	const { aiSettings } = useStoryEngine();
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const objectUrlRef = useRef<string | null>(null);
	const abortRef = useRef<AbortController | null>(null);
	const [state, setState] = useState<GeminiTtsPlaybackState>({
		activeId: null,
		status: "idle",
		errorMessage: null,
	});

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
		setState({ activeId: null, status: "idle", errorMessage: null });
	}, [cleanupAudio]);

	useEffect(() => {
		return () => {
			abortRef.current?.abort();
			cleanupAudio();
		};
	}, [cleanupAudio]);

	const playSpeechPlan = useCallback(
		async (playId: string, plan: SpeechSynthesisPlan) => {
			const apiKey = aiSettings?.apiKeys?.gemini?.trim() ?? "";
			if (!apiKey) {
				setState({
					activeId: playId,
					status: "error",
					errorMessage: "Add a Gemini API key in Settings → AI to play audio.",
				});
				return;
			}

			if (state.activeId === playId && state.status === "playing") {
				stop();
				return;
			}

			stop();
			const controller = new AbortController();
			abortRef.current = controller;
			const narrationTts = resolveGeminiNarrationTtsSettings(aiSettings?.geminiNarrationTts);

			setState({
				activeId: playId,
				status: "loading",
				errorMessage: null,
			});

			try {
				const wavBuffer = await synthesizeGeminiSpeechPlan({
					apiKey,
					plan,
					model: narrationTts.model,
					signal: controller.signal,
				});

				if (controller.signal.aborted) {
					return;
				}

				cleanupAudio();
				const blob = new Blob([wavBuffer], { type: "audio/wav" });
				const url = URL.createObjectURL(blob);
				objectUrlRef.current = url;
				const audio = new Audio(url);
				audioRef.current = audio;

				audio.onended = () => {
					cleanupAudio();
					setState({ activeId: null, status: "idle", errorMessage: null });
				};
				audio.onerror = () => {
					cleanupAudio();
					setState({
						activeId: playId,
						status: "error",
						errorMessage: "Unable to play synthesized audio.",
					});
				};

				await audio.play();
				setState({
					activeId: playId,
					status: "playing",
					errorMessage: null,
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
				});
			} finally {
				if (abortRef.current === controller) {
					abortRef.current = null;
				}
			}
		},
		[aiSettings, cleanupAudio, state.activeId, state.status, stop],
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

	const value: GeminiTtsPlaybackContextValue = {
		activeId: state.activeId,
		status: state.status,
		errorMessage: state.errorMessage,
		getItemStatus,
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
