import { downloadFile } from "../download";
import type { BackgroundJob } from "../../types/models";

export function canDownloadAiDocumentJob(job: BackgroundJob) {
	return (
		job.type === "ai_document" &&
		job.status === "complete" &&
		Boolean(job.result?.aiDocumentFilename && job.result?.aiDocumentMarkdown)
	);
}

export async function downloadAiDocumentJobResult(job: BackgroundJob) {
	const filename = job.result?.aiDocumentFilename;
	const markdown = job.result?.aiDocumentMarkdown;
	if (!filename || !markdown) {
		throw new Error("This document is no longer available to download.");
	}

	await downloadFile(filename, markdown, "text/markdown;charset=utf-8");
}
