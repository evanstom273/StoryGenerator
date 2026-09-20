import type {
  RpStats,
  SceneParticipantCapabilityOverride,
  StoryAuthorDirectiveState,
  StoryState,
} from "../types/models";

/**
 * The story state record is retained only for non-index runtime data.
 * Legacy index fields are intentionally ignored when reading and removed when
 * the record is written again.
 */
export type StoryRuntimeState = {
  rpStats?: RpStats;
  authorDirectives?: StoryAuthorDirectiveState;
  participantCapabilityOverrides?: SceneParticipantCapabilityOverride[];
  characters?: Record<string, any>;
  scene?: any;
  indexes?: any;
  summaries?: any;
  [key: string]: any;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseJson(json: string | null | undefined): unknown {
  if (!json?.trim()) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function sanitizeStoryRuntimeState(value: unknown): StoryRuntimeState {
  if (!isRecord(value)) return {};

  const next: StoryRuntimeState = {};
  if (isRecord(value.rpStats)) next.rpStats = value.rpStats as RpStats;
  if (isRecord(value.authorDirectives)) {
    next.authorDirectives = value.authorDirectives as StoryAuthorDirectiveState;
  }
  if (Array.isArray(value.participantCapabilityOverrides)) {
    next.participantCapabilityOverrides = value.participantCapabilityOverrides.filter(isRecord) as SceneParticipantCapabilityOverride[];
  }
  return next;
}

export function parseStoryRuntimeState(json: string | null | undefined): StoryRuntimeState {
  return sanitizeStoryRuntimeState(parseJson(json));
}

export function parseStoryRuntimeStateRecord(record: StoryState | null | undefined): StoryRuntimeState {
  return parseStoryRuntimeState(record?.stateJson);
}

/** Legacy reader name retained temporarily for callers being migrated. */
export function safeParseStoryStateData(json: string | null | undefined): any {
  return parseStoryRuntimeState(json);
}

export function normalizeStoryStateToV2(value: unknown): any {
  return sanitizeStoryRuntimeState(value);
}

export function parseStoryStateJson(json: string | null | undefined): any {
  return parseStoryRuntimeState(json);
}

export function serializeStoryRuntimeState(state: StoryRuntimeState): string {
  return JSON.stringify(sanitizeStoryRuntimeState(state));
}

export function mergeStoryRuntimeState(
  current: StoryRuntimeState,
  patch: Partial<StoryRuntimeState>,
): StoryRuntimeState {
  const next: StoryRuntimeState = { ...current };
  if ("rpStats" in patch) next.rpStats = patch.rpStats ?? undefined;
  if ("authorDirectives" in patch) next.authorDirectives = patch.authorDirectives ?? undefined;
  if ("participantCapabilityOverrides" in patch) {
    next.participantCapabilityOverrides = patch.participantCapabilityOverrides ?? undefined;
  }
  return sanitizeStoryRuntimeState(next);
}

export function createClearedStoryStateV2(preserve?: Partial<StoryRuntimeState>): StoryRuntimeState {
  return sanitizeStoryRuntimeState(preserve ?? {});
}

export function withIndexedMetadata<T>(state: T): T {
  return state;
}

export function finalizeStoryStateForSave(params: { parsedState?: unknown; [key: string]: any }): string {
  return JSON.stringify(sanitizeStoryRuntimeState(params.parsedState));
}

export function reconcileStoryIndexes(..._args: any[]): undefined {
  return undefined;
}

export function mergeStoryLocalPlayerIdentityIntoState<T>(state: T, ..._args: any[]): T {
  return state;
}

export function createSequelStoryStateData(..._args: any[]): StoryRuntimeState {
  return {};
}

export function applyTranscriptPresenceGate<T>(state: T, ..._args: any[]): T {
  return state;
}

export function applyOpenThreadReconciliation<T>(state: T, ..._args: any[]): T {
  return state;
}

export function formatStoryLongTermMemoryForPrompt(..._args: any[]): string {
  return "";
}

export function formatStorySceneStateForPrompt(..._args: any[]): string {
  return "";
}

export async function rebuildStoryMemoryAndIndexes(params: { repository?: unknown; storyId?: string; [key: string]: any }): Promise<{ stateJson: string; summaryText: string }> {
  const existing = params.repository && params.storyId && typeof (params.repository as any).getStoryState === "function"
    ? await (params.repository as any).getStoryState(params.storyId)
    : null;
  return { stateJson: serializeStoryRuntimeState(parseStoryRuntimeState(existing?.stateJson)), summaryText: "" };
}

export function protectGeneratedSummaryPlayerFacts(summary: string, ..._args: any[]): string {
  return summary;
}

export function selectChaptersForArchiveRebuild<T>(chapters: T[], ..._args: any[]): T[] {
  return chapters;
}

export function buildInitialChapterReviewProgress(..._args: any[]): never[] {
  return [];
}

export function getArchiveIndexStatus(..._args: any[]) {
  return { needsRefresh: false, reason: "up_to_date", indexedMessageCount: 0, attemptedMessageCount: 0, indexingGaps: [] as any[] };
}

export function reconcileRelationshipsFromStateJson(..._args: any[]) {
  return { relationships: [], indexes: undefined, changed: false };
}

export function listPresentIndexedCharacterNames(..._args: any[]): string[] { return []; }
export function synthesizeCharacterStatusBullets(..._args: any[]): string[] { return []; }
export function getCharacterStatusLines(..._args: any[]): string[] { return []; }
