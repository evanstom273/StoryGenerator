export function buildPlayerAssistRequest(playerCharacterName: string) {
  return [
    "Player Assist request:",
    `Write the next message for the player character: ${playerCharacterName}.`,
    "Output ONLY the player's message in the Story Engine format.",
    "Do not add commentary, options, or extra text.",
    "Do not write narration and do not write for any other speakers.",
    "Do not continue the scene beyond the player's turn.",
    "Formatting requirements:",
    `- First line: ${playerCharacterName}:`,
    "- Next lines (optional):",
    "- *Action.*",
    '- "Dialogue."',
    "Asterisks are reserved exclusively for actions; never use asterisks for emphasis.",
  ].join("\n");
}
