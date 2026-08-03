import type { StoryState, StoryStateData } from "../types/models";
import { safeParseStoryStateData } from "./storyStateV2";

function toTimestampMs(value: string | null | undefined) {
	if (!value) {
		return null;
	}

	const ts = new Date(value).getTime();
	return Number.isFinite(ts) ? ts : null;
}

function resolveIndexedMessageCount(parsed: ReturnType<typeof safeParseStoryStateData>) {
	if (!parsed) {
		return 0;
	}

	const fromIndexes =
		typeof parsed.indexes?.messageCount === "number" && Number.isFinite(parsed.indexes.messageCount)
			? Math.trunc(parsed.indexes.messageCount)
			: null;

	return Math.max(
		parsed.lastDeepIndexedMessageCount ?? 0,
		parsed.lastIndexedMessageCount ?? 0,
		fromIndexes ?? 0,
	);
}

function readStoryStateFields(storyState: StoryState | null | undefined) {
	const json = storyState?.stateJson?.trim() ?? "";
	const parsed = json ? safeParseStoryStateData(json) : null;
	if (parsed) {
		return parsed;
	}

	if (!json) {
		return null;
	}

	try {
		return JSON.parse(json) as StoryStateData;
	} catch {
		return null;
	}
}

export function getArchiveIndexStatus(
	storyState: StoryState | null | undefined,
	opts?: { currentMessageCount?: number },
) {
	const parsed = readStoryStateFields(storyState);

	const indexedAt =
		parsed?.lastDeepIndexedAt ??
		parsed?.indexedAt ??
		parsed?.lastIndexedAt ??
		storyState?.updatedAt ??
		null;

	const indexedAtMs = toTimestampMs(indexedAt);
	const indexedMessageCount = resolveIndexedMessageCount(parsed);
	const currentMessageCount =
		typeof opts?.currentMessageCount === "number" && Number.isFinite(opts.currentMessageCount)
			? Math.max(0, Math.trunc(opts.currentMessageCount))
			: indexedMessageCount;

	if (indexedAtMs == null || (indexedMessageCount === 0 && currentMessageCount > 0)) {
		return {
			indexedAt,
			indexedMessageCount,
			currentMessageCount,
			ageMs: null,
			isFresh: false,
			needsRefresh: true,
			reason: "missing" as const,
		};
	}

	if (currentMessageCount !== indexedMessageCount) {
		return {
			indexedAt,
			indexedMessageCount,
			currentMessageCount,
			ageMs: Math.max(0, Date.now() - indexedAtMs),
			isFresh: false,
			needsRefresh: true,
			reason:
				currentMessageCount > indexedMessageCount
					? ("new_messages" as const)
					: ("message_count_mismatch" as const),
		};
	}

	const ageMs = Math.max(0, Date.now() - indexedAtMs);

	return {
		indexedAt,
		indexedMessageCount,
		currentMessageCount,
		ageMs,
		isFresh: true,
		needsRefresh: false,
		reason: "current" as const,
	};
}
