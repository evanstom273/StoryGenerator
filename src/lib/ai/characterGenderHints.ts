import type { StoryStateData, StoryStateDataV2 } from "../../types/models";

export type CharacterGenderHint = "male" | "female";
export type CharacterGenderMap = Record<string, CharacterGenderHint>;

export function normalizeCharacterKey(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function inferCharacterGenderHint(
  gender?: string | null,
  pronouns?: string | null,
): CharacterGenderHint | undefined {
  const normalizedGender = gender?.trim().toLowerCase() ?? "";
  if (normalizedGender) {
    if (/^(m|male|man|boy)\b/.test(normalizedGender) || normalizedGender === "m") {
      return "male";
    }
    if (/^(f|female|woman|girl)\b/.test(normalizedGender) || normalizedGender === "f") {
      return "female";
    }
  }

  const normalizedPronouns = pronouns?.trim().toLowerCase() ?? "";
  if (normalizedPronouns === "he/him" || /\b(he\/him|him\/he)\b/.test(normalizedPronouns)) {
    return "male";
  }
  if (normalizedPronouns === "she/her" || /\b(she\/her|her\/she)\b/.test(normalizedPronouns)) {
    return "female";
  }

  return undefined;
}


export function inferGenderFromPronounsInText(
  text: string,
): CharacterGenderHint | undefined {
  const normalized = text.toLowerCase();
  let maleSignals = 0;
  let femaleSignals = 0;

  if (/\bhe\b/.test(normalized)) maleSignals += 1;
  if (/\bhis\b/.test(normalized)) maleSignals += 1;
  if (/\bhim\b/.test(normalized)) maleSignals += 1;
  if (/\bhimself\b/.test(normalized)) maleSignals += 1;
  if (/\bshe\b/.test(normalized)) femaleSignals += 1;
  if (/\bher\b/.test(normalized)) femaleSignals += 1;
  if (/\bhers\b/.test(normalized)) femaleSignals += 1;
  if (/\bherself\b/.test(normalized)) femaleSignals += 1;

  if (maleSignals > 0 && femaleSignals === 0) return "male";
  if (femaleSignals > 0 && maleSignals === 0) return "female";
  return undefined;
}

function applyGenderHint(
  hints: CharacterGenderMap,
  name: string,
  gender: CharacterGenderHint,
) {
  const key = normalizeCharacterKey(name);
  if (!key) return;

  hints[key] = gender;
  const firstToken = key.split(" ")[0] ?? "";
  if (firstToken.length >= 2) {
    hints[firstToken] = gender;
  }
}

export function buildCharacterGenderHintsFromStoryState(
  storyStateData: StoryStateData | StoryStateDataV2 | null | undefined,
  options?: {
    playerName?: string | null;
    playerAliases?: string[] | null;
    playerGender?: string | null;
    playerPronouns?: string | null;
  },
): CharacterGenderMap {
  const hints: CharacterGenderMap = {};
  const playerGender = inferCharacterGenderHint(options?.playerGender, options?.playerPronouns);
  const playerIdentityLabels = new Set(
    [options?.playerName, ...(options?.playerAliases ?? [])]
      .map((value) => normalizeCharacterKey(value ?? ""))
      .filter(Boolean),
  );

  for (const label of Array.from(playerIdentityLabels)) {
    const firstName = label.split(" ")[0];
    if (firstName) playerIdentityLabels.add(firstName);
  }

  if (playerGender && options?.playerName?.trim()) {
    applyGenderHint(hints, options.playerName.trim(), playerGender);
  }

  for (const [canonicalKey, entry] of Object.entries(
    storyStateData?.characters ?? {},
  ) as Array<[string, any]>) {
    const entryNames = [
      canonicalKey,
      entry?.canonicalName,
      entry?.displayName,
      ...(entry?.aliases ?? []),
    ]
      .filter((name): name is string => Boolean(name?.trim()))
      .map((name) => normalizeCharacterKey(name));

    if (entryNames.some((name) => playerIdentityLabels.has(name))) {
      continue;
    }

    const gender = inferCharacterGenderHint(entry?.gender, entry?.pronouns);
    if (!gender) continue;

    for (const name of [
      canonicalKey,
      entry?.canonicalName,
      entry?.displayName,
      ...(entry?.aliases ?? []),
    ].filter((name): name is string => Boolean(name?.trim()))) {
      applyGenderHint(hints, name, gender);
    }
  }

  return hints;
}
