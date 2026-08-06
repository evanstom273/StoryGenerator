import type {
  PlayerCharacter,
  StoryAuthorDirectiveState,
  StoryMessage,
  StoryStateData,
  StoryStateDataV2,
} from "../../types/models";
import { RELATIONSHIP_TIERS, sanitizeRelationshipTier } from "../relationshipIndex";
import type { AIChatMessage } from "./types";
import { extractFirstJsonObject, safeParseJsonObject, tryRepairTruncatedJson } from "./json";
import { buildMatureFictionPolicyBlock } from "./matureFictionPolicy";
import {
  formatAuthorDirectiveStateForPrompt,
  isAuthorDirectiveMessage,
} from "../storyText/authorDirectives";
import { isContinueMessage } from "../storyText/continueMode";
import { isDirectorMessage } from "../storyText/directorMode";
import { formatPlayerCharacterIdentityForPrompt, formatPlayerCharacterKnownTiesForPrompt } from "../playerCharacterPrompt";

const MAX_RECENT_MESSAGES = 40;

function normalizeWhitespace(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const MATURE_FICTION_EXTRACTION_POLICY = buildMatureFictionPolicyBlock({
  includeExtractionFocus: true,
});

function formatRecentMessages(
  messages: StoryMessage[],
  playerName: string,
  opts?: { messageNumberStart?: number; messageNumberTotal?: number },
) {
  const sliceStart = Math.max(0, messages.length - MAX_RECENT_MESSAGES);
  const sliced = messages.slice(sliceStart);
  const startNumber = (opts?.messageNumberStart ?? 1) + sliceStart;
  const total = opts?.messageNumberTotal ?? messages.length;

  return sliced
    .map((message, index) => {
      const prefix =
        message.role === "user"
          ? isAuthorDirectiveMessage(message)
            ? message.authorDirective?.kind ?? "author"
            : isContinueMessage(message)
              ? "continue"
            : isDirectorMessage(message)
              ? "director"
              : `user (${playerName})`
          : message.speakerType === "canon"
            ? `canon (${message.speakerName?.trim() || "Unknown"})`
            : message.speakerType === "narrator"
              ? "narrator"
              : "assistant";
      const number = startNumber + index;
      return `[Message ${number}/${total}] ${prefix}: ${message.content}`;
    })
    .join("\n\n");
}

export function buildStoryStateExtractionPrompt({
  playerName,
  playerCharacter,
  summaryText,
  recentMessages,
  existingStateJson,
  existingOpenThreads,
  messageNumberStart,
  messageNumberTotal,
  perMessageIndexing,
}: {
  playerName: string;
  playerCharacter?: PlayerCharacter | null;
  summaryText: string;
  recentMessages: StoryMessage[];
  existingStateJson?: string;
  existingOpenThreads?: Array<{ thread: string; evidence?: { messageNumbers?: number[] } }>;
  messageNumberStart?: number;
  messageNumberTotal?: number;
  perMessageIndexing?: boolean;
}): AIChatMessage[] {
  const system = normalizeWhitespace(
    [
      "You extract and maintain current story-state for continuity.",
      "Story events define current truth. The character sheet and transcript define the starting state.",
      "The player character sheet is authoritative canon for the protagonist's identity facts (name, age, gender, pronouns, species, role/occupation, disabilities/limitations). Do not contradict it with genre assumptions.",
      "Prefer existing story-state; update only when new evidence appears.",
      "Track only explicit, high-confidence changes. Do not invent facts.",
      "Transcript is the source of truth. Indexes are derived and rebuildable.",
      "Evidence rule: any indexed fact should reference the stable message numbers where it appears (messageNumbers).",
      MATURE_FICTION_EXTRACTION_POLICY,
      "Return STRICT JSON only. No markdown. No commentary. No trailing text.",
      "Schema (keys must match exactly):",
      "{",
      '  "updatedAt": string,',
      '  "characters": {',
      '    "<name>": {',
      '      "canonicalName"?: string,',
      '      "displayName"?: string,',
      '      "aliases"?: string[],',
      '      "pronouns"?: string,',
      '      "gender"?: string,',
      '      "titleOrRank"?: string,',
      '      "relationships"?: { "<otherName>": string },',
      '      "status"?: string,',
      '      "statusBullets"?: string[],',
      '      "strengths"?: string[],',
      '      "weaknesses"?: string[],',
      '      "characterTraitsPersistent"?: string[],',
      '      "characterStateTransient"?: string[],',
      '      "notes"?: string[]',
      "    }",
      "  },",
      '  "worldFacts": string[],',
      '  "unresolvedThreads": string[],',
      '  "sceneState"?: string[],',
      '  "significantMemories"?: string[],',
      '  "relationshipState"?: string[],',
      '  "relationships"?: { "<name>": { "<otherName>": { "trust"?: "low"|"medium"|"high"|"unknown", "respect"?: "low"|"medium"|"high"|"unknown", "friendship"?: "low"|"medium"|"high"|"unknown", "loyalty"?: "low"|"medium"|"high"|"unknown", "fear"?: "low"|"medium"|"high"|"unknown", "attraction"?: "low"|"medium"|"high"|"unknown", "rivalry"?: "low"|"medium"|"high"|"unknown", "hostility"?: "low"|"medium"|"high"|"unknown" } } },',
      '  "npcs"?: { "<name>": { "description"?: string, "role"?: string, "firstSeen"?: string, "lastSeen"?: string, "significance"?: "minor"|"recurring"|"major", "memories"?: string[] } },',
      '  "locations"?: { "<name>": { "description"?: string, "tags"?: string[], "notes"?: string[], "lastSeen"?: string } },',
      '  "summaries"?: { "premise"?: string, "protagonistSummary"?: string, "currentSituation"?: string, "recentDevelopments"?: string[], "characterSummaries"?: { "<name>": string }, "relationshipSummary"?: string, "worldSummary"?: string },',
      '  "authorDirectives"?: { "canon"?: string[], "retcons"?: string[], "hiddenSecrets"?: string[], "revealedSecrets"?: string[], "revealDirectives"?: string[] },',
      '  "indexes"?: {',
      '    "messageCount"?: number,',
      '    "messageNumberingVersion"?: "1.0",',
      '    "characters"?: { "<canonicalName>": { "name": string, "aliases"?: string[], "description"?: string, "firstSeenMessage"?: number, "lastSeenMessage"?: number, "evidence"?: { "messageNumbers": number[] } } },',
      '    "locations"?: { "<name>": { "name": string, "aliases"?: string[], "description"?: string, "firstSeenMessage"?: number, "lastSeenMessage"?: number, "evidence"?: { "messageNumbers": number[] } } },',
      '    "items"?: { "<name>": { "name": string, "aliases"?: string[], "description"?: string, "firstSeenMessage"?: number, "lastSeenMessage"?: number, "evidence"?: { "messageNumbers": number[] } } },',
      '    "factions"?: { "<name>": { "name": string, "aliases"?: string[], "description"?: string, "firstSeenMessage"?: number, "lastSeenMessage"?: number, "evidence"?: { "messageNumbers": number[] } } },',
      '    "relationships"?: Array<{ "a": string, "b": string, "tier": "stranger"|"acquaintance"|"friend"|"family"|"ally"|"rival"|"enemy"|"nemesis"|"lover", "summary"?: string, "history"?: Array<{ "summary": string, "messageNumber"?: number }>, "evidence"?: { "messageNumbers": number[] } }>,',
      '    "worldFacts"?: Array<{ "fact": string, "evidence"?: { "messageNumbers": number[] } }>,',
      '    "significantMemories"?: Array<{ "moment": string, "evidence"?: { "messageNumbers": number[] } }>,',
      '    "openThreads"?: Array<{ "thread": string, "evidence"?: { "messageNumbers": number[] } }>',
      "  }",
      "}",
      "Rules:",
      "- Include identity changes (preferred name, alias, undercover identity, pronouns).",
      "- Treat major identity transitions as significant memories when they are story-defining or emotionally pivotal, such as coming out, a stable name change, a gender identity reveal, or a lasting change in how the protagonist is known.",
      "- Always include the player character as an entry in characters (canonicalName = the player legal/full name). If the transcript uses nicknames or preferred names for the player, add them to aliases — do NOT create a separate indexes.characters entry for the same person under a nickname.",
      "- Never create indexes.relationships entries between the player and themselves, or between two names that refer to the same player character (legal name vs nickname vs preferred scene name).",
      "- Include relationship changes and rank/title changes when they occur.",
      "- Preserve three summary layers inside summaries: premise, currentSituation, and recentDevelopments.",
      "- premise should capture what the story is fundamentally about, who the player character is within it, and any stable ensemble dynamic or co-lead structure if present. It should change slowly unless the story truly transforms.",
      "- currentSituation should capture what is happening now, who is in immediate trouble, and what the active pressure is.",
      "- recentDevelopments should capture only the most important recent turning points, not every small beat.",
      "- protagonistSummary should keep focus on the player character, but in ensemble stories it should also note the most important co-leads, group role, and shared pressures shaping the scene.",
      "- If characters shift from formal titles to first names (or vice versa), capture the current preferred displayName and titleOrRank.",
      "- Include major injuries/recoveries and major world events.",
      "- Character entries and indexes.characters descriptions should answer 'who are they now?' not just who they were at the start.",
      "- Use status/statusBullets for live character conditions such as injuries, captivity, blindness, wanted status, political danger, disguises, or recent transformations.",
      "- Treat standard crime, war, combat, danger, trauma, grief, panic, depression, self-destructive behaviour, recovery, relapse, and aftermath as legitimate story material when the transcript supports them.",
      "- Preserve serious mental health and trauma context in clear, non-sensational language. Keep the narrative consequences; do not erase them just because they are uncomfortable.",
      "- Use strengths/weaknesses for enduring characterization that should influence future narration.",
      "- Use characterTraitsPersistent for durable personality/identity traits that should not change scene-to-scene. Update these rarely, only with strong evidence or story-defining events.",
      "- Use characterStateTransient for short-term mood/emotion/current goal that can change frequently and should NOT be promoted into characterTraitsPersistent.",
      "- Major life-changing events should aggressively update character status and registry descriptions.",
      "- Put short-term scene specifics (current location/participants/active situation) in sceneState.",
      "- Put only lasting, story-changing events in significantMemories (diagnoses, deaths, betrayals, promotions, major injuries, identity changes).",
      "- relationshipState should be a consolidated set of relationship facts that affect future behavior.",
      "- Use relationships for structured relationship metrics between characters (including recurring NPCs).",
      "- Use npcs to track recurring NPCs and what they remember.",
      "- NPC registry quality: indexes.characters.description, npcs.description, and characters.status/statusBullets must be specific and story-useful — never bare job titles or one-word labels.",
      "- For every NPC who appears or is clearly referenced in the transcript segment, update characters, npcs, and indexes.characters with role, manner, motive or agenda, ties to the player, and current story-relevant status when the transcript supports it.",
      "- REQUIRED: every major or recurring character in indexes.characters who speaks or acts in the transcript MUST also have a characters.<name> entry with 1-4 statusBullets describing their current mood, posture, agenda, or story-relevant condition in this scene. Do not limit status tracking to the player and one supervisor — ensemble casts need status for each on-screen major character (e.g. the full squad, not just Morgan and Captain Reyes).",
      "- statusBullets capture live scene state (waiting anxiously, disappointed, enforcing safety, etc.). indexes.characters.description captures stable role and characterization. Do not leave major speakers with registry descriptions but empty statusBullets.",
      "- When you update characters.<name>.statusBullets, return that character's complete CURRENT live state at the end of the indexed transcript (1-4 bullets). Replace outdated bullets — do not carry forward conditions that later transcript beats have superseded (e.g. 'waiting for Riley' after Riley arrived; 'not yet at the harbor overlook' after they entered; 'watching the tide' after the meeting started).",
      "- Recurring or major NPC descriptions should be at least two substantive sentences when enough transcript evidence exists. Minor NPCs may be shorter but still concrete.",
      "- Use characters.status or statusBullets for live NPC conditions: injured, grieving, suspicious, hiding something, allied, hostile, captive, disguised, etc.",
      "- indexes.characters.description should match the same depth as the characters/npcs entry for that person, not a stripped-down label.",
      ...(perMessageIndexing
        ? [
            "- You are processing ONE new transcript message at a time in chronological order. Merge incremental changes into existing story-state; do not discard prior canon.",
            "- Focus evidence and updates on entities touched in this message, but preserve all previously established characters, NPCs, threads, and facts.",
            "- Only ADD the current message number to evidence when that entity speaks, acts, or is directly described in THIS message. Do not add the current message number for characters merely mentioned by someone else.",
            "- Do not cite System, Chapter marker, Director, or Continue-only messages in evidence unless the cited fact is literally established in that message.",
          ]
        : []),
      "- Use locations to track important recurring places.",
      "- World facts are setting-level truths, institutions, wars, laws, disasters, political situations, and external constraints. Do not put personal character conditions in worldFacts.",
      "- indexes.worldFacts must be supported by transcript dialogue or narration. Do not promote player-sheet, premise, or summary-only background into indexes.worldFacts unless the same fact appears in the transcript.",
      "- indexes.worldFacts must cite the message numbers where the fact is stated or clearly established. Never cite a Chapter marker, System, Director, or Continue-only message unless the fact appears there.",
      "- Good world-fact examples from scene text: district routines ('the harbor signal flare' fires at dusk), institutional rules stated in dialogue, setting truths established on-screen.",
      "- Personal conditions belong in the relevant character entry, not in worldFacts. Example: 'Lyra is permanently blind' is character status, while 'the poison causes permanent blindness' is a world fact only if the transcript explicitly establishes it as a general rule.",
      "- If a major event is trivial or local, do not let it overwrite the premise. If it is story-defining, reflect it in premise/currentSituation/recentDevelopments.",
      "- Treat probable spelling variants, nicknames, and near-identical names as the same person unless the transcript clearly establishes separate individuals.",
      "- Keep lists short and deduplicated.",
      "- Keep indexes bounded: max 50 entities per category, max 30 worldFacts, max 50 significantMemories, max 20 openThreads, max 60 relationships.",
      "- Evidence should use messageNumbers from the transcript brackets. If uncertain, omit the entry instead of guessing.",
      "- For indexes.relationships: create an entry for EVERY established character paired with the player character. Also create entries between NPCs who have direct notable interaction.",
      "- Only use characters from indexes.characters, universe canon, or clearly established recurring NPCs — never scene labels, weather headers, or narration prefixes (e.g. Sun, Moon, Rain, Morning).",
      "- For indexes.relationships: represent the CURRENT dynamic state (not a timeline). Keep only one entry per pair. Update/overwrite the pair instead of adding duplicates.",
      `- For indexes.relationships.tier: assign the single best-fit tier. Valid values: ${RELATIONSHIP_TIERS.join(", ")}. Default to stranger if there has been no meaningful interaction.`,
      "- For commanding officers, supervisors, and formal workplace superiors, prefer acquaintance or ally unless the transcript shows deep personal intimacy beyond professional respect.",
      "- For indexes.relationships.summary: write 1-2 sentences describing the current state of this relationship. Required for non-strangers; optional but encouraged even for strangers.",
      "- For indexes.relationships.history: record up to 3 distinct turning-point moments. Each entry: concise 1-sentence summary + messageNumber when available.",
      "- Do not append rephrased duplicates of the same beat to indexes.relationships.history. If a new message only repeats an earlier moment (e.g. Captain Reyes returning early for the midnight watch briefing), update the existing history entry instead of adding another.",
      "- For indexes.relationships: use tier, summary, and optional history only. Do NOT include numeric trust/affection/fear/dependency metrics in indexes.relationships.",
      "- indexes.openThreads must list ONLY tensions that are still unresolved at the current story moment. Remove (do not keep) any thread the transcript has already answered — e.g. if Riley has appeared, drop 'Where is Riley?' threads; if Captain Reyes entered the warehouse doors, drop 'Who is entering?' threads.",
      "- When updating indexes.openThreads, return the complete current unresolved set, not only newly introduced questions. Omit solved threads entirely.",
      "- Do not repeat the same status bullet phrasing for a character in statusBullets (e.g. two bullets both about counting down to the midnight watch briefing). Prefer one concise live-state bullet per distinct beat.",
      "- Preserve Open Threads quality. Track the questions/tensions a reader would still care about.",
      "- If nothing changed, return the previous state with a refreshed updatedAt.",
      "- Never generate dialogue or actions for the player character; this is metadata only.",
      "- Continue lines may appear in the transcript. They are out-of-character continuation notes, not in-universe events. Use them to understand that the following assistant scene should keep unfolding, but index only the realized story outcomes, not the note itself.",
      "- Director lines may appear in the transcript. They are out-of-character staging notes, not in-universe events. Use them to understand why the following scene happened, but index only the realized story outcomes, not the note itself.",
      "- Canon lines are explicit author declarations and should be treated as permanent truth with the highest confidence.",
      "- Secret lines are true but intentionally hidden. Track them internally without exposing them as openly known story facts unless Reveal authority exists.",
      "- Reveal lines authorize hidden truths to begin entering the narrative naturally. After a reveal, the associated secret may move into ordinary story knowledge and resolution.",
      "- Retcon lines intentionally replace earlier canon. From that point onward, prefer the retconned understanding over conflicting prior material.",
    ].join("\n"),
  );

  const user = normalizeWhitespace(
    [
      playerCharacter
        ? [
            "Player Character Sheet (authoritative canon):",
            formatPlayerCharacterIdentityForPrompt(playerCharacter),
            (() => {
              const knownTiesLine = formatPlayerCharacterKnownTiesForPrompt(playerCharacter);
              return knownTiesLine ? `- ${knownTiesLine}` : "";
            })(),
            playerCharacter.characterConcept?.trim()
              ? `- Concept/Role: ${playerCharacter.characterConcept.trim()}`
              : "",
            playerCharacter.background?.trim() ? `- Background: ${playerCharacter.background.trim()}` : "",
            playerCharacter.notes?.trim() ? `- Notes: ${playerCharacter.notes.trim()}` : "",
          ]
            .filter(Boolean)
            .join("\n")
        : "",
      summaryText.trim() ? `Current Summary:\n${summaryText.trim()}` : "",
      existingStateJson?.trim() ? `Existing Story State JSON:\n${existingStateJson.trim()}` : "",
      existingOpenThreads?.length
        ? [
            "Current Open Threads (remove any that are now resolved; return indexes.openThreads as the full updated unresolved set only):",
            ...existingOpenThreads.slice(0, 12).map((entry, index) => {
              const evidence = Array.isArray(entry.evidence?.messageNumbers)
                ? entry.evidence.messageNumbers.filter((n) => Number.isFinite(n)).join(", ")
                : "";
              return `${index + 1}. ${entry.thread}${evidence ? ` [Messages ${evidence}]` : ""}`;
            }),
          ].join("\n")
        : "",
      perMessageIndexing && messageNumberStart && messageNumberTotal
        ? `Indexing focus: message ${messageNumberStart} of ${messageNumberTotal}. Only cite message ${messageNumberStart} in new evidence when this specific message supports the fact or character presence.`
        : "",
      `Recent Transcript:\n${formatRecentMessages(recentMessages, playerName, { messageNumberStart, messageNumberTotal })}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  );

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

function sanitizeEvidence(value: any, maxMessageNumber?: number) {
  const numbers = Array.isArray(value?.messageNumbers) ? value.messageNumbers : null;
  if (!numbers) return undefined;

  const filtered = numbers
    .filter((entry: unknown) => Number.isFinite(entry) && typeof entry === "number")
    .map((entry: number) => Math.trunc(entry))
    .filter((entry: number) => entry >= 1)
    .filter((entry: number) => (maxMessageNumber ? entry <= maxMessageNumber : true));

  const deduped = Array.from(new Set(filtered));
  return deduped.length ? { messageNumbers: deduped } : undefined;
}

function sanitizeEntityMap(value: any, maxMessageNumber?: number) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value).slice(0, 50);
  const result: Record<string, any> = {};

  for (const [key, entry] of entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const candidate = entry as any;
    if (typeof candidate.name !== "string" || !candidate.name.trim()) continue;

    const aliases = Array.isArray(candidate.aliases)
      ? candidate.aliases.filter((item: unknown) => typeof item === "string" && item.trim()).slice(0, 12)
      : undefined;

    const firstSeenMessage =
      typeof candidate.firstSeenMessage === "number" && Number.isFinite(candidate.firstSeenMessage)
        ? Math.trunc(candidate.firstSeenMessage)
        : undefined;
    const lastSeenMessage =
      typeof candidate.lastSeenMessage === "number" && Number.isFinite(candidate.lastSeenMessage)
        ? Math.trunc(candidate.lastSeenMessage)
        : undefined;

    const evidence = sanitizeEvidence(candidate.evidence, maxMessageNumber);

    result[key] = {
      ...(typeof candidate.id === "string" && candidate.id.trim() ? { id: candidate.id.trim() } : {}),
      name: candidate.name.trim(),
      ...(aliases?.length ? { aliases } : {}),
      ...(typeof candidate.description === "string" && candidate.description.trim()
        ? { description: candidate.description.trim() }
        : {}),
      ...(firstSeenMessage && firstSeenMessage >= 1
        ? { firstSeenMessage: maxMessageNumber ? Math.min(firstSeenMessage, maxMessageNumber) : firstSeenMessage }
        : {}),
      ...(lastSeenMessage && lastSeenMessage >= 1
        ? { lastSeenMessage: maxMessageNumber ? Math.min(lastSeenMessage, maxMessageNumber) : lastSeenMessage }
        : {}),
      ...(evidence ? { evidence } : {}),
    };
  }

  return Object.keys(result).length ? result : undefined;
}

function sanitizeIndexes(value: any) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;

  const messageCount =
    typeof value.messageCount === "number" && Number.isFinite(value.messageCount)
      ? Math.trunc(value.messageCount)
      : undefined;

  const maxMessageNumber = messageCount && messageCount > 0 ? messageCount : undefined;

  const relationshipsList = (value as any).relationships;
  const relationships = Array.isArray(relationshipsList)
    ? relationshipsList
        .filter((entry: unknown) => entry && typeof entry === "object" && !Array.isArray(entry))
        .slice(0, 60)
        .map((entry: any) => {
          if (typeof entry.a !== "string" || typeof entry.b !== "string") return null;
          if (!entry.a.trim() || !entry.b.trim()) return null;

          const evidence = sanitizeEvidence(entry.evidence, maxMessageNumber);
          const tier = sanitizeRelationshipTier(entry.tier);

          const sanitizedHistory = Array.isArray(entry.history)
            ? entry.history
                .filter((h: unknown) => h && typeof h === "object" && !Array.isArray(h) && typeof (h as any).summary === "string" && (h as any).summary.trim())
                .slice(0, 5)
                .map((h: any) => ({
                  summary: h.summary.trim(),
                  ...(typeof h.messageNumber === "number" && Number.isFinite(h.messageNumber) ? { messageNumber: Math.trunc(h.messageNumber) } : {}),
                }))
            : undefined;

          return {
            a: entry.a.trim(),
            b: entry.b.trim(),
            tier,
            ...(sanitizedHistory?.length ? { history: sanitizedHistory } : {}),
            ...(typeof entry.summary === "string" && entry.summary.trim() ? { summary: entry.summary.trim() } : {}),
            ...(evidence ? { evidence } : {}),
          };
        })
        .filter(Boolean)
    : undefined;

  const sanitizeStringEvidenceArray = (
    list: any,
    key: "fact" | "moment" | "thread",
    maxItems: number,
  ) => {
    if (!Array.isArray(list)) return undefined;
    const result = list
      .filter((entry: unknown) => entry && typeof entry === "object" && !Array.isArray(entry))
      .slice(0, maxItems)
      .map((entry: any) => {
        const value = entry[key];
        if (typeof value !== "string" || !value.trim()) return null;
        const evidence = sanitizeEvidence(entry.evidence, maxMessageNumber);
        return { [key]: value.trim(), ...(evidence ? { evidence } : {}) } as any;
      })
      .filter(Boolean);
    return result.length ? result : list.length === 0 ? [] : undefined;
  };

  const characters = sanitizeEntityMap(value.characters, maxMessageNumber);
  const locations = sanitizeEntityMap(value.locations, maxMessageNumber);
  const items = sanitizeEntityMap(value.items, maxMessageNumber);
  const factions = sanitizeEntityMap(value.factions, maxMessageNumber);
  const worldFacts = sanitizeStringEvidenceArray(value.worldFacts, "fact", 30);
  const significantMemories = sanitizeStringEvidenceArray(value.significantMemories, "moment", 50);
  const openThreads = sanitizeStringEvidenceArray(value.openThreads, "thread", 20);

  const built: any = {
    ...(messageCount && messageCount > 0 ? { messageCount } : {}),
    messageNumberingVersion: "1.0",
    ...(characters ? { characters } : {}),
    ...(locations ? { locations } : {}),
    ...(items ? { items } : {}),
    ...(factions ? { factions } : {}),
    ...(relationships && relationships.length ? { relationships } : {}),
    ...(worldFacts ? { worldFacts } : {}),
    ...(significantMemories ? { significantMemories } : {}),
    ...(openThreads ? { openThreads } : {}),
  };

  return Object.keys(built).length ? built : undefined;
}

export function parseStoryStateData(text: string): StoryStateData | null {
  const jsonText = extractFirstJsonObject(text) ?? text.trim();
  let parsed = safeParseJsonObject<StoryStateData>(jsonText);

  if (!parsed) {
    // Response may be truncated — attempt structural repair before giving up
    const repaired = tryRepairTruncatedJson(text);
    if (repaired && repaired !== jsonText) {
      parsed = safeParseJsonObject<StoryStateData>(repaired);
    }
  }

  if (!parsed) {
    return null;
  }

  if (!parsed.updatedAt || typeof parsed.updatedAt !== "string") {
    parsed.updatedAt = new Date().toISOString();
  }

  if (!parsed.characters || typeof parsed.characters !== "object" || Array.isArray(parsed.characters)) {
    parsed.characters = {};
  }

  if (!Array.isArray(parsed.worldFacts)) {
    parsed.worldFacts = [];
  }

  if (!Array.isArray(parsed.unresolvedThreads)) {
    parsed.unresolvedThreads = [];
  }

  if (parsed.sceneState && !Array.isArray(parsed.sceneState)) {
    delete (parsed as any).sceneState;
  }

  if (parsed.significantMemories && !Array.isArray(parsed.significantMemories)) {
    delete (parsed as any).significantMemories;
  }

  if (parsed.relationshipState && !Array.isArray(parsed.relationshipState)) {
    delete (parsed as any).relationshipState;
  }

  if (parsed.relationships && (typeof parsed.relationships !== "object" || Array.isArray(parsed.relationships))) {
    delete (parsed as any).relationships;
  }

  if (parsed.npcs && (typeof parsed.npcs !== "object" || Array.isArray(parsed.npcs))) {
    delete (parsed as any).npcs;
  }

  if (parsed.locations && (typeof parsed.locations !== "object" || Array.isArray(parsed.locations))) {
    delete (parsed as any).locations;
  }

  if (parsed.summaries && (typeof parsed.summaries !== "object" || Array.isArray(parsed.summaries))) {
    delete (parsed as any).summaries;
  }

  if (
    (parsed as any).authorDirectives &&
    (typeof (parsed as any).authorDirectives !== "object" ||
      Array.isArray((parsed as any).authorDirectives))
  ) {
    delete (parsed as any).authorDirectives;
  }

  if ((parsed as any).indexes) {
    const sanitized = sanitizeIndexes((parsed as any).indexes);
    if (sanitized) {
      (parsed as any).indexes = sanitized;
    } else {
      delete (parsed as any).indexes;
    }
  }

  if ((parsed as any).scene && (typeof (parsed as any).scene !== "object" || Array.isArray((parsed as any).scene))) {
    delete (parsed as any).scene;
  }

  if ((parsed as any).threads && (typeof (parsed as any).threads !== "object" || Array.isArray((parsed as any).threads))) {
    delete (parsed as any).threads;
  }

  return parsed;
}

function trimStringList(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim())
    .slice(0, maxItems);
}

export function formatStoryLongTermMemoryForPrompt(
  storyStateData: StoryStateData | StoryStateDataV2,
  opts?: { playerName?: string | null },
) {
  const lines: string[] = [];
  const authorDirectiveBlock = formatAuthorDirectiveStateForPrompt(
    (storyStateData as StoryStateData & { authorDirectives?: StoryAuthorDirectiveState })
      .authorDirectives,
  );

  if (authorDirectiveBlock) {
    lines.push("Author Declarations:");
    lines.push(authorDirectiveBlock);
    lines.push("");
  }

  if (storyStateData.summaries && typeof storyStateData.summaries === "object") {
    const premise = (storyStateData.summaries as any).premise;
    const protagonistSummary = (storyStateData.summaries as any).protagonistSummary;
    const currentSituation = (storyStateData.summaries as any).currentSituation;
    const recentDevelopments = trimStringList((storyStateData.summaries as any).recentDevelopments, 8);
    const worldSummary = (storyStateData.summaries as any).worldSummary;
    const relationshipSummary = (storyStateData.summaries as any).relationshipSummary;

    if (typeof premise === "string" && premise.trim()) {
      lines.push("Story Premise:");
      lines.push(`- ${premise.trim()}`);
    }
    if (typeof protagonistSummary === "string" && protagonistSummary.trim()) {
      lines.push("");
      lines.push("Player Character Focus:");
      lines.push(`- ${protagonistSummary.trim()}`);
    }
    if (typeof currentSituation === "string" && currentSituation.trim()) {
      lines.push("");
      lines.push("Current Situation:");
      lines.push(`- ${currentSituation.trim()}`);
    }
    if (recentDevelopments.length) {
      lines.push("");
      lines.push("Recent Developments:");
      for (const development of recentDevelopments) {
        lines.push(`- ${development}`);
      }
    }
    if (typeof worldSummary === "string" && worldSummary.trim()) {
      lines.push("");
      lines.push("World Summary:");
      lines.push(`- ${worldSummary.trim()}`);
    }
    if (typeof relationshipSummary === "string" && relationshipSummary.trim()) {
      lines.push("");
      lines.push("Relationship Summary:");
      lines.push(`- ${relationshipSummary.trim()}`);
    }
  }

  const playerName = opts?.playerName?.trim().toLowerCase() ?? "";
  const characters = storyStateData.characters ?? {};
  const characterNames = Object.keys(characters)
    .sort((left, right) => {
      if (playerName) {
        const leftIsPlayer = left.trim().toLowerCase() === playerName;
        const rightIsPlayer = right.trim().toLowerCase() === playerName;
        if (leftIsPlayer !== rightIsPlayer) {
          return leftIsPlayer ? -1 : 1;
        }
      }
      return left.localeCompare(right);
    })
    .slice(0, 24);
  if (characterNames.length) {
    if (lines.length) {
      lines.push("");
    }
    lines.push("Characters:");
    for (const name of characterNames) {
      const entry = characters[name];
      if (!entry) continue;

      const parts: string[] = [];
      if (entry.displayName && entry.displayName !== name) parts.push(`goes by ${entry.displayName}`);
      if (entry.pronouns) parts.push(`pronouns: ${entry.pronouns}`);
      if (entry.titleOrRank) parts.push(entry.titleOrRank);
      if (entry.status) parts.push(entry.status);
      if (entry.aliases?.length) parts.push(`aliases: ${entry.aliases.slice(0, 4).join(", ")}`);
      const relationships = entry.relationships ? Object.entries(entry.relationships).slice(0, 3) : [];
      if (relationships.length) {
        parts.push(
          `relationships: ${relationships
            .map(([other, rel]) => `${other}=${rel}`)
            .join(", ")}`,
        );
      }

      lines.push(`- ${name}${parts.length ? ` — ${parts.join("; ")}` : ""}`);

      const statusBullets = trimStringList((entry as any).statusBullets, 4);
      if (statusBullets.length) {
        lines.push(`  status: ${statusBullets.join(" | ")}`);
      }

      const strengths = trimStringList((entry as any).strengths, 4);
      if (strengths.length) {
        lines.push(`  strengths: ${strengths.join(", ")}`);
      }

      const weaknesses = trimStringList((entry as any).weaknesses, 4);
      if (weaknesses.length) {
        lines.push(`  weaknesses: ${weaknesses.join(", ")}`);
      }

      const traitsPersistent = trimStringList((entry as any).characterTraitsPersistent, 4);
      if (traitsPersistent.length) {
        lines.push(`  traits: ${traitsPersistent.join(", ")}`);
      }
    }
  }

  if (storyStateData.significantMemories?.length) {
    lines.push("");
    lines.push("Significant Memories:");
    for (const memory of storyStateData.significantMemories.slice(0, 12)) {
      lines.push(`- ${memory}`);
    }
  }

  if (storyStateData.relationshipState?.length) {
    lines.push("");
    lines.push("Relationship State:");
    for (const fact of storyStateData.relationshipState.slice(0, 12)) {
      lines.push(`- ${fact}`);
    }
  }

  if (storyStateData.relationships && Object.keys(storyStateData.relationships).length) {
    const relationshipLines: string[] = [];

    const subjectNames = Object.keys(storyStateData.relationships).slice(0, 12);
    for (const subject of subjectNames) {
      const targets = storyStateData.relationships[subject];
      if (!targets || typeof targets !== "object") {
        continue;
      }

      for (const targetName of Object.keys(targets).slice(0, 8)) {
        const metrics = targets[targetName];
        if (!metrics || typeof metrics !== "object") {
          continue;
        }

        const parts: string[] = [];
        const pushMetric = (label: string, value: unknown) => {
          if (typeof value !== "string" || value === "unknown") {
            return;
          }
          parts.push(`${label} ${value}`);
        };

        pushMetric("trust", (metrics as any).trust);
        pushMetric("respect", (metrics as any).respect);
        pushMetric("friendship", (metrics as any).friendship);
        pushMetric("loyalty", (metrics as any).loyalty);
        pushMetric("fear", (metrics as any).fear);
        pushMetric("attraction", (metrics as any).attraction);
        pushMetric("rivalry", (metrics as any).rivalry);
        pushMetric("hostility", (metrics as any).hostility);

        if (!parts.length) {
          continue;
        }

        relationshipLines.push(`- ${subject} → ${targetName}: ${parts.join(", ")}`);
      }
    }

    if (relationshipLines.length) {
      lines.push("");
      lines.push("Relationships:");
      lines.push(...relationshipLines.slice(0, 16));
    }
  }

  const indexedRelationships = storyStateData.indexes?.relationships;
  if (Array.isArray(indexedRelationships) && indexedRelationships.length) {
    const relLines: string[] = [];
    for (const rel of indexedRelationships.slice(0, 20)) {
      if (!rel.a || !rel.b) continue;
      const tierLabel = rel.tier ? ` [${rel.tier}]` : "";
      const summaryPart = rel.summary ? ` — ${rel.summary}` : "";
      relLines.push(`- ${rel.a} ↔ ${rel.b}${tierLabel}${summaryPart}`);
    }
    if (relLines.length) {
      lines.push("");
      lines.push("Indexed Relationships:");
      lines.push(...relLines);
    }
  }

  if (storyStateData.npcs && Object.keys(storyStateData.npcs).length) {
    lines.push("");
    lines.push("Recurring NPCs:");
    for (const name of Object.keys(storyStateData.npcs).slice(0, 12)) {
      const npc = storyStateData.npcs[name];
      if (!npc || typeof npc !== "object") {
        continue;
      }
      const parts: string[] = [];
      if (typeof (npc as any).role === "string" && (npc as any).role.trim()) {
        parts.push((npc as any).role.trim());
      }
      if (typeof (npc as any).significance === "string") {
        parts.push((npc as any).significance);
      }
      if (typeof (npc as any).description === "string" && (npc as any).description.trim()) {
        parts.push((npc as any).description.trim());
      }
      lines.push(`- ${name}${parts.length ? ` — ${parts.join("; ")}` : ""}`);
    }
  }

  if (storyStateData.locations && Object.keys(storyStateData.locations).length) {
    lines.push("");
    lines.push("Persistent Locations:");
    for (const name of Object.keys(storyStateData.locations).slice(0, 12)) {
      const location = storyStateData.locations[name];
      if (!location || typeof location !== "object") {
        continue;
      }
      const parts: string[] = [];
      if (
        typeof (location as any).description === "string" &&
        (location as any).description.trim()
      ) {
        parts.push((location as any).description.trim());
      }
      const tags = (location as any).tags;
      if (Array.isArray(tags) && tags.length) {
        parts.push(`tags: ${tags.slice(0, 4).join(", ")}`);
      }
      lines.push(`- ${name}${parts.length ? ` — ${parts.join("; ")}` : ""}`);
    }
  }

  if (storyStateData.worldFacts?.length) {
    lines.push("");
    lines.push("World Facts:");
    for (const fact of storyStateData.worldFacts.slice(0, 12)) {
      lines.push(`- ${fact}`);
    }
  }

  if (storyStateData.unresolvedThreads?.length) {
    lines.push("");
    lines.push("Unresolved Threads:");
    for (const thread of storyStateData.unresolvedThreads.slice(0, 10)) {
      lines.push(`- ${thread}`);
    }
  }

  const formatted = lines.join("\n").trim();
  return formatted.length > 4000 ? `${formatted.slice(0, 4000).trim()}…` : formatted;
}

export function formatStorySceneStateForPrompt(
  storyStateData: StoryStateData | StoryStateDataV2,
) {
  const lines: string[] = [];
  if (storyStateData.sceneState?.length) {
    for (const item of storyStateData.sceneState.slice(0, 16)) {
      lines.push(`- ${item}`);
    }
  }

  const transientEntries = Object.entries(storyStateData.characters ?? {})
    .map(([name, entry]) => ({ name, entry }))
    .filter(({ entry }) => Array.isArray((entry as any)?.characterStateTransient))
    .map(({ name, entry }) => ({
      name,
      state: trimStringList((entry as any).characterStateTransient, 2),
    }))
    .filter(({ state }) => state.length);

  if (transientEntries.length) {
    const sorted = transientEntries
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 8);

    for (const entry of sorted) {
      lines.push(`- ${entry.name}: ${entry.state.join(" | ")}`);
    }
  }

  const formatted = lines.join("\n").trim();
  return formatted.length > 1200 ? `${formatted.slice(0, 1200).trim()}…` : formatted;
}

export function formatStoryStateForPrompt(storyStateData: StoryStateData) {
  const longTerm = formatStoryLongTermMemoryForPrompt(storyStateData);
  const sceneState = formatStorySceneStateForPrompt(storyStateData);

  const blocks: string[] = [];
  if (longTerm) {
    blocks.push(longTerm);
  }
  if (sceneState) {
    blocks.push("");
    blocks.push("Current Scene State:");
    blocks.push(sceneState);
  }

  const combined = blocks.join("\n").trim();
  return combined.length > 4000 ? `${combined.slice(0, 4000).trim()}…` : combined;
}
