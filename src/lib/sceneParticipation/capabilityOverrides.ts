import type {
	DirectorIntent,
	SceneParticipantCapabilities,
	SceneParticipantCapabilityOverride,
	SceneParticipantCapabilityOverrideSource,
	StorySceneSnapshotV2,
	StoryStateData,
	StoryStateDataV2,
} from "../../types/models";
import { normalizeParticipantKey } from "./identity";

export const LEGACY_PHYSICAL_CAPABILITY_DEFAULTS: SceneParticipantCapabilities = {
	canSpeak: true,
	canPerformPhysicalActions: true,
	canBeAddressed: true,
	canBePhysicallyInteractedWith: true,
};

const CAPABILITY_KEYS = [
	"canSpeak",
	"canPerformPhysicalActions",
	"canBeAddressed",
	"canBePhysicallyInteractedWith",
] as const satisfies ReadonlyArray<keyof SceneParticipantCapabilities>;

const OVERRIDE_SOURCES = new Set<SceneParticipantCapabilityOverrideSource>([
	"live_scene_state",
	"director_instruction",
]);

export function isSceneParticipantCapabilityKey(
	value: string,
): value is keyof SceneParticipantCapabilities {
	return (CAPABILITY_KEYS as readonly string[]).includes(value);
}

export function mergeParticipantCapabilities(
	overrides?: Partial<SceneParticipantCapabilities> | null,
): SceneParticipantCapabilities {
	return {
		...LEGACY_PHYSICAL_CAPABILITY_DEFAULTS,
		...sanitizeCapabilityPartial(overrides),
	};
}

export function sanitizeCapabilityPartial(
	value: unknown,
): Partial<SceneParticipantCapabilities> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return {};
	}

	const record = value as Record<string, unknown>;
	const sanitized: Partial<SceneParticipantCapabilities> = {};
	for (const key of CAPABILITY_KEYS) {
		if (typeof record[key] === "boolean") {
			sanitized[key] = record[key];
		}
	}
	return sanitized;
}

export function normalizeSceneParticipantCapabilityOverride(
	value: unknown,
): SceneParticipantCapabilityOverride | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}

	const record = value as Record<string, unknown>;
	const participantKey =
		typeof record.participantKey === "string" ? record.participantKey.trim() : "";
	if (!participantKey || !normalizeParticipantKey(participantKey)) {
		return null;
	}

	if (
		typeof record.source !== "string" ||
		!OVERRIDE_SOURCES.has(record.source as SceneParticipantCapabilityOverrideSource)
	) {
		return null;
	}

	const capabilities = sanitizeCapabilityPartial(record.capabilities);
	if (Object.keys(capabilities).length === 0) {
		return null;
	}

	return {
		participantKey,
		capabilities,
		source: record.source as SceneParticipantCapabilityOverrideSource,
	};
}

export function normalizeSceneParticipantCapabilityOverrides(
	value: unknown,
): SceneParticipantCapabilityOverride[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const normalized: SceneParticipantCapabilityOverride[] = [];
	const seen = new Set<string>();
	for (const entry of value) {
		const override = normalizeSceneParticipantCapabilityOverride(entry);
		if (!override) {
			continue;
		}
		const key = normalizeParticipantKey(override.participantKey);
		if (seen.has(key)) {
			const index = normalized.findIndex(
				(item) => normalizeParticipantKey(item.participantKey) === key,
			);
			if (index >= 0) {
				normalized[index] = {
					...override,
					capabilities: {
						...normalized[index]!.capabilities,
						...override.capabilities,
					},
				};
			}
			continue;
		}
		seen.add(key);
		normalized.push(override);
	}
	return normalized;
}

/**
 * Compatibility adapter for the legacy scene.activeParticipants list.
 * Callers outside the resolver must use this instead of reading the field.
 */
export function readLegacyActiveParticipantNames(
	state: StoryStateData | StoryStateDataV2 | null | undefined,
): string[] {
	return (state?.scene?.activeParticipants ?? []).filter(
		(name): name is string => typeof name === "string" && name.trim().length > 0,
	);
}

export function getSceneParticipantCapabilityOverrides(
	state: StoryStateData | StoryStateDataV2 | null | undefined,
): SceneParticipantCapabilityOverride[] {
	return normalizeSceneParticipantCapabilityOverrides(
		state?.scene?.participantCapabilityOverrides,
	);
}

export function findCapabilityOverride(
	overrides: readonly SceneParticipantCapabilityOverride[],
	names: readonly string[],
): SceneParticipantCapabilityOverride | null {
	const keys = new Set(names.map(normalizeParticipantKey).filter(Boolean));
	if (!keys.size) {
		return null;
	}
	return (
		overrides.find((override) => keys.has(normalizeParticipantKey(override.participantKey))) ??
		null
	);
}

function withSceneOverrides(
	scene: StorySceneSnapshotV2 | undefined,
	overrides: SceneParticipantCapabilityOverride[],
): StorySceneSnapshotV2 {
	const next: StorySceneSnapshotV2 = { ...(scene ?? {}) };
	if (overrides.length) {
		next.participantCapabilityOverrides = overrides;
	} else {
		delete next.participantCapabilityOverrides;
	}
	return next;
}

export function clearSceneParticipantCapabilityOverrides<
	T extends StoryStateData | StoryStateDataV2,
>(state: T): T {
	if (!state.scene?.participantCapabilityOverrides?.length) {
		return state;
	}
	const scene: StorySceneSnapshotV2 = { ...state.scene };
	delete scene.participantCapabilityOverrides;
	return {
		...state,
		scene,
	};
}

export function clearNamedSceneParticipantCapabilityOverrides<
	T extends StoryStateData | StoryStateDataV2,
>(state: T, participantKeys: readonly string[]): T {
	const keys = new Set(participantKeys.map(normalizeParticipantKey).filter(Boolean));
	if (!keys.size) {
		return state;
	}
	const remaining = getSceneParticipantCapabilityOverrides(state).filter(
		(override) => !keys.has(normalizeParticipantKey(override.participantKey)),
	);
	if (remaining.length === getSceneParticipantCapabilityOverrides(state).length) {
		return state;
	}
	return {
		...state,
		scene: withSceneOverrides(state.scene, remaining),
	};
}

/**
 * Scene replacement is an explicit lifecycle event. Overrides never survive it.
 */
export function replaceCurrentSceneState<T extends StoryStateData | StoryStateDataV2>(
	state: T,
	nextScene?: StorySceneSnapshotV2 | null,
): T {
	if (!nextScene) {
		const { scene: _removed, ...rest } = state;
		return rest as T;
	}
	const scene: StorySceneSnapshotV2 = { ...nextScene };
	delete scene.participantCapabilityOverrides;
	return {
		...state,
		scene,
	};
}

export function applySceneParticipantCapabilityOverrides<
	T extends StoryStateData | StoryStateDataV2,
>(
	state: T,
	incoming: readonly SceneParticipantCapabilityOverride[],
	opts?: { replaceMatching?: boolean },
): T {
	const sanitized = normalizeSceneParticipantCapabilityOverrides(incoming);
	if (!sanitized.length) {
		return state;
	}

	const existing = getSceneParticipantCapabilityOverrides(state);
	const merged = new Map<string, SceneParticipantCapabilityOverride>();
	for (const override of existing) {
		merged.set(normalizeParticipantKey(override.participantKey), override);
	}
	for (const override of sanitized) {
		const key = normalizeParticipantKey(override.participantKey);
		const previous = merged.get(key);
		merged.set(key, {
			...override,
			capabilities:
				opts?.replaceMatching === false && previous
					? { ...previous.capabilities, ...override.capabilities }
					: override.capabilities,
		});
	}

	return {
		...state,
		scene: withSceneOverrides(state.scene, Array.from(merged.values())),
	};
}

/**
 * The only non-Director creation path. Requires a participant key and at least
 * one explicit boolean capability. No natural-language classification.
 */
export function applyLiveSceneCapabilityOverrides<T extends StoryStateData | StoryStateDataV2>(
	state: T,
	incoming: ReadonlyArray<{
		participantKey: string;
		capabilities: Partial<SceneParticipantCapabilities>;
	}>,
): T {
	const overrides = incoming.map((entry) => ({
		participantKey: entry.participantKey,
		capabilities: entry.capabilities,
		source: "live_scene_state" as const,
	}));
	return applySceneParticipantCapabilityOverrides(state, overrides);
}

/**
 * Indexing and memory rebuilds may copy existing overrides unchanged.
 * They must never accept model-invented overrides from incoming state.
 */
export function preserveSceneParticipantCapabilityOverrides(
	previous: StoryStateData | StoryStateDataV2 | null | undefined,
	incomingScene: StorySceneSnapshotV2 | undefined,
): StorySceneSnapshotV2 | undefined {
	const preserved = getSceneParticipantCapabilityOverrides(previous);
	if (!incomingScene && !preserved.length) {
		return incomingScene;
	}
	const scene: StorySceneSnapshotV2 = { ...(incomingScene ?? previous?.scene ?? {}) };
	return withSceneOverrides(scene, preserved);
}

export function stripInventedSceneCapabilityOverrides(
	scene: StorySceneSnapshotV2 | undefined,
): StorySceneSnapshotV2 | undefined {
	if (!scene) {
		return scene;
	}
	if (!("participantCapabilityOverrides" in scene)) {
		return scene;
	}
	const next: StorySceneSnapshotV2 = { ...scene };
	delete next.participantCapabilityOverrides;
	return next;
}

/**
 * Apply structured Director participation effects to current-scene state.
 * Scene cuts and explicit clears drop overrides. Typed overrides supersede.
 */
export function applyDirectorIntentToStoryState<T extends StoryStateData | StoryStateDataV2>(
	state: T,
	intent: DirectorIntent | null | undefined,
): T {
	if (!intent) {
		return state;
	}

	let next = state;
	if (intent.sceneCut || intent.clearParticipantCapabilityOverrides) {
		next = clearSceneParticipantCapabilityOverrides(next);
	} else if (intent.clearedParticipantKeys?.length) {
		next = clearNamedSceneParticipantCapabilityOverrides(next, intent.clearedParticipantKeys);
	}
	if (intent.participantCapabilityOverrides?.length) {
		next = applySceneParticipantCapabilityOverrides(
			next,
			intent.participantCapabilityOverrides,
		);
	}
	return next;
}
