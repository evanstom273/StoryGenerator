export const GLOBAL_META_CHAT_SCOPE_ID = "__story_engine_global_metachat__";

export function isGlobalMetaChatScope(scopeId: string | null | undefined) {
  return scopeId === GLOBAL_META_CHAT_SCOPE_ID;
}
