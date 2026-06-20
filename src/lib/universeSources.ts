import type { Universe, UniverseDraft, UniverseWikiSource } from "../types/models";

function normalizeSourceUrl(value: string | undefined) {
  return (value ?? "").trim();
}

export function normalizeUniverseWikiSources(
  draft: Pick<UniverseDraft, "wikiUrl" | "wikiUrls"> | Pick<Universe, "wikiUrl" | "wikiUrls">,
): UniverseWikiSource[] {
  const explicit = Array.isArray(draft.wikiUrls) ? draft.wikiUrls : [];
  const seeded = explicit.length
    ? explicit
    : normalizeSourceUrl(draft.wikiUrl)
      ? [{ url: normalizeSourceUrl(draft.wikiUrl), order: 0 }]
      : [];

  return seeded
    .map((source, index) => ({
      url: normalizeSourceUrl(source.url),
      label: source.label?.trim() || undefined,
      order: Number.isFinite(source.order) ? source.order : index,
    }))
    .filter((source) => source.url)
    .sort((left, right) => left.order - right.order)
    .map((source, index) => ({
      ...source,
      order: index,
    }));
}

export function getPrimaryUniverseWikiUrl(
  draft: Pick<UniverseDraft, "wikiUrl" | "wikiUrls"> | Pick<Universe, "wikiUrl" | "wikiUrls">,
) {
  return normalizeUniverseWikiSources(draft)[0]?.url ?? normalizeSourceUrl(draft.wikiUrl);
}

export function formatUniverseWikiSources(
  draft: Pick<UniverseDraft, "wikiUrl" | "wikiUrls"> | Pick<Universe, "wikiUrl" | "wikiUrls">,
) {
  return normalizeUniverseWikiSources(draft).map((source, index) =>
    `${index + 1}. ${source.label?.trim() ? `${source.label.trim()} — ` : ""}${source.url}`,
  );
}
