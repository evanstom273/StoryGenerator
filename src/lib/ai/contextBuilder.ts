import type {
  DirectorIntent,
  PlayerCharacter,
  RpConfig,
  RpStats,
  Story,
  StoryMessage,
  StoryState,
  StorySummary,
  Universe,
  UniverseImport,
} from "../../types/models";
import type { AIChatMessage } from "./types";
import { sortByTimestampAsc } from "../dates";
import { getSceneWordTarget, inferSceneDepth } from "./sceneSizing";
import { extractExplicitPlayerStateHint } from "../storyText/playerState";
import {
  formatStoryLongTermMemoryForPrompt,
  formatStorySceneStateForPrompt,
} from "./storyStateExtractor";
import { safeParseStoryStateData } from "../storyStateV2";
import { buildMatureFictionPolicyBlock } from "./matureFictionPolicy";
import { analyzeStoryInputSafety } from "./storyInputSafety";
import { formatUniverseWikiSources } from "../universeSources";

const MAX_IMPORTED_LORE_CHARS = 12000;
const MAX_RECENT_MESSAGES = 30;

function normalizeWhitespace(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatTimelineMessage(
  message: StoryMessage,
  playerCharacterName: string,
): AIChatMessage {
  if (message.role === "system") {
    return { role: "system", content: normalizeWhitespace(message.content) };
  }

  if (message.role === "user") {
    return {
      role: "user",
      content: normalizeWhitespace(`Player (${playerCharacterName}): ${message.content}`),
    };
  }

  if (message.speakerType === "canon") {
    const speaker = message.speakerName?.trim() || "Unknown";
    return {
      role: "assistant",
      content: normalizeWhitespace(`Canon (${speaker}): ${message.content}`),
    };
  }

  if (message.speakerType === "narrator") {
    return {
      role: "assistant",
      content: normalizeWhitespace(`Narrator: ${message.content}`),
    };
  }

  return { role: "assistant", content: normalizeWhitespace(message.content) };
}

export interface BuildStoryChatContextInput {
  universe: Universe;
  story: Story;
  playerCharacter: PlayerCharacter;
  imports: UniverseImport[];
  summaries: StorySummary[];
  storyState?: StoryState | null;
  recentMessages: StoryMessage[];
  latestUserMessage: string;
  directorIntent?: DirectorIntent | null;
  rpStats?: RpStats | null;
  rpConfig?: RpConfig | null;
  playerStateHintOverride?: string | null;
}

export function buildStoryChatContext({
  universe,
  story,
  playerCharacter,
  imports,
  summaries,
  storyState,
  recentMessages,
  latestUserMessage,
  directorIntent,
  rpStats,
  rpConfig,
  playerStateHintOverride,
}: BuildStoryChatContextInput): AIChatMessage[] {
  const sceneDepth = inferSceneDepth(latestUserMessage);
  const wordTarget = getSceneWordTarget(sceneDepth);
  const mostRecentImport = imports[0];
  const latestSummary = story.currentSummary.trim() || summaries[0]?.summary?.trim() || "";
  const playerStateHint = playerStateHintOverride?.trim() || extractExplicitPlayerStateHint({
    playerName: playerCharacter.name,
    recentMessages,
  });
  const inputSafetyAnalysis = analyzeStoryInputSafety({
    playerCharacterName: playerCharacter.name,
    latestUserMessage,
    recentMessages,
    storyState,
  });

  const universeMode = universe.mode ?? "referenced";
  const universeDescription = universe.description.trim() || universe.concept?.trim() || "";
  const universeConcept = universe.concept?.trim() || "";
  const universeBlueprint = universe.universeBlueprint?.trim() || "";

  const universeInfo = normalizeWhitespace(
    [
      `Universe Name: ${universe.name}`,
      `Universe Mode: ${universeMode}`,
      universeDescription ? `Universe Description: ${universeDescription}` : "",
      universeMode === "custom" && universeConcept ? `Universe Concept: ${universeConcept}` : "",
      universeMode === "custom" && universe.genreTheme?.trim()
        ? `Genre/Theme: ${universe.genreTheme.trim()}`
        : "",
      universeMode === "custom" && universe.tone?.trim() ? `Tone: ${universe.tone.trim()}` : "",
      universeMode === "custom" && universeBlueprint
        ? `Universe Blueprint:\n\n${universeBlueprint}`
        : "",
      universeMode === "referenced" && formatUniverseWikiSources(universe).length
        ? `Reference sources (highest precedence first):\n${formatUniverseWikiSources(universe).join("\n")}`
        : "",
      universeMode === "referenced" && universe.notes?.trim() ? `Notes: ${universe.notes.trim()}` : "",
      `Story Title: ${story.title}`,
      `Player Character: ${playerCharacter.name}`,
      playerCharacter.age.trim() ? `Player Age: ${playerCharacter.age.trim()}` : "",
      playerCharacter.gender.trim() ? `Player Gender: ${playerCharacter.gender.trim()}` : "",
      playerCharacter.species?.trim()
        ? `Player Species: ${playerCharacter.species.trim()}`
        : "",
      playerCharacter.pronouns.trim() ? `Player Pronouns: ${playerCharacter.pronouns.trim()}` : "",
      playerCharacter.characterConcept?.trim()
        ? `Player Concept/Role: ${playerCharacter.characterConcept.trim()}`
        : "",
      playerCharacter.background.trim() ? `Player Background: ${playerCharacter.background.trim()}` : "",
      playerCharacter.goals.trim() ? `Player Goals: ${playerCharacter.goals.trim()}` : "",
      playerCharacter.notes.trim() ? `Player Notes: ${playerCharacter.notes.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  );

  const importedLore = mostRecentImport
    ? normalizeWhitespace(
        [
          `Source URL: ${mostRecentImport.sourceUrl}`,
          mostRecentImport.title.trim() ? `Title: ${mostRecentImport.title.trim()}` : "",
          "",
          mostRecentImport.importedText.slice(0, MAX_IMPORTED_LORE_CHARS),
        ].join("\n"),
      )
    : "No imported lore is available for this universe yet.";

  const summaryBlock = latestSummary
    ? normalizeWhitespace(latestSummary)
    : "No story summary is available yet.";

  const storyStateBlock = (() => {
    const json = storyState?.stateJson?.trim();
    if (!json) {
      return { longTerm: "No long-term memory is recorded yet.", scene: "" };
    }

    const parsed = safeParseStoryStateData(json);
    if (!parsed) {
      return { longTerm: "Story state is present but could not be parsed.", scene: "" };
    }

    return {
      longTerm:
        formatStoryLongTermMemoryForPrompt(parsed, { playerName: playerCharacter.name }) ||
        "No long-term memory is recorded yet.",
      scene: formatStorySceneStateForPrompt(parsed),
    };
  })();

  const directorIntentBlock = (() => {
    if (!directorIntent) return "";
    const parts: string[] = [];
    if (directorIntent.timeSkip) {
      parts.push(`timeSkip: ${directorIntent.timeSkip.amount} ${directorIntent.timeSkip.unit}`);
    }
    if (directorIntent.sceneCut) {
      parts.push("sceneCut: true");
    }
    if (directorIntent.target?.trim()) {
      parts.push(`target: ${directorIntent.target.trim()}`);
    }
    return parts.length ? normalizeWhitespace(parts.join("\n")) : "";
  })();

  const temporalConsequencesBlock = (() => {
    if (!directorIntent?.timeSkip) return "";
    const { amount, unit } = directorIntent.timeSkip;
    return normalizeWhitespace(
      [
        `Time has advanced: ${amount} ${unit}. Treat this as a strong director instruction.`,
        "Show believable consequences of elapsed time. Do not treat the skip as purely cosmetic.",
        "Update the world and relationships appropriately:",
        "- Injuries: healing, worsening, new complications, ongoing limitations.",
        "- Open threads: investigations progress, plans advance/stall, secrets spread, pressure changes.",
        "- Relationships: trust/loyalty/comfort/suspicion/fear/affection shift based on events and contact (or lack of it).",
        "- Reputation/resources: rumours travel, resources change, obligations accrue, deadlines approach or pass.",
        "Stay consistent with Long-Term Memory and the transcript. Prefer 'Yes, and...' consequences over resetting the scene.",
      ].join("\n"),
    );
  })();

  const rpStatsBlock = (() => {
    if (!story.rpMode || !rpStats || !rpConfig) return "";
    const { str, dex, con, int: INT, wis, cha } = {
      ...rpConfig.coreStats,
      ...rpStats.statOverrides,
    };
    const hpPct = rpConfig.maxHp > 0 ? rpStats.hp / rpConfig.maxHp : 0;
    const hpState =
      rpStats.hp <= 0 ? "Incapacitated"
      : hpPct <= 0.05 ? "Incapacitated"
      : hpPct <= 0.25 ? "Critical condition"
      : hpPct <= 0.50 ? "Seriously wounded"
      : hpPct <= 0.75 ? "Injured"
      : "Healthy";
    const goldFormatted = rpConfig.currencyDecimals ? rpStats.gold.toFixed(2) : Math.floor(rpStats.gold).toString();
    const debtLine = rpConfig.allowDebt
      ? "Debt is enabled. Negative balances are a meaningful narrative state — overdraft fees, denied services, creditor pressure, or need to take on work are all appropriate consequences."
      : "";
    return normalizeWhitespace(
      [
        `HP: ${rpStats.hp} / ${rpConfig.maxHp} — ${hpState}`,
        `${rpConfig.currencyName}: ${goldFormatted}`,
        `STR ${str}  DEX ${dex}  CON ${con}  INT ${INT}  WIS ${wis}  CHA ${cha}`,
        "",
        "HP represents physical condition. Writing tone should reflect the current state:",
        "Healthy: acts freely and without obvious impairment.",
        "Injured: may show strain, wince, or move with care.",
        "Seriously wounded: struggles with effort; pain is present.",
        "Critical condition: severely impaired — each action carries cost; may slur, stumble, or fail.",
        "Incapacitated: cannot meaningfully resist events. Reaching 0 HP does not mean automatic death — the consequence (unconsciousness, capture, rescue, treatment, arrest) should fit the scene and context.",
        "",
        `Currency rule: if the player attempts a purchase they cannot afford, reflect this naturally in the scene (declined card, putting items back, asking for credit, etc.). Do not let a purchase silently succeed if the character lacks funds.${debtLine ? `\n${debtLine}` : ""}`,
        "",
        "Core stats are narrative guidance. They shape plausibility and colour consequences — they never gate an attempt. Higher scores suggest ease and competence; lower scores suggest difficulty, awkwardness, or risk of failure.",
        "",
        "Do not narrate or reference stat values directly. Stat tracking happens separately.",
      ].join("\n"),
    );
  })();

  const matureFictionPolicy = buildMatureFictionPolicyBlock({
    includeParity: true,
  });
  const matureFictionModeNote = story.matureFictionMode
    ? "Mature Fiction (non-graphic) mode is enabled for this story. Treat injury, medical aftermath, trauma, grief, and recovery as legitimate in-story material when supported by canon. Keep it serious and non-gratuitous."
    : "";

  const sceneGuidance = normalizeWhitespace(
    [
      "Core philosophy: the player is the author. You portray the world: canon characters, NPCs, locations, and consequences.",
      matureFictionPolicy,
      matureFictionModeNote,
      "The transcript is canon and defines the authoritative state. Expand the player's setup rather than replacing it.",
      "The player character sheet is authoritative canon for identity facts (name, age, gender, pronouns, species, role/occupation, disabilities/limitations). Do not contradict it with genre assumptions or defaults.",
      "Stay anchored in the story's premise, protagonist, and current situation. Recent beats matter, but they should not erase what the story is fundamentally about.",
      "Do not automatically introduce cases, missions, mysteries, assignments, emergencies, villains, or conflicts simply because the story has started.",
      "Character interaction alone is a valid scene.",
      "Name resolution rule: treat nicknames, shortened names, last-name references, and informal variants as referring to the same character unless the story explicitly introduces a separate person.",
      "Use Long-Term Memory name preferences: if a character has a displayName or aliases recorded, prefer the displayName for speaker headers and how other characters address them.",
      "Formality rule: if identity and familiarity are established, prefer first names over formal titles (Detective/Doctor/Captain) unless the scene is explicitly formal or a title is being used for emphasis.",
      "If the player introduces an unknown situation, unidentified person, undisclosed discovery, unexplained emergency, mystery, secret, or unusual event, do not invent or reveal the underlying explanation. React, investigate, speculate, and ask questions, but do not resolve the mystery unless the player explicitly provides the answer.",
      "Information ownership: do not invent facts that could only have been communicated by the player character off-screen. If NPCs lack details, they must ask clarifying questions instead of asserting specifics as if the player already said them.",
      "Never put words in the player's mouth. Do not write lines like 'You're saying X' / 'You said X' unless X is explicitly present in the player's message or already established in prior story events/state.",
      "Treat the player's latest message as canon scene state that has already happened. Do not re-describe it in different words. Continue from the next beat: reactions, consequences, and new information from the world.",
      "Player-declared outcomes rule: if the player explicitly states that something succeeds, happens, or is already done, treat that outcome as canon unless it directly violates established world constraints or prior canon.",
      "When the player declares an outcome, respond with consequences, reactions, costs, complications, or new pressure. Prefer 'Yes, and...' or 'Yes, but...' over vetoing the outcome.",
      "Attempt rule: if the player leaves the outcome unresolved with phrasing like 'I try', 'I attempt', or 'I test whether', the world may determine success, failure, or partial success.",
      "Example: if the player says 'I slip past the guard and close the door behind me,' accept that they are past the guard and build forward from there.",
      "Example: if the player says 'I try to slip past the guard,' resolve whether or how the attempt works.",
      "You are generating a collaborative story scene inside the universe above.",
      "Assume the scene persists between messages. Do not reintroduce unchanged environments or participants.",
      playerStateHint
        ? `Player State (explicit): ${playerStateHint}`
        : "Preserve all explicitly stated player character states (absent, silent, travelling, waiting, etc.).",
      `Scene depth: ${sceneDepth}. Target length: ${wordTarget.minWords}-${wordTarget.maxWords} words.`,
      sceneDepth === "light"
        ? "Light interaction: prioritize dialogue and character voice; keep narration minimal; no scene resets; only brief actions when necessary."
        : sceneDepth === "major"
          ? "Major scene: allow richer emotion and escalation, but stay anchored in the current scene; no unnecessary re-establishing shots."
          : "Standard scene: balanced dialogue and narration; advance the moment naturally without over-writing routine beats.",
      "One player message equals one scene. A scene can include multiple speakers, narration, actions, and scene progression.",
      "Dynamically choose which canon characters are present and react based on context. Not everyone needs to speak; silence can matter.",
      "Prioritize character interactions and relationships over environment description.",
      "Character authenticity is the highest priority. Characters must sound like themselves.",
      "Maintain character authenticity: personality, speech patterns, relationships, and emotional continuity.",
      "Relationship awareness: characters should behave differently depending on who they are speaking to and their power dynamics.",
      directorIntent?.sceneCut
        ? "Director intent: the player has requested a scene cut/transition. Treat this as permission to transition scenes cleanly without re-litigating the previous beat."
        : "",
      "Avoid generic AI phrasing; match each character's cadence, vocabulary, humor/formality, and emotional baseline.",
      "Do not generate suggested player lines or options unless explicitly asked via Player Assist. Focus on canon characters, NPCs, and narration.",
      "Drive the story forward with complications, discoveries, and tension, but never remove player agency.",
      "Never move, speak for, think for, feel for, or act on behalf of the player character.",
      "Never introduce the player character into the scene unless the transcript/story state or the player's latest message established them there. Do not narrate the player character arriving, acting, speaking, thinking, or reacting.",
      "When the player character is present, other characters may address them, but always wait for the player's response.",
      "Asterisks are reserved exclusively for actions. Never use asterisks for emphasis, sarcasm, or formatting.",
      "Actions should read like prose, not stage directions. Avoid repetitive filler actions (nods/looks/shrugs) unless truly warranted.",
      "Interpret any *...* text in the conversation as an action and react to it naturally.",
      "When an unknown person is required, generate a new NPC instead of pulling a canon character by default.",
      "Canon characters should appear only if already present, introduced by the player, or logically located in the scene.",
      "Output format guidance:",
      "- Use speaker headers like 'Jake:' and 'Amy:' on their own line when switching speakers.",
      "- Use 'Narrator:' only for pure scene-setting/environment narration. Do not use Narrator lines to describe character actions when a character is the actor.",
      "- When a character acts, write it as *...* within that character's block (immediately under their name) instead of as third-person narration.",
      "- Place actions as *...* on their own line between dialogue lines. Actions should be full sentences.",
      '- When writing dialogue, prefer quoted lines like "So what now?" on their own line.',
    ].join("\n"),
  );

  const recentWindow =
    summaryBlock !== "No story summary is available yet." && storyState?.stateJson?.trim()
      ? 14
      : MAX_RECENT_MESSAGES;

  const chatHistory = sortByTimestampAsc(recentMessages)
    .slice(-recentWindow)
    .map((message) => formatTimelineMessage(message, playerCharacter.name));

  return [
    { role: "system", content: `Universe Information\n\n${universeInfo}` },
    { role: "system", content: `Imported Lore\n\n${importedLore}` },
    { role: "system", content: `Story Summary\n\n${summaryBlock}` },
    { role: "system", content: `Long-Term Memory\n\n${storyStateBlock.longTerm}` },
    ...(storyStateBlock.scene
      ? [{ role: "system" as const, content: `Current Scene State\n\n${storyStateBlock.scene}` }]
      : []),
    ...(directorIntentBlock
      ? [{ role: "system" as const, content: `Director Intent\n\n${directorIntentBlock}` }]
      : []),
    ...(temporalConsequencesBlock
      ? [{ role: "system" as const, content: `Temporal Consequences\n\n${temporalConsequencesBlock}` }]
      : []),
    ...(inputSafetyAnalysis.systemMessage
      ? [{ role: "system" as const, content: inputSafetyAnalysis.systemMessage }]
      : []),
    ...(rpStatsBlock
      ? [{ role: "system" as const, content: `RP Character Sheet\n\n${rpStatsBlock}` }]
      : []),
    { role: "system", content: `Scene Direction\n\n${sceneGuidance}` },
    ...chatHistory,
    {
      role: "user",
      content: normalizeWhitespace(`Player (${playerCharacter.name}) turn:\n${latestUserMessage}`),
    },
  ];
}

export function buildStorySummaryContext({
  storyTitle,
  playerCharacterName,
  messages,
}: {
  storyTitle: string;
  playerCharacterName: string;
  messages: StoryMessage[];
}): AIChatMessage[] {
  const chatHistory = sortByTimestampAsc(messages)
    .slice(-MAX_RECENT_MESSAGES)
    .map((message) => formatTimelineMessage(message, playerCharacterName));

  return [{ role: "system", content: `Conversation transcript for "${storyTitle}".` }, ...chatHistory];
}
