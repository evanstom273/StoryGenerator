import type { MetaChatReference, PlayerCharacter, Story, Universe } from "../types/models";

export type MetaChatReferenceSuggestion = MetaChatReference & {
  score: number;
};

function normalizeReferenceName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ");
}

function buildReferenceCandidates(args: {
  stories: Story[];
  characters: PlayerCharacter[];
  universes: Universe[];
}) {
  return [
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
  ].filter((candidate) => candidate.normalizedLabel.length > 0);
}

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
  if (!query) {
    return 50;
  }
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

export function getMetaChatReferenceSuggestions(args: {
  query: string;
  stories: Story[];
  characters: PlayerCharacter[];
  universes: Universe[];
  limit?: number;
}): MetaChatReferenceSuggestion[] {
  const normalizedQuery = normalizeReferenceName(args.query);
  const suggestions = buildReferenceCandidates(args)
    .map((candidate) => ({
      id: candidate.id,
      kind: candidate.kind,
      label: candidate.label,
      score: scoreCandidate(normalizedQuery, candidate.normalizedLabel),
      normalizedLabel: candidate.normalizedLabel,
    }))
    .filter((candidate) => candidate.score >= (normalizedQuery ? 64 : 50))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.normalizedLabel.length - right.normalizedLabel.length;
    })
    .slice(0, args.limit ?? 8)
    .map(({ normalizedLabel: _normalizedLabel, ...candidate }) => candidate);

  return suggestions;
}
