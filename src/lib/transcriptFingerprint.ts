import type { StoryMessage } from "../types/models";

async function sha256Hex(value: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("Web Crypto is required to fingerprint the canonical transcript.");
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function buildCanonicalTranscriptFingerprint(messages: readonly StoryMessage[]) {
  const ordered = [...messages].sort((left, right) => {
    const timeDifference = new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime();
    return timeDifference || left.id.localeCompare(right.id);
  });
  const rows = await Promise.all(ordered.map(async (message) => ({
    id: message.id,
    revision: Number.isFinite(message.revision) ? Math.trunc(message.revision!) : 0,
    role: message.role,
    timestamp: message.timestamp,
    contentHash: await sha256Hex(message.content ?? ""),
  })));
  return `sha256:${await sha256Hex(JSON.stringify(rows))}`;
}
