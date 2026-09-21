import type { PlayerCharacter, StoryExportBundle, StoryMessage } from "../types/models";
import { formatDateTime } from "./dates";
import { parseSceneBlocks } from "./storyText/parseSceneBlocks";
import { resolveUserTranscriptSpeaker } from "./storyText/directorMode";
import { resolvePlayerCharacterSceneName } from "./playerCharacterPrompt";
import {
  createPdfDoc,
  pdfDimensions,
  heading,
  metaLine,
  subheading,
  body,
  speakerLine,
  rule,
  checkPage,
  PDF_MARGIN,
} from "./pdfLayout";

function resolveSpeakerLabel(
  message: StoryMessage,
  playerCharacter: PlayerCharacter,
  playerSceneName?: string,
): string {
  if (message.role === "user") {
    return resolveUserTranscriptSpeaker(message, {
      legalName: playerCharacter.name,
      sceneName: playerSceneName,
    });
  }
  if (message.speakerName?.trim()) return message.speakerName.trim();
  if (message.speakerType === "narrator") return "Narrator";
  if (message.role === "system" || message.speakerType === "system") return "System";
  return "Narrator";
}

export function serializeStoryExportPdf(bundle: StoryExportBundle): ArrayBuffer {
  const doc = createPdfDoc();
  const { pageW, pageH } = pdfDimensions(doc);
  let y = PDF_MARGIN;


  // ── Title ────────────────────────────────────────────────────────────────
  y = heading(doc, y, bundle.story.title, 18, pageH);
  y = rule(doc, y, pageW);

  y = metaLine(doc, y, "Universe", bundle.universe.name, pageH);
  y = metaLine(doc, y, "Protagonist", bundle.playerCharacter.name, pageH);
  y = metaLine(doc, y, "Exported", formatDateTime(bundle.exportedAt), pageH);
  y += 16;

  // ── Story Index ──────────────────────────────────────────────────────────
  if (bundle.storyIndex) {
    const idx = bundle.storyIndex;
    y = rule(doc, y, pageW);
    y += 12;
    y = heading(doc, y, "Story Index", 14, pageH);

    y = subheading(doc, y, "Chapter Summaries", pageH);
    if (idx.chapterSummaries.length === 0) {
      y = body(doc, y, "No chapter summaries indexed.", 0, undefined, pageH);
    } else {
      for (const chapter of idx.chapterSummaries) {
        y = subheading(doc, y, chapter.chapterLabel, pageH);
        y = metaLine(doc, y, "Source messages", String(chapter.sourceMessageIds.length), pageH);
        y = body(doc, y, chapter.summary.trim(), 0, undefined, pageH);
        y += 5;
      }
    }

    y = subheading(doc, y, "Characters", pageH);
    if (idx.characters.length === 0) {
      y = body(doc, y, "No characters indexed.", 0, undefined, pageH);
    } else {
      for (const character of idx.characters) {
        y = subheading(doc, y, `${character.canonicalName}${character.status ? ` (${character.status})` : ""}`, pageH);
        y = metaLine(doc, y, "Aliases", character.aliases.join(", ") || "None", pageH);
        if (character.description) y = metaLine(doc, y, "Description", character.description, pageH);
        if (character.developments.length) y = metaLine(doc, y, "Key developments", character.developments.join("; "), pageH);
        y = metaLine(doc, y, "Provenance", `${character.provenance.length} source message${character.provenance.length === 1 ? "" : "s"}`, pageH);
        y += 5;
      }
    }

    y = subheading(doc, y, "Relationships", pageH);
    if (idx.relationships.length === 0) {
      y = body(doc, y, "No relationships indexed.", 0, undefined, pageH);
    } else {
      const charMap = new Map(idx.characters.map((character) => [character.id, character.canonicalName]));
      charMap.set(bundle.playerCharacter.id, bundle.playerCharacter.name);
      for (const relationship of idx.relationships) {
        const nameA = charMap.get(relationship.characterIdA) || relationship.characterIdA;
        const nameB = charMap.get(relationship.characterIdB) || relationship.characterIdB;
        y = subheading(doc, y, `${nameA} & ${nameB}${relationship.state ? ` (${relationship.state})` : ""}`, pageH);
        y = metaLine(doc, y, "Nature", relationship.nature, pageH);
        if (relationship.developments.length) y = metaLine(doc, y, "Key developments", relationship.developments.join("; "), pageH);
        y = metaLine(doc, y, "Provenance", `${relationship.provenance.length} source message${relationship.provenance.length === 1 ? "" : "s"}`, pageH);
        y += 5;
      }
    }

    y += 8;
  }

  // ── Transcript ───────────────────────────────────────────────────────────
  y = rule(doc, y, pageW);
  y += 12;
  y = heading(doc, y, "Transcript", 14, pageH);
  y = rule(doc, y, pageW);
  y += 8;

  const playerSceneName = resolvePlayerCharacterSceneName(bundle.playerCharacter, {
    storyState: null,
    recentMessages: bundle.messages,
  });

  for (const message of bundle.messages) {
    if (message.role === "system") continue;

    if (message.role === "user") {
      const speaker = resolveSpeakerLabel(message, bundle.playerCharacter, playerSceneName);
      y = speakerLine(doc, y, speaker, message.content, pageH);
    } else {
      const blocks = parseSceneBlocks(message.content);

      for (const block of blocks) {
        const speaker = block.speakerLabel || "";
        y = speakerLine(doc, y, speaker, block.text, pageH);
      }
    }

    y += 8;
    y = checkPage(doc, y, pageH, 10);
    y = rule(doc, y, pageW);
    y += 10;
  }

  return doc.output("arraybuffer") as ArrayBuffer;
}
