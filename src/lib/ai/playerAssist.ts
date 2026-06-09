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

export function buildPlayerAssistContinuationRequest(
  playerCharacterName: string,
  existingText: string,
) {
  return [
    "Player Assist request:",
    `Continue the player's next message for the player character: ${playerCharacterName}.`,
    "The user has already started writing the message below. Treat it as the exact beginning of the player's message.",
    "Do NOT repeat any of the existing text. Do NOT rewrite it. Do NOT output the speaker label again.",
    "Output ONLY the continuation text to append after the existing text. No commentary. No other speakers. No narration.",
    "Asterisks are reserved exclusively for actions; never use asterisks for emphasis.",
    "",
    "Existing text (do not repeat):",
    "```",
    existingText.replace(/\r\n/g, "\n"),
    "```",
  ].join("\n");
}
