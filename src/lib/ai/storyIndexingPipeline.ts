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
  pronouns?: string;
  identityUpdate?: {
    name?: string;
    pronouns?: string;
  };
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
    if (char.id === name.trim()) {
      return char;
    }
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

function replaceIdentityWord(text: string, from: string, to: string): string {
  if (!from.trim() || normalizeNameKey(from) === normalizeNameKey(to)) return text;
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`\\b${escaped}\\b`, "gi"), (match) => {
    if (match === match.toUpperCase()) return to.toUpperCase();
    if (match[0] === match[0]?.toUpperCase()) return to.charAt(0).toUpperCase() + to.slice(1);
    return to;
  });
}

function pronounForms(pronouns?: string): { subject?: string; object?: string; possessive?: string } {
  if (!pronouns) return {};
  const [subject, object] = pronouns.toLowerCase().split("/").map((part) => part.trim());
  const possessive =
    subject === "he" ? "his" :
    subject === "she" ? "her" :
    subject === "they" ? "their" :
    undefined;
  return { subject, object, possessive };
}

function rewriteIdentityReferences(
  text: string,
  formerNames: string[],
  oldPronouns: string | undefined,
  newName: string,
  newPronouns: string | undefined,
): string {
  let rewritten = text;
  for (const formerName of formerNames) {
    rewritten = replaceIdentityWord(rewritten, formerName, newName);
  }

  const oldForms = pronounForms(oldPronouns);
  const newForms = pronounForms(newPronouns);
  if (oldForms.subject && newForms.subject) rewritten = replaceIdentityWord(rewritten, oldForms.subject, newForms.subject);
  if (oldForms.object && newForms.object) rewritten = replaceIdentityWord(rewritten, oldForms.object, newForms.object);
  if (oldForms.possessive && newForms.possessive) rewritten = replaceIdentityWord(rewritten, oldForms.possessive, newForms.possessive);
  return rewritten;
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
        pronouns: typeof c.pronouns === "string" ? c.pronouns.trim() : undefined,
        identityUpdate:
          c.identityUpdate && typeof c.identityUpdate === "object"
            ? {
                name: typeof (c.identityUpdate as Record<string, unknown>).name === "string"
                  ? ((c.identityUpdate as Record<string, unknown>).name as string).trim()
                  : undefined,
                pronouns: typeof (c.identityUpdate as Record<string, unknown>).pronouns === "string"
                  ? ((c.identityUpdate as Record<string, unknown>).pronouns as string).trim()
                  : undefined,
              }
            : undefined,
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
            `- ID: ${c.id} | Name: "${c.canonicalName}" | Aliases: [${c.aliases.map((a) => `"${a}"`).join(", ")}] | Pronouns: ${c.pronouns || "Unknown"} | Info: ${c.description || "None"} | Status: ${c.status || "None"} | Existing developments: [${c.developments.map((d) => `"${d}"`).join(", ")}]`,
        )
        .join("\n")
    : "None recorded yet.";

  const relationshipsList = existingRelationships.length
    ? existingRelationships
        .map((r) => {
          const charA = existingCharacters.find((c) => c.id === r.characterIdA)?.canonicalName ?? r.characterIdA;
          const charB = existingCharacters.find((c) => c.id === r.characterIdB)?.canonicalName ?? r.characterIdB;
          return `- ${charA} & ${charB}: ${r.nature} | State: ${r.state || "None"} | Existing developments: [${r.developments.map((d) => `"${d}"`).join(", ")}]`;
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
    `- Initial Player Character Sheet: "${playerCharacter.name}" (Aliases: [${(playerCharacter.aliases ?? []).map((a) => `"${a}"`).join(", ")}]). Pronouns: ${playerCharacter.pronouns || "Unknown"}. Gender: ${playerCharacter.gender || "Unknown"}.`,
    "- The transcript is authoritative. The index is derived narrative memory.",
    "- The player character sheet is the INITIAL identity baseline. Do not casually overwrite core profile facts, but the transcript may explicitly establish a later preferred name or pronouns.",
    "- STABLE CHARACTER IDENTITY: If a character is referred to by a nickname, alias, title, former name, or newly chosen name, resolve them to the SAME canonical character record rather than creating a duplicate person.",
    "- IDENTITY EVOLUTION: Only when the transcript explicitly establishes that a character now uses a different name and/or pronouns, return identityUpdate for that existing character. Never infer an identity change from a nickname, disguise, title, typo, or one-off form of address.",
    "- When identityUpdate is present, use the character's CURRENT preferred name and pronouns throughout character and relationship text. Keep former names as aliases.",
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
    "### Evidence & Canon Precision (Strict):",
    "- UNDERSTAND FREELY; CANONIZE CONSERVATIVELY. Use semantic understanding to connect events and preserve narrative meaning, but store the least assumptive accurate wording supported by the transcript.",
    "- Distinguish OBSERVED/EXPLICIT FACT from INTERPRETATION. Do not promote a plausible interpretation into established canon merely because it fits the scene.",
    "- Preserve uncertainty, attribution, and provisional language. Suspicions, theories, beliefs, guesses, fears, plans, and accusations remain attributed or uncertain until the transcript establishes them as fact.",
    "- Do not upgrade observable distress or behavior into a clinical, diagnostic, psychological, or neurodevelopmental label unless the transcript explicitly establishes that label. For example, distress/refusal is not automatically a meltdown, panic attack, shutdown, trauma response, or sensory episode.",
    "- Do not upgrade symptoms into diagnoses; affection or flirtation into romance; disagreement or tension into hostility, a fight, estrangement, or relationship rupture; concern into fear; reluctance into terror; preference or reliance into an essential dependency.",
    "- Do not invent motives, emotions, intentions, causality, severity, permanence, or significance beyond what dialogue, narration, or clearly established context supports.",
    "- Distinguish ATTEMPTED, PLANNED, PROPOSED, and COMPLETED actions. Never record an intended or interrupted action as having happened.",
    "- Existing index text is derived memory, not stronger evidence than the transcript. If an earlier summary/development used wording that new or reviewed transcript evidence does not support, correct or soften that wording rather than perpetuating it.",
    "- Semantic compression is encouraged, but precision outranks drama. Prefer concrete narrative meaning over stronger, more colorful, more clinical, or more definitive terminology.",
    "",
    "### Relationship Extraction Guidance (Important):",
    "- Relationships are important narrative memory. Actively extract them when the connection or interaction between two characters is significant enough that remembering their interpersonal history could affect a future scene.",
    "- Extract both established relationships from history/backstory and relationships revealed or created in the new messages. A relationship does NOT need to begin or change in this chapter to be worth recording.",
    "- Use explicit facts AND strongly supported interpersonal context. Trust, affection, protectiveness, familiarity, authority, resentment, rivalry, fear, suspicion, hostility, flirtation, betrayal, rescue, violence, meaningful cooperation, and major personal disclosures can all establish a relationship.",
    "- A single consequential interaction can be relationship-worthy even when the characters have only just met. For example, a serious confrontation, attack, betrayal, rescue, or capture can establish an adversarial, hostile, indebted, protective, or otherwise meaningful relationship.",
    "- Bias toward preserving a meaningful relationship rather than omitting it when the transcript provides reasonable narrative support. Do not require characters to explicitly label their relationship.",
    "- That preservation bias applies to WHETHER a narratively meaningful relationship should be remembered, not to strengthening its nature, state, motives, emotions, or significance beyond the evidence. Keep those descriptions conservative and evidence-grounded.",
    "- Do not create relationship records for mere co-presence or trivial incidental exchanges. The test is whether their interpersonal history would be useful context if they encounter each other again.",
    "- The relationship nature is the relatively durable connection (examples: close friends, trusted colleagues, captain/officer, parent/child, siblings, mentor/student, romantic partners, ex-partners, rivals, adversaries, uneasy allies, newly hostile acquaintances).",
    "- The relationship state is how that connection currently stands or feels (examples: trusting, affectionate, playful, strained, suspicious, hostile, protective, conflicted).",
    "- Keep relationship developments selective: record consequential events, revelations, or changes in the relationship, not every small interaction.",
    "- EXISTING DEVELOPMENT DEDUPLICATION: Existing character and relationship developments listed above are already stored canonical memory. Do not return a development that merely repeats, paraphrases, recalls, or continues an already-recorded development. Return only materially new information introduced by the new messages.",
    "- DELTA-ONLY DEVELOPMENTS: When a new event extends an existing development, return ONLY the newly learned detail, not a rewritten version of the old development plus the new detail. Example: if the index already records that a child climbed into his parents\' bed, and the new messages establish that he sucks his thumb while sleeping there, record only the thumb-sucking/stimming detail; do not restate that he climbed into or slept in the parents\' bed.",
    "- CHAPTER LOCALITY: chapterSummary must summarize ONLY events contained in the New Story Messages to Index for the active chapter. Existing characters, relationships, developments, inherited/ancestor chapter summaries, and other Story State are context only. Never recap inherited or earlier-story events inside the active chapter summary unless the new messages themselves explicitly revisit/discuss them, and then summarize only that present-chapter discussion or consequence.",
    "- When meaningful evidence supports several relationships in the chapter, include each useful relationship rather than returning an empty or artificially sparse relationships array.",
    "",
    "### Required Output JSON Format:",
    "Return a single JSON object with EXACTLY this structure (no markdown fences, no explanatory preamble):",
    "{",
    '  "chapterSummary": "Comprehensive detailed narrative memory of ONLY the active chapter messages supplied above (important events, character decisions, revelations, dialogue, agreements, emotional shifts, and end-of-chapter situation). Treat existing/inherited Story State only as context, never as events of this chapter. If an existing summary for THIS active chapter was provided above, update and expand it seamlessly rather than truncating.",',
    '  "characters": [',
    "    {",
    '      "matchedId": "Existing ID if this matches an existing character from the list above, or omit for new character",',
    '      "name": "Canonical display name",',
    '      "aliases": ["any aliases, nicknames, former names, or alternate names used in story"],',
    '      "pronouns": "Current pronouns if established in the story, otherwise omit",',
    '      "identityUpdate": { "name": "New current preferred display name ONLY if explicitly established, otherwise omit", "pronouns": "New current pronouns ONLY if explicitly established, otherwise omit" },',
    '      "description": "Established character information, role, traits grounded in story using current preferred name/pronouns",',
    '      "status": "Current status/state at this point in the story (condition, location, current activity)",',
    '      "developments": ["Only materially new character developments from these new messages; when extending existing memory, emit only the novel delta and do not restate already-indexed facts"]',
    "    }",
    "  ],",
    '  "relationships": [',
    "    {",
    '      "characterA": "Name or ID of first character",',
    '      "characterB": "Name or ID of second character",',
    '      "nature": "Established nature of their relationship (e.g. partners, estranged siblings, romantic interest)",',
    '      "state": "Current relationship state (e.g. trusting, strained, playful)",',
    '      "developments": ["Only materially new relationship developments from these new messages; when extending existing memory, emit only the novel delta and do not restate already-indexed facts"]',
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
        // Inherited chapters can have the same local label (for example both
        // stories have "Chapter I"). Never merge a sequel chapter into an
        // ancestor's summary merely because the labels match.
        !s.originStoryId &&
        ((chapterId && s.chapterId === chapterId) ||
          normalizeNameKey(s.chapterLabel) === normalizeNameKey(chapterLabel)),
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
      pronouns: playerCharacter.pronouns || undefined,
      description: playerCharacter.background || "",
      status: "Active",
      developments: [],
      provenance: [],
      updatedAt: now,
    };
    characters.unshift(pcRecord);
  } else {
    // Keep the stable player-character ID authoritative. Display identity may
    // evolve later in the transcript without creating a second character.
    pcRecord.id = playerCharacter.id || pcRecord.id;
    if (!pcRecord.pronouns && playerCharacter.pronouns) {
      pcRecord.pronouns = playerCharacter.pronouns;
    }
    for (const a of playerCharacter.aliases ?? []) {
      if (!pcRecord.aliases.some((existing) => normalizeNameKey(existing) === normalizeNameKey(a))) {
        pcRecord.aliases.push(a);
      }
    }
  }

  const identityChanges: Array<{
    characterId: string;
    formerNames: string[];
    oldPronouns?: string;
    newName: string;
    newPronouns?: string;
  }> = [];

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
      // Explicit story-established identity changes update presentation while
      // preserving the same stable character ID and retaining former names as aliases.
      const nextName = extracted.identityUpdate?.name?.trim();
      const nextPronouns = extracted.identityUpdate?.pronouns?.trim();
      if (nextName || nextPronouns) {
        const formerNames = [existing.canonicalName, ...existing.aliases];
        const oldPronouns = existing.pronouns;
        if (nextName && normalizeNameKey(nextName) !== normalizeNameKey(existing.canonicalName)) {
          const formerName = existing.canonicalName;
          if (!existing.aliases.some((a) => normalizeNameKey(a) === normalizeNameKey(formerName))) {
            existing.aliases.push(formerName);
          }
          existing.canonicalName = nextName;
        }
        if (nextPronouns) existing.pronouns = nextPronouns;
        identityChanges.push({
          characterId: existing.id,
          formerNames,
          oldPronouns,
          newName: nextName || existing.canonicalName,
          newPronouns: nextPronouns || existing.pronouns,
        });
      } else if (extracted.pronouns?.trim()) {
        existing.pronouns = extracted.pronouns.trim();
      }

      // An explicit identity update may legitimately produce a shorter rewritten description.
      if (extracted.description && (extracted.identityUpdate || extracted.description.length > existing.description.length)) {
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
        canonicalName: extracted.identityUpdate?.name?.trim() || extracted.name,
        aliases: extracted.aliases ?? [],
        pronouns: extracted.identityUpdate?.pronouns?.trim() || extracted.pronouns?.trim() || undefined,
        description: extracted.description ?? "",
        status: extracted.status ?? "Active",
        developments: extracted.developments ?? [],
        provenance: [...messageIds],
        updatedAt: now,
      });
    }
  }

  // Normalize previously derived character prose when the story explicitly
  // establishes a new current identity. This keeps the current index panel
  // consistent without altering the authoritative transcript or chapter summaries.
  for (const change of identityChanges) {
    const character = characters.find((candidate) => candidate.id === change.characterId);
    if (!character) continue;
    character.description = rewriteIdentityReferences(
      character.description, change.formerNames, change.oldPronouns, change.newName, change.newPronouns,
    );
    character.status = rewriteIdentityReferences(
      character.status, change.formerNames, change.oldPronouns, change.newName, change.newPronouns,
    );
    character.developments = character.developments.map((development) =>
      rewriteIdentityReferences(
        development, change.formerNames, change.oldPronouns, change.newName, change.newPronouns,
      ),
    );
  }

  // 3. Prepare Relationships (using canonical Character IDs)
  const relationships: StoryIndexRelationship[] = (existingIndex?.relationships ?? []).map((r) => ({
    ...r,
    developments: [...r.developments],
    provenance: [...r.provenance],
  }));

  for (const change of identityChanges) {
    for (const relationship of relationships) {
      if (relationship.characterIdA !== change.characterId && relationship.characterIdB !== change.characterId) continue;
      relationship.nature = rewriteIdentityReferences(
        relationship.nature, change.formerNames, change.oldPronouns, change.newName, change.newPronouns,
      );
      relationship.state = rewriteIdentityReferences(
        relationship.state, change.formerNames, change.oldPronouns, change.newName, change.newPronouns,
      );
      relationship.developments = relationship.developments.map((development) =>
        rewriteIdentityReferences(
          development, change.formerNames, change.oldPronouns, change.newName, change.newPronouns,
        ),
      );
    }
  }

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
      // Inherited chapter summaries are historical continuity, not the mutable
      // summary for a same-labelled chapter in the current sequel.
      !s.originStoryId &&
      ((chapterId && s.chapterId === chapterId) ||
        normalizeNameKey(s.chapterLabel) === normalizeNameKey(chapterLabel)),
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
      maxTokens: 8000,
      jsonMode: true,
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
      "Your previous response was not valid parseable JSON. Regenerate the extraction from the transcript above as ONE complete, concise JSON object only. Preserve the important chapter facts and meaningful relationships, but keep descriptions and development lists compact enough to finish the entire object. Do not use markdown fences, commentary, or trailing text. Ensure every string is escaped and every object/array is fully closed.",
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
