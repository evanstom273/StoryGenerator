const NUMBER_WORD_SPEAKER_DENY = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
  "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
] as const;

const DENIED_SPEAKER_LABELS = new Set([
  "He", "She", "They", "It", "We", "You", "I", "His", "Her", "Their", "Its",
  "The", "A", "An", "And", "But", "Or", "So", "Then", "Now", "Later", "Meanwhile",
  "Outside", "Inside", "Suddenly", "Time", "Note", "Warning", "However", "Therefore",
  "Eventually", "Finally", "Scene", "Chapter", "Part", "First", "Next", "Narrator",
  "As", "With", "After", "Before", "While", "When", "Once", "Until", "From", "Into",
  "Through", "Against", "Between", "Without", "Sun", "Moon", "Rain", "Snow", "Wind",
  "Storm", "Thunder", "Lightning", "Morning", "Evening", "Dawn", "Dusk", "Day", "Night",
  "Midnight", "Noon", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
  "Saturday", "January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December", "Spring", "Summer", "Autumn", "Fall",
  "Winter", "Weather", "Sky", "Clouds", "Fog", "Mist", "Darkness", "Silence",
  ...NUMBER_WORD_SPEAKER_DENY,
]);

export function isDeniedSpeakerLabel(value: string | null | undefined): boolean {
  if (!value?.trim()) return true;
  const trimmed = value.trim();
  const first = trimmed.split(/\s+/)[0] ?? "";
  return DENIED_SPEAKER_LABELS.has(trimmed) || DENIED_SPEAKER_LABELS.has(first);
}

export function isPossessiveSpeakerLabel(value: string | null | undefined): boolean {
  return /^[A-Z][a-zA-Z''-]*['']s$/i.test(value?.trim() ?? "");
}

export function normalizeSceneSpeakerLabel(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || isPossessiveSpeakerLabel(trimmed)) return trimmed;
  const nickname = trimmed.match(/^([^\s"']+)\s+["'][^"']+["']\s+/);
  if (nickname?.[1]) return nickname[1];
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

export function normalizeEmbeddedNicknameMentions(value: string): string {
  return value.replace(/\b([A-Z][a-z]+)\s+["'][^"']+["']\s+([A-Z][a-z]+)\b/g, "$1 $2");
}

export function normalizeSpeakerNamesInTranscript(value: string): string {
  return value
    .split(/(\r?\n)/)
    .map((part) => {
      if (/^\r?\n$/.test(part)) return part;
      const match = part.match(/^\s*([^:*\n]{1,120}):([\s\S]*)$/);
      if (!match) return normalizeEmbeddedNicknameMentions(part);
      const label = normalizeSceneSpeakerLabel(match[1]);
      return `${label}:${normalizeEmbeddedNicknameMentions(match[2])}`;
    })
    .join("");
}

export function resolvePlayerSceneLabelForRepairs(
  playerName?: string | null,
  playerSceneName?: string | null,
): string | null {
  const scene = normalizeSceneSpeakerLabel(playerSceneName);
  if (scene && !isDeniedSpeakerLabel(scene)) return scene;
  const legal = normalizeSceneSpeakerLabel(playerName);
  return legal && !isDeniedSpeakerLabel(legal) ? legal : null;
}
