export function extractFirstJsonObject(text: string) {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let stringChar = '"';
  let escape = false;

  for (let i = start; i < trimmed.length; i += 1) {
    const char = trimmed[i];

    if (escape) {
      escape = false;
      continue;
    }
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (inString) {
      if (char === stringChar) {
        inString = false;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      inString = true;
      stringChar = char;
      continue;
    }

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

function fixSingleQuotedJson(text: string): string {
  let result = "";
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (char === "'") {
      result += '"';
      i++;
      while (i < text.length) {
        const c = text[i];
        if (c === "\\") {
          const next = text[i + 1];
          if (next === "'") {
            result += "'";
            i += 2;
          } else if (next === '"') {
            result += '\\"';
            i += 2;
          } else {
            result += c + (next ?? "");
            i += 2;
          }
        } else if (c === '"') {
          result += '\\"';
          i++;
        } else if (c === "'") {
          result += '"';
          i++;
          break;
        } else {
          result += c;
          i++;
        }
      }
    } else if (char === '"') {
      result += '"';
      i++;
      while (i < text.length) {
        const c = text[i];
        if (c === "\\") {
          result += c + (text[i + 1] ?? "");
          i += 2;
        } else if (c === '"') {
          result += '"';
          i++;
          break;
        } else {
          result += c;
          i++;
        }
      }
    } else {
      result += char;
      i++;
    }
  }
  return result;
}

export function safeParseJsonObject<T>(text: string): T | null {
  const tryParse = (str: string): T | null => {
    try {
      const value = JSON.parse(str) as unknown;
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
      }
      return value as T;
    } catch {
      return null;
    }
  };

  const direct = tryParse(text);
  if (direct !== null) return direct;

  const fixed = fixSingleQuotedJson(text);
  if (fixed !== text) return tryParse(fixed);

  return null;
}

