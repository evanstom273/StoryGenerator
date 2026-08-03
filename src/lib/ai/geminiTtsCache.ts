import type { GeminiTtsModelId } from "./geminiTtsVoices";
import { buildGeminiTtsSynthesisSignature } from "./geminiTtsSynthesis";
import {
	deleteFromStore,
	getAllFromStore,
	getFromStore,
	putInStore,
} from "../idb";
import type { SpeechSynthesisPlan } from "../storyText/messageSpeechText";

const CACHE_SCHEMA_VERSION = 2;
const MAX_CACHE_ENTRIES = 120;

export type GeminiTtsCacheRecord = {
	id: string;
	playId: string;
	createdAtMs: number;
	byteLength: number;
	wavBytes: Uint8Array;
};

const memoryCache = new Map<string, Uint8Array>();

function toWavBytes(buffer: ArrayBuffer | Uint8Array): Uint8Array {
	return buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
}

function fallbackDigest(payload: string) {
	let hash = 2166136261;

	for (let index = 0; index < payload.length; index += 1) {
		hash ^= payload.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}

	return `f${(hash >>> 0).toString(16)}`;
}

export async function computeGeminiTtsCacheDigest(
	playId: string,
	plan: SpeechSynthesisPlan,
	model: GeminiTtsModelId,
) {
	const payload = JSON.stringify({
		v: CACHE_SCHEMA_VERSION,
		playId,
		synthesisSignature: buildGeminiTtsSynthesisSignature(plan),
		model,
	});

	if (typeof crypto !== "undefined" && crypto.subtle?.digest) {
		const bytes = new TextEncoder().encode(payload);
		const digest = await crypto.subtle.digest("SHA-256", bytes);
		const hex = Array.from(new Uint8Array(digest))
			.map((byte) => byte.toString(16).padStart(2, "0"))
			.join("");
		return hex;
	}

	return fallbackDigest(payload);
}

export async function computeGeminiTtsPlanCacheDigest(
	plan: SpeechSynthesisPlan,
	model: GeminiTtsModelId,
) {
	const payload = JSON.stringify({
		v: CACHE_SCHEMA_VERSION,
		synthesisSignature: buildGeminiTtsSynthesisSignature(plan),
		model,
	});

	if (typeof crypto !== "undefined" && crypto.subtle?.digest) {
		const bytes = new TextEncoder().encode(payload);
		const digest = await crypto.subtle.digest("SHA-256", bytes);
		const hex = Array.from(new Uint8Array(digest))
			.map((byte) => byte.toString(16).padStart(2, "0"))
			.join("");
		return hex;
	}

	return fallbackDigest(payload);
}

export async function readGeminiTtsCacheForPlan(plan: SpeechSynthesisPlan, model: GeminiTtsModelId) {
	const digest = await computeGeminiTtsPlanCacheDigest(plan, model);
	return getGeminiTtsMemoryCache(digest) ?? (await readGeminiTtsCache(digest));
}

export function getGeminiTtsMemoryCache(digest: string) {
	return memoryCache.get(digest) ?? null;
}

export async function readGeminiTtsCache(digest: string) {
	const memory = memoryCache.get(digest);
	if (memory) {
		return memory;
	}

	const record = await getFromStore<GeminiTtsCacheRecord>("geminiTtsCache", digest);
	if (!record?.wavBytes?.length) {
		return null;
	}

	memoryCache.set(digest, record.wavBytes);
	return record.wavBytes;
}

async function pruneGeminiTtsCacheIfNeeded() {
	const records = await getAllFromStore<GeminiTtsCacheRecord>("geminiTtsCache");
	if (records.length <= MAX_CACHE_ENTRIES) {
		return;
	}

	const sorted = [...records].sort((left, right) => left.createdAtMs - right.createdAtMs);
	const excess = sorted.length - MAX_CACHE_ENTRIES;

	for (let index = 0; index < excess; index += 1) {
		const record = sorted[index]!;
		memoryCache.delete(record.id);
		await deleteFromStore("geminiTtsCache", record.id);
	}
}

export async function writeGeminiTtsCache(
	digest: string,
	playId: string,
	wavBuffer: ArrayBuffer | Uint8Array,
) {
	const wavBytes = toWavBytes(wavBuffer);
	memoryCache.set(digest, wavBytes);

	await putInStore<GeminiTtsCacheRecord>("geminiTtsCache", {
		id: digest,
		playId,
		createdAtMs: Date.now(),
		byteLength: wavBytes.byteLength,
		wavBytes,
	});

	await pruneGeminiTtsCacheIfNeeded();
}
