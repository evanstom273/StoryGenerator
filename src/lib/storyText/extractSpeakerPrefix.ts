export function extractSpeakerPrefix(content: string): { speakerLabel: string; strippedContent: string } | null {
  const match = content.match(/^\s*([A-Za-z0-9 _'\"-]{1,40}):\s+([\s\S]*)$/);
  if (!match) {
    return null;
  }

  const speakerLabel = (match[1] ?? "").trim();
  const strippedContent = (match[2] ?? "").trim();

  if (!speakerLabel || !strippedContent) {
    return null;
  }

  return { speakerLabel, strippedContent };
}

