import type { IndexingGap, StoryMessage, StoryState, StoryStateData } from "../types/models";
import { safeParseStoryStateData } from "./storyStateV2";

async function sha256Hex(value: string): Promise<string> {
	const subtle = globalThis.crypto?.subtle;
	if (!subtle) throw new Error("Web Crypto is required to fingerprint the canonical transcript.");
	const digest = await subtle.digest("SHA-256", new TextEncoder().encode(value));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Hash ordered canonical message state without persisting transcript text. */
export async function buildCanonicalTranscriptFingerprint(messages: readonly StoryMessage[]) {
	const ordered = [...messages].sort((left, right) => {
		const timeDifference = new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime();
		return timeDifference || left.id.localeCompare(right.id);
	});
	const rows = await Promise.all(ordered.map(async (message) => ({
		id: message.id,
		revision: Number.isFinite(message.revision) ? Math.trunc(message.revision!) : 0,
		role: message.role,
		timestamp: message.timestamp,
		contentHash: await sha256Hex(message.content ?? ""),
	})));
	return `sha256:${await sha256Hex(JSON.stringify(rows))}`;
}

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

	// indexes.messageCount is transcript/index cardinality. It is updated by the
	// lightweight counter sync and is therefore not proof that deep indexing ran.
	const count = parsed.lastDeepIndexedMessageCount ?? parsed.lastIndexedMessageCount ?? 0;
	return typeof count === "number" && Number.isFinite(count)
		? Math.max(0, Math.trunc(count))
		: 0;
}

function resolveAttemptedMessageCount(
	parsed: ReturnType<typeof safeParseStoryStateData>,
	indexedMessageCount: number,
) {
	const attempted = parsed?.lastDeepIndexAttemptedMessageCount;
	return typeof attempted === "number" && Number.isFinite(attempted)
		? Math.max(indexedMessageCount, Math.max(0, Math.trunc(attempted)))
		: indexedMessageCount;
}

function resolveIndexingGaps(parsed: ReturnType<typeof safeParseStoryStateData>): IndexingGap[] {
	if (!Array.isArray(parsed?.indexingGaps)) {
		return [];
	}

	return parsed.indexingGaps.filter(
		(gap): gap is IndexingGap =>
			Boolean(gap) &&
			typeof gap === "object" &&
			typeof gap.messageNumber === "number" &&
			Number.isFinite(gap.messageNumber) &&
			gap.messageNumber > 0 &&
			gap.code === "provider_refusal" &&
			typeof gap.occurredAt === "string" &&
			gap.occurredAt.trim().length > 0,
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
	opts?: { currentMessageCount?: number; currentMessageFingerprint?: string | null },
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
	const attemptedMessageCount = resolveAttemptedMessageCount(parsed, indexedMessageCount);
	const indexingGaps = resolveIndexingGaps(parsed);
	const indexedFingerprint = parsed?.lastDeepIndexedTranscriptFingerprint;
	const currentMessageFingerprint = opts?.currentMessageFingerprint?.trim() || null;
	const currentMessageCount =
		typeof opts?.currentMessageCount === "number" && Number.isFinite(opts.currentMessageCount)
			? Math.max(0, Math.trunc(opts.currentMessageCount))
			: indexedMessageCount;

	if (indexingGaps.length > 0) {
		return {
			indexedAt,
			indexedMessageCount,
			attemptedMessageCount,
			indexingGaps,
			currentMessageCount,
			ageMs: indexedAtMs == null ? null : Math.max(0, Date.now() - indexedAtMs),
			isFresh: false,
			needsRefresh: true,
			reason: "partial" as const,
		};
	}

	if (indexedAtMs == null || (indexedMessageCount === 0 && currentMessageCount > 0)) {
		return {
			indexedAt,
			indexedMessageCount,
			attemptedMessageCount,
			indexingGaps,
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
			attemptedMessageCount,
			indexingGaps,
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

	if (!indexedFingerprint || !currentMessageFingerprint) {
		return {
			indexedAt,
			indexedMessageCount,
			attemptedMessageCount,
			indexingGaps,
			currentMessageCount,
			ageMs: indexedAtMs == null ? null : Math.max(0, Date.now() - indexedAtMs),
			isFresh: false,
			needsRefresh: true,
			reason: !indexedFingerprint ? ("fingerprint_missing" as const) : ("fingerprint_pending" as const),
		};
	}

	if (indexedFingerprint !== currentMessageFingerprint) {
		return {
			indexedAt,
			indexedMessageCount,
			attemptedMessageCount,
			indexingGaps,
			currentMessageCount,
			ageMs: indexedAtMs == null ? null : Math.max(0, Date.now() - indexedAtMs),
			isFresh: false,
			needsRefresh: true,
			reason: "content_mismatch" as const,
		};
	}

	const ageMs = Math.max(0, Date.now() - indexedAtMs);

	return {
		indexedAt,
		indexedMessageCount,
		attemptedMessageCount,
		indexingGaps,
		currentMessageCount,
		ageMs,
		isFresh: true,
		needsRefresh: false,
		reason: "current" as const,
	};
}
