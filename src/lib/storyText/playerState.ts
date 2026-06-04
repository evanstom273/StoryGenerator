import type { StoryMessage } from "../../types/models";

const STATE_KEYWORDS = [
  "not here",
  "hasn't arrived",
  "has not arrived",
  "out on a case",
  "out on a job",
  "waiting",
  "travelling",
  "traveling",
  "elsewhere",
  "hidden",
  "observing",
  "silent",
  "unconscious",
  "asleep",
  "injured",
];

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function findCandidateLines(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function extractExplicitPlayerStateHint({
  playerName,
  recentMessages,
}: {
  playerName: string;
  recentMessages: StoryMessage[];
}) {
  const normalizedPlayer = normalize(playerName);
  const sources: string[] = [];

  for (const message of recentMessages.slice(-15)) {
    if (message.role === "user") {
      sources.push(message.content);
    }
  }

  for (let sourceIndex = sources.length - 1; sourceIndex >= 0; sourceIndex -= 1) {
    const source = sources[sourceIndex] ?? "";
    for (const line of findCandidateLines(source)) {
      const normalizedLine = normalize(line);
      if (!normalizedLine.includes(normalizedPlayer) && !normalizedLine.startsWith("i ")) {
        continue;
      }

      if (STATE_KEYWORDS.some((keyword) => normalizedLine.includes(keyword))) {
        return line.length > 220 ? `${line.slice(0, 220).trim()}…` : line;
      }
    }
  }

  return null;
}
