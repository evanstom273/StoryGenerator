# Story Engine — Technical Architecture Document (TAD)

This document is written to onboard a developer who has never seen the Story Engine codebase before. It describes the current architecture as implemented in `StoryGenerator/` at **v1.18.3**.

## Table of Contents

1. Project Overview
2. System Architecture
3. Core Systems
4. Data Models
5. Story Engine Rules (Narrative + AI)
6. Import / Export Architecture
7. Current Features
8. Accessibility & Theming
9. Mobile Features
10. Known Bugs
11. Future Roadmap
12. File Structure
13. Dependencies
14. Build & Deployment
15. Appendix (Example JSON)

---

## 1. Project Overview

### Purpose
Story Engine is a single-user, local-first storytelling application. It lets a player:
- Create **Universes** (canon context containers, in "referenced" or "custom" mode)
- Create **Player Characters** (library-wide or story-scoped)
- Create **Stories** (a story lives in a universe and is played by a specific player character)
- Roleplay via a chat-like interface where the AI generates NPC/world responses while enforcing "player ownership"
- Analyse and explore a running story via an **Archive view** (indexes, evidence, chapter summaries)
- Converse with the AI **out of canon** via **MetaChat** (story analysis, plotting help)

The application stores everything locally (IndexedDB + localStorage). It is built as a web app and can be packaged as an Android application via Capacitor. A minimal Electron desktop wrapper (`StoryEngineDesktop/`) exists in the repo as a separate package.

### Philosophy
The core narrative philosophy is enforced through both prompting and post-generation validation:
- The player is the **author** of the player character.
- The AI **"owns the world"** (NPCs, canon characters, consequences, scene progression) but must not steal authorship of the player's thoughts, actions, or words.
- Canon is anchored by the transcript (Message 1 onward) and any imported universe lore.
- The player character sheet is **authoritative canon** for protagonist identity facts (name, age, gender, pronouns, species, role/occupation, disabilities/limitations).

### Core Design Principles
- **Local-first**: data persists on-device without a backend.
- **Offline-friendly**: the app is usable without network access; only AI calls and lore imports require network.
- **Thin repository + provider pattern**: IndexedDB access is centralized; React pages are mostly consumers of provider APIs/state.
- **Maintainability over novelty**: plain React/TypeScript with minimal dependencies.
- **Safety rails**: output sanitization and player-ownership checks guard against common LLM failure modes.
- **Mature fiction parity**: a shared policy block ensures genre-fiction themes (crime, combat, trauma, recovery) are treated as legitimate narrative material across all AI calls.

---

## 2. System Architecture

### Frontend Structure
- **Framework**: React 18 + React Router v6
- **Bundler**: Vite
- **Styling**: Tailwind CSS + CSS variable–based theme system
- **App entry**: `src/main.tsx` → `src/app/App.tsx`
- **Routing**: `src/app/router.tsx`
- **Layout/shell**:
  - Primary UI shell: `V2Shell` (responsive columns + drawers) — `src/app/layout/V2Shell.tsx`
  - Left navigation: `src/app/layout/V2LeftSidebar.tsx`
  - Right contextual sidebar: `src/app/layout/V2RightSidebar.tsx`
  - Story settings drawer overlay: `src/app/layout/StorySettingsDrawer.tsx`
  - Mobile nav overlay: `src/app/layout/MobileNav.tsx`

### State & Data Flow
- Persistent storage access lives in:
  - IndexedDB schema & helpers: `src/lib/idb.ts`
  - Repository (CRUD + import/export/backup): `src/lib/repository.ts`
- Global app state is managed by `StoryEngineProvider` (`src/app/providers/StoryEngineProvider.tsx`):
  - Loads data on startup, exposes CRUD functions, handles AI chat actions, background jobs, and orchestrates imports/exports.

### Storage Architecture
Story Engine uses three storage layers:
- **IndexedDB** (primary persistence): all entities live here.
- **localStorage** (UI prefs + version tracking):
  - UI prefs: `src/app/ui/UiPrefsContext.tsx`
  - Changelog "last viewed version": key `story-engine:changelog:last-viewed`
  - MetaChat open signal: key `story-engine:open-metachat`
- **In-memory React state**: provider caches entity lists for fast read access and page rendering.

### IndexedDB Schema
- **Database name / version**: `story-engine-db` / `6` (`src/lib/idb.ts`)

Object stores and indexes (keyPath is always `id`):

| Store | Indexes |
|---|---|
| `universes` | — |
| `playerCharacters` | `universeId` |
| `stories` | `universeId`, `playerCharacterId` |
| `messages` | `storyId` |
| `storyMetaMessages` | `storyId` |
| `storyChapters` | `storyId` |
| `aiSettings` | — |
| `storyAiConfigs` | `storyId` |
| `universeImports` | `universeId` |
| `storySummaries` | `storyId` |
| `storyStates` | `storyId` |
| `backgroundJobs` | `storyId`, `status` |
| `storyUiStates` | `storyId` (unique) |
| `developerBugs` | — |
| `developerFeatureRequests` | — |
| `developerTestingNotes` | — |

See `src/lib/idb.ts` for the authoritative schema definition.

### Data Relationships (Conceptual)
- Universe → Player Characters (1:N)
- Universe → Stories (1:N)
- Universe → Universe Imports (1:N)
- Player Character → Stories (1:N)
- Story → Messages (1:N)
- Story → MetaMessages (1:N, out-of-canon MetaChat history)
- Story → Chapters (1:N)
- Story → Summaries (1:N, typically "latest" used)
- Story → AI Configs (1:N, typically "latest" used)
- Story → Story State (1:N by schema; usage is effectively "latest" / deterministic id)
- Story → Background Jobs (1:N)
- Story → Story UI State (1:1, unique index)
- Developer Notes are independent of Universe/Story (global to the workspace).

---

## 3. Core Systems

### 3.1 Universes
Universes contain:
- Human-authored description and wiki URL(s).
- A **mode**: `"referenced"` (real fandom/wiki-backed) or `"custom"` (original worldbuilding).
  - `"referenced"` mode surfaces wiki source URLs in the prompt.
  - `"custom"` mode uses `concept`, `genreTheme`, `tone`, and `universeBlueprint` fields to describe the world.
- **Multi-source wiki support** (`wikiUrls?: UniverseWikiSource[]`): ordered list of wiki URLs with labels and precedence.
- **Universe Packs**: universes can be exported as versioned `universe_pack` bundles. When a new story is created, a snapshot of the universe (`universePackSnapshot`) is embedded in the story record to prevent canon drift.
- Imported lore text stored as `UniverseImport` entries.
- AI-assisted universe generation (`src/lib/ai/universeGenerator.ts`).

Key pages:
- Universe list: `src/pages/UniversesPage.tsx`
- Universe create/edit/import: `src/pages/UniverseFormPage.tsx`
- Universe detail + imported lore view: `src/pages/UniverseDetailPage.tsx`

### 3.2 Player Characters
Player Characters define the playable protagonist for a story. They are explicit typed entities, not just prompt text.

Notable fields:
- Identity: `name`, `age`, `gender`, `species`, `pronouns`
- Characterization: `characterConcept`, `appearance`, `personality`, `background`, `goals`, `notes`
- Relationship: belongs to a `universeId`
- **Scope**: `"library"` (reusable across stories) or `"story"` (a Quick Story Character created inline and optionally promoted later)
- `storyId`: set when `scope === "story"`, pointing to the story the character was created for

Key pages:
- List: `src/pages/PlayerCharactersPage.tsx`
- Create/edit: `src/pages/PlayerCharacterFormPage.tsx`
- Detail: `src/pages/PlayerCharacterDetailPage.tsx`

AI-assisted "randomize/fill fields":
- AI schema and instructions: `src/lib/ai/characterGenerator.ts`
- Orchestration in provider: `src/app/providers/StoryEngineProvider.tsx`

### 3.3 Stories
Stories bind:
- A universe (`universeId`) and optional universe pack snapshot (`universePackSnapshot`)
- A player character (`playerCharacterId`)
- A message timeline and computed summaries
- Optional long-term structured "story state" JSON (`StoryState`)
- Per-story flags: `matureFictionMode`, `isArchived`, `autoIndexMode`, `autoIndexInterval`

Key pages:
- Create (wizard): `src/pages/StoryCreatePage.tsx`
- Workspace: `src/pages/StoryWorkspacePage.tsx`

### 3.4 Messages
Messages are stored as `StoryMessage` items with:
- `role` (`user`, `assistant`, `system`), optional `speakerName`/`speakerType` for display/story formatting.
- `directorIntent`: detected intent parsed from the player's message (time skip, scene cut, or named target).
- `chapterBoundary`: marks the start or end of a named chapter.
- `editedAt`, `regeneratedAt`, `revision`: track in-place edits and regenerations of assistant messages.
- `speakerType`: `"player" | "canon" | "narrator" | "system"`

Storage: indexed by `storyId`.

Rendering:
- Bubble mode: `src/components/story/StoryMessageBubble.tsx`
- Transcript mode: `src/components/story/StoryTranscriptView.tsx`

### 3.5 MetaChat
MetaChat is an out-of-canon overlay that lets the player converse with the AI about the story (analysis, plotting help, writing assistance) without those messages entering the story transcript.

- Meta-messages stored in `storyMetaMessages` store (separate from `messages`).
- MetaChat drafts persist in `storyUiStates.metaChatDraft`.
- MetaChat responses can run as **background jobs** (`BackgroundJobType = "metachat_generate"`).
- Notification when a MetaChat background job completes.

Components: `src/components/story/MetaChatOverlay.tsx`

### 3.6 Chapters
Stories can be divided into chapters:
- Chapter boundaries are embedded as `chapterBoundary` metadata on `StoryMessage` records.
- Detection of `Chapter X` syntax in player messages triggers automatic chapter boundary creation: `src/lib/storyText/chapterDetection.ts`.
- `StoryChapter` records (`storyChapters` store) persist chapter labels and end-point message references.
- Chapter summaries are included in Archive PDF exports.

### 3.7 Background Jobs
Long-running operations (indexing, MetaChat generation, exports) run as tracked background jobs:
- `BackgroundJob` records stored in `backgroundJobs` (indexed by `storyId` and `status`).
- Job types: `story_index`, `metachat_generate`, `story_export`, `story_archive_export`.
- Status lifecycle: `queued → running → complete | failed | cancelled`.
- Progress tracking: `{ current, total, label }`.
- On completion: browser `Notification` API is used to notify the user (`src/lib/jobNotifications.ts`), with a click handler that navigates to the story or opens MetaChat.
- Deduplication key (`dedupeKey`) prevents stacking duplicate indexing jobs for the same story.

### 3.8 Developer Notes
Developer Notes provide an in-app QA tracker:
- Bugs, Feature Requests, Testing Notes, JSON export.
- Stored in `developerBugs`, `developerFeatureRequests`, `developerTestingNotes` (IndexedDB).

Pages: `src/pages/DeveloperNotesPage.tsx`, `DeveloperBugsPage.tsx`, `DeveloperBugFormPage.tsx`, `DeveloperFeatureRequestsPage.tsx`, `DeveloperTestingNotesPage.tsx`, `DeveloperTestingNoteFormPage.tsx`, `DeveloperNotesExportPage.tsx`

### 3.9 Import / Export
See Section 6 for full details.

---

## 4. Data Models

Authoritative TypeScript models: `src/types/models.ts`

### 4.1 ID Strategy
All entity IDs are strings: `createEntityId(prefix)` → `${prefix}-${crypto.randomUUID()}` — `src/lib/ids.ts`

### 4.2 Key Types and Enums

```ts
type AIProviderType = "openai" | "gemini" | "openrouter";
type StoryMessageRole = "user" | "assistant" | "system";
type StoryMessageSpeakerType = "player" | "canon" | "narrator" | "system";
type ExportFormat = "json" | "markdown" | "txt" | "pdf" | "archive_pdf";
type DeveloperBugStatus = "open" | "in-progress" | "resolved" | "closed";
type DeveloperFeaturePriority = "low" | "medium" | "high";
type AutoIndexInterval = 5 | 10 | 15 | 20 | "disabled";
type AutoIndexMode = "disabled" | "messages" | "chapter";
type BackgroundJobStatus = "queued" | "running" | "complete" | "failed" | "cancelled";
type BackgroundJobType = "story_index" | "metachat_generate" | "story_export" | "story_archive_export";

type DirectorIntent = {
  timeSkip?: { unit: "hours" | "days" | "weeks" | "months"; amount: number };
  sceneCut?: boolean;
  target?: string;
};

interface UniverseWikiSource {
  url: string;
  label?: string;
  order: number;
}
```

### 4.3 Entity Schemas

#### Universe
```ts
interface Universe {
  id: string;
  name: string;
  description: string;
  wikiUrl: string;                         // primary/legacy URL
  wikiUrls?: UniverseWikiSource[];         // ordered multi-source list
  mode?: "referenced" | "custom";          // defaults to "referenced"
  concept?: string;                        // custom mode
  genreTheme?: string;                     // custom mode
  tone?: string;                           // custom mode
  universeBlueprint?: string;              // custom mode — full world description
  notes?: string;                          // referenced mode notes
  importedLore: string[];
  importedCharacters: string[];
  importedLocations: string[];
  importedRelationships: string[];
  createdAt: string;
}
```

#### PlayerCharacter
```ts
interface PlayerCharacter {
  id: string;
  name: string;
  age: string;
  gender: string;
  species: string;
  pronouns: string;
  characterConcept?: string;
  appearance: string;
  personality: string;
  background: string;
  goals: string;
  notes: string;
  universeId: string;
  scope?: "library" | "story";
  storyId?: string;                        // set when scope === "story"
  createdAt: string;
}
```

#### Story
```ts
interface Story {
  id: string;
  title: string;
  universeId: string;
  playerCharacterId: string;
  openingPrompt?: string;                  // deprecated/removed from UI
  universePackSnapshot?: UniversePackSnapshotV1;
  isArchived?: boolean;
  matureFictionMode?: boolean;
  autoIndexMode?: AutoIndexMode;
  autoIndexInterval?: AutoIndexInterval;
  currentSummary: string;
  createdAt: string;
  updatedAt: string;
}
```

#### StoryMessage
```ts
interface StoryMessage {
  id: string;
  storyId: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  speakerName?: string;
  speakerType?: "player" | "canon" | "narrator" | "system";
  directorIntent?: DirectorIntent;
  chapterBoundary?: { kind: "start" | "end"; label: string };
  editedAt?: string;
  regeneratedAt?: string;
  revision?: number;
}
```

#### StoryMetaMessage
```ts
interface StoryMetaMessage {
  id: string;
  storyId: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  jobId?: string;
}
```

#### StoryChapter
```ts
interface StoryChapter {
  id: string;
  storyId: string;
  label: string;
  endsAtMessageId: string;
  endsAtIndex: number;
  createdAt: string;
  summary?: string;
}
```

#### BackgroundJob
```ts
interface BackgroundJob {
  id: string;
  type: BackgroundJobType;
  storyId?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  status: BackgroundJobStatus;
  progress?: { current: number; total: number; label?: string };
  error?: string;
  dedupeKey?: string;
  payload?: {
    trigger?: "manual" | "auto";
    content?: string;
    metaChatUserMessageId?: string;
    metaChatOpenOnComplete?: boolean;
    exportFormat?: ExportFormat;
  };
  result?: {
    messageId?: string;
    notificationTitle?: string;
    notificationBody?: string;
    openMetaChat?: boolean;
  };
}
```

#### StoryUiState
```ts
interface StoryUiState {
  id: string;
  storyId: string;
  metaChatDraft?: string;
  updatedAt: string;
}
```

#### AISettings
```ts
interface AISettings {
  id: "ai-settings";
  activeProviderType: "openai" | "gemini" | "openrouter";
  apiKeys: Partial<Record<AIProviderType, string>>;
  defaultModels: Partial<Record<AIProviderType, string>>;
  createdAt: string;
  updatedAt: string;
}
```

#### StoryAIConfig
```ts
interface StoryAIConfig {
  id: string;
  storyId: string;
  providerType: "openai" | "gemini" | "openrouter";
  model?: string;
  createdAt: string;
  updatedAt: string;
}
```

#### UniverseImport
```ts
interface UniverseImport {
  id: string;
  universeId: string;
  sourceUrl: string;
  sourceLabel?: string;
  title: string;
  importedText: string;
  importedAt: string;
}
```

#### StorySummary
```ts
interface StorySummary {
  id: string;
  storyId: string;
  summary: string;
  generatedAt: string;
}
```

#### StoryState
```ts
interface StoryState {
  id: string;
  storyId: string;
  stateJson: string;   // JSON string of StoryStateData
  updatedAt: string;
}
```

`StoryStateData` is the parsed form of `stateJson`. See Section 5.4 for the memory architecture.

### 4.4 Relationship Map
- `PlayerCharacter.universeId → Universe.id`
- `Story.universeId → Universe.id`
- `Story.playerCharacterId → PlayerCharacter.id`
- `StoryMessage.storyId → Story.id`
- `StoryMetaMessage.storyId → Story.id`
- `StoryChapter.storyId → Story.id`
- `UniverseImport.universeId → Universe.id`
- `StorySummary.storyId → Story.id`
- `StoryAIConfig.storyId → Story.id`
- `StoryState.storyId → Story.id` (stateJson holds structured memory)
- `BackgroundJob.storyId → Story.id`
- `StoryUiState.storyId → Story.id` (unique)

---

## 5. Story Engine Rules (Narrative + AI)

### 5.1 AI Provider Architecture
The AI tier uses a uniform provider interface defined in `src/lib/ai/types.ts`:

```ts
interface AIProvider {
  validateConnection: (apiKey: string, model: string) => Promise<void>;
  generateResponse: (request: GenerateResponseRequest) => Promise<GenerateResponseResult>;
  generateSummary: (request: GenerateSummaryRequest) => Promise<string>;
}
```

Three concrete providers are implemented, all calling their respective REST APIs directly from the client (API keys are stored in IndexedDB and never sent to any backend):

| Provider | File | API endpoint |
|---|---|---|
| OpenAI | `src/lib/ai/openaiProvider.ts` | `https://api.openai.com/v1/chat/completions` |
| Gemini | `src/lib/ai/geminiProvider.ts` | Google Generative Language API |
| OpenRouter | `src/lib/ai/openrouterProvider.ts` | `https://openrouter.ai/api/v1/chat/completions` |

The factory (`src/lib/ai/providerFactory.ts`) selects the provider by `AIProviderType`.

**Available models** (`src/lib/ai/models.ts`):
- OpenAI: `gpt-5`, `gpt-5-mini`, `gpt-4.1`, `gpt-4o` (default: `gpt-4o`)
- Gemini: `gemini-2.5-flash` (default), `gemini-2.5-pro`
- OpenRouter: `openai/gpt-oss-20b:free` (default), plus Qwen, DeepSeek, Gemma, Venice, Cydonia, Euryale options

**Request parameters**:
- Story generation: `temperature: 0.8`, `max_tokens: 700`, timeout 45 s
- Summary generation: `temperature: 0.2`, `max_tokens: 350`
- Memory rebuild: `timeoutMs: 120_000`

### 5.2 Player Ownership (The Player Owns the Player Character)
High-level rule: the AI must not narrate the player's actions, thoughts, feelings, or dialogue.

Where it is implemented:
- Prompt rules in: `src/lib/ai/contextBuilder.ts`
- Heuristic validator: `src/lib/storyText/playerProtection.ts` — `getPlayerCharacterAuthorshipViolation()`

Violation rules detected:
- `"second-person"` — "You walk into…" (second-person action)
- `"speaker-header"` — player name used as a speaker header
- `"scene-block-speaker"` — player name appears as a scene block speaker
- `"line-start-subject-verb"` — `Rebecca walked…` pattern at line start
- `"inline-subject-verb"` — player name + verb mid-sentence
- `"pronoun-continuation"` — He/She/They verb within a window after the player's name appeared

### 5.3 AI World Ownership (The AI Owns NPCs + Consequences)
Key prompt instructions in `contextBuilder.ts`:
- Transcript is canon and authoritative.
- Do not auto-introduce cases, missions, mysteries, or emergencies.
- Player-declared outcomes are treated as canon; build forward with "Yes, and…" or "Yes, but…".
- Attempt vs. declaration rule: "I try to…" vs. "I do X" are handled differently.
- Character authenticity is the highest priority.

### 5.4 Context Construction (`contextBuilder.ts`)
Each AI generation call builds a multi-block message array:

1. **Universe Information** — name, mode, description/blueprint, wiki sources, story title, player character sheet
2. **Imported Lore** — most recent `UniverseImport.importedText` (truncated to 12,000 chars)
3. **Story Summary** — `story.currentSummary` or latest `StorySummary.summary`
4. **Long-Term Memory** — formatted from `StoryStateData`: premise, protagonist, situation, recent developments, characters, relationships, NPCs, locations, world facts, unresolved threads
5. **Current Scene State** *(when present)* — transient scene state from `StoryStateData.sceneState` and per-character `characterStateTransient`
6. **Director Intent** *(when detected)* — time skip amount/unit, scene cut, or target
7. **Temporal Consequences** *(when a time skip is present)* — guidance for showing believable world changes
8. **Input Safety Context** *(when triggered)* — generated by `analyzeStoryInputSafety()` to help providers treat fiction-context injury/medical/trauma prose as legitimate
9. **Scene Direction** — extensive prompt block covering all narrative rules, output formatting, mature fiction policy, scene depth, word target
10. **Chat History** — last 14 messages (when summary + state exist) or last 30 messages
11. **Player Turn** — the current player message

**Scene sizing** (`src/lib/ai/sceneSizing.ts`): message length drives a `light | standard | major` scene depth determination which sets the word target (e.g. light: 60–150 words, major: 300–600 words).

**Director intent detection** (`src/lib/storyText/directorIntent.ts`): regex-based detection of time-skip phrases ("three days later", "after an hour", etc.) and scene-cut intent in the player's message. The extracted `DirectorIntent` is attached to the `StoryMessage` record.

**Mature fiction policy** (`src/lib/ai/matureFictionPolicy.ts`): a shared policy block injected into story generation, summaries, state extraction, and MetaChat prompts to ensure genre-fiction themes are treated as legitimate narrative context.

**Input safety analysis** (`src/lib/ai/storyInputSafety.ts`): scans the player's latest message for injury/medical/trauma terms, detects roleplay cues (speaker prefix, `*action*` formatting, dialogue quotes, character naming), and checks recent canon context. If flagged as likely-fictional, injects a system message explaining the fictional context to the AI provider.

### 5.5 Story State Memory Architecture

Story state is persisted as a JSON string in `StoryState.stateJson`. The parsed form is `StoryStateData` (Memory Architecture v2).

Key sections of `StoryStateData`:
- `summaries`: `premise`, `protagonistSummary`, `currentSituation`, `recentDevelopments[]`, `worldSummary`, `relationshipSummary`
- `characters`: per-character record with `canonicalName`, `displayName`, `aliases`, `pronouns`, `status`, `statusBullets`, `strengths`, `weaknesses`, `characterTraitsPersistent`, `characterStateTransient`, `relationships`, `notes`
- `worldFacts`: setting-level truths
- `unresolvedThreads`: open narrative threads
- `sceneState`: short-term scene specifics
- `significantMemories`: story-defining events
- `relationshipState`: consolidated relationship facts
- `relationships`: structured metrics between character pairs (`trust`, `respect`, `friendship`, `loyalty`, `fear`, `attraction`, `rivalry`, `hostility`)
- `npcs`: recurring NPC registry
- `locations`: persistent location registry
- `indexes` (`StoryIndexesV2`): AI-generated evidence-referenced indexes of characters, locations, items, factions, relationships, world facts, significant memories, open threads — all with `messageNumbers` evidence references
- `scene` (`StorySceneSnapshotV2`): current location, objective, active participants, scene summary
- `threads` (`StoryThreadsV2`): open thread list
- Indexing metadata: `lastDeepIndexedAt`, `lastAutoDeepIndexedAt`, `lastIndexedMessageCount`, etc.

**Memory rebuild pipeline** (`src/lib/ai/rebuildMemory.ts`): processes the entire transcript in 40-message chunks, accumulating `StoryStateDataV2` across iterations. Each chunk sends the previous state + next chunk to the AI for incremental extraction. Used for the "Rebuild Memory & Indexes" action in Story Settings.

**Incremental auto-indexing**: controlled per story by `autoIndexMode` and `autoIndexInterval` (5/10/15/20 messages, or disabled). Auto-indexing runs the same full deep-indexing pipeline as manual re-indexing.

**Archive index freshness** (`src/lib/archiveIndexing.ts`): checks `lastDeepIndexedAt` against a max-age threshold (5 minutes) to determine whether a re-index is needed before an Archive PDF export.

### 5.6 Output Standardization
After AI generation, assistant text is normalized through the story standardizer (`src/lib/storyText/storyStandardizer.ts`):
- Parses inline speaker headers, stand-alone speaker headers, and narration lines.
- Wraps action text in `*...*` and dialogue in `"..."`.
- Merges adjacent action fragments for the same speaker.
- Detects multi-actor actions and demotes them to narration.
- Collapses adjacent dialogue fragments.
- Emits structured `StoryFormatIssue` records for diagnostics.

Transcript sanitizer (`src/lib/storyText/transcriptSanitizer.ts`) handles further cleanup and scene state re-narration detection.

### 5.7 Player Assist
Two modes, both injected as a final user message into the normal story context:
- **Full assist** (`buildPlayerAssistRequest`): generates a complete player turn for the player character.
- **Continuation assist** (`buildPlayerAssistContinuationRequest`): appends to the player's already-started draft, continuing inline without repeating existing text.

Source: `src/lib/ai/playerAssist.ts`, `src/lib/ai/playerAssistContext.ts`

### 5.8 Canon Handling
- Transcript messages are passed to the AI with labeled prefixes: `Player (<name>):`, `Canon (<speaker>):`, `Narrator:`.
- Universe lore, story summary, and story state together form the "long-term context."
- The player character sheet is always included in the universe information block as authoritative identity canon.
- Name resolution rule: nicknames, shortened names, and informal variants are treated as the same character unless explicitly disambiguated.

---

## 6. Import / Export Architecture

### 6.1 Universe Import Flow (Lore ingestion)
- Fetch: AllOrigins CORS proxy — `src/lib/ingestion/fetchHtml.ts`
- Convert: HTML → text — `src/lib/ingestion/htmlToText.ts`
- Orchestration: `src/lib/ingestion/importUniverseLore.ts`
- Storage: `UniverseImport` record in `universeImports` (indexed by `universeId`)
- UI: part of Universe form route — `src/pages/UniverseFormPage.tsx`

### 6.2 Character Import/Export
- Export: `exportPlayerCharacterBundleV1(characterId)` → `PlayerCharacterExportBundleV1` JSON
- Import: `importPlayerCharacterBundleV1(bundle, { universeId })` — creates a new player character in the target universe
- Source: `src/lib/repository.ts`

### 6.3 Story Import/Export
- Export: `getStoryExportBundle(storyId)` → `StoryExportBundle` JSON (story + universe + player character + messages + optional state + optional chapters)
- Import: `importStoryExportBundle(bundle)`:
  - Creates new story id and message ids.
  - Reuses existing universe (match by `wikiUrl` first, then by name).
  - Reuses existing player character within the matched universe (match by name).
  - Story state is normalized to the new story id.
- Source: `src/lib/repository.ts`

### 6.4 Universe Pack Export
- Universe packs bundle universe + all universe imports as a versioned snapshot.
- Export type field: `"universe_pack"` with `packVersion`.
- When creating a new story, the pack snapshot is embedded in `Story.universePackSnapshot`.
- Source: `getUniverseExportBundle()` / `importUniversePackBundle()` in `repository.ts`

### 6.5 Story Human-Readable Exports
- **Markdown / TXT**: `src/lib/storyExport.ts` — formats transcript with speaker labels
- **Standard PDF**: `src/lib/storyExportPdf.ts` — uses jsPDF; includes story metadata, summary, and transcript
- **Archive PDF**: `src/lib/storyArchivePdf.ts` — full analysis export: metadata + index registries (characters, locations, items, factions, relationships, world facts, memories, open threads) with evidence message numbers + numbered transcript. Triggers a fresh deep-index if the existing index is stale (> 5 minutes old).

### 6.6 Support Bundle
- `.zip` file (via fflate) containing: story JSON export + Archive PDF + diagnostics JSON.
- Source: `src/lib/supportBundle.ts`

### 6.7 MetaChat Export
- Exports MetaChat message history for a story as JSON or text.
- Source: `src/lib/metaChatExport.ts`

### 6.8 Backup Format (Workspace backup v1)
Backup is a full snapshot of the workspace:
```ts
type StoryEngineBackupV1 = {
  backupVersion: 1;
  exportedAt: string;
  data: {
    universes: Universe[];
    playerCharacters: PlayerCharacter[];
    stories: Story[];
    messages: StoryMessage[];
    universeImports: UniverseImport[];
    storySummaries: StorySummary[];
    storyStates: StoryState[];
    storyAiConfigs: StoryAIConfig[];
    storyUiStates?: StoryUiState[];
    aiSettings: (Omit<AISettings, "apiKeys"> & { apiKeys?: Partial<Record<AIProviderType, string>> }) | null;
  };
  uiPrefs: {
    rightSidebarCollapsed: boolean;
    readerMode: boolean;
    showChrome: boolean;
    textSize: "sm" | "md" | "lg" | "xl";
  };
};
```

Security: AI API keys are sanitized to empty on export.

Implementation: `exportWorkspaceBackupV1()` / `importWorkspaceBackupV1(backup, { mode, mergePolicy })` in `src/lib/repository.ts`.

---

## 7. Current Features

### Fully Implemented
- Universe CRUD + detail view; universe lore import from wiki URL (HTML → text); multi-source wiki URL support; Universe Packs (versioned export + story snapshot)
- Universe creation in both `referenced` and `custom` mode with AI-assisted blueprint generation
- Player character CRUD + AI-assisted field generation from concept; Quick Story Characters (inline creation, promote to library)
- Story creation wizard + per-story AI config + per-story mature fiction mode
- Story workspace:
  - Chat generation with additive continuation mode
  - Edit / Regenerate last AI message
  - Player Assist (full turn and continuation)
  - Bubble view ("Details") and transcript mode
  - Reader mode toggle
  - Text size setting
  - Story archiving (`isArchived` flag)
  - Theme switching from the workspace
- MetaChat overlay (out-of-canon AI conversation with draft persistence + background job completion)
- Director intent detection: implicit time skips and scene cuts parsed from player messages; temporal consequences block in AI context
- Chapter detection and chapter boundary markers on messages; chapter-aware archive exports
- Story State / Memory Architecture v2:
  - Incremental per-story auto-indexing (configurable interval: 5/10/15/20 messages or disabled)
  - Manual "Re-index" action in Story Settings
  - Full "Rebuild Memory & Indexes" pipeline (chunked, cancellable, with progress)
  - Archive view tab: index registries, evidence message jumping, auto-index countdown
  - Story Settings: index info in collapsible sections, auto-index countdown
- Background jobs system: story indexing, MetaChat generation, exports; browser notifications on completion
- Story exports: JSON bundle, Markdown/TXT, Standard PDF, Archive PDF, Support Bundle (.zip)
- Workspace backup/restore (merge/replace)
- Versioning + changelog modal (shows once per version; Settings reopens)
- Developer Notes system (bugs/features/testing notes) with JSON export
- Theme system 2.0: Amethyst, Copper, Emerald, Azure, Crimson, Silver, High Contrast, Monochrome, plus Custom (user-selected accent color)
- Android auto-backup every ~12 hours (keeps last 5) with a share prompt

### Planned (Not Yet Implemented)
- Full accessibility audit (screen reader labels, reduced motion, enlarged touch targets)
- Species options per universe (current: free-text on player character)
- More advanced NPC/character database beyond story-state extraction

---

## 8. Accessibility & Theming

### Accessibility
Current:
- Text Size preference (`sm | md | lg | xl`) stored in localStorage and included in backup.
- Transcript typography scales with the selected text size.

Gaps:
- No screen reader labels/a11y audit beyond basic semantic HTML.
- No high contrast toggle (themes exist but no explicit reduced-motion support).
- No enlarged touch targets setting.

### Theming
Theme system uses CSS variables derived from a selected accent color:
- Built-in themes: Amethyst (default), Copper, Emerald, Azure, Crimson, Silver, High Contrast, Monochrome.
- Custom theme: user-selects an accent hex color; foreground contrast is auto-derived.
- Derived tokens: `--accent-muted`, `--accent-border`, `--accent-glow`, `--accent-surface`, gradients.
- Theme state: `src/app/theming/ThemeContext.tsx`; theme definitions: `src/app/theming/themes.ts`
- Setting: `src/pages/SettingsPage.tsx`; preference persisted in localStorage.

---

## 9. Mobile Features

### Navigation & Responsive Layout
- Mobile uses a top header with an overlay navigation drawer.
- Story settings open as a right-side drawer overlay.
- Desktop uses a 2–3 column layout with persistent left/right sidebars.

Files: `src/app/layout/MobileNav.tsx`, `src/app/layout/V2Shell.tsx`

### Android Back / Gesture Handling
- Packaged Android builds navigate back through app history via Capacitor's App plugin rather than instantly exiting.

### Android Auto Backup
- Auto-backup runs every ~12 hours in packaged Android builds.
- Keeps the last 5 backups locally; prompts to share via the native share sheet.
- Source: `src/lib/androidAutoBackup.ts`

### Capacitor Packaging
- Capacitor config: `capacitor.config.ts`
- App ID: `com.storyengine.app`
- Web assets directory: `dist`
- Android app located at `android/`

---

## 10. Known Bugs

### Pending Verification
- Story import universe duplication / mismatching: import attempts to reuse universes by wiki URL or name; needs real-world verification with different exports.
- Character alias recognition: prompt and story-state guidance exists; real effectiveness depends on model/provider and state extraction consistency.
- Canon character naming persistence (titles vs first names): prompt guidance exists; real effectiveness depends on model/provider.

### Workarounds
- If alias/name handling is wrong: explicitly state the alias mapping in-character ("Becca is Rebecca Alvarez") and/or use the story-state extractor/summary updates to reinforce it over time.

---

## 11. Future Roadmap

Based on current feature requests and code structure:
- Accessibility system expansion: screen reader improvements, reduced motion, larger touch targets
- Reading mode enhancements: more typography controls (line width, spacing), optional read-only mode for long scenes
- Species/universe taxonomy: universe-defined selectable species list (optional), keeping free-text fallback
- Diagnostics export: export anonymized, shareable debug bundle for bug reports
- Improved import reconciliation: stronger matching by stable identifiers beyond name/wiki URL

---

## 12. File Structure

```
StoryGenerator/
├── src/
│   ├── app/
│   │   ├── layout/           # AppShell, V2Shell, V2LeftSidebar, V2RightSidebar,
│   │   │                     #   StorySettingsDrawer, MobileNav
│   │   ├── navigation.ts     # Route path constants
│   │   ├── providers/
│   │   │   └── StoryEngineProvider.tsx   # Global state + AI orchestration
│   │   ├── router.tsx        # createBrowserRouter route tree
│   │   ├── theming/          # ThemeContext, themes.ts
│   │   ├── ui/               # UiPrefsContext (text size, reader mode, etc.)
│   │   └── versioning/       # ChangelogContext, ChangelogModal, version.ts (v1.18.3)
│   ├── components/
│   │   ├── cards/            # CharacterCard, StoryCard, UniverseCard
│   │   ├── forms/            # Fields (reusable form inputs)
│   │   ├── story/            # StoryMessageBubble, StoryTranscriptView, StoryArchiveView,
│   │   │                     #   MetaChatOverlay, StoryListRow, GenerationFailureModal
│   │   └── ui/               # Badge, Button, Panel
│   ├── lib/
│   │   ├── ai/
│   │   │   ├── additiveJoin.ts          # Additive response concatenation
│   │   │   ├── characterGenerator.ts   # AI character field generation
│   │   │   ├── contextBuilder.ts       # Multi-block story context assembly
│   │   │   ├── errors.ts               # AI error classification and generation failures
│   │   │   ├── geminiProvider.ts       # Gemini REST provider
│   │   │   ├── json.ts                 # JSON extraction/parsing helpers
│   │   │   ├── matureFictionPolicy.ts  # Shared mature fiction policy block builder
│   │   │   ├── models.ts               # Available model lists per provider + defaults
│   │   │   ├── openaiProvider.ts       # OpenAI REST provider
│   │   │   ├── openrouterProvider.ts   # OpenRouter REST provider
│   │   │   ├── playerAssist.ts         # Player Assist prompt builders
│   │   │   ├── playerAssistContext.ts  # Player Assist context assembler
│   │   │   ├── providerFactory.ts      # Provider selection by AIProviderType
│   │   │   ├── rebuildMemory.ts        # Full transcript rebuild pipeline (chunked)
│   │   │   ├── sceneSizing.ts          # Scene depth inference + word target
│   │   │   ├── storyInputSafety.ts     # Player input fictional-context analysis
│   │   │   ├── storyStateExtractor.ts  # Extraction prompt builder + formatter + sanitizer
│   │   │   ├── transmitSafe.ts         # Transmit-safe system note injection
│   │   │   ├── types.ts                # AIProvider interface + AIChatMessage types
│   │   │   └── universeGenerator.ts    # Universe blueprint AI generation
│   │   ├── ingestion/
│   │   │   ├── fetchHtml.ts            # CORS-proxy fetch (AllOrigins)
│   │   │   ├── htmlToText.ts           # HTML → plain text
│   │   │   └── importUniverseLore.ts   # Orchestrates lore import pipeline
│   │   ├── storyText/
│   │   │   ├── chapterDetection.ts     # Chapter boundary detection from player text
│   │   │   ├── directorIntent.ts       # Time-skip / scene-cut detection from player text
│   │   │   ├── extractSpeakerPrefix.ts # Speaker prefix extraction from player messages
│   │   │   ├── parseActionSegments.ts  # Action segment parsing
│   │   │   ├── parseSceneBlocks.ts     # Scene block parsing (speaker + content)
│   │   │   ├── playerProtection.ts     # Player ownership violation detection
│   │   │   ├── playerState.ts          # Explicit player state hint extraction
│   │   │   ├── storyStandardizer.ts    # AI output normalization (speaker/action/dialogue)
│   │   │   └── transcriptSanitizer.ts  # Transcript cleanup + re-narration detection
│   │   ├── events/
│   │   │   └── storyNavigation.ts      # Story navigation custom events
│   │   ├── androidAutoBackup.ts        # Android 12-hour auto-backup
│   │   ├── archiveIndexing.ts          # Archive index freshness check
│   │   ├── dates.ts                    # Sort helpers
│   │   ├── download.ts                 # File download trigger
│   │   ├── idb.ts                      # IndexedDB schema (v6) + CRUD helpers
│   │   ├── ids.ts                      # Entity ID generation
│   │   ├── jobNotifications.ts         # Browser Notification API for background jobs
│   │   ├── metaChatExport.ts           # MetaChat export helpers
│   │   ├── repository.ts               # StoryEngineRepository (CRUD + import/export/backup)
│   │   ├── storyArchivePdf.ts          # Archive PDF export (jsPDF)
│   │   ├── storyExport.ts              # Markdown/TXT export
│   │   ├── storyExportPdf.ts           # Standard PDF export (jsPDF)
│   │   ├── storyPremises.ts            # Preset story premise suggestions
│   │   ├── storyStateV2.ts             # StoryState v2 normalization + reconciliation
│   │   ├── supportBundle.ts            # Support bundle zip export (fflate)
│   │   ├── universeSources.ts          # Multi-source wiki URL helpers
│   │   └── useDebouncedEffect.ts       # Debounced effect hook
│   ├── pages/                # Route-level screens (see Section 3)
│   ├── types/
│   │   ├── models.ts         # All entity types + export/backup shapes
│   │   └── navigation.ts     # Navigation type helpers
│   └── utils/
│       └── cn.ts             # Tailwind classname merge helper
├── android/                  # Capacitor Android project
├── capacitor.config.ts       # Capacitor config (appId: com.storyengine.app)
├── index.html
├── package.json              # v1.18.3
├── tsconfig.json
└── vercel.json               # SPA routing rewrite for Vercel deployment
```

The repo root also contains:
- `StoryEngineDesktop/` — minimal Electron desktop wrapper (separate npm package)
- `_vercel_repro_f212b60/` — older snapshot for Vercel reproduction debugging
- `.trae/documents/` — AI-generated planning documents for each major feature phase
- `.vercel/project.json` — Vercel project configuration

---

## 13. Dependencies

From `package.json` (v1.18.3):

**Runtime**:
- `react`, `react-dom` — UI rendering and component model
- `react-router-dom` — client-side routing (`createBrowserRouter`, nested routes)
- `jspdf` — Standard and Archive PDF export generation
- `fflate` — In-browser zip compression (support bundle export)
- `@capacitor/core` — Capacitor runtime for packaging web app into native shells
- `@capacitor/android` — Android platform integration
- `@capacitor/app` — Native back button / lifecycle events
- `@capacitor/filesystem` — Local file access (share/export in packaged builds)
- `@capacitor/share` — Native share sheet (share exported files/content)

**Dev**:
- `vite` + `@vitejs/plugin-react` — dev server, bundling, HMR
- `typescript` — typechecking
- `tailwindcss`, `postcss`, `autoprefixer` — styling pipeline
- `@types/*` — TypeScript type definitions
- `@capacitor/cli` — platform syncing (`cap sync`, `cap open`, etc.)

---

## 14. Build & Deployment

### Local Development (Web)
From `StoryGenerator/`:
```bash
npm install
npm run dev       # vite --host 0.0.0.0
```

### Production Build (Web)
```bash
npm run build     # tsc --noEmit && vite build → dist/
```

### Vercel Deployment
- `vercel.json` configures SPA routing rewrites so all paths serve `index.html`.
- `.vercel/project.json` contains the Vercel project/org IDs.

### Android Deployment (Capacitor)
Typical flow after web changes:
```bash
npm run build
npx cap sync android
npx cap open android   # opens Android Studio
```

Notes:
- Release APKs require consistent signing + incrementing `versionCode`.
- Capacitor serves files from `webDir: "dist"` (`capacitor.config.ts`).
- `android/app/release/output-metadata.json` tracks the most recent release build.

### Electron Desktop (StoryEngineDesktop)
A separate minimal Electron wrapper in `StoryEngineDesktop/`:
- Entry: `StoryEngineDesktop/src/main.js`
- `package.json` is a separate npm workspace.
- A prebuilt binary exists at `StoryEngineDesktop/dist/win-unpacked/`.

---

## 15. Appendix (Example JSON)

### 15.1 Example Story Export Bundle (Shape)
```json
{
  "exportedAt": "2026-06-18T12:34:56.000Z",
  "story": {
    "id": "story-<uuid>",
    "title": "My Story",
    "universeId": "universe-<uuid>",
    "playerCharacterId": "player-character-<uuid>",
    "matureFictionMode": false,
    "autoIndexMode": "messages",
    "autoIndexInterval": 20,
    "currentSummary": "",
    "createdAt": "2026-06-18T12:00:00.000Z",
    "updatedAt": "2026-06-18T12:30:00.000Z"
  },
  "universe": {
    "id": "universe-<uuid>",
    "name": "Brooklyn Nine-Nine",
    "description": "...",
    "wikiUrl": "https://brooklyn-nine-nine.fandom.com/wiki/...",
    "wikiUrls": [{ "url": "...", "label": "Fandom wiki", "order": 0 }],
    "mode": "referenced",
    "importedLore": [],
    "importedCharacters": [],
    "importedLocations": [],
    "importedRelationships": [],
    "createdAt": "2026-06-18T11:00:00.000Z"
  },
  "playerCharacter": {
    "id": "player-character-<uuid>",
    "name": "Jamie Mercer",
    "age": "29",
    "gender": "Non-binary",
    "species": "Human",
    "pronouns": "they/them",
    "characterConcept": "A new detective navigating the precinct",
    "appearance": "...",
    "personality": "...",
    "background": "...",
    "goals": "...",
    "notes": "...",
    "universeId": "universe-<uuid>",
    "scope": "library",
    "createdAt": "2026-06-18T11:30:00.000Z"
  },
  "messages": [
    {
      "id": "message-<uuid>",
      "storyId": "story-<uuid>",
      "role": "user",
      "content": "I walk into the bullpen...",
      "timestamp": "2026-06-18T12:01:00.000Z",
      "speakerType": "player"
    },
    {
      "id": "message-<uuid>",
      "storyId": "story-<uuid>",
      "role": "assistant",
      "content": "Jake: *leans back in his chair* \"New blood!\"",
      "timestamp": "2026-06-18T12:01:10.000Z",
      "speakerType": "canon",
      "speakerName": "Jake Peralta"
    }
  ],
  "storyState": {
    "id": "story-state:story-<uuid>",
    "storyId": "story-<uuid>",
    "stateJson": "{\"memoryArchitectureVersion\":\"2.0\",\"updatedAt\":\"...\",\"characters\":{},\"worldFacts\":[],\"unresolvedThreads\":[]}",
    "updatedAt": "2026-06-18T12:20:00.000Z"
  },
  "chapters": []
}
```

### 15.2 Example Workspace Backup v1 (Shape)
```json
{
  "backupVersion": 1,
  "exportedAt": "2026-06-18T12:34:56.000Z",
  "data": {
    "universes": [],
    "playerCharacters": [],
    "stories": [],
    "messages": [],
    "aiSettings": null,
    "storyAiConfigs": [],
    "universeImports": [],
    "storySummaries": [],
    "storyStates": [],
    "storyUiStates": []
  },
  "uiPrefs": {
    "rightSidebarCollapsed": true,
    "readerMode": false,
    "showChrome": false,
    "textSize": "md"
  }
}
```

### 15.3 StoryStateData Shape (Memory Architecture v2, abridged)
```json
{
  "memoryArchitectureVersion": "2.0",
  "updatedAt": "2026-06-18T12:20:00.000Z",
  "characters": {
    "Jamie Mercer": {
      "canonicalName": "Jamie Mercer",
      "displayName": "Jamie",
      "pronouns": "they/them",
      "titleOrRank": "Detective",
      "status": "settling in at the Nine-Nine",
      "characterTraitsPersistent": ["curious", "dry humor"],
      "characterStateTransient": ["nervous on first day"]
    }
  },
  "worldFacts": ["The 99th Precinct is in Brooklyn, NY"],
  "unresolvedThreads": ["Will Jamie fit in with the squad?"],
  "summaries": {
    "premise": "Jamie Mercer's first day as a detective at the Nine-Nine.",
    "protagonistSummary": "Jamie is a new non-binary detective, cautiously optimistic.",
    "currentSituation": "Jamie has just arrived in the bullpen and met Jake.",
    "recentDevelopments": ["Jake made a characteristic first impression"]
  },
  "indexes": {
    "messageCount": 2,
    "messageNumberingVersion": "1.0",
    "characters": {
      "Jamie Mercer": { "name": "Jamie Mercer", "firstSeenMessage": 1, "evidence": { "messageNumbers": [1] } },
      "Jake Peralta": { "name": "Jake Peralta", "firstSeenMessage": 2, "evidence": { "messageNumbers": [2] } }
    }
  }
}
```
