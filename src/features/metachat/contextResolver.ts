import type { StoryEngineRepository } from "../../lib/repository";
import {
  resolveChapterEndMessageIndex,
  resolveMessageChapterBoundary,
  resolveNextChapterStartIndex,
} from "../../lib/storyText/chapterNavigation";
import type { StoryChapter, StoryMessage } from "../../types/models";
import type {
  Attachment,
  Conversation,
  ResolvedContext,
  ResourceCatalog,
} from "./types";

/** Only read capabilities are provided to retrieval. */
export type ContextRepository = Pick<
  StoryEngineRepository,
  | "listStoryCatalog"
  | "listPlayerCharacters"
  | "listUniverses"
  | "getStoryState"
  | "getStoryIndex"
  | "listStoryChapters"
  | "listStoryMessages"
  | "getStoryMessage"
  | "listAllStoryIndexes"
>;
export const CONTEXT_BUDGET = { casual: 2500, focused: 18000, review: 64000 };
const STOP = new Set(
  "the a an is in on of to and or that this it why how did do does was were with for you i me my please review chapter including about like what story stories compare".split(
    " ",
  ),
);
export function terms(text: string) {
  return [
    ...new Set(text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []),
  ].filter((word) => !STOP.has(word));
}
export function relevance(text: string, query: string) {
  const lower = text.toLowerCase();
  return terms(query).reduce(
    (score, term) => score + (lower.includes(term) ? 1 : 0),
    0,
  );
}
function mentions(text: string, name: string) {
  const normalized = name.toLowerCase().trim();
  if (normalized.length < 3)
    return text.toLowerCase().includes(`@${normalized}`);
  return new RegExp(
    `(^|[^\\p{L}\\p{N}])${normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{N}])`,
    "u",
  ).test(text.toLowerCase());
}
export function detectIntent(text: string): ResolvedContext["intent"] {
  if (
    /\b(review|analyse|analyze|analysis|critique|detailed|in.depth|compare|comparison|continuity|characterisation|characterization)\b/i.test(
      text,
    )
  )
    return "review";
  if (
    /\b(why|how|when|where|explain|remember|earlier|happened|relationship|react|development|current|state|chapter|transcript|summary|summarise|summarize)\b/i.test(
      text,
    )
  )
    return "focused";
  return "casual";
}
export async function loadCatalog(
  repository: ContextRepository,
): Promise<ResourceCatalog> {
  const [stories, characters, universes] = await Promise.all([
    repository.listStoryCatalog(),
    repository.listPlayerCharacters(),
    repository.listUniverses(),
  ]);
  return {
    stories,
    characters: characters.filter(
      (item) => (item.scope ?? "library") === "library",
    ),
    universes,
  };
}
export function catalogReferences(catalog: ResourceCatalog): Attachment[] {
  return [
    ...catalog.stories.map((item) => ({
      kind: "story" as const,
      id: item.id,
      label: item.title,
    })),
    ...catalog.characters.map((item) => ({
      kind: "character" as const,
      id: item.id,
      label: item.name,
    })),
    ...catalog.universes.map((item) => ({
      kind: "universe" as const,
      id: item.id,
      label: item.name,
    })),
  ];
}
function chapterToken(label: string) {
  const token = label
    .replace(/^chapter\s+/i, "")
    .trim()
    .split(/[\s:.,-]/)[0]
    ?.toUpperCase();
  if (/^\d+$/.test(token)) return Number(token);
  if (!/^[IVXLCDM]+$/.test(token)) return token;
  const values: Record<string, number> = {
    I: 1,
    V: 5,
    X: 10,
    L: 50,
    C: 100,
    D: 500,
    M: 1000,
  };
  return [...token].reduce(
    (n, c, i) =>
      n + (values[c] < (values[token[i + 1]] ?? 0) ? -values[c] : values[c]),
    0,
  );
}
export function chapterTranscript(
  messages: StoryMessage[],
  chapters: StoryChapter[],
  label: string,
): StoryMessage[] {
  const sorted = [...messages].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );
  const ordered = [...chapters].sort((a, b) => a.endsAtIndex - b.endsAtIndex);
  const position = ordered.findIndex(
    (chapter) => chapterToken(chapter.label) === chapterToken(label),
  );
  if (position >= 0) {
    const end = resolveChapterEndMessageIndex(sorted, ordered[position]);
    const start =
      position > 0
        ? resolveNextChapterStartIndex(sorted, ordered[position - 1])
        : 0;
    if (end === null || start === null) return [];
    const boundary = resolveMessageChapterBoundary(sorted[end]);
    return sorted.slice(start, boundary?.kind === "start" ? end : end + 1);
  }
  const start = sorted.findIndex((message) => {
    const boundary = resolveMessageChapterBoundary(message);
    return (
      boundary?.kind === "start" &&
      chapterToken(boundary.label) === chapterToken(label)
    );
  });
  if (start < 0) {
    // Closed chapter records also define the following open chapter without a banner.
    if (
      ordered.length &&
      chapterToken(label) ===
        Number(chapterToken(ordered[ordered.length - 1].label)) + 1
    ) {
      const next = resolveNextChapterStartIndex(
        sorted,
        ordered[ordered.length - 1],
      );
      return next === null ? [] : sorted.slice(next);
    }
    return [];
  }
  const next = sorted.findIndex(
    (message, i) =>
      i > start && resolveMessageChapterBoundary(message)?.kind === "start",
  );
  return sorted.slice(start, next < 0 ? undefined : next);
}
export function evidenceMessage(message: StoryMessage) {
  const author =
    message.role === "user"
      ? `User-authored ${message.speakerType ?? "player"}`
      : message.role === "assistant"
        ? "AI-authored narration/NPC dialogue"
        : "System/control";
  return `[${message.id}; ${author}${message.speakerName ? `; speaker ${message.speakerName}` : ""}] ${message.content}`;
}

export async function resolveContext(
  repository: ContextRepository,
  conversation: Conversation,
  query: string,
): Promise<ResolvedContext> {
  const intent = detectIntent(query);
  const catalog = await loadCatalog(repository);
  const candidates = catalogReferences(catalog);
  const limitations: string[] = [];
  const explicit = candidates.filter((item) => mentions(query, item.label));
  const ambiguous = explicit.filter((item) =>
    explicit.some(
      (other) =>
        other.id !== item.id &&
        other.label.toLowerCase() === item.label.toLowerCase(),
    ),
  );
  if (ambiguous.length)
    limitations.push(
      `Ambiguous names; ask which resource: ${ambiguous.map((item) => `${item.kind} ${item.label} (${item.id})`).join(", ")}`,
    );
  const mentioned = explicit.filter((item) => !ambiguous.includes(item));
  const previousQuery = conversation.messages
    .filter((item) => item.role === "user")
    .slice(-3, -1)
    .map((item) => item.content)
    .join(" ");
  const recentMentions = candidates.filter(
    (item) =>
      mentions(previousQuery, item.label) &&
      !candidates.some(
        (other) =>
          other.id !== item.id &&
          other.label.toLowerCase() === item.label.toLowerCase(),
      ),
  );
  const available = [
    ...conversation.attachments,
    ...mentioned,
    ...recentMentions,
  ];
  const resources = available.filter(
    (item, i) =>
      available.findIndex(
        (other) => other.id === item.id && other.kind === item.kind,
      ) === i,
  );
  const storyMentions = mentioned.filter((item) => item.kind === "story");
  let storyRefs = /\b(compare|comparison|versus|vs)\b/i.test(query)
    ? resources.filter((item) => item.kind === "story")
    : storyMentions.length
      ? storyMentions
      : resources.filter((item) => item.kind === "story");
  const search = `${query} ${previousQuery}`;
  if (!storyRefs.length && intent !== "casual" && !ambiguous.length) {
    // Existing semantic indexes can discover an NPC/event even without an attachment.
    const indexedMatches = (await repository.listAllStoryIndexes())
      .map((index) => ({
        index,
        score:
          relevance(JSON.stringify(index.characters), query) +
          relevance(JSON.stringify(index.chapterSummaries), query),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
    if (
      indexedMatches.length === 1 ||
      (indexedMatches[0]?.score ?? 0) > (indexedMatches[1]?.score ?? 0) * 2
    ) {
      const story = catalog.stories.find(
        (item) => item.id === indexedMatches[0]?.index.storyId,
      );
      if (story)
        storyRefs = [{ kind: "story", id: story.id, label: story.title }];
    } else if (indexedMatches.length) {
      limitations.push(
        `Several stories may fit; ask which: ${indexedMatches
          .slice(0, 6)
          .map(
            (item) =>
              catalog.stories.find((story) => story.id === item.index.storyId)
                ?.title ?? item.index.storyId,
          )
          .join(", ")}`,
      );
    }
  }
  const blocks: string[] = [];
  let remaining = CONTEXT_BUDGET[intent];
  function add(label: string, value: string, budget: number) {
    const size = Math.max(0, Math.min(budget, remaining - label.length - 5));
    if (!size) {
      limitations.push(
        `${label}: omitted because the context budget is exhausted.`,
      );
      return;
    }
    const clipped = value.length > size;
    blocks.push(
      `${label}\n${value.slice(0, size)}${clipped ? "\n[Excerpt only; remaining content omitted.]" : ""}`,
    );
    remaining -= blocks[blocks.length - 1].length;
    if (clipped)
      limitations.push(
        `${label}: partial evidence; do not claim a complete review.`,
      );
  }
  if (
    /\b(list|find|show|which|search)\b/i.test(query) &&
    /\b(stories|characters|universes|library)\b/i.test(query)
  ) {
    const ranked = [...candidates].sort(
      (a, b) => relevance(b.label, query) - relevance(a.label, query),
    );
    add(
      `Library catalog (${candidates.length} resources)`,
      ranked
        .map((item) => `${item.kind}: ${item.label} [${item.id}]`)
        .join("\n"),
      7000,
    );
  }
  if (storyRefs.length > 4)
    limitations.push(
      `Only the first four of ${storyRefs.length} stories fit this request. Narrow the selection for a full comparison.`,
    );
  for (const reference of storyRefs.slice(0, 4)) {
    const story = catalog.stories.find((item) => item.id === reference.id);
    if (!story) {
      limitations.push(`Story ${reference.label} is no longer available.`);
      continue;
    }
    add(
      `Story: ${story.title} [${story.id}]`,
      "This story's own transcript establishes its continuity.",
      250,
    );
    const [state, index] = await Promise.all([
      intent === "casual"
        ? Promise.resolve(null)
        : repository.getStoryState(story.id),
      repository.getStoryIndex(story.id),
    ]);
    const chapterMatch =
      /\bchapter\s+([IVXLCDM]+|\d+)\b/i.exec(query) ??
      (/\b(it|that|chapter)\b/i.test(query)
        ? /\bchapter\s+([IVXLCDM]+|\d+)\b/i.exec(previousQuery)
        : null);
    let selectedChapter: StoryMessage[] = [];
    let chapterRecords: StoryChapter[] = [];
    if (intent !== "casual" && chapterMatch) {
      const [records, transcript] = await Promise.all([
        repository.listStoryChapters(story.id),
        repository.listStoryMessages(story.id),
      ]);
      chapterRecords = records;
      selectedChapter = chapterTranscript(
        transcript,
        records,
        `Chapter ${chapterMatch[1]}`,
      );
    }
    const characterSearch = `${search} ${selectedChapter.map((message) => message.content).join(" ")}`;
    const characters = (index?.characters ?? []).filter((item) =>
      [item.canonicalName, ...item.aliases].some((name) =>
        mentions(characterSearch, name),
      ),
    );
    // Casual banter never loads chapter records or transcripts, nor the whole Story State.
    if (intent === "casual") {
      add(
        "Relevant indexed identity (not a request to analyse)",
        characters
          .map((item) => `${item.canonicalName}: ${item.status}`)
          .join("\n") || "No specific story facts retrieved.",
        800,
      );
      continue;
    }
    const perStoryBudget = Math.floor(
      CONTEXT_BUDGET[intent] / Math.max(1, Math.min(4, storyRefs.length)),
    );
    if (state)
      add(
        `Authoritative current Story State (${state.updatedAt})`,
        state.stateJson,
        Math.min(5000, perStoryBudget / 5),
      );
    else limitations.push(`${story.title}: no saved Story State.`);
    const characterIds = new Set(characters.map((item) => item.id));
    const relationships = (index?.relationships ?? []).filter(
      (item) =>
        characterIds.has(item.characterIdA) ||
        characterIds.has(item.characterIdB),
    );
    const chapterNumber = chapterMatch ? chapterToken(chapterMatch[1]) : null;
    const summarySearch = `${search} ${characters.map((item) => item.canonicalName).join(" ")}`;
    const summaries = [
      ...(index?.chapterSummaries?.length
        ? index.chapterSummaries
        : chapterRecords
            .filter((item) => item.summary)
            .map((item) => ({
              chapterId: item.id,
              chapterLabel: item.label,
              summary: item.summary!,
              sourceMessageIds: [],
              lastIndexedMessageId: item.endsAtMessageId,
              updatedAt: item.createdAt,
              originStoryId: undefined,
            }))),
    ]
      .filter((item) => {
        const number = chapterToken(item.chapterLabel);
        return (
          item.originStoryId ||
          typeof chapterNumber !== "number" ||
          typeof number !== "number" ||
          number <= chapterNumber
        );
      })
      .sort(
        (a, b) =>
          relevance(b.summary, summarySearch) -
          relevance(a.summary, summarySearch),
      )
      .slice(0, intent === "review" ? 4 : 2);
    add(
      "Relevant semantic memory (characters, relationships, earlier events with provenance)",
      JSON.stringify({ characters, relationships, summaries }),
      Math.min(6500, perStoryBudget / 4),
    );
    if (chapterMatch) {
      const selected = selectedChapter;
      if (!selected.length)
        limitations.push(
          `${story.title}: Chapter ${chapterMatch[1]} transcript not found. Do not invent its content.`,
        );
      else
        add(
          `${story.title} — Chapter ${chapterMatch[1]} actual transcript (${selected.length} messages)`,
          selected.map(evidenceMessage).join("\n\n"),
          Math.max(4000, perStoryBudget * 0.65),
        );
      limitations.push(
        "Story State is current, not a historical chapter snapshot. Infer chapter changes only from transcript evidence; distinguish inference from stored facts.",
      );
    } else {
      limitations.push(
        `${story.title}: selected excerpts, not a complete story transcript.`,
      );
      const provenance = [
        ...new Set([
          ...characters.flatMap((item) => item.provenance),
          ...relationships.flatMap((item) => item.provenance),
          ...summaries.flatMap((item) => item.sourceMessageIds),
        ]),
      ].slice(-12);
      const evidence = (
        await Promise.all(
          provenance.map((id) => repository.getStoryMessage(id)),
        )
      ).filter((item): item is StoryMessage =>
        Boolean(item && item.storyId === story.id),
      );
      // Focused requests may need the immediate scene when the index hasn't caught up.
      const transcript = await repository.listStoryMessages(story.id);
      const scored = transcript
        .map((item, i) => ({ item, i, score: relevance(item.content, search) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || b.i - a.i)
        .slice(0, 4);
      const selectedIds = new Set(
        [
          ...evidence,
          ...transcript.slice(-6),
          ...scored.flatMap((item) =>
            transcript.slice(Math.max(0, item.i - 1), item.i + 2),
          ),
        ].map((item) => item.id),
      );
      add(
        `${story.title} — relevant transcript excerpts`,
        transcript
          .filter((item) => selectedIds.has(item.id))
          .map(evidenceMessage)
          .join("\n\n"),
        Math.max(3000, perStoryBudget / 2),
      );
    }
  }
  for (const reference of resources.filter((item) => item.kind !== "story")) {
    if (
      intent === "casual" &&
      !mentioned.some((item) => item.id === reference.id)
    )
      continue;
    const record =
      reference.kind === "character"
        ? catalog.characters.find((item) => item.id === reference.id)
        : catalog.universes.find((item) => item.id === reference.id);
    if (!record) {
      limitations.push(
        `${reference.kind} ${reference.label} is no longer available.`,
      );
      continue;
    }
    add(
      `${reference.kind}: ${reference.label}${reference.kind === "character" ? " (immutable starting library sheet, not current story identity)" : " (reference only; each story's transcript takes precedence)"}`,
      JSON.stringify(record),
      intent === "casual" ? 600 : 4500,
    );
  }
  if (!storyRefs.length && /\b(chapter|react|story state)\b/i.test(query))
    limitations.push(
      "No unambiguous story selected. Ask for the story instead of guessing events.",
    );
  return {
    intent,
    resources: [...resources, ...storyRefs].filter(
      (item, i, all) =>
        all.findIndex(
          (other) => other.kind === item.kind && other.id === item.id,
        ) === i,
    ),
    text: blocks.join("\n\n"),
    limitations,
  };
}
