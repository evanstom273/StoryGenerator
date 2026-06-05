# Story Engine — Technical Architecture Document (TAD)

This document is written to onboard a developer who has never seen the Story Engine codebase before. It describes the current architecture as implemented in `c:\Users\evans\Documents\StoryGenRepo\StoryGenerator`.

## Table of Contents

1. Project Overview
2. System Architecture
3. Core Systems
4. Data Models
5. Story Engine Rules (Narrative + AI)
6. Import / Export Architecture
7. Current Features
8. Accessibility Features
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
- Create “Universes” (canon context containers)
- Create “Player Characters”
- Create “Stories” (a story lives in a universe and is played by a specific player character)
- Roleplay via a chat-like interface where the AI generates NPC/world responses while enforcing “player ownership”.

The application stores everything locally (IndexedDB + localStorage). It is built as a web app and can be packaged as an Android application via Capacitor.

### Philosophy
The core narrative philosophy is enforced both through prompting and post-generation validation:
- The player is the author of the player character.
- The AI “owns the world” (NPCs, canon characters, consequences, scene progression) but must not steal authorship of the player’s thoughts/actions/words.
- Canon is anchored by the transcript (Message 1 onward) and any imported universe lore.

### Core Design Principles
- Local-first: data persists on-device without a backend.
- Offline-friendly: the app is usable without network access; only AI calls and lore imports require network.
- Thin repository + provider pattern: IndexedDB access is centralized; React pages are mostly consumers of provider APIs/state.
- Maintainability over novelty: plain React/TypeScript with minimal dependencies.
- Safety rails: output sanitization and player-ownership checks guard against common LLM failure modes.

---

## 2. System Architecture

### Frontend Structure
- Framework: React 18 + React Router.
- Bundler: Vite.
- Styling: Tailwind CSS.
- App entry:
  - [main.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/main.tsx)
  - [App.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/app/App.tsx)
- Routing: [router.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/app/router.tsx)
- Layout/shell:
  - Primary UI shell is `V2Shell` (responsive columns + drawers): [V2Shell.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/app/layout/V2Shell.tsx)
  - Left navigation: [V2LeftSidebar.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/app/layout/V2LeftSidebar.tsx)
  - Right contextual sidebar: [V2RightSidebar.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/app/layout/V2RightSidebar.tsx)
  - Story settings drawer overlay: [StorySettingsDrawer.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/app/layout/StorySettingsDrawer.tsx)

### State & Data Flow
- Persistent storage access lives in:
  - IndexedDB schema & helpers: [idb.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/idb.ts)
  - Repository (CRUD + import/export/backup): [repository.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/repository.ts)
- Global app state is managed by `StoryEngineProvider`:
  - Loads data on startup, exposes CRUD functions, handles AI chat actions, and orchestrates imports/exports.
  - [StoryEngineProvider.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/app/providers/StoryEngineProvider.tsx)

### Storage Architecture
Story Engine uses three storage layers:
- IndexedDB (primary persistence): all entities listed in “Data Models” live here.
- localStorage (UI prefs + version tracking):
  - UI prefs: [UiPrefsContext.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/app/ui/UiPrefsContext.tsx)
  - Changelog “last viewed version”: `story-engine:changelog:last-viewed` via [ChangelogContext.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/app/versioning/ChangelogContext.tsx)
- In-memory React state:
  - Provider caches entity lists for fast read access and page rendering.

### IndexedDB Schema
Database:
- Name/version: `story-engine-db` / `4` ([idb.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/idb.ts))

Object stores and indexes (keyPath is always `id`):
- `universes`
- `playerCharacters` (index: `universeId`)
- `stories` (indexes: `universeId`, `playerCharacterId`)
- `messages` (index: `storyId`)
- `aiSettings`
- `storyAiConfigs` (index: `storyId`)
- `universeImports` (index: `universeId`)
- `storySummaries` (index: `storyId`)
- `storyStates` (index: `storyId`)
- `developerBugs`
- `developerFeatureRequests`
- `developerTestingNotes`

See [idb.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/idb.ts) for the authoritative schema definition.

### Data Relationships (Conceptual)
- Universe → Player Characters (1:N)
- Universe → Stories (1:N)
- Universe → Universe Imports (1:N)
- Player Character → Stories (1:N)
- Story → Messages (1:N)
- Story → Summaries (1:N, typically “latest” used)
- Story → AI Configs (1:N, typically “latest” used)
- Story → Story State (1:N by schema; usage is effectively “latest” / deterministic id)
- Developer Notes are independent of Universe/Story (global to the workspace).

---

## 3. Core Systems

### 3.1 Universes
Universes contain:
- Human-authored description and optional wiki URL.
- Imported lore text (via “Universe Import”) stored as `UniverseImport` entries.
- Placeholder arrays for imported characters/locations/relationships (future use).

Key pages:
- Universe list: [UniversesPage.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/pages/UniversesPage.tsx)
- Universe create/edit/import: [UniverseFormPage.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/pages/UniverseFormPage.tsx)
- Universe detail + imported lore view: [UniverseDetailPage.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/pages/UniverseDetailPage.tsx)

Key storage ops:
- Repository universe CRUD and exports/imports: [repository.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/repository.ts)

### 3.2 Player Characters
Player Characters define the playable protagonist for a story. They are explicit typed entities, not just prompt text.

Notable fields:
- Identity: `name`, `age`, `gender`, `species`, `pronouns`
- Characterization: `appearance`, `personality`, `background`, `goals`, `notes`
- Relationship: belongs to a `universeId`

Key pages:
- List: [PlayerCharactersPage.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/pages/PlayerCharactersPage.tsx)
- Create/edit: [PlayerCharacterFormPage.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/pages/PlayerCharacterFormPage.tsx)
- Detail: [PlayerCharacterDetailPage.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/pages/PlayerCharacterDetailPage.tsx)

AI-assisted “randomize/fill fields”:
- AI schema and instructions: [characterGenerator.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/ai/characterGenerator.ts)
- Orchestration in provider: [StoryEngineProvider.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/app/providers/StoryEngineProvider.tsx)

### 3.3 Stories
Stories bind:
- A universe (`universeId`)
- A player character (`playerCharacterId`)
- An opening prompt (canon initial state)
- A message timeline and computed summaries
- Optional long-term structured “story state” JSON

Key pages:
- Create (wizard): [StoryCreatePage.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/pages/StoryCreatePage.tsx)
- Workspace: [StoryWorkspacePage.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/pages/StoryWorkspacePage.tsx)

### 3.4 Messages
Messages are stored as `StoryMessage` items with:
- `role` (`user`, `assistant`, `system`) and optional `speakerName`/`speakerType` for display/story formatting.

Storage:
- Indexed by `storyId` to quickly retrieve a story’s timeline.

Rendering:
- Bubble mode: [StoryMessageBubble.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/components/story/StoryMessageBubble.tsx)
- Transcript mode: [StoryTranscriptView.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/components/story/StoryTranscriptView.tsx)

### 3.5 Developer Notes
Developer Notes provide an in-app QA tracker for testing without external tooling:
- Bugs
- Feature Requests
- Testing Notes
- Export (JSON)

Pages:
- Index: [DeveloperNotesPage.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/pages/DeveloperNotesPage.tsx)
- Bugs list/form: [DeveloperBugsPage.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/pages/DeveloperBugsPage.tsx), [DeveloperBugFormPage.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/pages/DeveloperBugFormPage.tsx)
- Feature requests list: [DeveloperFeatureRequestsPage.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/pages/DeveloperFeatureRequestsPage.tsx)
- Testing notes list/form: [DeveloperTestingNotesPage.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/pages/DeveloperTestingNotesPage.tsx), [DeveloperTestingNoteFormPage.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/pages/DeveloperTestingNoteFormPage.tsx)
- Export: [DeveloperNotesExportPage.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/pages/DeveloperNotesExportPage.tsx)

Storage:
- `developerBugs`, `developerFeatureRequests`, `developerTestingNotes` stores (IndexedDB).

### 3.6 Import / Export
Story Engine supports:
- Story export bundles (story + universe + player character + messages + optional story state)
- Universe export bundles (universe + universeImports)
- Player character export bundles
- Story “human readable” exports (Markdown/TXT/PDF)

See “Import / Export Architecture” for details and “Appendix” for example structures.

### 3.7 Backup / Restore
Workspace backup is a full dump of all indexedDB stores plus UI prefs:
- Supports merge or replace modes.
- Sanitizes API keys on export (keys are not included in backups).

See:
- Backup export/import: [repository.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/repository.ts)
- Backup shape: [models.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/types/models.ts)

---

## 4. Data Models

Authoritative TypeScript models live in:
- [models.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/types/models.ts)

### 4.1 ID Strategy
All entity IDs are strings generated by:
- `createEntityId(prefix)` → `${prefix}-${crypto.randomUUID()}` (preferred) or a timestamp/random fallback.
- [ids.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/ids.ts)

### 4.2 Entity Schemas

#### Universe
```ts
type Universe = {
  id: string;
  name: string;
  description: string;
  wikiUrl: string;
  importedLore: string[];
  importedCharacters: string[];
  importedLocations: string[];
  importedRelationships: string[];
  createdAt: string;
}
```

#### PlayerCharacter
```ts
type PlayerCharacter = {
  id: string;
  name: string;
  age: string;
  gender: string;
  species: string;
  pronouns: string;
  appearance: string;
  personality: string;
  background: string;
  goals: string;
  notes: string;
  universeId: string;
  createdAt: string;
}
```

#### Story
```ts
type Story = {
  id: string;
  title: string;
  universeId: string;
  playerCharacterId: string;
  openingPrompt: string;
  currentSummary: string;
  createdAt: string;
  updatedAt: string;
}
```

#### StoryMessage
```ts
type StoryMessage = {
  id: string;
  storyId: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  speakerName?: string;
  speakerType?: "canon" | "npc" | "narrator";
}
```

#### AISettings
```ts
type AISettings = {
  id: "ai-settings";
  activeProviderType: "openai" | "gemini" | "openrouter";
  apiKeys: Record<string, string>;
  defaultModels: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}
```

#### StoryAIConfig
```ts
type StoryAIConfig = {
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
type UniverseImport = {
  id: string;
  universeId: string;
  sourceUrl: string;
  title: string;
  importedText: string;
  importedAt: string;
}
```

#### StorySummary
```ts
type StorySummary = {
  id: string;
  storyId: string;
  summary: string;
  generatedAt: string;
}
```

#### StoryState
```ts
type StoryState = {
  id: string;
  storyId: string;
  stateJson: string; // JSON string of StoryStateData
  updatedAt: string;
}
```

#### DeveloperBug
```ts
type DeveloperBug = {
  id: string;
  title: string;
  status: "Open" | "Testing" | "Confirmed" | "Fixed" | string;
  reportedAt: string;
  description: string;
  reproductionSteps: string;
  expectedBehaviour: string;
  actualBehaviour: string;
  notes: string;
  updatedAt: string;
}
```

#### DeveloperFeatureRequest
```ts
type DeveloperFeatureRequest = {
  id: string;
  title: string;
  priority: "Low" | "Medium" | "High" | string;
  description: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}
```

#### DeveloperTestingNote
```ts
type DeveloperTestingNote = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}
```

### 4.3 Relationship Map
- `PlayerCharacter.universeId → Universe.id`
- `Story.universeId → Universe.id`
- `Story.playerCharacterId → PlayerCharacter.id`
- `StoryMessage.storyId → Story.id`
- `UniverseImport.universeId → Universe.id`
- `StorySummary.storyId → Story.id`
- `StoryAIConfig.storyId → Story.id`
- `StoryState.storyId → Story.id` (stateJson holds structured memory)

---

## 5. Story Engine Rules (Narrative + AI)

The Story Engine “rules” are enforced through a combination of:
- Prompt engineering (system guidance embedded in the story context)
- Output sanitization (format normalization)
- Ownership violation detection (heuristics that flag when the AI writes as the player)

### 5.1 Player Ownership (The Player Owns the Player Character)
High-level rule:
- The AI must not narrate the player’s actions, thoughts, feelings, or dialogue.

Where it is implemented:
- Prompt rules embedded into the AI context: [contextBuilder.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/ai/contextBuilder.ts)
- Heuristic validator for “player-authorship violations”: [playerProtection.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/storyText/playerProtection.ts)

Typical violations detected:
- “You walk into the room…” (second person action)
- “Rebecca smiles and says…” when Rebecca is the player character (subject+verb patterns)
- Player being used as a speaker header (e.g., `Rebecca:`)

### 5.2 AI World Ownership (The AI Owns NPCs + Consequences)
High-level rule:
- The AI is responsible for NPC behavior, world events, and consequences, but must not invent facts that only the player could have provided.

Key prompt instructions:
- The transcript is canon and authoritative.
- Do not auto-introduce mysteries/emergencies/cases “because the story started”.
- Continue from the player’s last message rather than rewriting it.

Source:
- [contextBuilder.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/ai/contextBuilder.ts)

### 5.3 Canon Handling
Canon anchors:
- Transcript messages (Message 1 onward)
- Imported universe lore (`UniverseImport.importedText`)
- Current story summary + story-state long-term memory (when present)

The system formats the story history for the LLM with role tags:
- Player messages labeled as `Player (<name>)`
- Canon/NPC/narrator messages labeled accordingly

Source:
- [contextBuilder.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/ai/contextBuilder.ts)

### 5.4 NPC Generation
NPC behavior is fully model-driven; the system constrains it by:
- Canon + universe lore + story state
- “No mystery resolution unless provided”
- “Don’t put words in player’s mouth”

The codebase does not maintain an explicit NPC entity database yet. Instead, NPC identity/relationships can be stored in `StoryState.stateJson` via extraction.

### 5.5 Alias Resolution (Nicknames & Name Variants)
The system treats nicknames/shortened names/variants as the same character unless explicitly introduced otherwise.

Enforcement points:
- Prompt rule: [contextBuilder.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/ai/contextBuilder.ts)
- Story-state extraction rule encourages recording aliases/displayName: [storyStateExtractor.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/ai/storyStateExtractor.ts)
- Player-ownership validator can accept name variants for the player: [playerProtection.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/storyText/playerProtection.ts)

---

## 6. Import / Export Architecture

### 6.1 Universe Import Flow (Lore ingestion)
Goal:
- Turn a wiki URL into cleaned plaintext stored for later AI context.

Implementation:
- Fetch: AllOrigins proxy to bypass CORS: [fetchHtml.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/ingestion/fetchHtml.ts)
- Convert: HTML → text extraction: [htmlToText.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/ingestion/htmlToText.ts)
- Orchestration: [importUniverseLore.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/ingestion/importUniverseLore.ts)
- UI: Universe import page is part of the Universe form route: [UniverseFormPage.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/pages/UniverseFormPage.tsx)

Storage:
- A `UniverseImport` record is saved into the `universeImports` store (indexed by `universeId`).

### 6.2 Character Import Flow
Current supported import:
- Import player character JSON bundle v1 into an existing universe.

Implementation:
- Export: `exportPlayerCharacterBundleV1(characterId)`
- Import: `importPlayerCharacterBundleV1(bundle, { universeId })`
- [repository.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/repository.ts)

### 6.3 Story Import Flow
Current supported import:
- Import story JSON bundle (story + universe + player character + messages + optional story state).

Implementation:
- Export: `exportStoryExportBundle(storyId)` in [repository.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/repository.ts)
- Import: `importStoryExportBundle(bundle)`:
  - Creates a new story id and new message ids.
  - Attempts to reuse an existing universe (match by `wikiUrl` first, then by universe name).
  - Attempts to reuse an existing player character within the matched universe (match by character name).
  - If story state exists, it is normalized to the new story id.

See:
- [repository.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/repository.ts)

### 6.4 Backup Format (Workspace backup v1)
Backup is a full snapshot of the workspace:
- `backupVersion: 1`
- `data` contains arrays for each major store (universes, stories, messages, etc.)
- `uiPrefs` includes stored UI preferences (including text size)

Security:
- AI API keys are not exported (sanitized to empty object).

Implementation:
- Export: `exportWorkspaceBackupV1()`
- Import: `importWorkspaceBackupV1(backup, { mode, mergePolicy })`

See:
- [repository.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/repository.ts)
- Type definition: [models.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/types/models.ts)

---

## 7. Current Features

### Fully Implemented
- Universe CRUD + universe detail view
- Player character CRUD + AI-assisted field generation
- Story creation wizard + per-story AI config
- Story workspace:
  - Chat generation
  - Bubble view (“Details”) and transcript view
  - Reader mode toggle (reduced chrome)
  - Text size setting (affects transcript typography)
- Universe lore import from wiki URL (HTML → text)
- Story export:
  - JSON bundle
  - Markdown/TXT export
  - PDF export (jsPDF)
- Workspace backup/restore (merge/replace)
- Developer Notes system (bugs/features/testing notes) with JSON export
- Versioning + changelog modal (shows once per version, Settings reopen)

### Experimental / “In Progress” Behavior
- Story state extraction and long-term memory:
  - Stored as JSON string in `StoryState.stateJson`
  - Used to constrain context window and reinforce canon/identity rules
- Story summaries:
  - Summary generation strategy is present; the system uses `Story.currentSummary` and falls back to saved summaries.

### Planned (Not Yet Implemented)
- Accessibility beyond text sizing (contrast, reduced motion, touch target scaling)
- Full “species options per universe” (current implementation is free-text on player character)
- More advanced NPC/character database beyond story-state extraction
- Diagnostics export (button exists but is disabled)

---

## 8. Accessibility Features

Current:
- Text Size preference (`sm | md | lg | xl`) stored in localStorage and included in backup.
- Transcript typography scales with the selected text size.

Primary code points:
- Setting UI and persistence: [SettingsPage.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/pages/SettingsPage.tsx)
- Preference key: [UiPrefsContext.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/app/ui/UiPrefsContext.tsx)
- Typography application: [StoryWorkspacePage.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/pages/StoryWorkspacePage.tsx), [StoryTranscriptView.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/components/story/StoryTranscriptView.tsx)

Gaps:
- No explicit screen reader labels/a11y audit yet beyond basic semantic HTML.
- No high contrast toggle, reduced motion toggle, or enlarged touch targets setting yet.

---

## 9. Mobile Features

### Navigation & Responsive Layout
- Mobile uses a top header with an overlay navigation drawer.
- Story settings open as a right-side drawer overlay.
- Desktop uses a 2–3 column layout with persistent left/right sidebars.

Files:
- Mobile nav overlay: [MobileNav.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/app/layout/MobileNav.tsx)
- Shell/responsive grid: [V2Shell.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/app/layout/V2Shell.tsx)

### Android Back / Gesture Handling
- Packaged Android builds are expected to navigate back through app history rather than instantly exiting.
- Native back integration is handled via Capacitor’s App plugin.

### Capacitor Packaging
- Capacitor config: [capacitor.config.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/capacitor.config.ts)
- App ID: `com.storyengine.app`
- Web assets directory: `dist`

---

## 10. Known Bugs

This section reflects “known/past bugs” that may still need validation on real story data.

### Bugs pending verification in real playtesting
- Story import universe duplication / mismatching:
  - Import attempts to reuse universes by wiki URL or name; needs real-world verification with different exports.
- Character alias recognition (nicknames):
  - Prompt and story-state guidance exists; real effectiveness depends on the model/provider and how consistently story state is extracted.
- Canon character naming persistence (titles vs first names):
  - Prompt guidance exists; real effectiveness depends on model/provider and state extraction.

### Workarounds
- If alias/name handling is wrong:
  - Explicitly state the alias mapping in-character (“Becca is Rebecca Alvarez”) and/or add it to notes.
  - Use the story-state extractor/summary updates to reinforce it over time.

---

## 11. Future Roadmap

Based on current feature requests and code structure:
- Accessibility system expansion:
  - High contrast mode
  - Reduced motion
  - Screen reader improvements
  - Larger touch targets
- Reading mode enhancements:
  - More typography controls (line width, spacing)
  - Optional “read-only” mode for reviewing long scenes
- Species/universe taxonomy:
  - Universe-defined selectable species list (optional), keeping free-text fallback
- Diagnostics export:
  - Export anonymized, shareable debug bundle (no keys) for bug reports
- Improved import reconciliation:
  - Stronger matching by stable identifiers beyond name/wiki URL

---

## 12. File Structure

Top-level:
- `src/app/` — routing, layout shells, providers, UI preference contexts, versioning/changelog
- `src/pages/` — route-level screens
- `src/components/` — reusable UI building blocks
- `src/lib/` — storage, AI providers, story text sanitation, imports, exports, utilities
- `src/types/` — data model and navigation types
- `src/utils/` — shared helpers (`cn` classnames helper)

Highlights:
- Storage:
  - [idb.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/idb.ts)
  - [repository.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/repository.ts)
- Global app orchestration:
  - [StoryEngineProvider.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/app/providers/StoryEngineProvider.tsx)
- AI:
  - Provider factory + provider implementations: [providerFactory.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/ai/providerFactory.ts), [openaiProvider.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/ai/openaiProvider.ts), [geminiProvider.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/ai/geminiProvider.ts), [openrouterProvider.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/ai/openrouterProvider.ts)
  - Prompt builder: [contextBuilder.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/ai/contextBuilder.ts)
  - State extractor (LLM-driven JSON memory): [storyStateExtractor.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/ai/storyStateExtractor.ts)
- Story text normalization + player-ownership checking:
  - [transcriptSanitizer.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/storyText/transcriptSanitizer.ts)
  - [playerProtection.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/storyText/playerProtection.ts)
- Exports:
  - Markdown/TXT: [storyExport.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/storyExport.ts)
  - PDF: [storyExportPdf.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/storyExportPdf.ts)

---

## 13. Dependencies

From [package.json](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/package.json):

Runtime:
- `react`, `react-dom`: UI rendering and component model.
- `react-router-dom`: client-side routing (`createBrowserRouter`, nested routes).
- `jspdf`: PDF story export generation.
- `@capacitor/core`: Capacitor runtime for packaging web app into native shells.
- `@capacitor/android`: Android platform integration.
- `@capacitor/app`: native back button / lifecycle events.
- `@capacitor/filesystem`: local file access (used for share/export workflows in packaged builds).
- `@capacitor/share`: native share sheet (share exported files/content).

Dev:
- `vite` + `@vitejs/plugin-react`: dev server, bundling, HMR.
- `typescript`: typechecking.
- `tailwindcss`, `postcss`, `autoprefixer`: styling pipeline.
- `@types/*`: TypeScript type definitions.
- `@capacitor/cli`: platform syncing (`cap sync`, `cap open`, etc.).

---

## 14. Build & Deployment

### Local Development (Web)
From the project root (`StoryGenerator/`):
```bash
npm install
npm run dev
```

### Production Build (Web)
```bash
npm run build
```
This runs `tsc --noEmit` then `vite build` and outputs `dist/`.

### Android Deployment (Capacitor)
Typical flow after changes:
```bash
npm run build
npx cap sync android
npx cap open android
```

Notes:
- Android updates require consistent signing + increasing `versionCode` when generating release APKs.
- Capacitor serves files from `webDir: "dist"` ([capacitor.config.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/capacitor.config.ts)).

---

## 15. Appendix (Example JSON)

### 15.1 Example Story Export Bundle (Shape)
```json
{
  "exportedAt": "2026-06-02T12:34:56.000Z",
  "story": {
    "id": "story-<uuid>",
    "title": "My Story",
    "universeId": "universe-<uuid>",
    "playerCharacterId": "player-character-<uuid>",
    "currentSummary": "",
    "createdAt": "2026-06-02T12:00:00.000Z",
    "updatedAt": "2026-06-02T12:30:00.000Z"
  },
  "universe": {
    "id": "universe-<uuid>",
    "name": "Star Wars",
    "description": "Space opera...",
    "wikiUrl": "https://starwars.fandom.com/wiki/...",
    "importedLore": [],
    "importedCharacters": [],
    "importedLocations": [],
    "importedRelationships": [],
    "createdAt": "2026-06-02T11:00:00.000Z"
  },
  "playerCharacter": {
    "id": "player-character-<uuid>",
    "name": "Rebecca Alvarez",
    "age": "27",
    "gender": "Woman",
    "species": "Human",
    "pronouns": "she/her",
    "appearance": "...",
    "personality": "...",
    "background": "...",
    "goals": "...",
    "notes": "...",
    "universeId": "universe-<uuid>",
    "createdAt": "2026-06-02T11:30:00.000Z"
  },
  "messages": [
    {
      "id": "message-<uuid>",
      "storyId": "story-<uuid>",
      "role": "user",
      "content": "I walk into the cantina...",
      "timestamp": "2026-06-02T12:01:00.000Z"
    },
    {
      "id": "message-<uuid>",
      "storyId": "story-<uuid>",
      "role": "assistant",
      "content": "The cantina hums with...",
      "timestamp": "2026-06-02T12:01:10.000Z",
      "speakerType": "narrator"
    }
  ],
  "storyState": {
    "id": "story-state:story-<uuid>",
    "storyId": "story-<uuid>",
    "stateJson": "{\"schemaVersion\":1,\"characters\":{}}",
    "updatedAt": "2026-06-02T12:20:00.000Z"
  }
}
```

### 15.2 Example Workspace Backup v1 (Shape)
```json
{
  "backupVersion": 1,
  "exportedAt": "2026-06-02T12:34:56.000Z",
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
    "developerBugs": [],
    "developerFeatureRequests": [],
    "developerTestingNotes": []
  },
  "uiPrefs": {
    "rightSidebarCollapsed": true,
    "readerMode": false,
    "showChrome": false,
    "textSize": "md"
  }
}
```
