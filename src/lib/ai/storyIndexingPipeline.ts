import type {
  EntityId,
  PlayerCharacter,
  Story,
  StoryIndex,
  StoryIndexChapterSummary,
  StoryIndexCharacter,
  StoryIndexRelationship,
  StoryMessage,
} from "../../types/models";
import type { AIProvider } from "./types";
import { createEntityId } from "../ids";

export interface IndexingExtractionCharacter {
  name: string;
  matchedId?: string;
  aliases?: string[];
  description?: string;
  status?: string;
  developments?: string[];
}

export interface IndexingExtractionRelationship {
  characterA: string;
  characterB: string;
  nature: string;
  state?: string;
  developments?: string[];
}

export interface IndexingExtractionResponse {
  chapterSummary?: string;
  characters?: IndexingExtractionCharacter[];
  relationships?: IndexingExtractionRelationship[];
}

export interface ProcessIndexingBatchParams {
  story: Story;
  playerCharacter: PlayerCharacter;
  chapterLabel: string;
  chapterId?: string;
  messages: StoryMessage[];
  existingIndex: StoryIndex | null;
  provider: AIProvider;
  apiKey?: string;
  model: string;
  signal?: AbortSignal;
}

export function normalizeNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/['"“”‘’]/g, "").replace(/\s+/g, " ");
}

/**
 * Matches a candidate name against existing canonical characters by display name or any known alias.
 */
export function matchExistingCharacter(
  name: string,
  characters: StoryIndexCharacter[],
): StoryIndexCharacter | null {
  const key = normalizeNameKey(name);
  if (!key) return null;

  for (const char of characters) {
    if (normalizeNameKey(char.canonicalName) === key) {
      return char;
    }
    for (const alias of char.aliases) {
      if (normalizeNameKey(alias) === key) {
        return char;
      }
    }
  }

  return null;
}

/**
 * Builds the canonical pair key for relationship tracking (order-independent).
 */
export function buildRelationshipPairKey(idA: string, idB: string): string {
  return [idA, idB].sort().join("::");
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function sanitizeAndParseJson(candidate: string): unknown {
  // Direct parse
  const direct = tryParseJson(candidate);
  if (direct) return direct;

  // Trailing commas fix before } or ]
  const withoutTrailingCommas = candidate.replace(/,\s*([}\]])/g, "$1");
  const trailingFix = tryParseJson(withoutTrailingCommas);
  if (trailingFix) return trailingFix;

  // Strip unescaped control characters (except common whitespace \n, \r, \t)
  const cleanedControls = withoutTrailingCommas.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F]+/g, " ");
  return tryParseJson(cleanedControls);
}

export function parseAndValidateIndexingExtraction(
  jsonText: string,
): IndexingExtractionResponse {
  let parsed: unknown = null;

  // 1. Check markdown code block first (e.g. "Here is the extraction:\n```json ... ```")
  const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]?.trim()) {
    parsed = sanitizeAndParseJson(codeBlockMatch[1].trim());
  }

  // 2. Direct cleaned attempt
  if (!parsed) {
    const cleaned = jsonText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    parsed = sanitizeAndParseJson(cleaned);
  }

  // 3. Outermost brace search { ... }
  if (!parsed) {
    const firstBrace = jsonText.indexOf("{");
    const lastBrace = jsonText.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const candidate = jsonText.slice(firstBrace, lastBrace + 1);
      parsed = sanitizeAndParseJson(candidate);
    }
  }

  if (!parsed) {
    if (!jsonText.includes("{") || !jsonText.includes("}")) {
      throw new Error("Invalid model response: failed to parse structured JSON.");
    }
    throw new Error("Invalid model response: JSON substring is malformed.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid extraction response: expected JSON object.");
  }

  const result: IndexingExtractionResponse = {};
  const obj = parsed as Record<string, unknown>;

  if (typeof obj.chapterSummary === "string" && obj.chapterSummary.trim()) {
    result.chapterSummary = obj.chapterSummary.trim();
  }

  if (Array.isArray(obj.characters)) {
    result.characters = obj.characters
      .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === "object"))
      .map((c) => ({
        name: typeof c.name === "string" ? c.name.trim() : "",
        matchedId: typeof c.matchedId === "string" ? c.matchedId.trim() : undefined,
        aliases: Array.isArray(c.aliases)
          ? c.aliases.filter((a): a is string => typeof a === "string" && Boolean(a.trim()))
          : [],
        description: typeof c.description === "string" ? c.description.trim() : "",
        status: typeof c.status === "string" ? c.status.trim() : "",
        developments: Array.isArray(c.developments)
          ? c.developments.filter((d): d is string => typeof d === "string" && Boolean(d.trim()))
          : [],
      }))
      .filter((c) => Boolean(c.name));
  }

  if (Array.isArray(obj.relationships)) {
    result.relationships = obj.relationships
      .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === "object"))
      .map((r) => ({
        characterA: typeof r.characterA === "string" ? r.characterA.trim() : "",
        characterB: typeof r.characterB === "string" ? r.characterB.trim() : "",
        nature: typeof r.nature === "string" ? r.nature.trim() : "",
        state: typeof r.state === "string" ? r.state.trim() : "",
        developments: Array.isArray(r.developments)
          ? r.developments.filter((d): d is string => typeof d === "string" && Boolean(d.trim()))
          : [],
      }))
      .filter((r) => Boolean(r.characterA && r.characterB && r.nature));
  }

  return result;
}

export function buildIndexingPrompt(params: {
  storyTitle: string;
  playerCharacter: PlayerCharacter;
  chapterLabel: string;
  existingChapterSummary?: string | null;
  existingCharacters: StoryIndexCharacter[];
  existingRelationships: StoryIndexRelationship[];
  newMessages: StoryMessage[];
}): string {
  const {
    storyTitle,
    playerCharacter,
    chapterLabel,
    existingChapterSummary,
    existingCharacters,
    existingRelationships,
    newMessages,
  } = params;

  const charactersList = existingCharacters.length
    ? existingCharacters
        .map(
          (c) =>
            `- ID: ${c.id} | Name: "${c.canonicalName}" | Aliases: [${c.aliases.map((a) => `"${a}"`).join(", ")}] | Info: ${c.description || "None"} | Status: ${c.status || "None"}`,
        )
        .join("\n")
    : "None recorded yet.";

  const relationshipsList = existingRelationships.length
    ? existingRelationships
        .map((r) => {
          const charA = existingCharacters.find((c) => c.id === r.characterIdA)?.canonicalName ?? r.characterIdA;
          const charB = existingCharacters.find((c) => c.id === r.characterIdB)?.canonicalName ?? r.characterIdB;
          return `- ${charA} & ${charB}: ${r.nature} | State: ${r.state || "None"}`;
        })
        .join("\n")
    : "None recorded yet.";

  const transcriptText = newMessages
    .map((m) => {
      const speaker = m.speakerName ? `${m.speakerName}: ` : m.role === "user" ? "Player: " : "";
      return `[Message ${m.id}]\n${speaker}${m.content}`;
    })
    .join("\n\n");

  return [
    `You are the StoryEngine Indexing Intelligence. Analyze the new story transcript messages for "${storyTitle}" (Active Chapter: "${chapterLabel}") and extract coherent structured indexing memory.`,
    "",
    "### Authoritative Canon Constraints (Strict):",
    `- Player Character: "${playerCharacter.name}" (Aliases: [${(playerCharacter.aliases ?? []).map((a) => `"${a}"`).join(", ")}]). Pronouns: ${playerCharacter.pronouns || "Unknown"}. Gender: ${playerCharacter.gender || "Unknown"}.`,
    "- The transcript is authoritative. The index is derived narrative memory.",
    "- NEVER change the player character's canonical identity, gender, or core profile.",
    "- STABLE CHARACTER IDENTITY: If a character is referred to by a nickname, alias, title, or former name (e.g. 'Jamie' vs 'James', 'Becca' vs 'Rebecca'), resolve them to the SAME canonical character record rather than creating a duplicate person.",
    "- If matching an existing character listed below, specify their existing ID in matchedId.",
    "",
    "### Existing Chapter Summary for this Chapter:",
    existingChapterSummary
      ? existingChapterSummary
      : "None yet. Create the initial detailed chapter summary from these messages.",
    "",
    "### Existing Canonical Characters:",
    charactersList,
    "",
    "### Existing Relationships:",
    relationshipsList,
    "",
    "### New Story Messages to Index:",
    transcriptText,
    "",
    "### Required Output JSON Format:",
    "Return a single JSON object with EXACTLY this structure (no markdown fences, no explanatory preamble):",
    "{",
    '  "chapterSummary": "Comprehensive detailed narrative memory capturing what happened in this chapter (important events, character decisions, revelations, dialogue, agreements, emotional shifts, and end-of-chapter situation). If an existing summary was provided above, update and expand it seamlessly rather than truncating.",',
    '  "characters": [',
    "    {",
    '      "matchedId": "Existing ID if this matches an existing character from the list above, or omit for new character",',
    '      "name": "Canonical display name",',
    '      "aliases": ["any aliases, nicknames, or alternate names used in story"],',
    '      "description": "Established character information, role, traits grounded in story",',
    '      "status": "Current status/state at this point in the story (condition, location, current activity)",',
    '      "developments": ["Important character developments relevant to future continuity"]',
    "    }",
    "  ],",
    '  "relationships": [',
    "    {",
    '      "characterA": "Name or ID of first character",',
    '      "characterB": "Name or ID of second character",',
    '      "nature": "Established nature of their relationship (e.g. partners, estranged siblings, romantic interest)",',
    '      "state": "Current relationship state (e.g. trusting, strained, playful)",',
    '      "developments": ["Key developments in this relationship"]',
    "    }",
    "  ]",
    "}",
  ].join("\n");
}

/**
 * Merges extracted structured data into the story index deterministically and idempotently.
 */
export function applyExtractionToIndex(params: {
  extraction: IndexingExtractionResponse;
  existingIndex: StoryIndex | null;
  storyId: EntityId;
  chapterLabel: string;
  chapterId?: string;
  messageIds: EntityId[];
  playerCharacter: PlayerCharacter;
}): StoryIndex {
  const {
    extraction,
    existingIndex,
    storyId,
    chapterLabel,
    chapterId,
    messageIds,
    playerCharacter,
  } = params;

  const now = new Date().toISOString();
  const lastMessageId = messageIds[messageIds.length - 1];

  // 1. Prepare Chapter Summaries
  const chapterSummaries: StoryIndexChapterSummary[] = [
    ...(existingIndex?.chapterSummaries ?? []),
  ];

  if (extraction.chapterSummary) {
    const existingSummaryIdx = chapterSummaries.findIndex(
      (s) =>
        (chapterId && s.chapterId === chapterId) ||
        normalizeNameKey(s.chapterLabel) === normalizeNameKey(chapterLabel),
    );

    const mergedSourceIds = Array.from(
      new Set([
        ...(existingSummaryIdx >= 0
          ? chapterSummaries[existingSummaryIdx]!.sourceMessageIds
          : []),
        ...messageIds,
      ]),
    );

    const updatedSummary: StoryIndexChapterSummary = {
      chapterId: chapterId || (existingSummaryIdx >= 0 ? chapterSummaries[existingSummaryIdx]!.chapterId : createEntityId("chapter")),
      chapterLabel,
      summary: extraction.chapterSummary,
      sourceMessageIds: mergedSourceIds,
      lastIndexedMessageId: lastMessageId ?? (existingSummaryIdx >= 0 ? chapterSummaries[existingSummaryIdx]!.lastIndexedMessageId : ""),
      updatedAt: now,
    };

    if (existingSummaryIdx >= 0) {
      chapterSummaries[existingSummaryIdx] = updatedSummary;
    } else {
      chapterSummaries.push(updatedSummary);
    }
  }

  // 2. Prepare Characters with Alias & Identity Resolution
  const characters: StoryIndexCharacter[] = (existingIndex?.characters ?? []).map((c) => ({
    ...c,
    aliases: [...c.aliases],
    developments: [...c.developments],
    provenance: [...c.provenance],
  }));

  // Ensure Player Character exists in index as authoritative baseline
  let pcRecord = matchExistingCharacter(playerCharacter.name, characters);
  if (!pcRecord) {
    pcRecord = {
      id: playerCharacter.id || createEntityId("char-player"),
      canonicalName: playerCharacter.name,
      aliases: Array.from(new Set(playerCharacter.aliases ?? [])),
      description: playerCharacter.background || "",
      status: "Active",
      developments: [],
      provenance: [],
      updatedAt: now,
    };
    characters.unshift(pcRecord);
  } else {
    // Keep player character ID and canonical name authoritative
    pcRecord.id = playerCharacter.id || pcRecord.id;
    for (const a of playerCharacter.aliases ?? []) {
      if (!pcRecord.aliases.some((existing) => normalizeNameKey(existing) === normalizeNameKey(a))) {
        pcRecord.aliases.push(a);
      }
    }
  }

  // Merge model extracted characters
  for (const extracted of extraction.characters ?? []) {
    if (!extracted.name) continue;

    // Check matchedId first, then name/alias match
    let existing: StoryIndexCharacter | null = null;
    if (extracted.matchedId) {
      existing = characters.find((c) => c.id === extracted.matchedId) ?? null;
    }
    if (!existing) {
      existing = matchExistingCharacter(extracted.name, characters);
    }
    if (!existing && extracted.aliases?.length) {
      for (const alias of extracted.aliases) {
        existing = matchExistingCharacter(alias, characters);
        if (existing) break;
      }
    }

    if (existing) {
      // Update existing record
      if (extracted.description && extracted.description.length > existing.description.length) {
        existing.description = extracted.description;
      }
      if (extracted.status) {
        existing.status = extracted.status;
      }
      for (const alias of extracted.aliases ?? []) {
        if (!existing.aliases.some((a) => normalizeNameKey(a) === normalizeNameKey(alias))) {
          existing.aliases.push(alias);
        }
      }
      for (const dev of extracted.developments ?? []) {
        if (!existing.developments.some((d) => normalizeNameKey(d) === normalizeNameKey(dev))) {
          existing.developments.push(dev);
        }
      }
      for (const mid of messageIds) {
        if (!existing.provenance.includes(mid)) {
          existing.provenance.push(mid);
        }
      }
      existing.updatedAt = now;
    } else {
      // Create brand new character
      const newId = createEntityId("char");
      characters.push({
        id: newId,
        canonicalName: extracted.name,
        aliases: extracted.aliases ?? [],
        description: extracted.description ?? "",
        status: extracted.status ?? "Active",
        developments: extracted.developments ?? [],
        provenance: [...messageIds],
        updatedAt: now,
      });
    }
  }

  // 3. Prepare Relationships (using canonical Character IDs)
  const relationships: StoryIndexRelationship[] = (existingIndex?.relationships ?? []).map((r) => ({
    ...r,
    developments: [...r.developments],
    provenance: [...r.provenance],
  }));

  for (const extractedRel of extraction.relationships ?? []) {
    const charA = matchExistingCharacter(extractedRel.characterA, characters);
    const charB = matchExistingCharacter(extractedRel.characterB, characters);

    if (!charA || !charB || charA.id === charB.id) {
      continue;
    }

    const pairId = buildRelationshipPairKey(charA.id, charB.id);
    const existingRel = relationships.find(
      (r) => buildRelationshipPairKey(r.characterIdA, r.characterIdB) === pairId,
    );

    if (existingRel) {
      existingRel.nature = extractedRel.nature || existingRel.nature;
      if (extractedRel.state) {
        existingRel.state = extractedRel.state;
      }
      for (const dev of extractedRel.developments ?? []) {
        if (!existingRel.developments.some((d) => normalizeNameKey(d) === normalizeNameKey(dev))) {
          existingRel.developments.push(dev);
        }
      }
      for (const mid of messageIds) {
        if (!existingRel.provenance.includes(mid)) {
          existingRel.provenance.push(mid);
        }
      }
      existingRel.updatedAt = now;
    } else {
      relationships.push({
        id: pairId,
        characterIdA: charA.id,
        characterIdB: charB.id,
        nature: extractedRel.nature,
        state: extractedRel.state ?? "",
        developments: extractedRel.developments ?? [],
        provenance: [...messageIds],
        updatedAt: now,
      });
    }
  }

  // 4. Calculate total unique indexed messages
  const allIndexedMessageIds = new Set<string>();
  for (const cs of chapterSummaries) {
    for (const id of cs.sourceMessageIds) {
      allIndexedMessageIds.add(id);
    }
  }
  for (const id of messageIds) {
    allIndexedMessageIds.add(id);
  }

  return {
    id: existingIndex?.id || `story-index:${storyId}`,
    storyId,
    chapterSummaries,
    characters,
    relationships,
    lastIndexedMessageId: lastMessageId ?? existingIndex?.lastIndexedMessageId,
    lastIndexedAt: now,
    indexedMessageCount: allIndexedMessageIds.size,
    updatedAt: now,
  };
}

/**
 * Orchestrates a single coherent extraction call through the provider and updates the index.
 */
export async function processIndexingBatch(
  params: ProcessIndexingBatchParams,
): Promise<StoryIndex> {
  const {
    story,
    playerCharacter,
    chapterLabel,
    chapterId,
    messages,
    existingIndex,
    provider,
    apiKey,
    model,
    signal,
  } = params;

  if (!messages.length) {
    return existingIndex ?? {
      id: `story-index:${story.id}`,
      storyId: story.id,
      chapterSummaries: [],
      characters: [],
      relationships: [],
      indexedMessageCount: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  const existingSummary = existingIndex?.chapterSummaries.find(
    (s) =>
      (chapterId && s.chapterId === chapterId) ||
      normalizeNameKey(s.chapterLabel) === normalizeNameKey(chapterLabel),
  )?.summary;

  const prompt = buildIndexingPrompt({
    storyTitle: story.title,
    playerCharacter,
    chapterLabel,
    existingChapterSummary: existingSummary,
    existingCharacters: existingIndex?.characters ?? [],
    existingRelationships: existingIndex?.relationships ?? [],
    newMessages: messages,
  });

  const generateExtractionResponse = (repairInstruction?: string) =>
    provider.generateResponse({
      apiKey: apiKey || "",
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a narrative indexing engine. Return strict, valid JSON matching the requested extraction schema.",
        },
        {
          role: "user",
          content: repairInstruction
            ? `${prompt}\n\n### JSON Repair Retry\n${repairInstruction}`
            : prompt,
        },
      ],
      temperature: repairInstruction ? 0 : 0.2,
      maxTokens: 4000,
      signal,
    });

  let response = await generateExtractionResponse();
  let extraction: IndexingExtractionResponse;
  try {
    extraction = parseAndValidateIndexingExtraction(response.content);
  } catch (error) {
    if (signal?.aborted) throw error;

    // A model can occasionally return truncated or malformed JSON even when
    // explicitly instructed otherwise. Retry once with a stricter repair
    // instruction instead of failing the whole indexing operation immediately.
    response = await generateExtractionResponse(
      "Your previous response was not valid parseable JSON. Regenerate the extraction from the transcript above as ONE complete JSON object only. Do not use markdown fences, commentary, or trailing text. Ensure every string is escaped and every object/array is fully closed.",
    );
    extraction = parseAndValidateIndexingExtraction(response.content);
  }

  return applyExtractionToIndex({
    extraction,
    existingIndex,
    storyId: story.id,
    chapterLabel,
    chapterId,
    messageIds: messages.map((m) => m.id),
    playerCharacter,
  });
}
