import type {
  StoryAuthorDirective,
  StoryAuthorDirectiveKind,
  StoryAuthorDirectiveState,
  StoryMessage,
  StoryMessageSpeakerType,
  StoryStateData,
  StoryStateDataV2,
} from "../../types/models";

const AUTHOR_DIRECTIVE_LABELS: Record<StoryAuthorDirectiveKind, string> = {
  canon: "Canon",
  secret: "Secret",
  reveal: "Reveal",
  retcon: "Retcon",
};

const EMPTY_AUTHOR_DIRECTIVE_STATE: StoryAuthorDirectiveState = {
  canon: [],
  retcons: [],
  hiddenSecrets: [],
  revealedSecrets: [],
  revealDirectives: [],
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = normalizeText(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function tokenize(value: string) {
  return normalizeText(value)
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 4);
}

function doesRevealMatchSecret(revealText: string, secretText: string) {
  const reveal = normalizeText(revealText);
  const secret = normalizeText(secretText);
  if (!reveal || !secret) {
    return false;
  }
  if (reveal === secret || reveal.includes(secret) || secret.includes(reveal)) {
    return true;
  }

  const revealTokens = tokenize(revealText);
  const secretTokens = tokenize(secretText);
  if (!revealTokens.length || !secretTokens.length) {
    return false;
  }

  const secretSet = new Set(secretTokens);
  const overlap = revealTokens.filter((token) => secretSet.has(token)).length;
  return overlap >= Math.min(2, Math.min(revealTokens.length, secretTokens.length));
}

export function detectAuthorDirectiveKind(
  speakerLabel: string | null | undefined,
): StoryAuthorDirectiveKind | null {
  const normalized = normalizeText(speakerLabel);
  switch (normalized) {
    case "canon":
      return "canon";
    case "secret":
      return "secret";
    case "reveal":
      return "reveal";
    case "retcon":
      return "retcon";
    default:
      return null;
  }
}

export function getAuthorDirectiveLabel(kind: StoryAuthorDirectiveKind) {
  return AUTHOR_DIRECTIVE_LABELS[kind];
}

export function isAuthorDirectiveMessage(
  message:
    | Pick<StoryMessage, "role" | "speakerType" | "speakerName" | "authorDirective">
    | null
    | undefined,
) {
  if (!message || message.role !== "user") {
    return false;
  }

  return (
    message.authorDirective?.kind != null ||
    message.speakerType === "author" ||
    detectAuthorDirectiveKind(message.speakerName) != null
  );
}

export function resolveAuthorDirective(
  speakerLabel: string | null | undefined,
  fallbackDirective?: StoryAuthorDirective | null,
): StoryAuthorDirective | undefined {
  const kind = detectAuthorDirectiveKind(speakerLabel) ?? fallbackDirective?.kind ?? null;
  return kind ? { kind } : undefined;
}

export function resolveUserSpeakerTypeForAuthorDirective(
  authorDirective: StoryAuthorDirective | undefined,
  fallbackSpeakerType?: StoryMessageSpeakerType,
): StoryMessageSpeakerType | undefined {
  if (authorDirective) {
    return "author";
  }

  return fallbackSpeakerType;
}

export function resolveUserSpeakerNameForAuthorDirective(
  authorDirective: StoryAuthorDirective | undefined,
  fallbackSpeakerName?: string | null,
) {
  if (authorDirective) {
    return getAuthorDirectiveLabel(authorDirective.kind);
  }

  const trimmed = fallbackSpeakerName?.trim();
  return trimmed || undefined;
}

export function buildAuthorDirectiveState(
  messages: StoryMessage[],
): StoryAuthorDirectiveState {
  const state: StoryAuthorDirectiveState = {
    ...EMPTY_AUTHOR_DIRECTIVE_STATE,
  };

  for (const message of messages) {
    if (!isAuthorDirectiveMessage(message)) {
      continue;
    }

    const kind = message.authorDirective?.kind ?? detectAuthorDirectiveKind(message.speakerName);
    const content = message.content?.trim() ?? "";
    if (!kind || !content) {
      continue;
    }

    if (kind === "canon") {
      state.canon = dedupeStrings([...state.canon, content]);
      continue;
    }

    if (kind === "retcon") {
      state.retcons = dedupeStrings([...state.retcons, content]);
      continue;
    }

    if (kind === "secret") {
      const alreadyRevealed = state.revealedSecrets.some((entry) =>
        doesRevealMatchSecret(entry, content),
      );
      if (!alreadyRevealed) {
        state.hiddenSecrets = dedupeStrings([...state.hiddenSecrets, content]);
      }
      continue;
    }

    if (kind === "reveal") {
      state.revealDirectives = dedupeStrings([...state.revealDirectives, content]);

      const revealedMatches = state.hiddenSecrets.filter((secret) =>
        doesRevealMatchSecret(content, secret),
      );
      if (revealedMatches.length) {
        state.hiddenSecrets = state.hiddenSecrets.filter(
          (secret) => !revealedMatches.includes(secret),
        );
        state.revealedSecrets = dedupeStrings([
          ...state.revealedSecrets,
          ...revealedMatches,
        ]);
      } else {
        state.revealedSecrets = dedupeStrings([...state.revealedSecrets, content]);
      }
    }
  }

  return {
    canon: dedupeStrings(state.canon),
    retcons: dedupeStrings(state.retcons),
    hiddenSecrets: dedupeStrings(state.hiddenSecrets),
    revealedSecrets: dedupeStrings(state.revealedSecrets),
    revealDirectives: dedupeStrings(state.revealDirectives),
  };
}

export function hasAuthorDirectiveContent(
  state: StoryAuthorDirectiveState | null | undefined,
) {
  if (!state) {
    return false;
  }

  return Boolean(
    state.canon.length ||
      state.retcons.length ||
      state.hiddenSecrets.length ||
      state.revealedSecrets.length ||
      state.revealDirectives.length,
  );
}

export function formatAuthorDirectiveStateForPrompt(
  state: StoryAuthorDirectiveState | null | undefined,
) {
  if (!hasAuthorDirectiveContent(state)) {
    return "";
  }

  const lines: string[] = [
    "These author declarations override ordinary inference. Treat them as the highest-priority truth layer for continuity.",
  ];

  if (state?.canon.length) {
    lines.push("", "Canon Declarations:");
    for (const entry of state.canon) {
      lines.push(`- ${entry}`);
    }
  }

  if (state?.retcons.length) {
    lines.push("", "Active Retcons:");
    lines.push(
      "Later retcons replace earlier canon where they conflict. The current story state should follow the retconned version going forward.",
    );
    for (const entry of state.retcons) {
      lines.push(`- ${entry}`);
    }
  }

  if (state?.hiddenSecrets.length) {
    lines.push("", "Hidden Secrets:");
    lines.push(
      "These are objectively true but must remain concealed from characters and/or the audience unless later reveal authority or scene logic explicitly permits exposure. Do not hint at them gratuitously.",
    );
    for (const entry of state.hiddenSecrets) {
      lines.push(`- ${entry}`);
    }
  }

  if (state?.revealedSecrets.length) {
    lines.push("", "Revealed Or Reveal-Authorized Secrets:");
    lines.push(
      "These truths may now enter the narrative naturally and can be exposed, discussed, or resolved when appropriate.",
    );
    for (const entry of state.revealedSecrets) {
      lines.push(`- ${entry}`);
    }
  }

  return lines.join("\n");
}

export function applyAuthorDirectivesToStoryState(
  state: StoryStateData | StoryStateDataV2 | null | undefined,
  messages: StoryMessage[],
): StoryStateDataV2 {
  const directiveState = buildAuthorDirectiveState(messages);

  return {
    ...(state ?? {}),
    authorDirectives: directiveState,
  };
}
