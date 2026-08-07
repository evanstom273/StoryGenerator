export function buildStoryAudiobookLibraryKey(storyId: string): string {
	return `story_audiobook:${storyId}`;
}

export function buildStoryChapterLibraryKey(storyId: string, chapterMessageId: string): string {
	return `story_chapter:${storyId}:${chapterMessageId}`;
}

export function buildMediaAssetPlayId(assetId: string): string {
	return `media:${assetId}`;
}

export function parseStoryAudiobookPlayId(playId: string): string | null {
	const prefix = "story-audiobook-";
	return playId.startsWith(prefix) ? playId.slice(prefix.length) : null;
}

export function parseChapterPlayId(playId: string): string | null {
	const prefix = "chapter-";
	return playId.startsWith(prefix) ? playId.slice(prefix.length) : null;
}

export function parseMediaAssetPlayId(playId: string): string | null {
	const prefix = "media:";
	return playId.startsWith(prefix) ? playId.slice(prefix.length) : null;
}
