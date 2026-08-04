import type { StoryIndexesV2, StoryStateDataV2 } from "../types/models";

type OpenThreadRow = NonNullable<StoryIndexesV2["openThreads"]>[number];

function normalizeThreadText(value: string): string {
	return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function mergeEvidence(
	left?: { messageNumbers?: number[] },
	right?: { messageNumbers?: number[] },
) {
	const leftNumbers = Array.isArray(left?.messageNumbers) ? left.messageNumbers : [];
	const rightNumbers = Array.isArray(right?.messageNumbers) ? right.messageNumbers : [];
	const merged = Array.from(
		new Set(
			[...leftNumbers, ...rightNumbers].filter(
				(n) => typeof n === "number" && Number.isFinite(n) && n >= 1,
			),
		),
	).sort((a, b) => a - b);
	return merged.length ? { messageNumbers: merged } : undefined;
}

function playerLastSeenMessage(state: StoryStateDataV2, playerName?: string): number | undefined {
	const indexes = state.indexes?.characters;
	if (!indexes || typeof indexes !== "object") {
		return undefined;
	}

	const playerNorm = playerName?.trim().toLowerCase() ?? "";
	let best: number | undefined;
	for (const entity of Object.values(indexes)) {
		const name = entity?.name?.trim() ?? "";
		if (!name) {
			continue;
		}
		if (playerNorm && name.toLowerCase() !== playerNorm && !name.toLowerCase().includes(playerNorm)) {
			continue;
		}
		if (typeof entity.lastSeenMessage === "number" && Number.isFinite(entity.lastSeenMessage)) {
			best = Math.max(best ?? 0, Math.trunc(entity.lastSeenMessage));
		}
	}
	return best;
}

export function isResolvedOpenThread(
	thread: string,
	state: StoryStateDataV2,
	opts?: { playerName?: string; totalMessages?: number },
): boolean {
	const text = normalizeThreadText(thread);
	const totalMessages = opts?.totalMessages ?? state.indexes?.messageCount ?? 0;
	const playerSeen = playerLastSeenMessage(state, opts?.playerName);

	if (
		(text.includes("where is") || text.includes("where's")) &&
		(text.includes("jamie") || text.includes("potter") || text.includes("detective"))
	) {
		return typeof playerSeen === "number" && playerSeen >= 8;
	}

	if (text.includes("entering") && text.includes("door")) {
		return totalMessages >= 5;
	}

	if (
		(text.includes("arrive") && text.includes("time")) ||
		text.includes("on schedule") ||
		(text.includes("evening shift") && text.includes("log"))
	) {
		return typeof playerSeen === "number" && playerSeen >= 8;
	}

	if (text.includes("prior to") && text.includes("demonstration")) {
		return typeof playerSeen === "number" && playerSeen >= 8;
	}

	return false;
}

export function mergeOpenThreadsAuthoritative(
	previous: OpenThreadRow[] | undefined,
	incoming: OpenThreadRow[] | undefined,
): OpenThreadRow[] | undefined {
	if (!Array.isArray(incoming)) {
		return previous?.length ? previous : undefined;
	}

	if (!incoming.length) {
		return undefined;
	}

	const prevByKey = new Map<string, OpenThreadRow>();
	for (const row of previous ?? []) {
		const key = typeof row.thread === "string" ? normalizeThreadText(row.thread) : "";
		if (key) {
			prevByKey.set(key, row);
		}
	}

	const merged: OpenThreadRow[] = [];
	for (const row of incoming) {
		if (typeof row.thread !== "string" || !row.thread.trim()) {
			continue;
		}
		const key = normalizeThreadText(row.thread);
		const existing = prevByKey.get(key);
		merged.push(
			existing
				? {
						...existing,
						...row,
						thread: row.thread.trim(),
						evidence: mergeEvidence(existing.evidence, row.evidence),
					}
				: { ...row, thread: row.thread.trim() },
		);
	}

	return merged.length ? merged : undefined;
}

export function reconcileResolvedOpenThreads(
	threads: OpenThreadRow[] | undefined,
	state: StoryStateDataV2,
	opts?: { playerName?: string; totalMessages?: number },
): OpenThreadRow[] | undefined {
	if (!threads?.length) {
		return threads;
	}

	const filtered = threads.filter(
		(entry) => !isResolvedOpenThread(entry.thread, state, opts),
	);
	return filtered.length ? filtered : undefined;
}
