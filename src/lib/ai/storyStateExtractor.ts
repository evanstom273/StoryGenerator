import type { StoryMessage, StoryStateData } from "../../types/models";
import type { AIChatMessage } from "./types";
import { extractFirstJsonObject, safeParseJsonObject } from "./json";

function normalizeWhitespace(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatRecentMessages(messages: StoryMessage[], playerName: string) {
  return messages
    .slice(-40)
    .map((message) => {
      const prefix =
        message.role === "user"
          ? `Player (${playerName}):`
          : message.speakerType === "canon"
            ? `Canon (${message.speakerName?.trim() || "Unknown"}):`
            : message.speakerType === "narrator"
              ? "Narration:"
              : "Assistant:";
      return `${prefix}\n${message.content}`;
    })
    .join("\n\n");
}

export function buildStoryStateExtractionPrompt({
  playerName,
  openingPrompt,
  summaryText,
  recentMessages,
  existingStateJson,
}: {
  playerName: string;
  openingPrompt: string;
  summaryText: string;
  recentMessages: StoryMessage[];
  existingStateJson?: string;
}): AIChatMessage[] {
  const system = normalizeWhitespace(
    [
      "You extract and maintain current story-state for continuity.",
      "Story events define current truth. The character sheet and opening prompt define the starting state.",
      "Prefer existing story-state; update only when new evidence appears.",
      "Track only explicit, high-confidence changes. Do not invent facts.",
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
      '  "summaries"?: { "characterSummaries"?: { "<name>": string }, "relationshipSummary"?: string, "worldSummary"?: string }',
      "}",
      "Rules:",
      "- Include identity changes (preferred name, alias, undercover identity, pronouns).",
      "- Include relationship changes and rank/title changes when they occur.",
      "- Include major injuries/recoveries and major world events.",
      "- Put short-term scene specifics (current location/participants/active situation) in sceneState.",
      "- Put only lasting, story-changing events in significantMemories (diagnoses, deaths, betrayals, promotions, major injuries, identity changes).",
      "- relationshipState should be a consolidated set of relationship facts that affect future behavior.",
      "- Use relationships for structured relationship metrics between characters (including recurring NPCs).",
      "- Use npcs to track recurring NPCs and what they remember.",
      "- Use locations to track important recurring places.",
      "- Keep lists short and deduplicated.",
      "- If nothing changed, return the previous state with a refreshed updatedAt.",
      "- Never generate dialogue or actions for the player character; this is metadata only.",
    ].join("\n"),
  );

  const user = normalizeWhitespace(
    [
      openingPrompt.trim() ? `Opening Prompt (canon setup):\n${openingPrompt.trim()}` : "",
      summaryText.trim() ? `Current Summary:\n${summaryText.trim()}` : "",
      existingStateJson?.trim() ? `Existing Story State JSON:\n${existingStateJson.trim()}` : "",
      `Recent Transcript:\n${formatRecentMessages(recentMessages, playerName)}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  );

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export function parseStoryStateData(text: string): StoryStateData | null {
  const jsonText = extractFirstJsonObject(text) ?? text.trim();
  const parsed = safeParseJsonObject<StoryStateData>(jsonText);
  if (!parsed) {
    return null;
  }

  if (!parsed.updatedAt || typeof parsed.updatedAt !== "string") {
    return null;
  }

  if (!parsed.characters || typeof parsed.characters !== "object") {
    return null;
  }

  if (!Array.isArray(parsed.worldFacts) || !Array.isArray(parsed.unresolvedThreads)) {
    return null;
  }

  if (parsed.sceneState && !Array.isArray(parsed.sceneState)) {
    return null;
  }

  if (parsed.significantMemories && !Array.isArray(parsed.significantMemories)) {
    return null;
  }

  if (parsed.relationshipState && !Array.isArray(parsed.relationshipState)) {
    return null;
  }

  if (parsed.relationships && typeof parsed.relationships !== "object") {
    return null;
  }

  if (parsed.npcs && typeof parsed.npcs !== "object") {
    return null;
  }

  if (parsed.locations && typeof parsed.locations !== "object") {
    return null;
  }

  if (parsed.summaries && typeof parsed.summaries !== "object") {
    return null;
  }

  return parsed;
}

export function formatStoryLongTermMemoryForPrompt(storyStateData: StoryStateData) {
  const lines: string[] = [];

  const characterNames = Object.keys(storyStateData.characters || {}).slice(0, 24);
  if (characterNames.length) {
    lines.push("Characters:");
    for (const name of characterNames) {
      const entry = storyStateData.characters[name];
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

  if (storyStateData.summaries && typeof storyStateData.summaries === "object") {
    const worldSummary = (storyStateData.summaries as any).worldSummary;
    const relationshipSummary = (storyStateData.summaries as any).relationshipSummary;
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

export function formatStorySceneStateForPrompt(storyStateData: StoryStateData) {
  const lines: string[] = [];
  if (storyStateData.sceneState?.length) {
    for (const item of storyStateData.sceneState.slice(0, 16)) {
      lines.push(`- ${item}`);
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
