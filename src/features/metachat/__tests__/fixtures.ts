import type {
  PlayerCharacter,
  Universe,
  Story,
  StoryIndex,
  StoryMessage,
  StoryChapter,
} from "../../../types/models";
import {
  clearStore,
  openStoryEngineDatabase,
  putInStore,
} from "../../../lib/idb";
import { createIndexedDbStoryEngineRepository } from "../../../lib/repository";
import { createConversationRepository } from "../repository";
import { ConversationService } from "../conversationService";
import type { ResponseGenerator } from "../responseGenerator";

export const now = "2026-10-08T10:00:00.000Z";
export const universe: Universe = {
  id: "who",
  name: "Doctor Who",
  description: "Adventures in time",
  wikiUrl: "",
  mode: "custom",
  importedLore: [],
  importedCharacters: [],
  importedLocations: [],
  importedRelationships: [],
  createdAt: now,
};
export const character: PlayerCharacter = {
  id: "jamie",
  name: "Jamie",
  age: "25",
  gender: "man",
  species: "human",
  pronouns: "he/him",
  appearance: "",
  personality: "Loyal",
  background: "Highlander",
  goals: "",
  notes: "",
  universeId: "who",
  scope: "library",
  createdAt: now,
};
export const story: Story = {
  id: "blue",
  title: "The Blue Box",
  universeId: "who",
  playerCharacterId: "jamie",
  currentSummary: "",
  createdAt: now,
  updatedAt: now,
};
export const otherStory: Story = {
  ...story,
  id: "home",
  title: "The Long Way Home",
};
export function message(
  id: string,
  content: string,
  role: StoryMessage["role"] = "assistant",
  index = 1,
): StoryMessage {
  return {
    id,
    storyId: "blue",
    role,
    content,
    timestamp: `2026-10-08T10:00:${String(index).padStart(2, "0")}.000Z`,
  };
}
export const transcript: StoryMessage[] = [
  {
    ...message("m0", "Chapter I", "system", 0),
    chapterBoundary: { kind: "start", label: "Chapter I" },
  },
  {
    ...message("m1", 'Jamie: "You promised we would get home."', "user", 1),
    speakerType: "player",
  },
  message(
    "m2",
    "The Doctor pockets the broken compass instead of answering.",
    "assistant",
    2,
  ),
  {
    ...message("m3", "End of Chapter I", "system", 3),
    chapterBoundary: { kind: "end", label: "Chapter I" },
  },
  {
    ...message("m4", "Chapter II", "system", 4),
    chapterBoundary: { kind: "start", label: "Chapter II" },
  },
  {
    ...message("m5", 'Jamie: "You kept the compass?"', "user", 5),
    speakerType: "player",
  },
  message(
    "m6",
    "The Doctor admits he cannot repair the compass. Jamie turns away, betrayed.",
    "assistant",
    6,
  ),
  {
    ...message("m7", "Director: Keep the apology awkward.", "user", 7),
    speakerType: "director",
  },
  message(
    "m8",
    "The Doctor sits beside Jamie and apologises without a joke.",
    "assistant",
    8,
  ),
  {
    ...message("m9", "End of Chapter II", "system", 9),
    chapterBoundary: { kind: "end", label: "Chapter II" },
  },
];
export const chapters: StoryChapter[] = [
  {
    id: "c1",
    storyId: "blue",
    label: "Chapter I",
    endsAtMessageId: "m3",
    endsAtIndex: 4,
    createdAt: now,
    summary: "The Doctor hides the compass.",
  },
  {
    id: "c2",
    storyId: "blue",
    label: "Chapter II",
    endsAtMessageId: "m9",
    endsAtIndex: 10,
    createdAt: now,
    summary: "Jamie confronts the Doctor.",
  },
];
export const index: StoryIndex = {
  storyId: "blue",
  indexedMessageCount: 10,
  updatedAt: now,
  characters: [
    {
      id: "doctor",
      canonicalName: "The Doctor",
      aliases: ["Doctor"],
      description: "Time traveller",
      status: "Ashamed of his lie",
      developments: ["Admitted the broken compass"],
      provenance: ["m6", "m8"],
      updatedAt: now,
    },
    {
      id: "jamie",
      canonicalName: "Jamie",
      aliases: [],
      description: "Companion",
      status: "Feels betrayed",
      developments: ["Stopped trusting the Doctor"],
      provenance: ["m1", "m5", "m6"],
      updatedAt: now,
    },
  ],
  relationships: [
    {
      id: "r1",
      characterIdA: "doctor",
      characterIdB: "jamie",
      nature: "friendship",
      state: "trust damaged",
      developments: ["The broken promise to go home"],
      provenance: ["m1", "m6"],
      updatedAt: now,
    },
  ],
  chapterSummaries: [
    {
      chapterId: "c1",
      chapterLabel: "Chapter I",
      summary:
        "The Doctor promised Jamie home but concealed the broken compass.",
      sourceMessageIds: ["m1", "m2"],
      lastIndexedMessageId: "m3",
      updatedAt: now,
    },
  ],
};
export async function resetDatabase() {
  const db = await openStoryEngineDatabase();
  await Promise.all(
    Array.from(db.objectStoreNames).map((name) =>
      clearStore(name as Parameters<typeof clearStore>[0]),
    ),
  );
}
export async function seed() {
  const resources = createIndexedDbStoryEngineRepository();
  await resources.saveUniverse(universe);
  await resources.savePlayerCharacter(character);
  await resources.saveStory(story);
  await resources.saveStory(otherStory);
  for (const item of transcript) await resources.saveStoryMessage(item);
  await resources.saveStoryMessage({
    ...message("home-1", "Jamie returned home and forgave the Doctor."),
    storyId: "home",
  });
  for (const item of chapters) await resources.saveStoryChapter(item);
  await resources.saveStoryIndex(index);
  await putInStore("storyStates", {
    id: "story-state:blue",
    storyId: "blue",
    stateJson: JSON.stringify({
      authorDirectives: {
        canon: ["Jamie now uses they/them pronouns"],
        retcons: [],
        hiddenSecrets: [],
        revealedSecrets: [],
        revealDirectives: [],
      },
    }),
    updatedAt: now,
  });
  return resources;
}
export const generator: ResponseGenerator = {
  generate: async () => ({
    reply: "Oh, he knows exactly what he's doing 😂",
    actions: [],
  }),
  summarize: async () =>
    "We agreed to keep the apology awkward and respect Jamie's new pronouns.",
};
export async function setup(customGenerator: ResponseGenerator = generator) {
  const resources = await seed();
  const repository = createConversationRepository();
  const service = new ConversationService(
    repository,
    resources,
    customGenerator,
  );
  return { resources, repository, service };
}
