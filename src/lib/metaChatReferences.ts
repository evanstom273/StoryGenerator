import type { MetaChatReference, PlayerCharacter, Story, Universe } from "../types/models";

function normalizeReferenceName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ");
}

function toUniqueReferences(references: MetaChatReference[]) {
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = `${reference.kind}:${reference.id}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function mergeMetaChatReferences(...referenceSets: Array<MetaChatReference[] | undefined>) {
  return toUniqueReferences(referenceSets.flatMap((set) => set ?? []));
}

export function resolveMetaChatReferences(args: {
  text: string;
  stories: Story[];
  characters: PlayerCharacter[];
  universes: Universe[];
}): MetaChatReference[] {
  const haystack = args.text.trim();
  if (!haystack.includes("@")) {
    return [];
  }

  const candidates: Array<MetaChatReference & { normalizedLabel: string }> = [
    ...args.stories.map((story) => ({
      id: story.id,
      kind: "story" as const,
      label: story.title,
      normalizedLabel: normalizeReferenceName(story.title),
    })),
    ...args.characters.map((character) => ({
      id: character.id,
      kind: "character" as const,
      label: character.name,
      normalizedLabel: normalizeReferenceName(character.name),
    })),
    ...args.universes.map((universe) => ({
      id: universe.id,
      kind: "universe" as const,
      label: universe.name,
      normalizedLabel: normalizeReferenceName(universe.name),
    })),
  ]
    .filter((candidate) => candidate.normalizedLabel.length > 0);

  const mentionPattern =
    /(^|\s)@([A-Za-z0-9][A-Za-z0-9'’&.+-]*(?:\s+[A-Za-z0-9][A-Za-z0-9'’&.+-]*){0,5})/g;
  const resolved: MetaChatReference[] = [];
  let match: RegExpExecArray | null;

  function tokenPrefixScore(query: string, candidateLabel: string) {
    const queryTokens = query.split(" ").filter(Boolean);
    const candidateTokens = candidateLabel.split(" ").filter(Boolean);
    if (!queryTokens.length || !candidateTokens.length) {
      return 0;
    }

    let candidateIndex = 0;
    for (const queryToken of queryTokens) {
      let matched = false;
      while (candidateIndex < candidateTokens.length) {
        if (candidateTokens[candidateIndex]!.startsWith(queryToken)) {
          matched = true;
          candidateIndex += 1;
          break;
        }
        candidateIndex += 1;
      }
      if (!matched) {
        return 0;
      }
    }

    return 80 + queryTokens.length;
  }

  function scoreCandidate(query: string, candidateLabel: string) {
    if (query === candidateLabel) {
      return 100;
    }
    if (candidateLabel.startsWith(query)) {
      return 92;
    }
    const tokenScore = tokenPrefixScore(query, candidateLabel);
    if (tokenScore > 0) {
      return tokenScore;
    }
    if (candidateLabel.includes(query)) {
      return 70;
    }
    const candidateTokens = candidateLabel.split(" ").filter(Boolean);
    if (candidateTokens.some((token) => token.startsWith(query))) {
      return 64;
    }
    return 0;
  }

  while ((match = mentionPattern.exec(haystack)) !== null) {
    const rawQuery = match[2] ?? "";
    const normalizedQuery = normalizeReferenceName(rawQuery);
    if (normalizedQuery.length < 2) {
      continue;
    }

    let bestMatch: (MetaChatReference & { normalizedLabel: string }) | null = null;
    let bestScore = 0;

    for (const candidate of candidates) {
      const score = scoreCandidate(normalizedQuery, candidate.normalizedLabel);
      if (score > bestScore) {
        bestMatch = candidate;
        bestScore = score;
        continue;
      }
      if (
        score === bestScore &&
        score > 0 &&
        bestMatch &&
        candidate.normalizedLabel.length < bestMatch.normalizedLabel.length
      ) {
        bestMatch = candidate;
      }
    }

    if (bestMatch && bestScore >= 64) {
      resolved.push({
        id: bestMatch.id,
        kind: bestMatch.kind,
        label: bestMatch.label,
      });
    }
  }

  return toUniqueReferences(resolved);
}

export function getMetaChatReferenceDisplay(reference: MetaChatReference) {
  if (reference.kind === "story") {
    return `Story: ${reference.label}`;
  }
  if (reference.kind === "character") {
    return `Character: ${reference.label}`;
  }
  return `Universe: ${reference.label}`;
}
