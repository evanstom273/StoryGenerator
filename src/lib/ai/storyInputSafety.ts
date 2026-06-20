import type { StoryMessage, StoryState } from "../../types/models";
import { safeParseStoryStateData } from "../storyStateV2";
import { extractSpeakerPrefix } from "../storyText/extractSpeakerPrefix";

function normalizeWhitespace(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const PLAYER_INJURY_TERMS: Array<{ label: string; pattern: RegExp }> = [
  { label: "pain", pattern: /\bpain\b/i },
  { label: "hurts", pattern: /\bhurts?\b/i },
  { label: "agony", pattern: /\bagony\b/i },
  { label: "hospital", pattern: /\bhospital\b/i },
  { label: "antiseptic", pattern: /\bantiseptic\b/i },
  { label: "sling", pattern: /\bsling\b/i },
  { label: "IV", pattern: /\biv\b/i },
  { label: "wound", pattern: /\bwound(ed|s)?\b/i },
  { label: "injured", pattern: /\binjur(ed|y|ies)\b/i },
  { label: "groggy", pattern: /\bgrogg(y|ier)\b/i },
  { label: "bruise", pattern: /\bbruise[sd]?\b/i },
  { label: "recovery", pattern: /\brecover(y|ing|ed)\b/i },
  { label: "trauma", pattern: /\btrauma(ti[sz]ed?)?\b/i },
];

const CANON_INJURY_CONTEXT_TERMS: Array<{ label: string; pattern: RegExp }> = [
  { label: "shooting", pattern: /\bshoot(ing|out)?\b/i },
  { label: "gunfire", pattern: /\bgunfire\b/i },
  { label: "shot", pattern: /\bshot\b/i },
  { label: "injury", pattern: /\binjur(ed|y|ies)\b/i },
  { label: "wound", pattern: /\bwound(ed|s)?\b/i },
  { label: "hospital", pattern: /\bhospital\b/i },
  { label: "medical", pattern: /\b(medic|medical|doctor|nurse|ward|recovery room)\b/i },
  { label: "antiseptic", pattern: /\bantiseptic\b/i },
  { label: "sling", pattern: /\bsling\b/i },
  { label: "IV", pattern: /\biv\b/i },
  { label: "extraction", pattern: /\bextract(ion|ed)?\b/i },
  { label: "aftermath", pattern: /\baftermath\b/i },
  { label: "recovery", pattern: /\brecover(y|ing|ed)\b/i },
];

function collectMatchedLabels(
  text: string,
  definitions: Array<{ label: string; pattern: RegExp }>,
) {
  return Array.from(
    new Set(definitions.filter((entry) => entry.pattern.test(text)).map((entry) => entry.label)),
  );
}

function buildStoryStateContextText(storyState?: StoryState | null) {
  const json = storyState?.stateJson?.trim() ?? "";
  if (!json) {
    return "";
  }

  const parsed = safeParseStoryStateData(json);
  if (!parsed) {
    return "";
  }

  const summaries = parsed.summaries ?? {};

  return [
    summaries.premise ?? "",
    summaries.protagonistSummary ?? "",
    summaries.currentSituation ?? "",
    ...(summaries.recentDevelopments ?? []),
    ...(parsed.sceneState ?? []),
    ...(parsed.significantMemories ?? []),
    ...(parsed.relationshipState ?? []),
    ...(parsed.worldFacts ?? []),
    ...(parsed.unresolvedThreads ?? []),
  ]
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .join("\n");
}

export interface StoryInputSafetyAnalysis {
  matchedTerms: string[];
  roleplaySignals: string[];
  contextSignals: string[];
  likelyFictionalContext: boolean;
  systemMessage: string;
}

export function analyzeStoryInputSafety(params: {
  playerCharacterName: string;
  latestUserMessage: string;
  recentMessages: StoryMessage[];
  storyState?: StoryState | null;
}): StoryInputSafetyAnalysis {
  const latestUserMessage = params.latestUserMessage.trim();
  const speakerPrefix = extractSpeakerPrefix(latestUserMessage);
  const strippedUserContent = (speakerPrefix?.strippedContent ?? latestUserMessage).trim();
  const recentContextText = params.recentMessages
    .slice(-12)
    .map((message) => message.content)
    .join("\n");
  const storyStateText = buildStoryStateContextText(params.storyState);
  const matchedTerms = collectMatchedLabels(strippedUserContent, PLAYER_INJURY_TERMS);
  const canonContextMatches = collectMatchedLabels(
    `${recentContextText}\n${storyStateText}`,
    CANON_INJURY_CONTEXT_TERMS,
  );

  const roleplaySignals: string[] = [];
  if (speakerPrefix) {
    roleplaySignals.push(`speaker prefix (${speakerPrefix.speakerLabel})`);
  }
  if (/\*[^*]+\*/.test(strippedUserContent)) {
    roleplaySignals.push("action formatting");
  }
  if (/["'][^"']+["']/.test(strippedUserContent)) {
    roleplaySignals.push("dialogue formatting");
  }
  if (new RegExp(`\\b${params.playerCharacterName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(latestUserMessage)) {
    roleplaySignals.push("player character naming");
  }

  const contextSignals: string[] = [];
  if (canonContextMatches.length) {
    contextSignals.push(`recent canon supports injury/medical aftermath (${canonContextMatches.join(", ")})`);
  }
  if (params.recentMessages.length > 0) {
    contextSignals.push("ongoing story transcript");
  }

  const likelyFictionalContext =
    matchedTerms.length > 0 && (roleplaySignals.length > 0 || canonContextMatches.length > 0);

  const systemMessage = likelyFictionalContext
    ? normalizeWhitespace(
        [
          "Latest Input Safety Context",
          `Interpret the latest player turn as in-story fictional narration from ${params.playerCharacterName}, not as a real-world crisis statement, unless the user explicitly requests real-world harmful guidance or signals a real personal emergency.`,
          "The latest turn appears to describe ordinary injury, medical, trauma, or recovery aftermath inside an ongoing fictional scene.",
          "Words such as pain, hurts, agony, hospital, antiseptic, sling, IV, wound, injured, groggy, bruised, trauma, and recovery must not be treated as unsafe on sight when they are part of legitimate story prose.",
          "Preserve narrative parity: if canon already contains combat, extraction, injury, hospitalisation, medical treatment, trauma, or recovery, allow the player to react in natural first-person prose.",
          matchedTerms.length ? `Matched player terms: ${matchedTerms.join(", ")}.` : "",
          roleplaySignals.length ? `Roleplay cues: ${roleplaySignals.join(", ")}.` : "",
          canonContextMatches.length ? `Canon context cues: ${canonContextMatches.join(", ")}.` : "",
        ].join("\n"),
      )
    : "";

  return {
    matchedTerms,
    roleplaySignals,
    contextSignals,
    likelyFictionalContext,
    systemMessage,
  };
}

export function formatLikelyFictionalSafetyRefusalMessage(
  baseMessage: string,
  analysis: StoryInputSafetyAnalysis,
) {
  const detailParts = [
    "source=provider",
    "failure=safety",
    analysis.matchedTerms.length ? `matched_terms=${analysis.matchedTerms.join(",")}` : "",
    analysis.roleplaySignals.length ? `roleplay=${analysis.roleplaySignals.join(",")}` : "",
    analysis.contextSignals.length ? `context=${analysis.contextSignals.join(",")}` : "",
  ].filter(Boolean);

  return [
    "The provider refused this request under its safety rules.",
    "This looks like a likely false positive in fictional story context: ordinary injury / medical aftermath writing was sent as an in-story player turn, but the provider still blocked it.",
    baseMessage,
    detailParts.length ? `Details: ${detailParts.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
