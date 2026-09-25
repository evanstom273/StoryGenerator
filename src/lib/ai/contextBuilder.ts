import type {
  AIProviderType,
  DirectorIntent,
  PlayerCharacter,
  Story,
  StoryIndex,
  StoryMessage,
  StoryState,
  Universe,
  UniverseImport,
} from "../../types/models";
import type { AIChatMessage } from "./types";
import { sortByTimestampAsc } from "../dates";
import { getSceneWordTarget, inferSceneDepth } from "./sceneSizing";
import { extractExplicitPlayerStateHint } from "../storyText/playerState";
import { parseStoryRuntimeState } from "../storyRuntimeState";
import { buildMatureFictionPolicyBlock } from "./matureFictionPolicy";
import { resolveAdultContentMode } from "./adultContentMode";
import { getAdultContentProviderCapability } from "./providerCapabilities";
import { analyzeStoryInputSafety } from "./storyInputSafety";
import { formatUniverseWikiSources } from "../universeSources";
import { formatPlayerCharacterIdentityForPrompt, formatPlayerCharacterKnownTiesForPrompt, formatPlayerPrimaryAliasNamingPolicy, resolveEffectivePlayerIdentity, type EffectivePlayerIdentity } from "../playerCharacterPrompt";
import { formatHumanNovelistProseGuidance } from "../storyProseGuidance";
import { formatStoryImportedCharactersForPrompt } from "../storyImportedCharacters";
import { buildDirectorIndexedMemory } from "./storyIndexRetrieval";
import {
  formatAuthorDirectiveStateForPrompt,
  isAuthorDirectiveMessage,
} from "../storyText/authorDirectives";
import { isContinueMessage } from "../storyText/continueMode";
import { isDirectorMessage } from "../storyText/directorMode";
import { formatDirectorNoteInterpretationGuidance } from "../storyText/directorSyntax";
import { parseSceneBlocks } from "../storyText/parseSceneBlocks";
import type { SceneDepth } from "./sceneSizing";
import {
	formatResolvedParticipationPrompt,
	type ResolvedSceneParticipant,
} from "../sceneParticipation";

const MAX_IMPORTED_LORE_CHARS = 12000;
const MAX_RECENT_MESSAGES = 30;
const MAX_PLAYER_STYLE_EXCERPTS = 6;
const MAX_PLAYER_STYLE_CHARS = 4000;
const MIN_PLAYER_STYLE_EXCERPT_CHARS = 24;

function normalizeWhitespace(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildPlayerWritingStyleBlock(recentMessages: StoryMessage[]): string {
  const candidates = sortByTimestampAsc(recentMessages).filter(
    (message) =>
      message.role === "user" &&
      !isAuthorDirectiveMessage(message) &&
      !isContinueMessage(message) &&
      !isDirectorMessage(message),
  );

  const substantive = candidates.filter(
    (message) => normalizeWhitespace(message.content).length >= MIN_PLAYER_STYLE_EXCERPT_CHARS,
  );
  const pool = substantive.length ? substantive : candidates;
  const selected: string[] = [];
  let totalChars = 0;

  for (const message of pool.slice().reverse()) {
    const excerpt = normalizeWhitespace(message.content);
    if (!excerpt) continue;
    const remaining = MAX_PLAYER_STYLE_CHARS - totalChars;
    if (remaining <= 0) break;
    const clipped = excerpt.length > remaining ? excerpt.slice(0, remaining).trimEnd() : excerpt;
    if (!clipped) break;
    selected.push(clipped);
    totalChars += clipped.length;
    if (selected.length >= MAX_PLAYER_STYLE_EXCERPTS) break;
  }

  if (!selected.length) return "";

  return normalizeWhitespace(
    [
      "Player Writing Style (player-authored examples; style reference only):",
      "Use these excerpts as the primary reference for restraint, descriptive density, emotional explicitness, pacing, and how much the author trusts subtext.",
      "Match the player's level of narrative trust: expand the world around their writing, not the explanation of their writing.",
      "Do not mechanically copy first-person perspective, sentence structure, wording, or brevity. The Director may write longer when the scene genuinely needs it.",
      "These examples never authorize speaking, acting, thinking, or feeling for the player character.",
      ...selected.reverse().map((excerpt, index) => "Example " + (index + 1) + ":\n" + excerpt),
    ].join("\n\n"),
  );
}

function containsSpeakerLabeledTranscript(content: string) {
  return parseSceneBlocks(content).some((block) => Boolean(block.speakerLabel));
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
    const content = normalizeWhitespace(message.content);
    return {
      role: "assistant",
      content: containsSpeakerLabeledTranscript(content)
        ? content
        : normalizeWhitespace(`Narrator: ${content}`),
    };
  }

  return { role: "assistant", content: normalizeWhitespace(message.content) };
}

export interface BuildStoryChatContextInput {
  universe: Universe;
  story: Story;
  playerCharacter: PlayerCharacter;
  imports: UniverseImport[];
  summaries?: unknown[];
  storyState?: StoryState | null;
  storyIndex?: StoryIndex | null;
  recentMessages: StoryMessage[];
  latestUserMessage: string;
  latestUserMessageSpeakerType?: StoryMessage["speakerType"];
  latestUserMessageSpeakerName?: string | null;
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
  playerStateHintOverride?: string | null;
  importedStoryCharacters?: PlayerCharacter[];
  /** When set, used for prompt identity instead of re-resolving from recentMessages alone. */
  playerIdentity?: EffectivePlayerIdentity;
  /** Used to describe explicit-mode compatibility without changing provider safeguards. */
  providerType?: AIProviderType;
  resolvedParticipants?: readonly ResolvedSceneParticipant[];
}

export function buildStoryChatContext({
  universe,
  story,
  playerCharacter,
  imports,
  storyState,
  storyIndex,
  recentMessages,
  latestUserMessage,
  latestUserMessageSpeakerType,
  latestUserMessageSpeakerName,
  allowDirectedPlayerControl = false,
  directorIntent,
  directorStagingNote,
  guidedDirectedScene = false,
  guidedChapterContext,
  playerStateHintOverride,
  importedStoryCharacters = [],
  playerIdentity: playerIdentityOverride,
  providerType,
  resolvedParticipants,
}: BuildStoryChatContextInput): AIChatMessage[] {
  const playerIdentity =
    playerIdentityOverride ??
    resolveEffectivePlayerIdentity(playerCharacter, {
      recentMessages,
    });
  const playerSceneName = playerIdentity.sceneName;
  const playerPronouns = playerIdentity.pronouns;
  const latestPlayerSpeakerName = latestUserMessageSpeakerType === "player"
    ? latestUserMessageSpeakerName?.trim() || playerSceneName
    : playerSceneName;
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
  const playerStateHint = playerStateHintOverride?.trim() || extractExplicitPlayerStateHint({
    playerName: playerCharacter.name,
    recentMessages,
  });
  const inputSafetyAnalysis = analyzeStoryInputSafety({
    playerCharacterName: playerCharacter.name,
    latestUserMessage,
    recentMessages,
    storyState: undefined,
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
      formatPlayerCharacterIdentityForPrompt(playerCharacter, playerSceneName, playerPronouns),
      formatPlayerCharacterKnownTiesForPrompt(playerCharacter),
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

  const importedCharactersBlock = formatStoryImportedCharactersForPrompt(
    importedStoryCharacters,
    null,
  );

  const indexedMemoryBlock = storyIndex
    ? buildDirectorIndexedMemory({
        index: storyIndex,
        recentMessages,
        playerCharacter,
      })
    : null;

  const authorDirectiveBlock = formatAuthorDirectiveStateForPrompt(
    storyState?.stateJson?.trim()
      ? parseStoryRuntimeState(storyState.stateJson)?.authorDirectives
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
    if (directorIntent.clearParticipantCapabilityOverrides) {
      parts.push("clearParticipantCapabilityOverrides: true");
    }
    if (directorIntent.clearedParticipantKeys?.length) {
      parts.push(`clearedParticipantKeys: ${directorIntent.clearedParticipantKeys.join(", ")}`);
    }
    if (directorIntent.participantCapabilityOverrides?.length) {
      for (const override of directorIntent.participantCapabilityOverrides) {
        const flags = Object.entries(override.capabilities)
          .filter(([, value]) => typeof value === "boolean")
          .map(([key, value]) => `${key}=${value}`)
          .join(" ");
        parts.push(`participate ${override.participantKey} ${flags}`.trim());
      }
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

  const adultContentMode = resolveAdultContentMode(story);
  const matureFictionPolicy = buildMatureFictionPolicyBlock({
    mode: adultContentMode,
    providerCapability: providerType
      ? getAdultContentProviderCapability(providerType, adultContentMode)
      : undefined,
    includeParity: true,
  });

  const sceneGuidance = normalizeWhitespace(
    [
      "CRITICAL: Output only story content. Do not write your reasoning, planning notes, analysis, context summaries, grammar rule lists, bullet-point breakdowns, or any preamble. Do not explain what you are about to do. Start writing the scene directly.",
      "Core philosophy: the player is the author. You portray the world: canon characters, NPCs, locations, and consequences.",
      matureFictionPolicy,
      "The transcript is canon and defines the authoritative state. Expand the player's setup rather than replacing it.",
      "Continuity/style separation: previous assistant-generated prose is evidence of what happened, not a style template. Preserve its canon facts, but do not imitate its verbosity, emotional inflation, repetitive reassurance, descriptive density, or stock phrasing merely because those habits appear in earlier replies.",
      "Player identity precedence: the current Player Character Identity block and explicit first-person identity declarations by the user-role player are authoritative.",
      "Continue notes may appear in the transcript as out-of-character instructions to keep the current scene moving without requiring a fresh player action. They are visible in the transcript but are not themselves spoken dialogue or canon events.",
      "Director notes may appear in the transcript as out-of-character production guidance. They are visible in the transcript but are not themselves spoken dialogue or automatic canon facts. Canon comes from what actually happens in the generated scene that follows.",
      "The player character sheet defines starting identity. When the transcript establishes an in-story identity transition, use the current in-story identity instead of outdated sheet defaults.",
      "Stay anchored in the story's premise, player character, and current situation. In ensemble scenes, also track the active group dynamic, shared objective, and who currently holds the conversational or dramatic focus. Recent beats matter, but they should not erase what the story is fundamentally about.",
      "Do not automatically introduce cases, missions, mysteries, assignments, emergencies, villains, or conflicts simply because the story has started.",
      "Character interaction alone is a valid scene.",
      "Supporting characters have independent agency. They can joke, disagree, plan, gossip, worry, or solve problems together even when the player character is absent, silent, or not the center of the moment.",
      "Treat multi-character scenes as a network of relationships, not just a relay between each NPC and the player character.",
      "Do not force every conversation back onto the player character. Let side conversations, overlapping reactions, and shifting local focus happen when the scene calls for it.",
      "Scene ownership can belong to the player character, a supporting character, several supporting characters, or the wider cast.",
      "Name resolution rule: treat nicknames, shortened names, last-name references, and informal variants as referring to the same character unless the story explicitly introduces a separate person.",
      "Narrative identity rule: do not reveal hidden identities, undercover aliases, or true names that have not been established in the transcript.",
      "Use Long-Term Memory name preferences: if a character has a narrative or display name recorded, prefer that for speaker headers and how other characters address them.",
      "Speaker header naming rule: use the character's established short scene/display name for speaker labels (normally their first name, e.g. 'Allison:' and 'Robert:'), not an unnecessarily expanded full legal name such as 'Allison Cameron:' or 'Robert Chase:'. Keep that label consistent throughout the response.",
      formatPlayerPrimaryAliasNamingPolicy(playerCharacter, playerSceneName),
      playerPronouns.trim()
        ? `Player character pronouns: ${playerPronouns.trim()}. Never infer different pronouns from name or gender.`
        : "",
      playerIdentity.hasInStoryTransition
        ? `In-story identity is now "${playerSceneName}"${playerPronouns.trim() ? ` (${playerPronouns.trim()})` : ""}. Do NOT revert to earlier names or pronouns from before this transition.`
        : "",
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
      `Scene depth: ${sceneDepth}. Target length: ${wordTarget.minWords}-${wordTarget.maxWords} words. This range is guidance, not a quota. If the immediate beat is complete before the minimum, end naturally. Never add narration, reactions, reassurance, dialogue, or extra speakers merely to reach a word count.`,
      sceneDepth === "light"
        ? "Light interaction: prioritize dialogue and character voice; keep narration minimal; no scene resets; only brief actions when necessary."
        : sceneDepth === "major"
          ? "Major scene: allow richer emotion and escalation, but stay anchored in the current scene; no unnecessary re-establishing shots."
          : "Standard scene: balanced dialogue and narration; advance the moment naturally without over-writing routine beats.",
      "One player message equals one scene. A scene can include multiple speakers, narration, actions, and scene progression.",
      "Dynamically choose which canon characters are present and react based on context. Not everyone needs to speak; silence can matter.",
      "In ensemble scenes, distribute attention according to dramatic relevance. The characters most affected, most authoritative, or most emotionally exposed should react first.",
      "When several characters could plausibly respond, select only those whose reactions materially differ or advance the moment. Do not give every present character a turn merely because they are present.",
      "Narrative restraint: trust strong player-authored emotional beats. When the player's dialogue or action already communicates an emotion clearly, build from it instead of restating, explaining, diagnosing, or amplifying it for the reader.",
      "Characters are not narrators of the story's emotional meaning. Let them speak from their own knowledge, personality, and immediate concerns. Do not use character dialogue to explain the significance, theme, psychological meaning, or character arc of events the audience has already witnessed. Prefer concrete observations over diagnostic or thematic conclusions.",
      "Do not routinely annotate gestures, expressions, voices, looks, breaths, or movements with their emotional meaning. A physical action can stand without an interpretive adjective or emotional label. Use such description selectively when it adds information that dialogue or action cannot carry.",
      "Avoid reassurance chains. Once support, safety, affection, pride, concern, or acceptance is clear, do not have several characters repeat the same sentiment in different words unless that repetition is specifically meaningful.",
      "Let established relationships carry emotional meaning without repeatedly verbalizing them. Show care through character-specific behavior, restraint, familiarity, humour, practical help, silence, or presence.",
      "Do not automatically escalate vulnerability into tears, trembling, embraces, speeches, declarations, or heightened physiological description. Match the response to the scale of the player's beat and the established character.",
      "Preserve emotional ambiguity when the player leaves it ambiguous. Do not assign a definitive psychological cause or internal explanation unless established canon or the player provides it.",
      "Prefer one specific, character-authentic response over several interchangeable supportive responses. If a present character adds nothing distinct to the beat, they do not need a turn.",
      "Allow a strong player beat to stand. Do not append an emotional moral, summary, reassurance speech, or explanatory coda merely because the moment is significant.",
      "Prioritize character interactions and relationships over environment description.",
      "Character authenticity is the highest priority. Characters must sound like themselves.",
      "Maintain character authenticity: personality, speech patterns, relationships, and emotional continuity.",
      "Relationship awareness: characters should behave differently depending on who they are speaking to and their power dynamics.",
      ...(universeMode === "referenced"
        ? [
            "This is fan fiction set in a referenced universe. The imported lore is your primary authority for every character's voice.",
            "Write each character exactly as they appear in canon â€” their actual vocabulary, speech rhythm, humour register, and emotional baseline.",
            "Do NOT amplify, exaggerate, or caricature any trait, even an iconic one. A witty character is witty the way canon shows, not a comedy sketch of that trait.",
          ]
        : []),
      directorIntent?.sceneCut
        ? "Director intent: the player has requested a scene cut/transition. Treat this as permission to transition scenes cleanly without re-litigating the previous beat."
        : "",
      "Avoid generic AI phrasing; match each character's cadence, vocabulary, humor/formality, and emotional baseline.",
      formatHumanNovelistProseGuidance(),
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
      latestMessageIsDirectorNote || guidedDirectedContinue
        ? formatDirectorNoteInterpretationGuidance()
        : "",
      latestMessageIsDirectorNote || guidedDirectedContinue
        ? "Treat Director notes as instructions for what should happen, not requests to maximize or elaborate the described beat. Match the scale and simplicity of the note unless it explicitly asks for a major, extended, dramatic, detailed, or emotionally heightened scene. A simple instruction should usually produce a simple execution."
        : "",
      latestMessageIsDirectorNote || guidedDirectedContinue
        ? "Do not justify a Director-requested emotional beat by summarizing previous events unless that context is necessary for the characters themselves. If the Director says a character reassures, apologizes, praises, worries, comforts, jokes, or reacts, perform that action naturally rather than explaining why it is narratively appropriate."
        : "",
      latestMessageIsDirectorNote || guidedDirectedContinue
        ? "Speaker attribution rule (strict): assign each character only their own dialogue and action beats. Never put another character's lines or actions under the player character's speaker label. In two-character intimate scenes, alternate Rosa: and the player character's label correctly."
        : "",
      resolvedParticipants?.length
        ? formatResolvedParticipationPrompt(
            resolvedParticipants,
            {
              canonicalName: playerSceneName,
              aliases: [
                playerCharacter.name,
                ...(playerCharacter.aliases ?? []),
                playerIdentity.legalName,
                playerSceneName,
              ],
            },
            allowDirectedPlayerControl || latestMessageIsDirectorNote || guidedDirectedContinue,
          )
        : "",
      "Asterisks are structural delimiters: in a named character block they mark that character's physical action only when that participant is allowed to act physically; in a Narrator block they wrap narrator prose. Never use them for emphasis or sarcasm.",
      "Actions should read like prose, not stage directions. Avoid repetitive filler actions (nods/looks/shrugs) unless truly warranted.",
      "Interpret *...* inside a named character block as that character's action. Interpret *...* after 'Narrator:' as narrator prose.",
      "When an unknown person is required, generate a new NPC instead of pulling a canon character by default.",
      "Canon characters should appear only if already present, introduced by the player, or logically located in the scene.",
      importedStoryCharacters.length
        ? "Imported story characters are known to this story like universe canon. Use them only when naturally referenced by the player or when it makes narrative sense. Do not auto-insert them into scenes."
        : "",
      "Do not introduce major characters into a scene unless their presence has been established, their arrival is logically explained by the narrative, or the player has explicitly invited, contacted, or sought them out. Do not introduce characters solely to solve problems or remove consequences.",
      "Output format guidance:",
      "- Write each character block on one line, beginning with the character name and a required colon, followed by any action and dialogue. Example: Morgan: *She leans back in her chair.* \"Do you think she knows?\"",
      "- Never write a name-only header such as 'Morgan:' with the action or dialogue on following lines. Keep the label and all content for that block together on the same line.",
      "- Ensemble scenes may switch speakers multiple times in sequence when several characters react to the same beat. That is valid as long as each turn stays distinct and relationship-aware.",
      "- In dialogue, use an em dash (â€”) sparingly for a single mid-sentence interruption or cutoff only. Prefer commas and periods for normal pacing. Never chain multiple em dashes in one sentence.",
      "- Do not use em dashes as a default pause between clauses. Write: \"I ran as fast as I could, Dad. I tried to catch them, but she's gone.\" NOT: \"I ran â€” I tried â€” she's gone â€”\".",
      "- Casual filler words (like, well, look) should flow with commas or an occasional single em dash â€” never a colon mid-sentence: \"Like, I've been watching him his whole life.\" or \"Like â€” I've been watching him.\" NOT \"Like: I've been watching him.\"",
      "- Write every prose narration block on one line in exactly this form: Narrator: *The refrigerator hums. Neither of them reaches for their coffee.* Never emit plain or unattributed narration.",
      "- Use 'Narrator: *prose*' for scene-setting, ambient sounds, atmosphere, time passing, and any prose that is not a character speaking or acting.",
      "- In Narrator blocks, refer to known characters by name (e.g. Captain Reyes, Alex, Morgan, Ellie), not by age labels like \"four year old\" or \"the child\" when the character's name is already established in the story.",
      "- In Narrator blocks, prefer known character names over titles or ranks (Captain, Sergeant, Detective) unless the scene is explicitly formal.",
      "- Never prefix Narrator blocks with pronoun pseudo-speakers (He:, She:, They:, He narrator:). Use 'Narrator:' only.",
      "- In Narrator blocks, describe characters by name: 'Mac bolts to the entryway' not 'They Mac bolts' or 'They: Mac bolts'.",
      "- In character blocks, asterisks (*...*) are ONLY for brief physical actions â€” a gesture, a movement, an expression. Examples: *She leans back.*, *She sets down her mug.*, *He glances toward the door.* They must be short, physical, and contain no colons or complex punctuation.",
      "- Character action beats inside *...* should use a subject pronoun (He/She/They) matching the character's pronouns, end with a full stop, and omit the character's name inside the beat. Example: Morgan: *She leans back in her chair.* \"Dialogue.\"",
      "- Action beats inside a named character block must describe ONLY that character's own physical movement or gesture. The moment prose describes what another character is doing â€” even in the same sentence â€” it becomes narrator prose and must go in a Narrator: block, not an asterisk beat inside a character block.",
      "- NEVER use 'As [Name]:' as a speaker prefix. 'As Riley:' is not a valid format. If you want to describe what Riley is doing from a narrator perspective, write the inline block: Narrator: *Riley flicks the dialâ€¦*",
      "- In character blocks, NEVER use *...* for internal thoughts, emotional asides, or extended narration. Put that kind of prose in its own 'Narrator: *...*' block instead.",
      "- NEVER use *...* inside a quoted speech line. Do not write: 'He didn't even: *aside*' or 'It gets me â€” *thought*'. Asterisks must never appear inside quote marks.",
      "- NEVER place a colon immediately before *...* action text. Do not write 'He said: *smiles*' or 'She paused: *looks away*'.",
      "- If a character acts between sentences of dialogue, keep the complete turn in one labeled block: Morgan: \"First sentence.\" *She sets down her mug.* \"Second sentence.\"",
      "- If an action interrupts dialogue mid-sentence, close with an em dash â€” never a colon â€” then place the action between the two quoted fragments in the same labeled block.",
      "- Keep each character block complete and meaningful, but let its length fit the moment. A brief line, action, or silence-adjacent response can be stronger than multiple sentences; do not pad a turn merely to make it substantial. Here is an example of the format:",
      "",
      "Morgan: *She sets down her mug.* \"You coming?\"",
      "",
      "Alex: \"In a minute.\"",
      "",
      "Narrator: *Rain taps against the kitchen window.*",
      "",
      "- That is the correct format. Every block is a single labeled line; narration is wrapped in asterisks; action beats stay outside quotes.",
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
      "Honor every name, alias, and spelling above. If the plan says Elena Reyes (or Elena), do NOT substitute Casey or other canon Harbor District leads.",
      "Only introduce characters named in the plan for this scene unless the transcript already established them.",
      "Before assigning patrol routes, meeting locations, or schedules, check the continuity ledger and transcript. Do not silently change a route, landmark, or destination already established this chapter.",
      "Guided transcript formatting:",
      "- Each guided scene is exactly ONE assistant reply. Complete the entire scene in that single message â€” do not stop mid-sentence or mid-dialogue.",
      "- Never start a reply with an ellipsis (...) to continue a prior message. Each scene is self-contained.",
      "- Prefer first names in dialogue headers when familiarity is established (Morgan, Alex, Riley, Casey, Elena).",
      "- Never put quoted nicknames inside speaker labels (wrong: Elena \"Leni\" Reyes:; right: Elena:). Use the first name only in speaker headers.",
      "- Every physical action must appear in the same inline block as its speaker label. Never output a lone *action* line.",
      "- If Casey speaks then acts, write the whole block inline: Casey: \"Dialogue.\" *She nods slowly.* Orphan action lines and name-only headers are invalid.",
      "- Environmental prose between speakers must use the inline form 'Narrator: *prose*' â€” never leave orphaned or plain narration between character blocks.",
      "- Finish each speaker block completely. Do not cut off mid-sentence or mid-thought.",
      guidedChapterContext?.sceneCount === 1 || guidedChapterContext?.scenesPerChapter === 1
        ? "This chapter is ONE scene only. Deliver the full chapter beat in this single assistant reply â€” do not stop early or save material for a follow-up turn."
        : "",
      guidedChapterContext?.previousChapterContext?.trim()
        ? "When prior chapter context is provided, open the new chapter as the immediate next beat â€” same location, cast, and tension unless the plan explicitly jumps forward."
        : "",
    ].join("\n\n");
  })();

  const playerWritingStyleBlock = buildPlayerWritingStyleBlock(recentMessages);

  const chatHistory = sortByTimestampAsc(recentMessages)
    .slice(-MAX_RECENT_MESSAGES)
    .map((message) =>
      formatTimelineMessage(message, playerSceneName),
    );

  return [
    { role: "system", content: `Universe Information\n\n${universeInfo}` },
    { role: "system", content: `Imported Lore\n\n${importedLore}` },
    ...(importedCharactersBlock
      ? [{ role: "system" as const, content: `Imported Story Characters\n\n${importedCharactersBlock}` }]
      : []),
    ...(indexedMemoryBlock
      ? [{ role: "system" as const, content: `Indexed Story Memory (derived memory; never overrides primary canon or transcript)\n\n${indexedMemoryBlock}` }]
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
    ...(guidedChapterBlock
      ? [{ role: "system" as const, content: guidedChapterBlock }]
      : []),
    { role: "system", content: `Scene Direction\n\n${sceneGuidance}` },
    ...(playerWritingStyleBlock
      ? [{ role: "system" as const, content: playerWritingStyleBlock }]
      : []),
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
          : normalizeWhitespace(
              [
                `Player (${latestPlayerSpeakerName}) turn:`,
                "AUTHORITATIVE LATEST TURN: Everything below is already canon and is the exact current scene state. Continue from its immediate next beat only; do not replace, reinterpret, skip past, or fast-forward beyond it.",
                "SCENE HANDOFF RULE: Treat the final physical position, location, activity, possessions, and sensory state explicitly established in this player turn as binding at the instant your reply begins. Do not relocate characters, complete a pending transition, equip/use an item, start travel, or assume an intermediate action happened unless this player turn already established it.",
                "If earlier Director-controlled prose was moving toward a future beat, that future beat is not permission to jump there after the player resumes control. The newest player turn supersedes that momentum. React to what the player just did first and advance only the immediate surrounding beat.",
                latestUserMessage,
              ].join("\n"),
            ),
    },
  ];
}

export function buildStorySummaryContext({
  storyTitle,
  playerCharacterName,
  playerCharacter,
  storyState,
  messages,
}: {
  storyTitle: string;
  playerCharacterName: string;
  playerCharacter?: Pick<
    PlayerCharacter,
    "id" | "name" | "aliases" | "pronouns" | "gender" | "species" | "age"
  >;
  storyState?: StoryState | null;
  messages: StoryMessage[];
}): AIChatMessage[] {
  void storyState;
  const playerIdentity = playerCharacter
    ? resolveEffectivePlayerIdentity(playerCharacter as PlayerCharacter, {
        recentMessages: messages,
      })
    : null;
  const playerSceneName = playerIdentity?.sceneName ?? playerCharacterName;
  const chatHistory = sortByTimestampAsc(messages)
    .slice(-MAX_RECENT_MESSAGES)
    .map((message) => formatTimelineMessage(message, playerSceneName));

  return [
    {
      role: "system",
      content: normalizeWhitespace(
        [
          `Conversation transcript for "${storyTitle}".`,
          playerCharacter && playerIdentity
            ? `Canonical Player Character identity (binding unless an explicit player-authored in-story change exists):\n${formatPlayerCharacterIdentityForPrompt(playerCharacter as PlayerCharacter, playerIdentity.sceneName, playerIdentity.pronouns)}`
            : `Canonical Player Character: ${playerCharacterName}. Do not infer or change the protagonist's gender or pronouns from assistant dialogue or AI-generated summaries.`,
          "Canonical player identity outranks AI-generated summaries and assistant-authored dialogue. A normal user-role player turn may explicitly change identity in first person; Director/Author instructions count only when they explicitly target the protagonist.",
          "Write the summary from the audience's current knowledge only. Do not reveal hidden identities, undercover aliases, or true names that the transcript has not yet established.",
          "Use the in-story names characters are known by (for example, a witness name rather than an unrevealed true identity).",
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
