import type {
  MetaChatReference,
  PlayerCharacter,
  Story,
  Universe,
} from "../types/models";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
    .filter((candidate) => candidate.normalizedLabel.length > 0)
    .sort((left, right) => right.normalizedLabel.length - left.normalizedLabel.length);

  const resolved: MetaChatReference[] = [];
  const matchedRanges: Array<{ start: number; end: number }> = [];

  for (const candidate of candidates) {
    const pattern = new RegExp(
      `(^|\\s)@${escapeRegExp(candidate.label)}(?=$|[\\s.,!?;:])`,
      "gi",
    );
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(haystack)) !== null) {
      const start = match.index + match[1].length;
      const end = start + candidate.label.length + 1;
      const overlaps = matchedRanges.some(
        (range) => !(end <= range.start || start >= range.end),
      );
      if (overlaps) {
        continue;
      }
      matchedRanges.push({ start, end });
      resolved.push({
        id: candidate.id,
        kind: candidate.kind,
        label: candidate.label,
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
