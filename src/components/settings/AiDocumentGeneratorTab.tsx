import { useEffect, useState } from "react";
import { Field, SelectInput, TextAreaInput } from "../forms/Fields";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Panel";
import { useStoryEngine } from "../../app/providers/StoryEngineProvider";
import { getBackgroundTaskProgressLabel } from "../../lib/backgroundTasks";
import {
	GEMINI_TTS_MODEL_OPTIONS,
	GEMINI_TTS_VOICE_CATALOG,
	GEMINI_TTS_VOICE_GROUP_LABELS,
	resolveGeminiPodcastTtsSettings,
	resolveGeminiNarrationTtsSettings,
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
		queueAiDocumentJob,
		queuePodcastAudioJob,
		cancelBackgroundJob,
		backgroundJobs,
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
	const [activeDocumentJobId, setActiveDocumentJobId] = useState<string | null>(null);
	const [activeAudioJobId, setActiveAudioJobId] = useState<string | null>(null);

	const selectedPreset = getAiDocumentPreset(presetId);
	const hasGeminiKey = Boolean(aiSettings?.apiKeys?.gemini?.trim());
	const podcastTts = resolveGeminiPodcastTtsSettings(aiSettings?.geminiPodcastTts);
	const narrationTts = resolveGeminiNarrationTtsSettings(aiSettings?.geminiNarrationTts);

	async function persistNarrationTts(
		patch: Partial<{
			voice: string;
			characterVoice: string;
			model: string;
		}>,
	) {
		if (!aiSettings) {
			return;
		}

		await saveAISettings({
			activeProviderType: aiSettings.activeProviderType,
			geminiNarrationTts: {
				...narrationTts,
				...patch,
			},
		});
	}

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

	useEffect(() => {
		if (!activeDocumentJobId) {
			return;
		}

		const job = backgroundJobs.find((entry) => entry.id === activeDocumentJobId);
		if (!job) {
			return;
		}

		if (job.status === "running" || job.status === "queued") {
			setIsGenerating(true);
			setStatusMessage(
				job.status === "queued"
					? "Queued…"
					: getBackgroundTaskProgressLabel(job),
			);
			return;
		}

		if (job.status === "complete") {
			setIsGenerating(false);
			setStatusMessage(job.result?.notificationBody ?? "Document generation complete.");
			setActiveDocumentJobId(null);
			return;
		}

		if (job.status === "failed") {
			setIsGenerating(false);
			setErrorMessage(job.error ?? "Document generation failed.");
			setActiveDocumentJobId(null);
			return;
		}

		if (job.status === "cancelled") {
			setIsGenerating(false);
			setStatusMessage("Generation cancelled.");
			setActiveDocumentJobId(null);
		}
	}, [activeDocumentJobId, backgroundJobs]);

	useEffect(() => {
		if (!activeAudioJobId) {
			return;
		}

		const job = backgroundJobs.find((entry) => entry.id === activeAudioJobId);
		if (!job) {
			return;
		}

		if (job.status === "running" || job.status === "queued") {
			setIsGenerating(true);
			setAudioStatusMessage(
				job.status === "queued"
					? "Queued…"
					: getBackgroundTaskProgressLabel(job),
			);
			return;
		}

		if (job.status === "complete") {
			setIsGenerating(false);
			setAudioStatusMessage(job.result?.notificationBody ?? "Podcast audio ready.");
			setActiveAudioJobId(null);
			return;
		}

		if (job.status === "failed") {
			setIsGenerating(false);
			setAudioErrorMessage(job.error ?? "Podcast audio generation failed.");
			setActiveAudioJobId(null);
			return;
		}

		if (job.status === "cancelled") {
			setIsGenerating(false);
			setAudioStatusMessage("Generation cancelled.");
			setActiveAudioJobId(null);
		}
	}, [activeAudioJobId, backgroundJobs]);

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

			const result = await queueAiDocumentJob({
				source,
				presetId,
				customPrompt: presetId === AI_DOCUMENT_CUSTOM_PRESET_ID ? customPrompt : undefined,
				structure,
				outputFormat,
			});

			if (result.duplicate) {
				setStatusMessage("This document is already queued or running.");
			} else {
				setStatusMessage("Generation queued. You can leave this page while it runs.");
			}
			setActiveDocumentJobId(result.job.id);
		} catch (error) {
			setIsGenerating(false);
			setErrorMessage(error instanceof Error ? error.message : "Unable to queue document generation.");
		}
	}

	function handleCancel() {
		if (activeDocumentJobId) {
			void cancelBackgroundJob(activeDocumentJobId);
		}
		if (activeAudioJobId) {
			void cancelBackgroundJob(activeAudioJobId);
		}
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
		try {
			const markdown = await readMarkdownUploadFile(markdownAudioFile);
			const result = await queuePodcastAudioJob({
				markdown,
				label: markdownAudioFile.name,
			});

			if (result.duplicate) {
				setAudioStatusMessage("Podcast audio is already queued or running for this file.");
			} else {
				setAudioStatusMessage("Podcast audio queued. You can leave this page while it runs.");
			}
			setActiveAudioJobId(result.job.id);
		} catch (error) {
			setIsGenerating(false);
			setAudioErrorMessage(error instanceof Error ? error.message : "Unable to queue podcast audio.");
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
								Gemini TTS voices
							</div>
							<p className="mt-2 text-[13px] leading-6 text-ink-muted">
								Configure podcast export voices and story/MetaChat playback (message play buttons,
								Listen to Chapter). Defaults favor clear, emotive narration.
							</p>
						</div>

						<div className="space-y-4 rounded-[8px] border border-divider/[0.35] bg-panel-muted/30 px-3.5 py-4">
							<div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
								Story & MetaChat playback
							</div>
							<div className="grid gap-6 md:grid-cols-2">
								<Field label="Narration voice" hint="Clear story narration — default Iapetus">
									<SelectInput
										value={narrationTts.voice}
										onChange={(event) =>
											void persistNarrationTts({ voice: event.target.value })
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
								<Field label="Character dialogue voice" hint="NPC lines — default Aoede">
									<SelectInput
										value={narrationTts.characterVoice}
										onChange={(event) =>
											void persistNarrationTts({ characterVoice: event.target.value })
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
							<Field label="Story TTS model">
								<SelectInput
									value={narrationTts.model}
									onChange={(event) => void persistNarrationTts({ model: event.target.value })}
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

						<div className="space-y-4">
							<div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
								Podcast document export
							</div>
							<div className="grid gap-6 md:grid-cols-2">
							<Field
								label="Morgan voice (host one)"
								hint={podcastTts.hostOneVoice}
								help="Voice for the first podcast host in generated recap scripts."
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
								label="Casey voice (host two)"
								hint={podcastTts.hostTwoVoice}
								help="Voice for the second podcast host in generated recap scripts."
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

							<Field label="Podcast TTS model">
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
							<Field label="Story" hint="From your Story Engine library" help="Pick a saved story to convert into a document or audio script.">
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
							<Field
								label="Document type"
								help="Choose a preset such as novelisation, podcast recap, or timeline summary. Each preset shapes structure and tone."
							>
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
							<Field
								label="Structure"
								help="Chapter-by-chapter writes one section per story chapter. Single document merges everything into one file."
							>
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
							<Field
								label="Custom instructions"
								hint="Describe the document to generate"
								help="Optional extra guidance for the AI — tone, audience, sections to include, or things to avoid."
							>
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
