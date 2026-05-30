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
  return headerPattern.test(text);
}

