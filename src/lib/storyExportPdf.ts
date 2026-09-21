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

    y = heading(doc, y, "Chapter Summaries", 12, pageH);
    if (idx.chapterSummaries.length === 0) {
      y = speakerLine(doc, y, "", "No chapter summaries indexed.", pageH);
    } else {
      for (const chapter of idx.chapterSummaries) {
        y = speakerLine(
          doc,
          y,
          chapter.chapterLabel,
          `${chapter.summary}\nSource messages: ${chapter.sourceMessageIds.length}`,
          pageH,
        );
      }
    }

    y = heading(doc, y, "Characters", 12, pageH);
    if (idx.characters.length === 0) {
      y = speakerLine(doc, y, "", "No characters indexed.", pageH);
    } else {
      for (const character of idx.characters) {
        const details = [
          character.aliases.length ? `Aliases: ${character.aliases.join(", ")}` : "Aliases: None",
          character.description ? `Description: ${character.description}` : "",
          character.developments.length ? `Key developments: ${character.developments.join("; ")}` : "",
          `Provenance: ${character.provenance.length} source message${character.provenance.length === 1 ? "" : "s"}`,
        ].filter(Boolean).join("\n");
        y = speakerLine(
          doc,
          y,
          `${character.canonicalName}${character.status ? ` (${character.status})` : ""}`,
          details,
          pageH,
        );
      }
    }

    y = heading(doc, y, "Relationships", 12, pageH);
    const characterNames = new Map(idx.characters.map((character) => [character.id, character.canonicalName]));
    characterNames.set(bundle.playerCharacter.id, bundle.playerCharacter.name);
    if (idx.relationships.length === 0) {
      y = speakerLine(doc, y, "", "No relationships indexed.", pageH);
    } else {
      for (const relationship of idx.relationships) {
        const nameA = characterNames.get(relationship.characterIdA) || relationship.characterIdA;
        const nameB = characterNames.get(relationship.characterIdB) || relationship.characterIdB;
        const details = [
          `Nature: ${relationship.nature}`,
          relationship.developments.length ? `Key developments: ${relationship.developments.join("; ")}` : "",
          `Provenance: ${relationship.provenance.length} source message${relationship.provenance.length === 1 ? "" : "s"}`,
        ].filter(Boolean).join("\n");
        y = speakerLine(
          doc,
          y,
          `${nameA} & ${nameB}${relationship.state ? ` (${relationship.state})` : ""}`,
          details,
          pageH,
        );
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
