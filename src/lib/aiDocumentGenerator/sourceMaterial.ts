import type { PlayerCharacter, StoryExportBundle, StoryMessage } from "../../types/models";
import { formatDateTime } from "../dates";
import { resolveMessageChapterBoundary } from "../storyText/chapterNavigation";
import { isAuthorDirectiveMessage } from "../storyText/authorDirectives";
import { isContinueMessage } from "../storyText/continueMode";
import { isDirectorMessage } from "../storyText/directorMode";
import { serializeStoryExport } from "../storyExport";
import type { ChapterSourceSegment } from "./types";
import { resolveNarrativeProtagonistName } from "../narrativeIdentity";
import { resolvePlayerCharacterSceneName } from "../playerCharacterPrompt";
import { safeParseStoryStateData } from "../storyStateV2";

const MAX_SOURCE_CHARS = 140000;
const MAX_CHAPTER_SOURCE_CHARS = 32000;

function truncateSourceMaterial(text: string, maxChars = MAX_SOURCE_CHARS) {
	const trimmed = text.trim();
	if (trimmed.length <= maxChars) {
		return trimmed;
	}

	return `${trimmed.slice(0, maxChars).trim()}\n\n[Source truncated for model context limits.]`;
}

function resolveSpeakerLabel(
	message: StoryMessage,
	playerCharacter: PlayerCharacter,
	storyStateJson?: string | null,
) {
	const storyState = storyStateJson?.trim() ? safeParseStoryStateData(storyStateJson) : null;
	const sceneName = resolvePlayerCharacterSceneName(playerCharacter, { storyState });
	if (message.role === "user") {
		if (isAuthorDirectiveMessage(message)) {
			return message.speakerName?.trim() || "Author";
		}
		if (isContinueMessage(message)) {
			return "Continue";
		}
		if (isDirectorMessage(message)) {
			return "Director";
		}
		return message.speakerName?.trim() || sceneName;
	}

	if (message.role === "system" || message.speakerType === "system") {
		return "System";
	}

	if (message.speakerName?.trim()) {
		return message.speakerName.trim();
	}

	if (message.speakerType === "narrator") {
		return "Narrator";
	}

	return message.role === "assistant" ? "Narrator" : "System";
}

function formatMessageLine(
	message: StoryMessage,
	playerCharacter: PlayerCharacter,
	storyStateJson?: string | null,
) {
	const speaker = resolveSpeakerLabel(message, playerCharacter, storyStateJson);
	const prefix = speaker ? `${speaker}: ` : "";
	return `[${formatDateTime(message.timestamp)}] ${prefix}${message.content.trim()}`;
}

export function segmentStoryBundleByChapter(bundle: StoryExportBundle): ChapterSourceSegment[] {
	const sortedMessages = [...bundle.messages].sort(
		(left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
	);

	if (!sortedMessages.length) {
		return [];
	}

	const segments: ChapterSourceSegment[] = [];
	let currentLabel = "Opening";
	let currentLines: string[] = [];

	const pushSegment = () => {
		if (!currentLines.length) {
			return;
		}
		segments.push({
			label: currentLabel,
			transcript: truncateSourceMaterial(currentLines.join("\n"), MAX_CHAPTER_SOURCE_CHARS),
		});
	};

	for (const message of sortedMessages) {
		const boundary = resolveMessageChapterBoundary(message);
		if (boundary?.kind === "start") {
			pushSegment();
			currentLines = [];
			currentLabel = boundary.label.trim() || "Chapter";
		}
		currentLines.push(formatMessageLine(message, bundle.playerCharacter, bundle.storyState?.stateJson));
	}

	pushSegment();

	if (segments.length === 1 && segments[0]?.label === "Opening") {
		segments[0] = {
			label: "Chapter I",
			transcript: segments[0].transcript,
		};
	}

	return segments;
}

export function buildChapterSegmentedSourceMaterial(bundle: StoryExportBundle) {
	const segments = segmentStoryBundleByChapter(bundle);
	if (!segments.length) {
		return buildSourceMaterialFromStoryBundle(bundle);
	}

	const storyState = bundle.storyState?.stateJson?.trim()
		? safeParseStoryStateData(bundle.storyState.stateJson)
		: null;
	const header = [
		`Story: ${bundle.story.title}`,
		`Universe: ${bundle.universe.name}`,
		`Protagonist: ${resolveNarrativeProtagonistName(bundle.playerCharacter, storyState, bundle.messages)}`,
		`Summary: ${bundle.story.currentSummary?.trim() || "No summary provided."}`,
		"",
		"The transcript below is split by chapter. Cover every chapter in order.",
	].join("\n");

	const body = segments
		.map((segment) => [`## ${segment.label}`, "", segment.transcript, ""].join("\n"))
		.join("\n");

	return truncateSourceMaterial(`${header}\n\n${body}`);
}

export function buildSourceMaterialFromStoryBundle(bundle: StoryExportBundle) {
	const markdown = serializeStoryExport(bundle, "markdown");
	const raw =
		typeof markdown.content === "string"
			? markdown.content
			: new TextDecoder().decode(markdown.content as ArrayBuffer);
	return truncateSourceMaterial(raw);
}

export function segmentUploadedSourceByChapter(text: string): ChapterSourceSegment[] {
	const pattern = /^##\s+(.+)$/gm;
	const matches = [...text.matchAll(pattern)];
	if (!matches.length) {
		return [{ label: "Full Story", transcript: truncateSourceMaterial(text, MAX_CHAPTER_SOURCE_CHARS) }];
	}

	const segments: ChapterSourceSegment[] = [];
	for (let index = 0; index < matches.length; index += 1) {
		const match = matches[index]!;
		const label = match[1]!.trim();
		const start = match.index ?? 0;
		const end = index + 1 < matches.length ? matches[index + 1]!.index ?? text.length : text.length;
		const body = text.slice(start, end).replace(/^##\s+.+$/m, "").trim();
		if (body) {
			segments.push({
				label,
				transcript: truncateSourceMaterial(body, MAX_CHAPTER_SOURCE_CHARS),
			});
		}
	}

	return segments.length ? segments : [{ label: "Full Story", transcript: truncateSourceMaterial(text, MAX_CHAPTER_SOURCE_CHARS) }];
}

export async function readMarkdownUploadFile(file: File) {
	const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
	if (extension !== "md" && extension !== "markdown") {
		throw new Error("Upload a Markdown (.md) file from a previous generator export.");
	}

	const text = await readFileAsText(file);
	if (!text.trim()) {
		throw new Error("The uploaded Markdown file is empty.");
	}

	return text;
}

export function buildAudioFilenameFromMarkdownUpload(filename: string) {
	const base = filename.replace(/\.(md|markdown)$/i, "").trim();
	const safe = base
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return safe ? `${safe}.wav` : "podcast-audio.wav";
}

export async function readUploadedSourceFile(file: File) {
	const extension = file.name.split(".").pop()?.toLowerCase() ?? "";

	if (extension === "pdf") {
		const bytes = await file.arrayBuffer();
		const text = await extractTextFromPdf(bytes);
		if (!text.trim()) {
			throw new Error("Could not extract text from the PDF. Try Markdown or TXT export instead.");
		}
		return truncateSourceMaterial(text);
	}

	if (extension === "md" || extension === "markdown" || extension === "txt") {
		const text = await readFileAsText(file);
		if (!text.trim()) {
			throw new Error("The uploaded file is empty.");
		}
		return truncateSourceMaterial(text);
	}

	throw new Error("Upload a Story Engine Archive PDF, Markdown, or TXT export.");
}

async function readFileAsText(file: File) {
	if (typeof file.text === "function") {
		return await file.text();
	}

	return await new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(new Error("Unable to read the selected file."));
		reader.onload = () => {
			resolve(typeof reader.result === "string" ? reader.result : "");
		};
		reader.readAsText(file);
	});
}

async function extractTextFromPdf(bytes: ArrayBuffer) {
	const pdfjs = await import("pdfjs-dist");
	pdfjs.GlobalWorkerOptions.workerSrc = new URL(
		"pdfjs-dist/build/pdf.worker.min.mjs",
		import.meta.url,
	).toString();

	const loadingTask = pdfjs.getDocument({ data: bytes });
	const pdf = await loadingTask.promise;
	const pages: string[] = [];

	for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
		const page = await pdf.getPage(pageNumber);
		const textContent = await page.getTextContent();
		const pageText = textContent.items
			.map((item) => ("str" in item && typeof item.str === "string" ? item.str : ""))
			.join(" ");
		pages.push(pageText.trim());
	}

	return pages.filter(Boolean).join("\n\n");
}
