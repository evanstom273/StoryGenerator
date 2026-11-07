import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

function newId(prefix) {
  return `${prefix}:${crypto.randomUUID()}`;
}

function normalizeLines(value) {
  return (value || "").replace(/\r\n/g, "\n").split("\n");
}

function findHeaderIndex(lines, header) {
  const target = header.trim();
  return lines.findIndex((line) => line.trim() === target);
}

function sliceBetween(lines, startHeader, endHeader) {
  const start = findHeaderIndex(lines, startHeader);
  if (start < 0) return [];
  const end = endHeader ? findHeaderIndex(lines, endHeader) : -1;
  const begin = start + 1;
  const finish = end >= 0 ? end : lines.length;
  return lines.slice(begin, finish);
}

function joinParagraph(lines) {
  return lines
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseLabeledBlock(sectionLines, keys) {
  const allowed = new Set(keys);
  const result = {};
  let activeKey = null;

  for (const rawLine of sectionLines) {
    const line = rawLine.trimEnd();
    const match = /^([A-Za-z][A-Za-z ]+):\s*(.*)$/.exec(line.trim());
    if (match) {
      const key = match[1]?.trim() ?? "";
      if (allowed.has(key)) {
        activeKey = key;
        result[key] = (match[2] ?? "").trim();
        continue;
      }
    }

    if (!activeKey) continue;
    const text = line.trim();
    if (!text) continue;
    result[activeKey] = `${result[activeKey] ? `${result[activeKey]} ` : ""}${text}`;
  }

  return result;
}

function parseDateToIso(value) {
  const trimmed = (value || "").trim();
  if (!trimmed) return new Date().toISOString();
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) return new Date().toISOString();
  return new Date(ms).toISOString();
}

function parseTranscriptMessages(lines, playerName) {
  const transcriptIdx = findHeaderIndex(lines, "Transcript");
  if (transcriptIdx < 0) return [];

  const rest = lines.slice(transcriptIdx + 1);
  const messages = [];
  let buffer = [];

  function flush(timeLine) {
    const timeMatch = /^Time:\s*(.+)$/.exec(timeLine.trim());
    const timestamp = parseDateToIso(timeMatch?.[1] ?? "");
    const chunk = buffer.map((line) => line.replace(/\s+$/g, "")).join("\n").trim();
    buffer = [];
    if (!chunk) return;

    const chunkLines = chunk.split("\n").map((line) => line.trimEnd());
    const first = (chunkLines[0] ?? "").trim();

    if (first && first === playerName) {
      messages.push({
        id: newId("story-message"),
        storyId: "",
        role: "user",
        speakerType: "player",
        speakerName: playerName,
        content: chunkLines.slice(1).join("\n").trim(),
        timestamp,
      });
      return;
    }

    if (first && first === "System") {
      messages.push({
        id: newId("story-message"),
        storyId: "",
        role: "system",
        speakerType: "system",
        content: chunkLines.slice(1).join("\n").trim(),
        timestamp,
      });
      return;
    }

    if (first && first === "Assistant") {
      messages.push({
        id: newId("story-message"),
        storyId: "",
        role: "assistant",
        content: chunkLines.slice(1).join("\n").trim(),
        timestamp,
      });
      return;
    }

    messages.push({
      id: newId("story-message"),
      storyId: "",
      role: "assistant",
      content: chunkLines.join("\n").trim(),
      timestamp,
    });
  }

  for (const rawLine of rest) {
    const line = rawLine ?? "";
    if (line.trim().startsWith("Time:")) {
      flush(line);
      continue;
    }

    buffer.push(line);
  }

  return messages;
}

async function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];

  if (!inputPath || !outputPath) {
    throw new Error(
      "Usage: node scripts/convert-prototype-story-import.mjs <input.json> <output.story.json>",
    );
  }

  const absoluteInput = path.resolve(process.cwd(), inputPath);
  const absoluteOutput = path.resolve(process.cwd(), outputPath);
  const raw = await fs.readFile(absoluteInput, "utf8");
  const parsed = JSON.parse(raw);

  const transcriptRaw = parsed?.transcript_raw;
  if (typeof transcriptRaw !== "string" || !transcriptRaw.trim()) {
    throw new Error("Input JSON does not contain transcript_raw text.");
  }

  const lines = normalizeLines(transcriptRaw);
  const title = (lines[0] ?? parsed?.title ?? "Imported Story").trim() || "Imported Story";

  const storyLines = sliceBetween(lines, "Story", "Opening Prompt");
  const storyFields = parseLabeledBlock(storyLines, [
    "Universe",
    "Player Character",
    "Created",
    "Updated",
  ]);

  const openingPrompt = joinParagraph(sliceBetween(lines, "Opening Prompt", "Current Summary"));
  const currentSummary = joinParagraph(sliceBetween(lines, "Current Summary", "Universe Snapshot"));

  const universeSnapshotLines = sliceBetween(lines, "Universe Snapshot", "Player Character Snapshot");
  const universeSnapshot = parseLabeledBlock(universeSnapshotLines, ["Name", "Wiki URL", "Description"]);

  const characterSnapshotLines = sliceBetween(lines, "Player Character Snapshot", "Transcript");
  const characterSnapshot = parseLabeledBlock(characterSnapshotLines, [
    "Name",
    "Age",
    "Gender",
    "Pronouns",
    "Appearance",
    "Personality",
    "Background",
    "Goals",
    "Notes",
  ]);

  const universeName =
    universeSnapshot["Name"] || storyFields["Universe"] || "Imported Universe";
  const playerName =
    characterSnapshot["Name"] || storyFields["Player Character"] || "Player";

  const universeId = newId("universe");
  const playerCharacterId = newId("player-character");
  const storyId = newId("story");

  const createdAt = parseDateToIso(storyFields["Created"]);
  const updatedAt = parseDateToIso(storyFields["Updated"]);

  const universe = {
    id: universeId,
    name: universeName,
    wikiUrl: universeSnapshot["Wiki URL"] || "",
    description: universeSnapshot["Description"] || "",
    importedLore: [],
    importedCharacters: [],
    importedLocations: [],
    importedRelationships: [],
    createdAt,
  };

  const playerCharacter = {
    id: playerCharacterId,
    name: playerName,
    age: characterSnapshot["Age"] || "",
    gender: characterSnapshot["Gender"] || "",
    pronouns: characterSnapshot["Pronouns"] || "",
    appearance: characterSnapshot["Appearance"] || "",
    personality: characterSnapshot["Personality"] || "",
    background: characterSnapshot["Background"] || "",
    goals: characterSnapshot["Goals"] || "",
    notes: characterSnapshot["Notes"] || "",
    universeId,
    createdAt,
  };

  const story = {
    id: storyId,
    title,
    universeId,
    playerCharacterId,
    openingPrompt: openingPrompt || "N/A",
    currentSummary: currentSummary || "",
    createdAt,
    updatedAt,
  };

  const messages = parseTranscriptMessages(lines, playerName).map((message) => ({
    ...message,
    storyId,
  }));

  const bundle = {
    exportedAt: new Date().toISOString(),
    story,
    universe,
    playerCharacter,
    messages,
  };

  await fs.mkdir(path.dirname(absoluteOutput), { recursive: true });
  await fs.writeFile(absoluteOutput, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

