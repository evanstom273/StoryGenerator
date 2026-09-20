import type {
  PlayerCharacter,
  StoryIndex,
  StoryIndexChapterSummary,
  StoryIndexCharacter,
  StoryIndexRelationship,
  StoryMessage,
} from "../../types/models";
import { normalizeNameKey } from "./storyIndexingPipeline";

export interface BuildDirectorIndexedMemoryParams {
  index: StoryIndex | null;
  recentMessages: StoryMessage[];
  playerCharacter: PlayerCharacter;
  maxChapterSummaries?: number;
  maxCharacters?: number;
  maxSummaryChars?: number;
}

/**
 * Scans recent messages to find character names and aliases mentioned in the active scene.
 */
export function extractActiveCharacterIds(
  recentMessages: StoryMessage[],
  characters: StoryIndexCharacter[],
  playerCharacter: PlayerCharacter,
): Set<string> {
  const activeIds = new Set<string>();

  // Always include player character if indexed
  const pcNormalized = normalizeNameKey(playerCharacter.name);
  const pcChar = characters.find(
    (c) =>
      c.id === playerCharacter.id ||
      normalizeNameKey(c.canonicalName) === pcNormalized,
  );
  if (pcChar) {
    activeIds.add(pcChar.id);
  }

  // Look through recent message text and speakers
  const recentText = recentMessages
    .slice(-10)
    .map((m) => `${m.speakerName ?? ""} ${m.content}`)
    .join(" ")
    .toLowerCase();

  for (const char of characters) {
    if (activeIds.has(char.id)) continue;

    const canonicalLower = char.canonicalName.toLowerCase();
    if (recentText.includes(canonicalLower)) {
      activeIds.add(char.id);
      continue;
    }

    for (const alias of char.aliases) {
      if (alias.length > 2 && recentText.includes(alias.toLowerCase())) {
        activeIds.add(char.id);
        break;
      }
    }
  }

  return activeIds;
}

/**
 * Selects relevant chapter summaries:
 * - For short stories (<= 4 chapters): includes all chapters.
 * - For long stories: includes the most recent 2-3 chapters for immediate continuity,
 *   plus older chapters that feature active characters or major developments.
 */
export function selectRelevantChapterSummaries(
  summaries: StoryIndexChapterSummary[],
  activeCharacters: StoryIndexCharacter[],
  maxCount = 4,
): StoryIndexChapterSummary[] {
  if (summaries.length <= maxCount) {
    return summaries;
  }

  // Always include the latest 2 chapters for immediate continuity
  const recent = summaries.slice(-2);
  const recentIds = new Set(recent.map((s) => s.chapterId));

  // Prioritize older summaries that mention any active character name or alias
  const activeNames = activeCharacters.flatMap((c) => [
    c.canonicalName.toLowerCase(),
    ...c.aliases.map((a) => a.toLowerCase()),
  ]);

  const scoredOlder = summaries
    .slice(0, -2)
    .map((summary) => {
      const text = `${summary.chapterLabel} ${summary.summary}`.toLowerCase();
      let matchCount = 0;
      for (const name of activeNames) {
        if (text.includes(name)) matchCount += 1;
      }
      return { summary, matchCount };
    })
    .sort((a, b) => b.matchCount - a.matchCount);

  const olderSelected = scoredOlder
    .slice(0, maxCount - recent.length)
    .map((item) => item.summary);

  // Return selected summaries in chronological order
  return summaries.filter(
    (s) => recentIds.has(s.chapterId) || olderSelected.some((o) => o.chapterId === s.chapterId),
  );
}

/**
 * Formats canonical character records for Director prompt.
 */
export function formatIndexedCharactersForDirector(
  characters: StoryIndexCharacter[],
): string {
  if (!characters.length) return "";

  return characters
    .map((c) => {
      const aliasesPart = c.aliases.length
        ? ` (Aliases: ${c.aliases.join(", ")})`
        : "";
      const statusPart = c.status ? `\n  - Current Status: ${c.status}` : "";
      const descPart = c.description ? `\n  - Background: ${c.description}` : "";
      const devPart = c.developments.length
        ? `\n  - Developments:\n${c.developments.map((d) => `    * ${d}`).join("\n")}`
        : "";
      return `* ${c.canonicalName}${aliasesPart}:${statusPart}${descPart}${devPart}`;
    })
    .join("\n\n");
}

/**
 * Formats canonical relationships for Director prompt.
 */
export function formatIndexedRelationshipsForDirector(
  relationships: StoryIndexRelationship[],
  characterMap: Map<string, StoryIndexCharacter>,
): string {
  if (!relationships.length) return "";

  return relationships
    .map((r) => {
      const nameA = characterMap.get(r.characterIdA)?.canonicalName ?? r.characterIdA;
      const nameB = characterMap.get(r.characterIdB)?.canonicalName ?? r.characterIdB;
      const statePart = r.state ? ` [State: ${r.state}]` : "";
      const devPart = r.developments.length
        ? `\n  - Developments: ${r.developments.join("; ")}`
        : "";
      return `* ${nameA} & ${nameB}: ${r.nature}${statePart}${devPart}`;
    })
    .join("\n");
}

/**
 * Formats chapter summaries for Director prompt.
 */
export function formatChapterSummariesForDirector(
  summaries: StoryIndexChapterSummary[],
  maxSummaryChars = 2000,
): string {
  if (!summaries.length) return "";

  return summaries
    .map((s) => {
      const truncated =
        s.summary.length > maxSummaryChars
          ? `${s.summary.slice(0, maxSummaryChars).trim()}…`
          : s.summary;
      return `### ${s.chapterLabel}\n${truncated}`;
    })
    .join("\n\n");
}

/**
 * Builds the complete formatted "Indexed Story Memory" block for injection into Director context.
 */
export function buildDirectorIndexedMemory(
  params: BuildDirectorIndexedMemoryParams,
): string | null {
  const {
    index,
    recentMessages,
    playerCharacter,
    maxChapterSummaries = 4,
    maxCharacters = 8,
    maxSummaryChars = 2500,
  } = params;

  if (!index) return null;

  const allCharacters = index.characters ?? [];
  const allRelationships = index.relationships ?? [];
  const allChapterSummaries = index.chapterSummaries ?? [];

  if (!allCharacters.length && !allRelationships.length && !allChapterSummaries.length) {
    return null;
  }

  // 1. Resolve relevant characters
  const activeIds = extractActiveCharacterIds(recentMessages, allCharacters, playerCharacter);
  let relevantCharacters: StoryIndexCharacter[] = [];

  if (allCharacters.length <= maxCharacters) {
    relevantCharacters = allCharacters;
  } else {
    // Active characters first, then others up to maxCharacters
    const activeList = allCharacters.filter((c) => activeIds.has(c.id));
    const inactiveList = allCharacters.filter((c) => !activeIds.has(c.id));
    relevantCharacters = [...activeList, ...inactiveList].slice(0, maxCharacters);
  }

  const charMap = new Map(allCharacters.map((c) => [c.id, c]));
  const relevantCharIds = new Set(relevantCharacters.map((c) => c.id));

  // 2. Resolve relationships involving relevant characters
  const relevantRelationships = allRelationships.filter(
    (r) => relevantCharIds.has(r.characterIdA) || relevantCharIds.has(r.characterIdB),
  );

  // 3. Resolve chapter summaries
  const relevantSummaries = selectRelevantChapterSummaries(
    allChapterSummaries,
    relevantCharacters,
    maxChapterSummaries,
  );

  // 4. Assemble sections
  const sections: string[] = [];

  if (relevantSummaries.length) {
    sections.push(
      `#### Detailed Chapter Summaries (Narrative History)\n${formatChapterSummariesForDirector(relevantSummaries, maxSummaryChars)}`,
    );
  }

  if (relevantCharacters.length) {
    sections.push(
      `#### Canonical Characters & Current Status\n${formatIndexedCharactersForDirector(relevantCharacters)}`,
    );
  }

  if (relevantRelationships.length) {
    sections.push(
      `#### Character Relationships\n${formatIndexedRelationshipsForDirector(relevantRelationships, charMap)}`,
    );
  }

  if (!sections.length) return null;

  return sections.join("\n\n");
}
