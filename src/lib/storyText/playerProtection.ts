import { parseSceneBlocks } from "./parseSceneBlocks";

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function detectPlayerCharacterAuthorshipViolation({
  playerName,
  text,
}: {
  playerName: string;
  text: string;
}) {
  const escaped = escapeRegex(playerName.trim());
  if (!escaped) {
    return false;
  }

  const headerPattern = new RegExp(`^\\s*${escaped}\\s*(?::|[-—])\\s*`, "im");
  if (headerPattern.test(text)) {
    return true;
  }

  const blocks = parseSceneBlocks(text);
  if (blocks.some((block) => block.speakerLabel?.trim() === playerName.trim())) {
    return true;
  }

  const forbiddenLeadingVerbs = new Set([
    "is",
    "was",
    "are",
    "were",
    "has",
    "had",
    "will",
    "would",
    "can",
    "could",
    "should",
    "might",
    "must",
    "says",
    "said",
    "asks",
    "asked",
    "replies",
    "replied",
    "answers",
    "answered",
    "whispers",
    "whispered",
    "mutters",
    "muttered",
    "thinks",
    "thought",
    "feels",
    "felt",
    "decides",
    "decided",
    "walks",
    "walked",
    "steps",
    "stepped",
    "enters",
    "entered",
    "leaves",
    "left",
    "sits",
    "sat",
    "stands",
    "stood",
    "turns",
    "turned",
    "leans",
    "leaned",
    "reaches",
    "reached",
    "takes",
    "took",
    "grabs",
    "grabbed",
    "pushes",
    "pushed",
    "pulls",
    "pulled",
    "runs",
    "ran",
    "smiles",
    "smiled",
    "laughs",
    "laughed",
    "nods",
    "nodded",
    "looks",
    "looked",
    "glances",
    "glanced",
  ]);

  const normalizedName = playerName.trim();
  const linePrefix = new RegExp(`^\\*?\\s*${escapeRegex(normalizedName)}\\b\\s+([a-zA-Z']+)`, "i");

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const match = trimmed.match(linePrefix);
    if (!match) {
      continue;
    }

    const verb = match[1]?.toLowerCase();
    if (verb && forbiddenLeadingVerbs.has(verb)) {
      return true;
    }
  }

  return false;
}
