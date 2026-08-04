const CHAPTER_HEADER_RE = /^\s*Chapter\s+([IVXLC\d]+)\s*[:.\-]\s*(.*)$/i;
const SCENE_HEADER_RE = /^\s*Scene\s+([IVXLC\d]+)\s*[:.\-]\s*(.*)$/i;

export function stripChapterHeadingPrefix(label: string, overview: string): {
	label: string;
	overview: string;
} {
	const trimmedLabel = label.trim();
	const trimmedOverview = overview.trim();

	const labelMatch = trimmedLabel.match(CHAPTER_HEADER_RE);
	if (labelMatch) {
		const chapterLabel = `Chapter ${labelMatch[1].toUpperCase()}`;
		const labelBody = labelMatch[2]?.trim() ?? "";
		return {
			label: chapterLabel,
			overview: [labelBody, trimmedOverview].filter(Boolean).join("\n\n"),
		};
	}

	const overviewMatch = trimmedOverview.match(CHAPTER_HEADER_RE);
	if (overviewMatch && !trimmedLabel) {
		return {
			label: `Chapter ${overviewMatch[1].toUpperCase()}`,
			overview: overviewMatch[2]?.trim() ?? "",
		};
	}

	return { label: trimmedLabel, overview: trimmedOverview };
}

export function parseSceneOverviews(overview: string): string[] {
	const lines = overview.split("\n");
	const scenes: string[] = [];
	let currentLines: string[] = [];
	let foundSceneHeader = false;

	for (const line of lines) {
		const match = line.match(SCENE_HEADER_RE);
		if (match) {
			foundSceneHeader = true;
			if (currentLines.length) {
				scenes.push(currentLines.join("\n").trim());
			}
			currentLines = [match[2]?.trim() ?? ""];
			continue;
		}

		if (line.trim() || currentLines.length) {
			currentLines.push(line);
		}
	}

	if (currentLines.length) {
		scenes.push(currentLines.join("\n").trim());
	}

	if (!foundSceneHeader) {
		return [];
	}

	return scenes.filter((scene) => scene.length > 0);
}

export function resolveScenesForChapter(overview: string, scenesPerChapter: number): {
	scenes: string[];
	sceneCount: number;
} {
	const parsedScenes = parseSceneOverviews(overview);
	if (!parsedScenes.length) {
		const count = Math.max(1, Math.min(10, scenesPerChapter));
		return {
			scenes: Array.from({ length: count }, () => overview.trim()),
			sceneCount: count,
		};
	}

	const cappedCount =
		scenesPerChapter > 0
			? Math.min(parsedScenes.length, scenesPerChapter)
			: parsedScenes.length;
	const sceneCount = Math.max(1, Math.min(10, cappedCount));
	return {
		scenes: parsedScenes.slice(0, sceneCount),
		sceneCount,
	};
}

export function shouldStageDirectorBeatForScene(overview: string, sceneIndex: number): boolean {
	const parsedScenes = parseSceneOverviews(overview);
	if (parsedScenes.length > 0) {
		return true;
	}

	return sceneIndex === 0;
}

export function parseOverallChapterDirections(overallDirection: string): Record<string, string> {
	const lines = overallDirection.split("\n");
	const chapters: Record<string, string> = {};
	let currentLabel: string | null = null;
	let currentLines: string[] = [];

	for (const line of lines) {
		const match = line.match(CHAPTER_HEADER_RE);
		if (match) {
			if (currentLabel) {
				chapters[currentLabel] = currentLines.join("\n").trim();
			}
			currentLabel = `Chapter ${match[1].toUpperCase()}`;
			currentLines = [match[2]?.trim() ?? ""];
			continue;
		}

		if (currentLabel) {
			currentLines.push(line);
		}
	}

	if (currentLabel) {
		chapters[currentLabel] = currentLines.join("\n").trim();
	}

	return chapters;
}
