import type { MediaAsset, MediaAssetCategory } from "../../types/models";
import { createEntityId } from "../ids";
import {
	deleteFromStore,
	getAllByIndex,
	getAllFromStore,
	getFromStore,
	putInStore,
} from "../idb";
import { computeWavDurationMs } from "./wavDuration";

export const MEDIA_LIBRARY_CHANGED_EVENT = "story-engine:media-library-changed";

function copyWavBytes(bytes: ArrayBuffer | Uint8Array): Uint8Array {
	return bytes instanceof Uint8Array ? new Uint8Array(bytes) : new Uint8Array(bytes);
}

function notifyMediaLibraryChanged() {
	if (typeof window !== "undefined") {
		window.dispatchEvent(new Event(MEDIA_LIBRARY_CHANGED_EVENT));
	}
}

export async function listMediaAssets(): Promise<MediaAsset[]> {
	const assets = await getAllFromStore<MediaAsset>("mediaLibrary");
	return assets.sort((left, right) => right.createdAtMs - left.createdAtMs);
}

export async function getMediaAssetById(id: string): Promise<MediaAsset | null> {
	return getFromStore<MediaAsset>("mediaLibrary", id);
}

export async function findMediaAssetByLibraryKey(
	libraryKey: string,
): Promise<MediaAsset | null> {
	const matches = await getAllByIndex<MediaAsset>("mediaLibrary", "libraryKey", libraryKey);
	return matches[0] ?? null;
}

export async function listMediaAssetsByCategory(
	category: MediaAssetCategory,
): Promise<MediaAsset[]> {
	const assets = await getAllByIndex<MediaAsset>("mediaLibrary", "category", category);
	return assets.sort((left, right) => right.createdAtMs - left.createdAtMs);
}

export type IngestMediaAssetInput = {
	category: MediaAssetCategory;
	libraryKey: string;
	title: string;
	subtitle: string;
	storyId?: string;
	storyTitleSnapshot?: string;
	sourceJobId?: string;
	wavBytes: ArrayBuffer | Uint8Array;
	contentDigest?: string;
};

export async function ingestMediaAsset(input: IngestMediaAssetInput): Promise<MediaAsset> {
	const wavBytes = copyWavBytes(input.wavBytes);
	const now = Date.now();
	const asset: MediaAsset = {
		id: createEntityId("media"),
		category: input.category,
		libraryKey: input.libraryKey,
		title: input.title.trim() || "Untitled audio",
		subtitle: input.subtitle.trim() || "Story Engine",
		storyId: input.storyId,
		storyTitleSnapshot: input.storyTitleSnapshot?.trim() || undefined,
		sourceJobId: input.sourceJobId,
		createdAtMs: now,
		updatedAtMs: now,
		durationMs: computeWavDurationMs(wavBytes),
		format: "wav",
		mimeType: "audio/wav",
		byteLength: wavBytes.byteLength,
		audioBytes: wavBytes,
		orphaned: false,
		lastPositionMs: 0,
		contentDigest: input.contentDigest,
	};

	await putInStore("mediaLibrary", asset);
	notifyMediaLibraryChanged();
	return asset;
}

export async function replaceMediaAssetAudio(
	assetId: string,
	input: Omit<IngestMediaAssetInput, "libraryKey" | "category"> & {
		category?: MediaAssetCategory;
	},
): Promise<MediaAsset> {
	const existing = await getMediaAssetById(assetId);
	if (!existing) {
		throw new Error("Media asset not found.");
	}

	const wavBytes = copyWavBytes(input.wavBytes);
	const now = Date.now();
	const updated: MediaAsset = {
		...existing,
		category: input.category ?? existing.category,
		title: input.title.trim() || existing.title,
		subtitle: input.subtitle.trim() || existing.subtitle,
		storyId: input.storyId ?? existing.storyId,
		storyTitleSnapshot: input.storyTitleSnapshot ?? existing.storyTitleSnapshot,
		sourceJobId: input.sourceJobId ?? existing.sourceJobId,
		updatedAtMs: now,
		durationMs: computeWavDurationMs(wavBytes),
		byteLength: wavBytes.byteLength,
		audioBytes: wavBytes,
		lastPositionMs: 0,
		lastPlayedAtMs: undefined,
		contentDigest: input.contentDigest ?? existing.contentDigest,
	};

	await putInStore("mediaLibrary", updated);
	notifyMediaLibraryChanged();
	return updated;
}

export async function deleteMediaAsset(id: string): Promise<void> {
	await deleteFromStore("mediaLibrary", id);
	notifyMediaLibraryChanged();
}

export async function markMediaAssetsOrphanedForStory(storyId: string): Promise<void> {
	const assets = await getAllByIndex<MediaAsset>("mediaLibrary", "storyId", storyId);
	await Promise.all(
		assets.map(async (asset) => {
			if (asset.orphaned) {
				return;
			}
			await putInStore("mediaLibrary", {
				...asset,
				orphaned: true,
				updatedAtMs: Date.now(),
			});
		}),
	);
	if (assets.length) {
		notifyMediaLibraryChanged();
	}
}
