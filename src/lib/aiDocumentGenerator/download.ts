import { downloadFile } from "../download";
import type { BackgroundJob } from "../../types/models";
import { EPUB_MIME_TYPE, serializeNovelisationEpub } from "./epub";

export function canDownloadAiDocumentJob(job: BackgroundJob) {
	return (
		job.type === "ai_document" &&
		job.status === "complete" &&
		Boolean(job.result?.aiDocumentFilename && job.result?.aiDocumentMarkdown)
	);
}

export function prepareAiDocumentJobDownload(job: BackgroundJob) {
	const filename = job.result?.aiDocumentFilename;
	const markdown = job.result?.aiDocumentMarkdown;
	if (!filename || !markdown) {
		throw new Error("This document is no longer available to download.");
	}

	if (/\.epub$/i.test(filename)) {
		return {
			filename,
			content: serializeNovelisationEpub(markdown),
			mimeType: EPUB_MIME_TYPE,
		};
	}

	return {
		filename,
		content: markdown,
		mimeType: "text/markdown;charset=utf-8",
	};
}

export async function downloadAiDocumentJobResult(job: BackgroundJob) {
	const prepared = prepareAiDocumentJobDownload(job);
	await downloadFile(prepared.filename, prepared.content, prepared.mimeType);
}
