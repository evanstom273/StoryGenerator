import type { BackgroundJob } from "../../types/models";
import type { AiDocumentPresetId } from "../aiDocumentGenerator/presets";
import { getAiDocumentPreset } from "../aiDocumentGenerator/presets";
import { findMediaAssetByLibraryKey, ingestMediaAsset } from "./store";

function stripExtension(filename: string): string {
	return filename.replace(/\.[^.]+$/, "").trim();
}

function buildAiDocumentAudioTitle(job: BackgroundJob, presetDisplayName: string): string {
	if (job.type === "podcast_audio") {
		const label = job.payload?.aiDocumentSourceLabel?.trim();
		if (label) {
			return stripExtension(label);
		}
		return presetDisplayName;
	}

	return presetDisplayName;
}

function buildAiDocumentAudioSubtitle(
	job: BackgroundJob,
	storyTitle?: string,
): string {
	if (storyTitle?.trim()) {
		return storyTitle.trim();
	}

	const label = job.payload?.aiDocumentSourceLabel?.trim();
	if (label) {
		return stripExtension(label);
	}

	return "Uploaded source";
}

export async function ingestAiDocumentAudioFromJob(args: {
	job: BackgroundJob;
	wavBytes: ArrayBuffer | Uint8Array;
	storyTitle?: string;
}): Promise<{ assetId: string; created: boolean }> {
	const { job, wavBytes, storyTitle } = args;
	const presetId = (job.payload?.aiDocumentPresetId ?? "custom") as AiDocumentPresetId;
	const preset = getAiDocumentPreset(presetId);
	const libraryKey = `ai_audio:${job.id}`;
	const existing = await findMediaAssetByLibraryKey(libraryKey);

	if (existing) {
		return { assetId: existing.id, created: false };
	}

	const category = job.type === "podcast_audio" ? "podcast" : "ai_document";
	const title = buildAiDocumentAudioTitle(job, preset.displayName);
	const subtitle = buildAiDocumentAudioSubtitle(job, storyTitle);
	const storyId = job.payload?.aiDocumentSourceStoryId ?? job.storyId ?? undefined;

	const asset = await ingestMediaAsset({
		category,
		libraryKey,
		title,
		subtitle,
		storyId,
		storyTitleSnapshot: storyTitle,
		sourceJobId: job.id,
		wavBytes,
	});

	return { assetId: asset.id, created: true };
}
