export type SceneDepth = "light" | "standard" | "major";

export interface SceneWordTarget {
  minWords: number;
  maxWords: number;
}

const MAJOR_KEYWORDS = [
  "dead",
  "death",
  "killed",
  "murder",
  "confession",
  "reveal",
  "arrest",
  "betrayal",
  "explosion",
  "shooting",
  "gun",
  "blood",
  "kidnap",
  "hostage",
  "divorce",
  "break up",
  "breakup",
  "crying",
  "funeral",
  "panic",
  "heart attack",
];

const LIGHT_OPENERS = [
  "how",
  "what",
  "why",
  "where",
  "when",
  "who",
  "you okay",
  "you ok",
  "are you",
  "is ",
  "did ",
  "do ",
  "can ",
  "could ",
  "would ",
];

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export function inferSceneDepth(latestUserMessage: string): SceneDepth {
  const text = normalize(latestUserMessage);
  if (!text) {
    return "standard";
  }

  if (MAJOR_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return "major";
  }

  const isQuestion = text.endsWith("?") || text.includes("?");
  const isShort = text.split(/\s+/).filter(Boolean).length <= 18;
  const startsLikeLight = LIGHT_OPENERS.some((starter) => text.startsWith(starter));

  if (isShort && (isQuestion || startsLikeLight)) {
    return "light";
  }

  return "standard";
}

export function getSceneWordTarget(depth: SceneDepth): SceneWordTarget {
  switch (depth) {
    case "light":
      return { minWords: 50, maxWords: 200 };
    case "major":
      return { minWords: 300, maxWords: 1100 };
    case "standard":
    default:
      return { minWords: 150, maxWords: 500 };
  }
}

