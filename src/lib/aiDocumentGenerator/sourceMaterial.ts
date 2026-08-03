import type { StoryExportBundle } from "../../types/models";
import { serializeStoryExport } from "../storyExport";

const MAX_SOURCE_CHARS = 140000;

function truncateSourceMaterial(text: string) {
	const trimmed = text.trim();
	if (trimmed.length <= MAX_SOURCE_CHARS) {
		return trimmed;
	}

	return `${trimmed.slice(0, MAX_SOURCE_CHARS).trim()}\n\n[Source truncated for model context limits.]`;
}

export function buildSourceMaterialFromStoryBundle(bundle: StoryExportBundle) {
	const markdown = serializeStoryExport(bundle, "markdown");
	const raw =
		typeof markdown.content === "string"
			? markdown.content
			: new TextDecoder().decode(markdown.content as ArrayBuffer);
	return truncateSourceMaterial(raw);
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
