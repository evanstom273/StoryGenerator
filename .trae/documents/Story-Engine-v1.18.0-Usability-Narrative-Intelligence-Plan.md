# Story Engine v1.18.0 — Usability + Narrative Intelligence Upgrade (Plan)

## Summary
Implement v1.18.0 as a coordinated upgrade across exports, library UX, indexing modes, and narrative intelligence:
- Archive PDF export always deep-indexes first and becomes transcript-first.
- Theme switching becomes available directly in Story Settings.
- Stories can be archived/retired (hidden by default, never deleted).
- Search expands across Stories/Universes/Characters (no message text search).
- Library pages gain sorting and filtering for large collections.
- Relationship dynamics get additional metrics (comfort/suspicion) and improved prompt support.
- “Director intent” phrases (time skips, scene cuts) are detected automatically with an undo path.
- MetaChat is introduced as an out-of-canon thread per story and is excluded from canon context/indexing.
- Chapters are added (detection + timeline markers + summaries) and indexing gains an “After Every Chapter” mode.
- Versioning bump to 1.18.0 + Android versionCode per convention.

## Current State Analysis (Grounded)

### Export pipeline
- Archive PDF generation is routed via `serializeStoryExport(bundle, "archive_pdf")` → `serializeStoryArchivePdf` in:
  - [storyExport.ts](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/lib/storyExport.ts#L240-L261)
  - [storyArchivePdf.ts](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/lib/storyArchivePdf.ts#L63-L532)
- In-story export buttons currently do **not** refresh indexing before export:
  - [StorySettingsDrawer.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/app/layout/StorySettingsDrawer.tsx#L271-L285)
  - [V2RightSidebar.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/app/layout/V2RightSidebar.tsx#L62-L76)
- The PDF currently places “Full Transcript” last (needs to become transcript-first):
  - [storyArchivePdf.ts](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/lib/storyArchivePdf.ts#L190-L529)

### Theme system
- Theme is managed by `ThemeProvider` and persisted in localStorage; `useTheme()` exposes `setThemeKey()`:
  - [ThemeContext.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/app/theming/ThemeContext.tsx#L207-L289)
- Theme selection UI exists only in Settings:
  - [SettingsPage.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/pages/SettingsPage.tsx#L523-L625)

### Library lists and search
- List pages exist but have no filters/sort/search:
  - [StoriesPage.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/pages/StoriesPage.tsx)
  - [UniversesPage.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/pages/UniversesPage.tsx)
  - [PlayerCharactersPage.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/pages/PlayerCharactersPage.tsx)
- Search box exists only in V2 sidebar, currently filtering only universes and their stories:
  - [V2LeftSidebar.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/app/layout/V2LeftSidebar.tsx#L59-L66)

### Indexing and scheduling
- Deep rebuild entrypoint is `updateIndexesDeep(storyId, opts)` in:
  - [StoryEngineProvider.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/app/providers/StoryEngineProvider.tsx#L1788-L1898)
- Auto indexing currently triggers on message count and uses `story.autoIndexInterval`:
  - [StoryEngineProvider.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/app/providers/StoryEngineProvider.tsx#L2781-L2793)
- Auto vs manual deep-index anchoring is already supported via `deepIndexTrigger: "auto"` passed into `finalizeStoryStateForSave`:
  - [StoryEngineProvider.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/app/providers/StoryEngineProvider.tsx#L2810-L2818)

### Relationships
- Relationship indexes already exist with 0–100 metrics, evidence refs, and reconciliation:
  - [models.ts](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/types/models.ts#L129-L153)
  - Extraction + clamping: [storyStateExtractor.ts](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/lib/ai/storyStateExtractor.ts#L242-L323)
  - Pair merge: [storyStateV2.ts](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/lib/storyStateV2.ts#L157-L201)

### Chapters + MetaChat
- No chapter storage, UI, or detection exists (no chapter types/stores found).
- No MetaChat storage, UI, or message type exists (no MetaChat types/stores found).

### Storage
- IndexedDB is versioned at `DATABASE_VERSION = 4` and currently has no stores for chapters or meta messages:
  - [idb.ts](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/lib/idb.ts#L1-L17)

## Key Decisions (Locked)
- Search scope: no message content searching (stories/universes/characters/summaries only).
- Theme switch placement: Story Settings drawer.
- Archiving model: `isArchived: boolean` on `Story`.
- Archive PDF freshness: always run a full deep index before generating; fail export if indexing fails.
- Chapters UX: timeline markers (plus manage from Story Settings).
- Chapter labels: auto-detected only (no editing UI in v1.18.0).
- Indexing modes: one-of (Disabled / Every N messages / After Every Chapter).
- MetaChat AI: uses same provider/model as story, but a different system prompt and never enters canon context.
- Relationships: add new metrics (comfort + suspicion) rather than renaming existing.
- Director intent UX: auto-apply + undo path.
- Search UI: both (sidebar quick filter + richer Home search panel).
- Archived default: hidden everywhere by default; toggle reveals.

## Proposed Changes (By Feature)

### 1) Export reliability: deep-index before Archive PDF export
**Goal:** Always generate Archive PDF from fresh indexes (no stale archive).

**Implementation**
- Add an export helper that performs:
  1) Set UI state to “Updating archive…”
  2) Call `updateIndexesDeep(storyId, { deepIndexTrigger: "auto" | "export" })` (new trigger value if needed)
  3) Fetch fresh bundle via `exportStory(storyId)`
  4) Set UI state to “Generating PDF…”
  5) Generate + download PDF.
- Apply to:
  - Story Settings “Export Archive PDF”
  - Right sidebar “Export Archive PDF”
  - Support Bundle export (because it includes Archive PDF via [supportBundle.ts](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/lib/supportBundle.ts#L18-L60))
- Error handling: if indexing throws, show error and do not generate.

**Files**
- [StorySettingsDrawer.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/app/layout/StorySettingsDrawer.tsx)
- [V2RightSidebar.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/app/layout/V2RightSidebar.tsx)
- [StoryEngineProvider.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/app/providers/StoryEngineProvider.tsx) (optional: expose a `exportArchivePdfFresh(storyId)` convenience method in context)

**Verification**
- Export Archive PDF with new messages present and confirm the PDF metadata “Indexed at” reflects the refresh and indexes match current transcript.

### 2) Archive PDF layout: transcript-first
**Goal:** Reader experiences the story first; analysis comes after.

**Implementation**
- Reorder sections in [storyArchivePdf.ts](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/lib/storyArchivePdf.ts) to:
  1) Cover/title + short metadata
  2) Full Transcript (with chapter separators if present)
  3) Current Summary
  4) Open Threads
  5) Character Registry
  6) Location Registry
  7) Relationship Registry
  8) World Facts
  9) Significant Memories
  10) Appendix (optional; keep any existing extra state blocks here if still desired)
- Keep transcript formatting rules:
  - consistent numbering (already `[Message N]`)
  - consistent speaker tags (already `resolveTranscriptSpeakerLabel`)
  - ASCII-safe relationship delimiter: keep `<->` (already used).
- Add optional chapter separators:
  - insert a monospace separator like `----- CHAPTER END: {label} -----` at the correct transcript position.

**Files**
- [storyArchivePdf.ts](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/lib/storyArchivePdf.ts)
- New: `StoryExportBundle` may need to include chapters for chapter-aware exports (see Chapter section).

**Verification**
- Generate a PDF and confirm transcript precedes “Current Summary” and registries.

### 3) Quick theme switching from story view (Story Settings drawer)
**Implementation**
- In `StorySettingsDrawer`, add a small “Theme” section near the top that uses `useTheme()`:
  - dropdown of available theme keys (from [themes.ts](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/app/theming/themes.ts))
  - optional custom accent input can remain Settings-only (v1.18 scope) unless easy to reuse.
- Persist is already handled by ThemeContext.

**Files**
- [StorySettingsDrawer.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/app/layout/StorySettingsDrawer.tsx)
- [ThemeContext.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/app/theming/ThemeContext.tsx) (no structural changes expected)

**Verification**
- Change theme from inside a story and confirm it updates immediately and persists across refresh.

### 4) Story archiving / retirement
**Data model**
- Add `isArchived?: boolean` to `Story`.

**Behavior**
- Default views show Active only.
- Add toggles/filters to reveal archived stories.
- Archived stories remain exportable and accessible via direct navigation.

**UI changes**
- Story Settings: add “Archive Story” / “Restore Story” action.
- Story lists:
  - filter toggle: Active / Archived / All
  - sorting: recently updated / recently created / alphabetical
  - optional filter by universe.
- Sidebar:
  - hide archived by default and provide a “Show archived” toggle in UI prefs (so sidebar behavior matches lists).

**Files**
- Types: [models.ts](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/types/models.ts)
- Persistence: [repository.ts](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/lib/repository.ts) (no special migration required; field stored with story)
- UI prefs: [UiPrefsContext.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/app/ui/UiPrefsContext.tsx) + provider where UI prefs are set (in `AppShell` / `V2Shell`).
- Lists:
  - [HomePage.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/pages/HomePage.tsx)
  - [StoriesPage.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/pages/StoriesPage.tsx)
  - [V2LeftSidebar.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/app/layout/V2LeftSidebar.tsx)

**Verification**
- Archive a story, confirm it disappears from default views and returns when toggled.

### 5) Comprehensive search (stories + characters + universes, no message text)
**Implementation**
- Sidebar:
  - Extend existing search to include:
    - stories by title
    - universes by name
    - player characters by name
  - Render grouped results (Stories / Universes / Characters).
- Home:
  - Add a search input and results panel with the same grouped result types.
  - Clicking results navigates appropriately.

**Files**
- [V2LeftSidebar.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/app/layout/V2LeftSidebar.tsx)
- [HomePage.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/pages/HomePage.tsx)
- (Optional) New shared component for grouped search results, to avoid duplication.

**Verification**
- Search for a character name and confirm results include the character and their stories’ universe context.

### 6) Filtering + sorting for large libraries
**Implementation**
- StoriesPage: add filter/sort controls (Active/Archived/All, universe filter, sort).
- UniversesPage: add sort controls (createdAt desc, alphabetical).
- PlayerCharactersPage: add universe filter and sorting (createdAt desc, alphabetical).

**Files**
- [StoriesPage.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/pages/StoriesPage.tsx)
- [UniversesPage.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/pages/UniversesPage.tsx)
- [PlayerCharactersPage.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/pages/PlayerCharactersPage.tsx)
- New shared UI primitives if helpful (e.g., a small `ListToolbar` component).

**Verification**
- Confirm sorts change list ordering and filters reduce results without breaking navigation.

### 7) Relationship system: evolving dynamics (comfort/suspicion additions)
**Data model**
- Extend `RelationshipIndexEntry` to include:
  - `comfort?: number`
  - `suspicion?: number`

**Extraction + reconciliation**
- Update the extraction prompt in [storyStateExtractor.ts](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/lib/ai/storyStateExtractor.ts) to request these fields as part of “current dynamic state”.
- Update sanitization/clamping to include the new metrics (0..100).
- Update display in archive views + PDF relationship registry to include the new fields when present.

**Files**
- [models.ts](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/types/models.ts)
- [storyStateExtractor.ts](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/lib/ai/storyStateExtractor.ts)
- [StoryArchiveView.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/components/story/StoryArchiveView.tsx)
- [StorySettingsDrawer.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/app/layout/StorySettingsDrawer.tsx) (if it mirrors archive sections)
- [storyArchivePdf.ts](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/lib/storyArchivePdf.ts)

**Verification**
- Create/observe relationship shift (e.g., betrayal) and confirm suspicion increases while comfort drops after re-index.

### 8) Implicit director intent recognition (time skips, scene cuts) with undo
**Goal:** Recognize natural phrases and feed structured intent into the next generation.

**Data model**
- Extend `StoryMessage` with optional metadata:
  - `directorIntent?: { timeSkip?: { unit: "hours" | "days" | "weeks" | "months"; amount: number }; sceneCut?: boolean; target?: string }`
  - This stays attached to the user message that expressed the intent.

**Detection**
- Add a small detector in `src/lib/storyText/`:
  - Regex patterns for “A few hours later…”, “Over the next week…”, “The scene cuts to…”, “Meanwhile…”, “Cut back to…”, etc.
- On user message submission (inside StoryEngineProvider’s `sendChatMessage` path), detect intent and write it into the stored user message.

**Context integration**
- In [contextBuilder.ts](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/lib/ai/contextBuilder.ts), add a “Director Intent” block when the latest user message includes `directorIntent`.

**Undo**
- UI shows a small “Director intent applied” banner/pill after generation for the latest user message.
- Undo behavior:
  1) Clear `directorIntent` on that user message
  2) Trigger `regenerateLastAssistantMessage(storyId)` so the assistant reply is regenerated without the time-skip guidance.

**Files**
- Types: [models.ts](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/types/models.ts)
- Detection: new `src/lib/storyText/directorIntent.ts`
- Provider flow: [StoryEngineProvider.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/app/providers/StoryEngineProvider.tsx)
- UI: [StoryWorkspacePage.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/pages/StoryWorkspacePage.tsx) (banner + undo button)
- Prompt packing: [contextBuilder.ts](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/lib/ai/contextBuilder.ts)

**Verification**
- Send “A week later…” and confirm the next AI output reflects elapsed time; press Undo and confirm regenerated output stops applying the skip.

### 9) Temporal awareness upgrade (time skips have consequences)
**Goal:** Time skips cause believable progress in injuries, threads, and relationships.

**Implementation**
- When `directorIntent.timeSkip` exists, add a “Temporal Consequences” instruction block to the narrator prompt:
  - update injuries (healing/worsening)
  - progress investigations/threads
  - shift relationships (trust/comfort/suspicion)
  - reputations/spread of info
  - resource changes (if present)
- This lives in [contextBuilder.ts](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/lib/ai/contextBuilder.ts) adjacent to the “Director Intent” block to keep it tightly scoped to time-skip turns.

**Verification**
- A time skip should naturally advance open threads and adjust relationship metrics after the next index.

### 10) MetaChat (“writer’s room”) — out-of-canon, no contamination
**Storage**
- Add a new store: `storyMetaMessages` keyed by id, indexed by `storyId`.
- New type `StoryMetaMessage`:
  - `{ id, storyId, role: "user" | "assistant" | "system", content, timestamp }`

**UI**
- In Story Settings: add a “MetaChat” button.
- Opens a modal/overlay with:
  - clearly labeled “Out of canon. Does not affect story.”
  - message list + input
  - uses same provider/model as story, but a MetaChat-specific system prompt (analysis/planning).

**Hard contamination rule**
- MetaChat messages are never included in:
  - `sendChatMessage` canon context
  - rebuild/indexing inputs
  - archive PDF transcript

**Files**
- DB: [idb.ts](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/lib/idb.ts) (bump version + store/index)
- Repo: [repository.ts](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/lib/repository.ts) (CRUD + list by storyId)
- Types: [models.ts](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/types/models.ts)
- Provider: [StoryEngineProvider.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/app/providers/StoryEngineProvider.tsx) (hydrate + API methods)
- UI: [StorySettingsDrawer.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/app/layout/StorySettingsDrawer.tsx) + new `MetaChatOverlay.tsx`
- AI: new prompt builder in `src/lib/ai/metaChatContext.ts` (or extend existing playerAssist context patterns)

**Verification**
- Send MetaChat planning messages and confirm canon generation remains unaffected (no MetaChat content appears in story replies or indexes).

### 11) Chapters: detection + timeline markers + chapter summaries
**Storage**
- Add a new store: `storyChapters` keyed by id, indexed by `storyId`.
- Type:
  - `StoryChapter { id, storyId, label, endsAtMessageId, endsAtIndex, createdAt, summary? }`

**Detection**
- On user message submit, detect chapter-end patterns:
  - “End of Chapter I/1/One”
  - “Chapter II End”
  - common variants with punctuation
- Store a chapter record with:
  - best-effort label
  - `endsAtIndex` derived from message order (1-based message number in story)
  - `endsAtMessageId`

**Timeline markers**
- Render a chapter-end marker row in the transcript/timeline when message index == chapter end.
  - Implement in the transcript renderer used by StoryWorkspacePage (e.g., `StoryTranscriptView` / `StoryMessageBubble` path).

**Chapter summaries**
- On chapter creation:
  - Create a chapter summary via a dedicated summarization prompt over the chapter’s message slice (start..end).
  - Store summary on the chapter record.
  - Reuse existing provider/model, with a “chapter summary” system prompt; keep size guardrails (cap transcript excerpt).

**Files**
- DB: [idb.ts](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/lib/idb.ts)
- Repo: [repository.ts](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/lib/repository.ts)
- Types: [models.ts](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/types/models.ts)
- Provider flow: [StoryEngineProvider.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/app/providers/StoryEngineProvider.tsx)
- UI: `StoryTranscriptView`/`StoryMessageBubble` components and Story Settings chapter list section.

**Verification**
- Post “End of Chapter 1” as a user message; confirm:
  - marker appears in timeline
  - a chapter record exists
  - summary is generated and viewable.

### 12) Indexing mode: “After Every Chapter”
**Data model**
- Add per-story indexing mode:
  - `autoIndexMode?: "disabled" | "messages" | "chapter"`
  - Keep `autoIndexInterval?: AutoIndexInterval` for “messages” mode.

**Behavior**
- If mode is `chapter`:
  - When a new chapter record is created, trigger a deep index at that boundary.
  - Ensure this uses the “auto” trigger path so it does not interfere with manual re-index semantics.
- Story Settings UI:
  - “Automatic Indexing” section:
    - Mode dropdown: Disabled / Every N messages / After every chapter
    - If mode is “Every N messages”, show interval dropdown (5/10/15/20)
    - If mode is “After every chapter”, show text: “Next auto index: after next chapter end.”

**Files**
- Types: [models.ts](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/types/models.ts)
- Provider: [StoryEngineProvider.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/app/providers/StoryEngineProvider.tsx)
- UI: [StorySettingsDrawer.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/app/layout/StorySettingsDrawer.tsx), [StoryArchiveView.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/components/story/StoryArchiveView.tsx)

**Verification**
- Set mode to “After every chapter”, end a chapter, confirm auto indexing runs and timestamps/anchors update.

### 13) Versioning and release wiring
**Implementation**
- Bump app version to `1.18.0` and add a changelog entry.
- Android: bump `versionCode` to `11800` and `versionName` to `1.18.0`.

**Files**
- [version.ts](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/app/versioning/version.ts)
- [android/app/build.gradle](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/android/app/build.gradle)
- [package.json](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/package.json)

## Storage / Migration Details
- Bump IndexedDB `DATABASE_VERSION` from 4 → 5 (or 6 if multiple steps are needed) in [idb.ts](file:///c:/Users/evans/Documents/StoryGenRepo/storygenerator/src/lib/idb.ts).
- Add stores:
  - `storyMetaMessages` with index `storyId`
  - `storyChapters` with index `storyId`
- No destructive migration: existing data remains intact; new stores are additive.

## Verification Checklist (DoD-Oriented)
- Export:
  - Archive PDF triggers deep indexing first; error blocks export.
  - Archive PDF section order matches transcript-first spec.
  - Relationship separator remains ASCII-safe.
- Theme:
  - Theme can be changed from Story Settings drawer and persists.
- Archiving:
  - Story can be archived/restored; default views hide archived.
  - Story remains exportable and accessible when archived (with toggle).
- Search:
  - Sidebar search includes stories/universes/characters (grouped).
  - Home search panel includes stories/universes/characters (grouped).
- Sorting/filtering:
  - Stories/universes/characters lists support required sorts/filters.
- Relationships:
  - comfort/suspicion appear in indexes and displays when present.
- Director intent + temporal:
  - Time skip and scene cut phrases detected and affect generation.
  - Undo clears intent and regenerates last assistant reply.
  - Temporal consequences guidance is present for time skips.
- MetaChat:
  - MetaChat thread exists and is clearly labeled out-of-canon.
  - MetaChat content never appears in canon narration or indexes.
- Chapters:
  - Chapter end detection works; marker in timeline; summary stored.
  - Indexing mode “After every chapter” triggers auto deep index at boundaries.
- Build:
  - `npm run build` passes.
  - `npx cap copy android` and Android Studio build succeeds.

## Deliverables (Screens/Video)
- Transcript-first Archive PDF (exported file + screenshot of first pages).
- Story archive toggle in library (Stories page filter + sidebar toggle).
- Search UI + grouped results (Home + sidebar).
- Quick theme switch from story drawer.
- MetaChat overlay.
- Chapter markers in timeline + chapter list section.
- Indexing mode “After every chapter” selector and observed trigger.
- Example outputs (captured text):
  - relationship metrics shifting over time
  - time skip producing believable consequences

