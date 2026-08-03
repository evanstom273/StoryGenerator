import { useEffect, useRef, useState } from "react";
import { Field, SelectInput, TextAreaInput } from "../forms/Fields";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Panel";
import { useStoryEngine } from "../../app/providers/StoryEngineProvider";
import { downloadFile } from "../../lib/download";
import { isGenerationFailureError } from "../../lib/ai/errors";
import {
	GEMINI_TTS_MODEL_OPTIONS,
	GEMINI_TTS_VOICE_CATALOG,
	GEMINI_TTS_VOICE_GROUP_LABELS,
	resolveGeminiPodcastTtsSettings,
	type GeminiTtsVoiceGroup,
} from "../../lib/ai/geminiTtsVoices";
import {
	AI_DOCUMENT_CUSTOM_PRESET_ID,
	AI_DOCUMENT_PRESETS,
	buildAiDocumentFilename,
	getAiDocumentPreset,
	type AiDocumentPresetId,
} from "../../lib/aiDocumentGenerator/presets";
import type { AiDocumentOutputFormat, AiDocumentStructure } from "../../lib/aiDocumentGenerator/types";
import { readMarkdownUploadFile, readUploadedSourceFile } from "../../lib/aiDocumentGenerator/sourceMaterial";

type SourceMode = "library" | "upload";

export function AiDocumentGeneratorTab() {
	const {
		stories,
		aiSettings,
		saveAISettings,
		generateAiDocument,
		generateAiDocumentAudioFromMarkdown,
	} = useStoryEngine();
	const [sourceMode, setSourceMode] = useState<SourceMode>("library");
	const [storyId, setStoryId] = useState("");
	const [uploadFile, setUploadFile] = useState<File | null>(null);
	const [markdownAudioFile, setMarkdownAudioFile] = useState<File | null>(null);
	const [presetId, setPresetId] = useState<AiDocumentPresetId>("podcast-chapter-breakdown");
	const [structure, setStructure] = useState<AiDocumentStructure>("chapter-by-chapter");
	const [outputFormat, setOutputFormat] = useState<AiDocumentOutputFormat>("markdown");
	const [customPrompt, setCustomPrompt] = useState("");
	const [statusMessage, setStatusMessage] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [audioStatusMessage, setAudioStatusMessage] = useState<string | null>(null);
	const [audioErrorMessage, setAudioErrorMessage] = useState<string | null>(null);
	const [isGenerating, setIsGenerating] = useState(false);
	const abortRef = useRef<AbortController | null>(null);
	const uploadAudioResumeRef = useRef<{ key: string; pcmParts: Uint8Array[] } | null>(null);
	const documentAudioResumeRef = useRef<{ key: string; pcmParts: Uint8Array[] } | null>(null);

	const selectedPreset = getAiDocumentPreset(presetId);
	const hasGeminiKey = Boolean(aiSettings?.apiKeys?.gemini?.trim());
	const podcastTts = resolveGeminiPodcastTtsSettings(aiSettings?.geminiPodcastTts);

	async function persistPodcastTts(
		patch: Partial<{
			hostOneVoice: string;
			hostTwoVoice: string;
			model: string;
		}>,
	) {
		if (!aiSettings) {
			return;
		}

		await saveAISettings({
			activeProviderType: aiSettings.activeProviderType,
			geminiPodcastTts: {
				...podcastTts,
				...patch,
			},
		});
	}

	const voiceGroups = GEMINI_TTS_VOICE_CATALOG.reduce<
		Record<GeminiTtsVoiceGroup, typeof GEMINI_TTS_VOICE_CATALOG>
	>((groups, voice) => {
		groups[voice.group].push(voice);
		return groups;
	}, {
		narration: [],
		podcast: [],
		news: [],
		warm: [],
		expressive: [],
		other: [],
	});

	useEffect(() => {
		if (!storyId && stories[0]?.id) {
			setStoryId(stories[0].id);
		}
	}, [storyId, stories]);

	useEffect(() => {
		if (selectedPreset.defaultStructure) {
			setStructure(selectedPreset.defaultStructure);
		}
	}, [presetId, selectedPreset.defaultStructure]);

	useEffect(() => {
		if (!selectedPreset.supportsGeminiTts && outputFormat === "gemini-audio-wav") {
			setOutputFormat("markdown");
		}
	}, [outputFormat, selectedPreset.supportsGeminiTts]);

	async function handleGenerate() {
		setErrorMessage(null);
		setStatusMessage(null);

		if (sourceMode === "library" && !storyId) {
			setErrorMessage("Select a story from your library.");
			return;
		}

		if (sourceMode === "upload" && !uploadFile) {
			setErrorMessage("Upload a Story Engine export file.");
			return;
		}

		if (presetId === AI_DOCUMENT_CUSTOM_PRESET_ID && !customPrompt.trim()) {
			setErrorMessage("Describe the custom document you want generated.");
			return;
		}

		if (outputFormat === "gemini-audio-wav" && !hasGeminiKey) {
			setErrorMessage("Add a Gemini API key in Settings → AI to generate podcast audio.");
			return;
		}

		setIsGenerating(true);
		const controller = new AbortController();
		abortRef.current = controller;

		try {
			let source:
				| { type: "story"; storyId: string; label: string }
				| { type: "upload"; text: string; label: string };

			if (sourceMode === "library") {
				const story = stories.find((entry) => entry.id === storyId);
				if (!story) {
					throw new Error("Story not found.");
				}
				source = {
					type: "story",
					storyId,
					label: story.title,
				};
			} else {
				const text = await readUploadedSourceFile(uploadFile!);
				source = {
					type: "upload",
					text,
					label: uploadFile!.name,
				};
			}

			setStatusMessage(
				outputFormat === "gemini-audio-wav"
					? "Generating document and Gemini audio…"
					: "Generating document…",
			);

			const sourceKey =
				sourceMode === "library"
					? `story:${storyId}`
					: `upload:${uploadFile!.name}:${uploadFile!.size}`;
			const audioResume =
				outputFormat === "gemini-audio-wav" &&
				documentAudioResumeRef.current?.key === sourceKey
					? { pcmParts: documentAudioResumeRef.current.pcmParts }
					: undefined;

			const result = await generateAiDocument({
				source,
				presetId,
				customPrompt: presetId === AI_DOCUMENT_CUSTOM_PRESET_ID ? customPrompt : undefined,
				structure,
				outputFormat,
				signal: controller.signal,
				onProgress: (message) => setStatusMessage(message),
				audioResume,
				onAudioChunkComplete:
					outputFormat === "gemini-audio-wav"
						? (state) => {
								documentAudioResumeRef.current = {
									key: sourceKey,
									pcmParts: state.pcmParts,
								};
								setStatusMessage(`Generating audio ${state.index + 1}/${state.total}…`);
							}
						: undefined,
			});

			await downloadFile(result.filename, result.content, result.mimeType);
			documentAudioResumeRef.current = null;
			setStatusMessage(`Downloaded ${result.filename}`);
		} catch (error) {
			if (isGenerationFailureError(error)) {
				const failure = error.failure;
				const isSilentCancel = failure.kind === "cancelled";
				if (isSilentCancel) {
					setStatusMessage("Generation cancelled.");
				} else {
					setErrorMessage(failure.summaryMessage);
				}
			} else if (error instanceof Error && /abort/i.test(error.message)) {
				setStatusMessage("Generation cancelled.");
			} else {
				setErrorMessage(error instanceof Error ? error.message : "Unable to generate the document.");
			}
		} finally {
			setIsGenerating(false);
			abortRef.current = null;
		}
	}

	function handleCancel() {
		abortRef.current?.abort();
		documentAudioResumeRef.current = null;
		uploadAudioResumeRef.current = null;
	}

	async function handleGenerateAudioFromMarkdown() {
		setAudioErrorMessage(null);
		setAudioStatusMessage(null);

		if (!markdownAudioFile) {
			setAudioErrorMessage("Upload a Markdown file from a previous generator export.");
			return;
		}

		if (!hasGeminiKey) {
			setAudioErrorMessage("Add a Gemini API key in Settings → AI to generate podcast audio.");
			return;
		}

		setIsGenerating(true);
		const controller = new AbortController();
		abortRef.current = controller;

		try {
			const markdown = await readMarkdownUploadFile(markdownAudioFile);
			const resumeKey = `${markdownAudioFile.name}:${markdown.length}`;
			const resume =
				uploadAudioResumeRef.current?.key === resumeKey
					? { pcmParts: uploadAudioResumeRef.current.pcmParts }
					: undefined;

			setAudioStatusMessage(
				resume
					? `Resuming audio at ${resume.pcmParts.length + 1}/…`
					: "Generating Gemini podcast audio…",
			);

			const result = await generateAiDocumentAudioFromMarkdown({
				markdown,
				label: markdownAudioFile.name,
				signal: controller.signal,
				resume,
				onProgress: (message) => setAudioStatusMessage(message),
				onChunkComplete: (state) => {
					uploadAudioResumeRef.current = {
						key: resumeKey,
						pcmParts: state.pcmParts,
					};
					setAudioStatusMessage(`Generating audio ${state.index + 1}/${state.total}…`);
				},
			});

			await downloadFile(result.filename, result.content, result.mimeType);
			uploadAudioResumeRef.current = null;
			setAudioStatusMessage(`Downloaded ${result.filename}`);
		} catch (error) {
			if (isGenerationFailureError(error)) {
				const failure = error.failure;
				const isSilentCancel = failure.kind === "cancelled";
				if (isSilentCancel) {
					setAudioStatusMessage("Generation cancelled.");
				} else {
					setAudioErrorMessage(failure.summaryMessage);
				}
			} else if (error instanceof Error && /abort/i.test(error.message)) {
				setAudioStatusMessage("Generation cancelled.");
			} else {
				setAudioErrorMessage(error instanceof Error ? error.message : "Unable to generate audio.");
			}
		} finally {
			setIsGenerating(false);
			abortRef.current = null;
		}
	}

	const outputExtension = outputFormat === "gemini-audio-wav" ? "wav" : "md";

	return (
		<div className="space-y-6">
			<Panel variant="flat">
				<div className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">
					AI Document Generator
				</div>
				<p className="mt-2 text-[13px] leading-6 text-ink-muted">
					Generate companion documents about a story — chapter-by-chapter podcast breakdowns,
					thematic discussions, guides, and more. Optionally export podcast audio with Gemini TTS.
					Read-only: stories, archives, and exports are never modified.
				</p>
			</Panel>

			{hasGeminiKey ? (
				<Panel variant="flat" padding="lg">
					<div className="space-y-6">
						<div>
							<div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">
								Gemini podcast voices
							</div>
							<p className="mt-2 text-[13px] leading-6 text-ink-muted">
								Choose voices for Sam and Alex (or whatever host names appear in your Markdown).
								Gemini offers 30 prebuilt narrators — not separate voicing models. Pick a TTS model
								below; the app falls back to 2.5 if 3.1 is unavailable.
							</p>
						</div>

						<div className="grid gap-6 md:grid-cols-2">
							<Field
								label="Sam voice (host one)"
								hint={podcastTts.hostOneVoice}
							>
								<SelectInput
									value={podcastTts.hostOneVoice}
									onChange={(event) =>
										void persistPodcastTts({ hostOneVoice: event.target.value })
									}
									disabled={isGenerating}
								>
									{(Object.keys(voiceGroups) as GeminiTtsVoiceGroup[]).map((group) => {
										const voices = voiceGroups[group];
										if (!voices.length) {
											return null;
										}
										return (
											<optgroup key={group} label={GEMINI_TTS_VOICE_GROUP_LABELS[group]}>
												{voices.map((voice) => (
													<option key={voice.id} value={voice.id}>
														{voice.label} — {voice.description}
													</option>
												))}
											</optgroup>
										);
									})}
								</SelectInput>
							</Field>
							<Field
								label="Alex voice (host two)"
								hint={podcastTts.hostTwoVoice}
							>
								<SelectInput
									value={podcastTts.hostTwoVoice}
									onChange={(event) =>
										void persistPodcastTts({ hostTwoVoice: event.target.value })
									}
									disabled={isGenerating}
								>
									{(Object.keys(voiceGroups) as GeminiTtsVoiceGroup[]).map((group) => {
										const voices = voiceGroups[group];
										if (!voices.length) {
											return null;
										}
										return (
											<optgroup key={group} label={GEMINI_TTS_VOICE_GROUP_LABELS[group]}>
												{voices.map((voice) => (
													<option key={voice.id} value={voice.id}>
														{voice.label} — {voice.description}
													</option>
												))}
											</optgroup>
										);
									})}
								</SelectInput>
							</Field>
						</div>

						<Field label="TTS model">
							<SelectInput
								value={podcastTts.model}
								onChange={(event) => void persistPodcastTts({ model: event.target.value })}
								disabled={isGenerating}
							>
								{GEMINI_TTS_MODEL_OPTIONS.map((model) => (
									<option key={model.id} value={model.id}>
										{model.label} — {model.description}
									</option>
								))}
							</SelectInput>
						</Field>
					</div>
				</Panel>
			) : null}

			<Panel variant="flat" padding="lg">
				<div className="space-y-8">
					<div className="space-y-4">
						<div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">Source</div>
						<div className="grid gap-2 sm:grid-cols-2">
							<Button
								type="button"
								variant={sourceMode === "library" ? "secondary" : "ghost"}
								onClick={() => setSourceMode("library")}
								disabled={isGenerating}
							>
								Library story
							</Button>
							<Button
								type="button"
								variant={sourceMode === "upload" ? "secondary" : "ghost"}
								onClick={() => setSourceMode("upload")}
								disabled={isGenerating}
							>
								Upload export
							</Button>
						</div>

						{sourceMode === "library" ? (
							<Field label="Story" hint="From your Story Engine library">
								<SelectInput
									value={storyId}
									onChange={(event) => setStoryId(event.target.value)}
									disabled={isGenerating || !stories.length}
								>
									{stories.length ? (
										stories.map((story) => (
											<option key={story.id} value={story.id}>{story.title}</option>
										))
									) : (
										<option value="">No stories yet</option>
									)}
								</SelectInput>
							</Field>
						) : (
							<Field label="Export file" hint="Archive PDF, Markdown, or TXT">
								<input
									type="file"
									accept=".pdf,.md,.markdown,.txt,application/pdf,text/markdown,text/plain"
									disabled={isGenerating}
									className="block w-full text-sm text-ink-muted file:mr-3 file:rounded-[8px] file:border-0 file:bg-white/[0.06] file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-ink hover:file:bg-white/[0.09]"
									onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
								/>
							</Field>
						)}
					</div>

					<div className="space-y-4">
						<div className="grid gap-6 md:grid-cols-2">
							<Field label="Document type">
								<SelectInput
									value={presetId}
									onChange={(event) => setPresetId(event.target.value as AiDocumentPresetId)}
									disabled={isGenerating}
								>
									{AI_DOCUMENT_PRESETS.map((preset) => (
										<option key={preset.id} value={preset.id}>{preset.displayName}</option>
									))}
								</SelectInput>
							</Field>
							<Field label="Structure">
								<SelectInput
									value={structure}
									onChange={(event) =>
										setStructure(event.target.value as AiDocumentStructure)
									}
									disabled={isGenerating}
								>
									<option value="chapter-by-chapter">Chapter-by-chapter breakdown</option>
									<option value="single">Single document</option>
								</SelectInput>
							</Field>
						</div>

						{selectedPreset.supportsGeminiTts ? (
							<Field
								label="Output"
								hint={
									hasGeminiKey
										? "Gemini audio uses your Gemini API key"
										: "Add a Gemini API key in Settings → AI for audio"
								}
							>
								<SelectInput
									value={outputFormat}
									onChange={(event) =>
										setOutputFormat(event.target.value as AiDocumentOutputFormat)
									}
									disabled={isGenerating || (!hasGeminiKey && outputFormat === "markdown")}
								>
									<option value="markdown">Markdown document</option>
									<option value="gemini-audio-wav" disabled={!hasGeminiKey}>
										Gemini podcast audio (WAV)
									</option>
								</SelectInput>
							</Field>
						) : null}

						{presetId === AI_DOCUMENT_CUSTOM_PRESET_ID ? (
							<Field label="Custom instructions" hint="Describe the document to generate">
								<TextAreaInput
									value={customPrompt}
									onChange={(event) => setCustomPrompt(event.target.value)}
									disabled={isGenerating}
									placeholder="Example: A chapter-by-chapter podcast recap with a summary table at the end."
								/>
							</Field>
						) : (
							<div className="rounded-[8px] border border-divider/[0.35] bg-panel-muted/40 px-3.5 py-3 text-[12px] leading-6 text-ink-muted">
								{selectedPreset.displayName} — output:{" "}
								<span className="font-medium text-ink-soft">
									{buildAiDocumentFilename(selectedPreset.filenameStem, undefined, outputExtension)}
								</span>
								{structure === "chapter-by-chapter" ? (
									<span className="block mt-1 text-[11px]">
										Generates each chapter section separately, then summary, themes, and open questions.
									</span>
								) : null}
							</div>
						)}
					</div>

					{statusMessage ? (
						<div className="rounded-[8px] border border-emerald-400/20 bg-emerald-400/10 px-3.5 py-3 text-sm text-emerald-200">
							{statusMessage}
						</div>
					) : null}
					{errorMessage ? (
						<div className="rounded-[8px] border border-rose-400/20 bg-rose-400/10 px-3.5 py-3 text-sm text-rose-200">
							{errorMessage}
						</div>
					) : null}

					<div className="flex flex-wrap gap-3">
						<Button type="button" onClick={() => void handleGenerate()} disabled={isGenerating}>
							{isGenerating ? "Generating…" : errorMessage ? "Retry" : "Generate"}
						</Button>
						{isGenerating ? (
							<Button type="button" variant="secondary" onClick={handleCancel}>
								Cancel
							</Button>
						) : null}
					</div>
				</div>
			</Panel>

			<Panel variant="flat" padding="lg">
				<div className="space-y-6">
					<div>
						<div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">
							Audio from Markdown
						</div>
						<p className="mt-2 text-[13px] leading-6 text-ink-muted">
							Upload a podcast Markdown export to generate Gemini TTS audio without re-running document
							generation. Use files from this tool or compatible exports with labeled host dialogue.
						</p>
					</div>

					<Field
						label="Markdown file"
						hint={
							hasGeminiKey
								? "Podcast chapter breakdown or discussion exports (.md)"
								: "Add a Gemini API key in Settings → AI for audio"
						}
					>
						<input
							type="file"
							accept=".md,.markdown,text/markdown"
							disabled={isGenerating}
							className="block w-full text-sm text-ink-muted file:mr-3 file:rounded-[8px] file:border-0 file:bg-white/[0.06] file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-ink hover:file:bg-white/[0.09]"
							onChange={(event) => {
								setMarkdownAudioFile(event.target.files?.[0] ?? null);
								uploadAudioResumeRef.current = null;
							}}
						/>
					</Field>

					{audioStatusMessage ? (
						<div className="rounded-[8px] border border-emerald-400/20 bg-emerald-400/10 px-3.5 py-3 text-sm text-emerald-200">
							{audioStatusMessage}
						</div>
					) : null}
					{audioErrorMessage ? (
						<div className="rounded-[8px] border border-rose-400/20 bg-rose-400/10 px-3.5 py-3 text-sm text-rose-200">
							{audioErrorMessage}
						</div>
					) : null}

					<div className="flex flex-wrap gap-3">
						<Button
							type="button"
							onClick={() => void handleGenerateAudioFromMarkdown()}
							disabled={isGenerating || !hasGeminiKey}
						>
							{isGenerating ? "Generating…" : audioErrorMessage ? "Retry" : "Generate audio"}
						</Button>
						{isGenerating ? (
							<Button type="button" variant="secondary" onClick={handleCancel}>
								Cancel
							</Button>
						) : null}
					</div>
				</div>
			</Panel>
		</div>
	);
}
