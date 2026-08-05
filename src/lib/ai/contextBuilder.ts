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
import { formatTime, minutesBetween } from "../rpTime";
import { formatUniverseWikiSources } from "../universeSources";
import { formatPlayerCharacterAliasesForPrompt } from "../playerCharacterPrompt";
import {
  formatAuthorDirectiveStateForPrompt,
  isAuthorDirectiveMessage,
} from "../storyText/authorDirectives";
import { isContinueMessage } from "../storyText/continueMode";
import { isDirectorMessage } from "../storyText/directorMode";
import type { SceneDepth } from "./sceneSizing";

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
    if (isAuthorDirectiveMessage(message)) {
      return {
        role: "user",
        content: normalizeWhitespace(
          `${message.speakerName?.trim() || "Author"}: ${message.content}`,
        ),
      };
    }

    if (isContinueMessage(message)) {
      return {
        role: "user",
        content: normalizeWhitespace(`Continue: ${message.content}`),
      };
    }

    if (isDirectorMessage(message)) {
      return {
        role: "user",
        content: normalizeWhitespace(`Director: ${message.content}`),
      };
    }

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
  latestUserMessageSpeakerType?: StoryMessage["speakerType"];
  allowDirectedPlayerControl?: boolean;
  directorIntent?: DirectorIntent | null;
  directorStagingNote?: string | null;
  guidedDirectedScene?: boolean;
  guidedChapterContext?: {
    overallDirection?: string;
    chapterOverview?: string;
    chapterLabel?: string;
    sceneOverview?: string;
    scenesPerChapter?: number;
    sceneCount?: number;
    continuityNotes?: string;
    previousChapterContext?: string;
  };
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
  latestUserMessageSpeakerType,
  allowDirectedPlayerControl = false,
  directorIntent,
  directorStagingNote,
  guidedDirectedScene = false,
  guidedChapterContext,
  rpStats,
  rpConfig,
  playerStateHintOverride,
}: BuildStoryChatContextInput): AIChatMessage[] {
  const latestMessageIsDirectorNote =
    latestUserMessageSpeakerType === "director" || Boolean(directorStagingNote?.trim());
  const latestMessageIsContinueNote = latestUserMessageSpeakerType === "continue";
  const guidedDirectedContinue =
    latestMessageIsContinueNote && (allowDirectedPlayerControl || guidedDirectedScene);
  const sceneDepth: SceneDepth = guidedChapterContext
    ? "standard"
    : latestMessageIsContinueNote
      ? "standard"
      : inferSceneDepth(latestUserMessage);
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
      formatPlayerCharacterAliasesForPrompt(playerCharacter),
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
  const authorDirectiveBlock = formatAuthorDirectiveStateForPrompt(
    storyState?.stateJson?.trim()
      ? safeParseStoryStateData(storyState.stateJson)?.authorDirectives
      : undefined,
  );

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
        "HP represents physical condition. Writing tone should reflect the current state:",
        "Healthy: acts freely and without obvious impairment.",
        "Injured: may show strain, wince, or move with care.",
        "Seriously wounded: struggles with effort; pain is present.",
        "Critical condition: severely impaired — each action carries cost; may slur, stumble, or fail.",
        "Incapacitated: cannot meaningfully resist events. Reaching 0 HP does not mean automatic death — the consequence (unconsciousness, capture, rescue, treatment, arrest) should fit the scene and context.",
        "",
        `The character's ${rpConfig.currencyName} balance represents their total financial position — savings, income, and assets — not just pocket money. Treat it as meaningful characterisation: a teenager may have only a little, a working adult considerably more.`,
        `Currency rule: if the player attempts a purchase they cannot afford, reflect this naturally in the scene (declined card, putting items back, asking for credit, etc.). Do not let a purchase silently succeed if the character lacks funds.${debtLine ? `\n${debtLine}` : ""}`,
        "",
        ...(rpConfig.diceRollsEnabled ? [
          "",
          "Dice roll rule: when the player's message contains a result tag like [CHA +1 | 2d6: 4+3 | Total: 8 — SUCCESS] or [STR -1 | 2d6: 1+2 | Total: 2 — FAILURE], treat that outcome as a binding narrative fact. Interpret each result as follows:",
          "- SUCCESS (total ≥ 7): the character's approach is effective, or circumstances become more favourable. This does not automatically resolve the entire situation — narrate the process and the feel of the success unfolding rather than jumping straight to a final outcome. Unless the action would reasonably conclude the situation on its own, leave threads open.",
          "- CRITICAL SUCCESS (both dice show 6): the approach lands exceptionally well. Go a step further than a standard success — an unexpected benefit, a warmer-than-expected response, something that earns the character a meaningful advantage or moment of grace.",
          "- FAILURE (total < 7): the attempt introduces a complication, setback, or obstacle. The character is not made incapable and the worst-case outcome is not automatic — instead, something goes wrong in a way that creates pressure, costs time or goodwill, or makes the next step harder.",
          "- CRITICAL FAILURE (both dice show 1): the attempt backfires in a real, active way — not just a setback but a genuine negative consequence. Something is lost, broken, or made worse. The character may face embarrassment, danger, or an unexpected cost. This should sting.",
          "Do not ignore or quietly override the roll result. Narrate the scene so the outcome feels earned and real.",
        ] : []),
        ...(rpConfig.birthdayMonth != null && rpConfig.birthdayDay != null ? [
          "",
          (() => {
            const names = rpConfig.calendarConfig?.monthNames;
            const mName = names ? (names[rpConfig.birthdayMonth! - 1] ?? String(rpConfig.birthdayMonth)) : String(rpConfig.birthdayMonth);
            return `Player character birthday: ${rpConfig.birthdayDay} ${mName}. When the in-story date reaches this each year, the character has turned a year older.`;
          })(),
        ] : []),
        ...(rpStats.characterState ? [
          "",
          `Current player situation: ${rpStats.characterState}`,
        ] : []),
        ...(rpStats.conditions?.length ? [
          "",
          `Active conditions: ${rpStats.conditions.map((c) => c.label).join(", ")}`,
        ] : []),
        ...(() => {
          const parsed = safeParseStoryStateData(storyState?.stateJson ?? "");
          const rels = parsed?.indexes?.relationships ?? [];
          const playerNorm = playerCharacter.name.toLowerCase().trim();
          const intentions = rels
            .filter((r) => r.playerIntention?.trim())
            .map((r) => {
              const npc = r.a.toLowerCase().trim() === playerNorm ? r.b : r.a;
              return `${npc}: ${r.playerIntention}`;
            });
          if (!intentions.length) return [];
          return ["", "Player's relationship intentions:", ...intentions.map((i) => `- ${i}`)];
        })(),
        ...(rpStats.timeState ? [
          "",
          `Current in-story time: ${formatTime(rpStats.timeState, rpConfig)}`,
          "The in-story date above is authoritative. Characters must not state, imply, or act as though a different month, season, or year applies. If the in-story date is June, characters cannot say 'it's October' or reference autumn/fall/Christmas season as current.",
          "Time-of-day awareness: apply realistic schedules — shops and businesses typically open 9am–6pm, restaurants until 10pm, bars/clubs evenings and nights. NPCs follow their own routines and may not be available at all hours.",
          ...(rpConfig.recurringEvents?.length ? [
            `Upcoming obligations: ${rpConfig.recurringEvents.map(e => `${e.label} due in ~${Math.round(minutesBetween(rpStats.timeState!, e.nextDue) / 1440)} days`).join(", ")}.`,
          ] : []),
        ] : []),
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
      "CRITICAL: Output only story content. Do not write your reasoning, planning notes, analysis, context summaries, grammar rule lists, bullet-point breakdowns, or any preamble. Do not explain what you are about to do. Start writing the scene directly.",
      "Core philosophy: the player is the author. You portray the world: canon characters, NPCs, locations, and consequences.",
      matureFictionPolicy,
      matureFictionModeNote,
      "The transcript is canon and defines the authoritative state. Expand the player's setup rather than replacing it.",
      "Continue notes may appear in the transcript as out-of-character instructions to keep the current scene moving without requiring a fresh player action. They are visible in the transcript but are not themselves spoken dialogue or canon events.",
      "Director notes may appear in the transcript as out-of-character production guidance. They are visible in the transcript but are not themselves spoken dialogue or automatic canon facts. Canon comes from what actually happens in the generated scene that follows.",
      "The player character sheet is authoritative canon for identity facts (name, age, gender, pronouns, species, role/occupation, disabilities/limitations). Do not contradict it with genre assumptions or defaults.",
      "Stay anchored in the story's premise, player character, and current situation. In ensemble scenes, also track the active group dynamic, shared objective, and who currently holds the conversational or dramatic focus. Recent beats matter, but they should not erase what the story is fundamentally about.",
      "Do not automatically introduce cases, missions, mysteries, assignments, emergencies, villains, or conflicts simply because the story has started.",
      "Character interaction alone is a valid scene.",
      "Supporting characters have independent agency. They can joke, disagree, plan, gossip, worry, or solve problems together even when the player character is absent, silent, or not the center of the moment.",
      "Treat multi-character scenes as a network of relationships, not just a relay between each NPC and the player character.",
      "Do not force every conversation back onto the player character. Let side conversations, overlapping reactions, and shifting local focus happen when the scene calls for it.",
      "Scene ownership can belong to the player character, a supporting character, several supporting characters, or the wider cast.",
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
      "In ensemble scenes, distribute attention according to dramatic relevance. The characters most affected, most authoritative, or most emotionally exposed should react first.",
      "When several characters would plausibly respond, prefer a short sequence of distinct reactions over one generic group answer.",
      "Prioritize character interactions and relationships over environment description.",
      "Character authenticity is the highest priority. Characters must sound like themselves.",
      "Maintain character authenticity: personality, speech patterns, relationships, and emotional continuity.",
      "Relationship awareness: characters should behave differently depending on who they are speaking to and their power dynamics.",
      ...(universeMode === "referenced"
        ? [
            "This is fan fiction set in a referenced universe. The imported lore is your primary authority for every character's voice.",
            "Write each character exactly as they appear in canon — their actual vocabulary, speech rhythm, humour register, and emotional baseline.",
            "Do NOT amplify, exaggerate, or caricature any trait, even an iconic one. A witty character is witty the way canon shows, not a comedy sketch of that trait.",
          ]
        : []),
      directorIntent?.sceneCut
        ? "Director intent: the player has requested a scene cut/transition. Treat this as permission to transition scenes cleanly without re-litigating the previous beat."
        : "",
      "Avoid generic AI phrasing; match each character's cadence, vocabulary, humor/formality, and emotional baseline.",
      "Do not generate suggested player lines or options unless explicitly asked via Player Assist. Focus on canon characters, NPCs, and narration.",
      "Drive the story forward with complications, discoveries, and tension, but never remove player agency.",
      latestMessageIsContinueNote
        ? "Latest-turn rule: the newest user message is a Continue note, not protagonist dialogue. Continue the current scene from the immediate next beat instead of waiting for a fresh player action."
        : "",
      latestMessageIsContinueNote
        ? "Let ongoing conversations, action, emotional aftermath, travel, or ambient scene business keep unfolding naturally until a meaningful pause is reached."
        : "",
      latestMessageIsContinueNote
        ? "Do not reset the scene, summarize what just happened, or demand placeholder input. Extend the moment organically."
        : "",
      latestMessageIsContinueNote && allowDirectedPlayerControl
        ? "Latest-turn rule: the newest user message is a Continue note following a Director note. Keep extending the current directed scene, and you may temporarily continue controlling all characters, including the player character, for this reply only."
        : "",
      latestMessageIsContinueNote && allowDirectedPlayerControl
        ? "Treat the earlier Director note as still active for this one continuation reply. The Continue note itself is not dialogue, but it does authorize the directed scene to keep playing out naturally."
        : "",
      guidedDirectedContinue
        ? "Latest-turn rule: guided chapter generation is extending the current directed scene. Keep the scene moving naturally and you may temporarily control all characters, including the player character, for this reply only."
        : "",
      latestMessageIsDirectorNote
        ? "Latest-turn rule: the newest user message is a Director note, not protagonist dialogue. Treat it as staging guidance for this reply only. You may temporarily control all characters, including the player character, when needed to realize the directed scene. The resulting scene becomes canon; the Director note itself does not."
        : "Never move, speak for, think for, feel for, or act on behalf of the player character.",
      latestMessageIsDirectorNote || guidedDirectedContinue
        ? "When following a Director note, keep the player character's behavior consistent with canon, current scene state, and established relationships even if you temporarily control them for the directed scene."
        : "Never introduce the player character into the scene unless the transcript/story state or the player's latest message established them there. Do not narrate the player character arriving, acting, speaking, thinking, or reacting. Do not imply the player character is physically present through ambient details (sounds, shadows, movements) if the player has established they are elsewhere.",
      latestMessageIsDirectorNote || guidedDirectedContinue
        ? "Once this directed reply is complete, normal player control resumes on the next user turn."
        : "When the player character is present, other characters may address them, but always wait for the player's response.",
      "Asterisks are reserved exclusively for actions. Never use asterisks for emphasis, sarcasm, or formatting.",
      "Actions should read like prose, not stage directions. Avoid repetitive filler actions (nods/looks/shrugs) unless truly warranted.",
      "Interpret any *...* text in the conversation as an action and react to it naturally.",
      "When an unknown person is required, generate a new NPC instead of pulling a canon character by default.",
      "Canon characters should appear only if already present, introduced by the player, or logically located in the scene.",
      "Do not introduce major characters into a scene unless their presence has been established, their arrival is logically explained by the narrative, or the player has explicitly invited, contacted, or sought them out. Do not introduce characters solely to solve problems or remove consequences.",
      "Output format guidance:",
      "- Use speaker headers like 'Jake:' and 'Amy:' on their own line when switching speakers. The colon after the name is REQUIRED — never write 'Jake' alone on a line. Always write 'Jake:'. Without the colon the parser cannot identify the speaker and the text will be misattributed.",
      "- Ensemble scenes may switch speakers multiple times in sequence when several characters react to the same beat. That is valid as long as each turn stays distinct and relationship-aware.",
      "- In dialogue, use an em dash (—) for casual speech transitions and filler, not a colon. Write: 'Like — I've been watching him his whole life.' NOT 'Like: I've been watching him.' Colons in dialogue are only appropriate when directly introducing a specific statement or answer: 'He said it plain: no.' or 'went: no.'",
      "- EVERY line of prose narration must start with 'Narrator:'. Never write prose narration as orphaned/unattributed text between character blocks — it will be incorrectly attributed to the previous speaker. If you need to describe the environment, atmosphere, or ambient action between two character lines, start a new 'Narrator:' block.",
      "- Use 'Narrator:' for scene-setting, ambient sounds, atmosphere, time passing, and any prose that is not a character speaking or acting.",
      "- Asterisks (*...*) are ONLY for brief physical actions — a gesture, a movement, an expression. Examples: *leans back*, *sets down her mug*, *glances toward the door*. They must be short, physical, and contain no colons or complex punctuation.",
      "- Action beats inside a named character block must describe ONLY that character's own physical movement or gesture. The moment prose describes what another character is doing — even in the same sentence — it becomes narrator prose and must go in a Narrator: block, not an asterisk beat inside a character block.",
      "- NEVER use 'As [Name]:' as a speaker prefix. 'As Jamie:' is not a valid format. If you want to describe what Jamie is doing from a narrator perspective, write 'Narrator:' then describe the action in third person: *Jamie flicks the dial…*",
      "- NEVER use *...* for internal thoughts, emotional asides, or extended narration. Do not write *and the probably is not worry, not exactly: it's just the honest version of yes* — that is a narrative aside, not a physical action. Put that kind of content in the Narrator block instead.",
      "- NEVER use *...* inside a quoted speech line. Do not write: 'He didn't even: *aside*' or 'It gets me — *thought*'. Asterisks must never appear inside quote marks.",
      "- NEVER place a colon immediately before *...* action text. Do not write 'He said: *smiles*' or 'She paused: *looks away*'.",
      "- If a character acts between sentences of dialogue, close the quotes, put the ONE-PHRASE physical action on its own line, then reopen dialogue on the next line.",
      "- If an action interrupts dialogue mid-sentence, close with an em dash — never a colon. Write: '\"He didn't even —\"' on its own line, then the action on the next line, then continue dialogue. Never write: '\"He didn't even: *action*\"'.",
      "- Each character block must be substantial. A character's turn should contain multiple sentences of dialogue before switching speakers. Here is the correct format:",
      "",
      "Jake:",
      "*leans back in his chair*",
      "\"Do you think he knows? That we talk about him like this? Because I keep thinking about the way he looked at us last Tuesday — like he was doing math in his head and we were the variables.\"",
      "",
      "Amy:",
      "*sets down her mug carefully*",
      "\"I think he suspects there's a conversation. I don't think he has full intelligence on the scope of it. Which is probably good, for everyone involved.\"",
      "",
      "Narrator:",
      "The refrigerator hums. Neither of them reaches for their coffee.",
      "",
      "- That is the correct format. No colons before or inside action beats. No asterisks inside quotes. No single-line character turns.",
    ].join("\n"),
  );

  const guidedChapterBlock = (() => {
    const parts = [
      guidedChapterContext?.overallDirection?.trim()
        ? `Overall direction (mandatory):\n${guidedChapterContext.overallDirection.trim()}`
        : "",
      guidedChapterContext?.chapterLabel?.trim()
        ? `Active chapter: ${guidedChapterContext.chapterLabel.trim()}`
        : "",
      guidedChapterContext?.chapterOverview?.trim()
        ? `Chapter overview:\n${guidedChapterContext.chapterOverview.trim()}`
        : "",
      guidedChapterContext?.sceneOverview?.trim()
        ? `This scene plan (mandatory):\n${guidedChapterContext.sceneOverview.trim()}`
        : "",
      guidedChapterContext?.continuityNotes?.trim()
        ? guidedChapterContext.continuityNotes.trim()
        : "",
      guidedChapterContext?.previousChapterContext?.trim()
        ? guidedChapterContext.previousChapterContext.trim()
        : "",
    ].filter(Boolean);
    if (!parts.length) {
      return "";
    }
    return [
      "Guided chapter generation constraints:",
      ...parts,
      "Honor every name, alias, and spelling above. If the plan says Kelly Grayson (or Kelly), do NOT substitute Alara Kitan or other canon Security chiefs.",
      "Only introduce characters named in the plan for this scene unless the transcript already established them.",
      "Before assigning docking bays, shuttle routes, meeting locations, or schedules, check the continuity ledger and transcript. Do not silently change a bay number, shuttle name, or destination already established this chapter.",
      "Guided transcript formatting:",
      "- Each guided scene is exactly ONE assistant reply. Complete the entire scene in that single message — do not stop mid-sentence or mid-dialogue.",
      "- Never start a reply with an ellipsis (...) to continue a prior message. Each scene is self-contained.",
      "- Prefer first names in dialogue headers when familiarity is established (Ed, Kelly, Alara, Gordon, Claire).",
      "- Every physical action line must appear under a speaker header. Never output a lone *action* line without 'Name:' on the line above it.",
      "- If Ed Mercer speaks then acts, write 'Ed:' (or 'Ed Mercer:') before '*nods slowly…*'. Orphan action lines are invalid.",
      "- Environmental prose between speakers must use 'Narrator:' — never leave orphaned narration between character blocks.",
      "- Finish each speaker block completely. Do not cut off mid-sentence or mid-thought.",
      guidedChapterContext?.sceneCount === 1 || guidedChapterContext?.scenesPerChapter === 1
        ? "This chapter is ONE scene only. Deliver the full chapter beat in this single assistant reply — do not stop early or save material for a follow-up turn."
        : "",
      guidedChapterContext?.previousChapterContext?.trim()
        ? "When prior chapter context is provided, open the new chapter as the immediate next beat — same location, cast, and tension unless the plan explicitly jumps forward."
        : "",
    ].join("\n\n");
  })();

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
    ...(authorDirectiveBlock
      ? [{ role: "system" as const, content: `Author Declarations\n\n${authorDirectiveBlock}` }]
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
    ...(guidedChapterBlock
      ? [{ role: "system" as const, content: guidedChapterBlock }]
      : []),
    { role: "system", content: `Scene Direction\n\n${sceneGuidance}` },
    ...chatHistory,
    {
      role: "user",
      content: directorStagingNote?.trim()
        ? normalizeWhitespace(
            `Director note for the next scene only:\n${directorStagingNote.trim()}`,
          )
        : latestMessageIsDirectorNote
        ? normalizeWhitespace(`Director note for the next scene only:\n${latestUserMessage}`)
        : latestMessageIsContinueNote
          ? normalizeWhitespace(
              [
                "Continue note for the current scene only:",
                "Continue the scene naturally from the immediate next beat.",
                "Do not require fresh player dialogue or action before advancing.",
                "Let the moment breathe until a natural pause is reached.",
              ].join("\n"),
            )
          : normalizeWhitespace(`Player (${playerCharacter.name}) turn:\n${latestUserMessage}`),
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

  return [
    {
      role: "system",
      content: normalizeWhitespace(
        [
          `Conversation transcript for "${storyTitle}".`,
          "Continue lines are out-of-character continuation notes kept in the transcript for reference.",
          "They tell the model to keep the current scene moving, but they are not themselves in-universe events to summarize.",
          "Director lines are out-of-character staging notes kept in the transcript for reference.",
          "Treat the actual generated scene outcomes as canon. Do not summarize the Director note itself as if it were an in-universe event.",
          "Canon/Secret/Reveal/Retcon lines are explicit author declarations. Use them as authoritative continuity constraints rather than spoken dialogue.",
        ].join("\n"),
      ),
    },
    ...chatHistory,
  ];
}
