import type { MediaAsset, MediaAssetCategory } from "../../types/models";
import {
	buildStoryAudiobookLibraryKey,
	buildStoryChapterLibraryKey,
} from "./libraryKeys";
import {
	findMediaAssetByLibraryKey,
	ingestMediaAsset,
	replaceMediaAssetAudio,
} from "./store";

export type IngestStoryAudioInput = {
	category: Extract<MediaAssetCategory, "audiobook" | "chapter">;
	storyId: string;
	storyTitle: string;
	chapterMessageId?: string;
	chapterTitle?: string;
	wavBytes: ArrayBuffer | Uint8Array;
	contentDigest?: string;
	replaceExisting?: boolean;
};

export type IngestStoryAudioResult = {
	asset: MediaAsset;
	created: boolean;
	replaced: boolean;
	unchanged: boolean;
};

export async function ingestStoryAudio(
	input: IngestStoryAudioInput,
): Promise<IngestStoryAudioResult> {
	const libraryKey =
		input.category === "audiobook"
			? buildStoryAudiobookLibraryKey(input.storyId)
			: buildStoryChapterLibraryKey(input.storyId, input.chapterMessageId ?? "");

	if (input.category === "chapter" && !input.chapterMessageId) {
		throw new Error("Chapter audio requires a chapter message id.");
	}

	const title =
		input.category === "audiobook"
			? input.storyTitle.trim() || "Story audiobook"
			: input.chapterTitle?.trim() || "Chapter audio";
	const subtitle = input.category === "audiobook" ? "Full story audiobook" : input.storyTitle;

	const existing = await findMediaAssetByLibraryKey(libraryKey);
	if (existing) {
		if (input.contentDigest && existing.contentDigest === input.contentDigest) {
			return { asset: existing, created: false, replaced: false, unchanged: true };
		}

		if (!input.replaceExisting) {
			const error = new Error("ALREADY_IN_LIBRARY");
			(error as Error & { existingAssetId?: string }).existingAssetId = existing.id;
			throw error;
		}

		const asset = await replaceMediaAssetAudio(existing.id, {
			title,
			subtitle,
			storyId: input.storyId,
			storyTitleSnapshot: input.storyTitle,
			wavBytes: input.wavBytes,
			contentDigest: input.contentDigest,
			category: input.category,
		});

		return { asset, created: false, replaced: true, unchanged: false };
	}

	const asset = await ingestMediaAsset({
		category: input.category,
		libraryKey,
		title,
		subtitle,
		storyId: input.storyId,
		storyTitleSnapshot: input.storyTitle,
		wavBytes: input.wavBytes,
		contentDigest: input.contentDigest,
	});

	return { asset, created: true, replaced: false, unchanged: false };
}
