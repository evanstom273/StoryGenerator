export function extractFirstJsonObject(text: string) {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  if (start === -1) {
    return null;
  }

  let depth = 0;
  for (let i = start; i < trimmed.length; i += 1) {
    const char = trimmed[i];

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return trimmed.slice(start, i + 1);
      }
    }
  }

  return null;
}

export function safeParseJsonObject<T>(text: string): T | null {
  try {
    const value = JSON.parse(text) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    return value as T;
  } catch {
    return null;
  }
}

