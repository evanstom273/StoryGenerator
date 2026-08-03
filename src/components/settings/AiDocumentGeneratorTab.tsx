import { useEffect, useRef, useState } from "react";
import { Field, SelectInput, TextAreaInput } from "../forms/Fields";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Panel";
import { useStoryEngine } from "../../app/providers/StoryEngineProvider";
import { downloadFile } from "../../lib/download";
import { isGenerationFailureError } from "../../lib/ai/errors";
import {
	AI_DOCUMENT_CUSTOM_PRESET_ID,
	AI_DOCUMENT_PRESETS,
	buildAiDocumentFilename,
	getAiDocumentPreset,
	type AiDocumentPresetId,
} from "../../lib/aiDocumentGenerator/presets";
import { readUploadedSourceFile } from "../../lib/aiDocumentGenerator/sourceMaterial";

type SourceMode = "library" | "upload";

export function AiDocumentGeneratorTab() {
	const { stories, generateAiDocument } = useStoryEngine();
	const [sourceMode, setSourceMode] = useState<SourceMode>("library");
	const [storyId, setStoryId] = useState("");
	const [uploadFile, setUploadFile] = useState<File | null>(null);
	const [presetId, setPresetId] = useState<AiDocumentPresetId>("story-summary");
	const [customPrompt, setCustomPrompt] = useState("");
	const [statusMessage, setStatusMessage] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [isGenerating, setIsGenerating] = useState(false);
	const abortRef = useRef<AbortController | null>(null);

	useEffect(() => {
		if (!storyId && stories[0]?.id) {
			setStoryId(stories[0].id);
		}
	}, [storyId, stories]);

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

			setStatusMessage("Generating document…");

			const result = await generateAiDocument({
				source,
				presetId,
				customPrompt: presetId === AI_DOCUMENT_CUSTOM_PRESET_ID ? customPrompt : undefined,
				signal: controller.signal,
			});

			await downloadFile(result.filename, result.markdown, "text/markdown");
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
	}

	return (
		<div className="space-y-6">
			<Panel variant="flat">
				<div className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">
					AI Document Generator
				</div>
				<p className="mt-2 text-[13px] leading-6 text-ink-muted">
					Generate brand-new Markdown companion documents about a story. This tool is read-only — it
					does not modify stories, archives, indexes, or exports. Standard JSON, Markdown, TXT, and
					PDF exports remain unchanged.
				</p>
			</Panel>

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

						{presetId === AI_DOCUMENT_CUSTOM_PRESET_ID ? (
							<Field label="Custom instructions" hint="Describe the document to generate">
								<TextAreaInput
									value={customPrompt}
									onChange={(event) => setCustomPrompt(event.target.value)}
									disabled={isGenerating}
									placeholder="Example: A bullet-point production bible for adapting this story as a limited series."
								/>
							</Field>
						) : (
							<div className="rounded-[8px] border border-divider/[0.35] bg-panel-muted/40 px-3.5 py-3 text-[12px] leading-6 text-ink-muted">
								{getAiDocumentPreset(presetId).displayName} — output file:{" "}
								<span className="font-medium text-ink-soft">
									{buildAiDocumentFilename(getAiDocumentPreset(presetId).filenameStem)}
								</span>
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
		</div>
	);
}
