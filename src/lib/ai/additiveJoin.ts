export type AdditiveJoinStrategy = "direct" | "space" | "newline";

function trimTrailingWhitespace(value: string) {
  return value.replace(/[ \t]+$/g, "").replace(/\s+$/g, "");
}

function trimLeadingWhitespace(value: string) {
  return value.replace(/^\s+/g, "");
}

function endsWithOpenDelimiter(value: string) {
  const trimmed = trimTrailingWhitespace(value);
  if (!trimmed) {
    return false;
  }

  return /(?:[*"'([{]|:\s*[*"'])$/.test(trimmed);
}

function shouldJoinWithSpace(existingText: string, generatedText: string) {
  const trimmedExisting = trimTrailingWhitespace(existingText);
  const trimmedGenerated = trimLeadingWhitespace(generatedText);

  if (!trimmedExisting || !trimmedGenerated) {
    return false;
  }

  const lastChar = trimmedExisting.slice(-1);
  const firstChar = trimmedGenerated[0];

  if (!/[A-Za-z0-9,;:)]/.test(lastChar)) {
    return false;
  }

  if (!/[A-Za-z0-9"'(]/.test(firstChar)) {
    return false;
  }

  return !/[.!?…]$/.test(trimmedExisting);
}

export function getAdditiveJoinStrategy(
  existingText: string,
  generatedText: string,
): AdditiveJoinStrategy {
  if (!trimLeadingWhitespace(generatedText)) {
    return "direct";
  }

  if (endsWithOpenDelimiter(existingText)) {
    return "direct";
  }

  if (shouldJoinWithSpace(existingText, generatedText)) {
    return "space";
  }

  return "newline";
}

export function appendAdditiveText(existingText: string, generatedText: string) {
  const trimmedGenerated = trimLeadingWhitespace(generatedText);
  if (!trimmedGenerated) {
    return existingText;
  }

  const strategy = getAdditiveJoinStrategy(existingText, generatedText);

  if (strategy === "direct") {
    return `${trimTrailingWhitespace(existingText)}${trimmedGenerated}`;
  }

  if (strategy === "space") {
    return `${trimTrailingWhitespace(existingText)} ${trimmedGenerated}`;
  }

  const trimmedExisting = trimTrailingWhitespace(existingText);
  const separator = trimmedExisting.endsWith("\n") ? "\n" : "\n\n";
  return `${trimmedExisting}${separator}${trimmedGenerated}`;
}
