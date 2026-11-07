# Story Engine — Create Sequel Feature Spec

## Summary
Implement a first-class `Create Sequel` feature for Story Engine.

This is not a generic story duplication flow and not an endless `Continue Story` mode. A sequel creates a brand-new story with a fresh transcript while inheriting the predecessor's distilled canon state:
- previous events remain canon
- the predecessor becomes read-only
- the sequel starts at message 1
- AI context stays lean by using the predecessor's final summary and indexed `StoryState`, not the full prior transcript

The feature should feel like creating `Season 2` of a show, a sequel novel, or a spin-off that starts with clean pages while preserving continuity.

## Goals
- Create a new story from a prior story's final canon state.
- Keep the new transcript fresh and minimal from message 1.
- Preserve the predecessor as immutable canon.
- Carry forward durable knowledge:
  - current summary
  - indexed character state
  - relationship state
  - world facts
  - unresolved threads
  - durable scene-independent memory
- Expose visible story lineage in the UI.
- Keep AI prompt context compact even for long-running multi-season stories.

## Non-Goals
- Do not merge two transcripts into one endless story.
- Do not copy all previous messages into the sequel transcript.
- Do not delete or overwrite the predecessor story.
- Do not build a fully general branching-timeline editor in v1.
- Do not backfill historical lineage for all old stories automatically beyond safe schema defaults.

## Locked Product Decisions
- Player character behavior: use the predecessor's player character by default, but allow the user to switch to another compatible character in the same universe during sequel creation.
- Predecessor editability: once a sequel is created, the predecessor becomes hard read-only in normal UI.
- Lineage model: allow branching. A story may have multiple sequels/spin-offs. The common single-child case can still render as a simple vertical chain.

## Current State Analysis (Grounded)

### Story creation
- New stories are created in `StoryCreatePage` and routed through `createStory()` in `StoryEngineProvider`.
- `createStory()` currently creates a new `Story`, snapshots the current universe pack, saves it, hydrates the provider cache, and returns the new record.
- Relevant files:
  - `src/pages/StoryCreatePage.tsx`
  - `src/app/providers/StoryEngineProvider.tsx`
  - `src/types/models.ts`

### Persistent canon and indexing
- Story Engine already has the right abstraction for sequel carry-forward: `StoryState`.
- `StoryState` stores JSON in `stateJson`, and `StoryStateData` / `StoryStateDataV2` already represent distilled memory:
  - `worldFacts`
  - `unresolvedThreads`
  - `summaries`
  - `significantMemories`
  - `relationshipState`
  - indexed entities and indexed relationships under `indexes`
- Relevant files:
  - `src/types/models.ts`
  - `src/lib/storyStateV2.ts`
  - `src/lib/archiveIndexing.ts`
  - `src/lib/ai/rebuildMemory.ts`

### AI prompt assembly
- Chat context is already built from structured sources, not just raw transcript.
- `buildStoryChatContext()` currently injects:
  - universe information
  - imported lore
  - story summary
  - long-term memory derived from `StoryState`
  - current scene state
  - recent transcript window
- This is the exact seam where sequel-aware canon inheritance should plug in.
- Relevant file:
  - `src/lib/ai/contextBuilder.ts`

### Export/import support
- Story export already bundles:
  - `story`
  - `universe`
  - `playerCharacter`
  - `messages`
  - `storyState`
  - `chapters`
- The repository already knows how to fetch the final distilled state for a story.
- Relevant files:
  - `src/lib/repository.ts`
  - `src/app/providers/StoryEngineProvider.tsx`
  - `src/types/models.ts`

### Existing story flags
- `Story` already has optional flags like `isArchived`.
- The current model can safely accept additive lineage and read-only metadata.
- Relevant file:
  - `src/types/models.ts`

## Product Definition

### User-facing feature
Add a `Create Sequel` action to a story. When used, Story Engine should:
1. Create a new story with a new UUID.
2. Keep the predecessor story as canon and hard read-only.
3. Seed the sequel with distilled canon from the predecessor's final state.
4. Start the sequel transcript fresh at message 1.
5. Preserve lineage so the user can navigate backward and forward across story seasons/spin-offs.

### User mental model
The sequel should feel like:
- a new season
- a sequel novel
- a TV spin-off

It should not feel like:
- a transcript clone
- a branchless auto-append continuation
- an archive restore

## User Experience Specification

### Entry points
Add `Create Sequel` in the following places:
- story list row/card actions
- story workspace settings/drawer
- optional story detail header area if a dedicated story detail surface exists later

### Sequel creation flow
The sequel action opens a dedicated `Create Sequel` flow, not the generic story create form unchanged.

The form should show:
- predecessor story title
- predecessor universe
- predecessor player character
- predecessor final summary preview
- predecessor lineage preview

Editable inputs:
- sequel title
- player character selector
  - defaults to predecessor's player character
  - limited to characters in the same universe
- optional opening note or sequel setup note
- optional toggle for whether to create an initial seeded system message or keep the transcript completely empty except for `Chapter I.`

Read-only explanatory copy:
- predecessor events remain canon
- predecessor becomes read-only
- sequel starts with a fresh transcript
- Story Engine carries forward distilled canon, not the full transcript

### Success behavior
On successful creation:
- navigate directly to the sequel story workspace
- show lineage UI indicating the predecessor link
- transcript starts at message 1
- if auto-seeding is enabled, the opening should be:
  - `Chapter I.`
- the predecessor should visibly show a read-only / prequel badge afterward

### Predecessor behavior after sequel creation
The predecessor story remains:
- viewable
- exportable
- searchable
- available in lineage navigation

But it becomes:
- non-editable in normal UI
- non-writable for transcript changes
- non-writable for canon-mutating actions

At minimum, block:
- sending new chat messages
- manual message creation
- message editing
- message deletion
- assistant regeneration
- any action that mutates indexed canon or transcript

### Lineage UI
Show a visible chain or branch-aware lineage block on story surfaces.

Minimum display:
- current story
- direct predecessor, if any
- direct sequels, if any

Preferred display:
- a compact lineage panel such as:

`Davies Chronicles`
`  -> Davies Chronicles II`
`     -> Davies Chronicles III`

For branches:
- show sibling sequels under the same predecessor
- allow click-through navigation

## Canon Seeding Model

### Principle
The sequel should inherit the predecessor's distilled canon, not its transcript.

### Canon inputs to carry forward
The sequel seed should be assembled from:
- predecessor `Story.currentSummary`
- predecessor latest `StorySummary` if `currentSummary` is empty
- predecessor `StoryState`
- predecessor indexed relationships
- predecessor world facts
- predecessor unresolved threads
- predecessor significant memories
- predecessor relationship state summaries
- predecessor durable character and location indexes
- predecessor RP state only if explicitly intended to persist

### Canon outputs in the sequel
The sequel should have immediately available starting context equivalent to:
- this story is a direct sequel to `X`
- previous events are canon
- current world state
- current relationship state
- important unresolved threads
- durable facts about characters, places, factions, and circumstances

### What should not be copied
Do not carry forward:
- predecessor messages
- predecessor meta-messages
- predecessor background jobs
- predecessor transient UI state
- predecessor active scene snapshot if it is too transcript-local

### Scene vs long-term memory rule
Carry forward durable canon, not ephemeral scene staging.

Carry forward by default:
- summary
- world facts
- unresolved threads
- indexed entities
- relationship indexes
- significant memories
- durable relationship-state summaries

Do not carry forward by default:
- immediate scene framing like exact camera position, current gesture beats, or half-finished paragraph state
- temporary UI draft state

For `scene` data inside `StoryStateDataV2`:
- only include it in the sequel if explicitly normalized into a sequel-safe "current state" summary
- do not blindly persist raw transient scene blocks as if the new story is resuming mid-sentence

## Data Model Changes

### `Story`
Extend `Story` with additive lineage and lock fields.

Proposed fields:

```ts
interface Story {
  parentStoryId?: EntityId;
  rootStoryId?: EntityId;
  lineageDepth?: number;
  sequelSeedSourceStoryId?: EntityId;
  readOnlyReason?: "sequel_prequel";
  readOnlyLockedAt?: Timestamp;
  sequelSeedSummary?: string;
}
```

Notes:
- `parentStoryId`: direct predecessor link.
- `rootStoryId`: top-most ancestor for quick chain traversal and grouping.
- `lineageDepth`: cached depth for sorting/rendering convenience.
- `sequelSeedSourceStoryId`: explicit record of which story seeded canon.
- `readOnlyReason`: additive lock reason. Keeps the design extensible if other lock modes appear later.
- `readOnlyLockedAt`: audit/debug visibility.
- `sequelSeedSummary`: optional compact description used for quick UI or debugging.

### `StoryDraft`
Extend `StoryDraft` so sequel creation can be routed through existing provider infrastructure.

Proposed additions:

```ts
interface StoryDraft {
  parentStoryId?: EntityId;
  rootStoryId?: EntityId;
  lineageDepth?: number;
  sequelSeedSourceStoryId?: EntityId;
}
```

### New sequel seed data structure
Introduce a structured payload for sequel bootstrap. This can either live inside `StoryState` or be stored directly on `Story` plus an initial `StoryState`.

Recommended new internal type:

```ts
type SequelSeedData = {
  sourceStoryId: EntityId;
  sourceStoryTitle: string;
  rootStoryId: EntityId;
  predecessorSummary: string;
  inheritedStateJson: string;
  createdAt: Timestamp;
}
```

Recommendation:
- do not create a new IndexedDB store in v1 unless necessary
- prefer deriving a fresh sequel `StoryState` at creation time and saving it into the existing `storyStates` store

## Storage and Migration

### IndexedDB migration
No new object store is required for v1 if sequel state is represented through:
- additive fields on `Story`
- a normal `StoryState` record for the sequel

Therefore:
- no `DATABASE_VERSION` bump is required solely for added optional fields stored inside existing story objects
- only bump the DB version if a new store or new indexed query path becomes necessary

### Backward compatibility
Existing stories should remain valid with:
- no lineage fields
- no read-only fields
- no sequel seed metadata

Default assumptions for old stories:
- editable
- standalone roots
- no parent

## Provider and Repository Changes

### Repository additions
Add repository helpers:

```ts
getChildStories(parentStoryId: EntityId): Promise<Story[]>;
createSequelSeedFromStory(sourceStoryId: EntityId): Promise<SequelSeedData | null>;
```

Potentially also:

```ts
listStoriesByRootStoryId(rootStoryId: EntityId): Promise<Story[]>;
```

If no new index is added, root traversal can initially be done in memory from hydrated stories.

### Provider additions
Add a dedicated context action:

```ts
createSequel(input: {
  sourceStoryId: EntityId;
  title: string;
  playerCharacterId: EntityId;
  openingNote?: string;
}): Promise<Story>;
```

This should:
1. load the source story
2. validate sequel eligibility
3. build sequel seed data from final summary + final `StoryState`
4. create the new story with lineage fields
5. save a fresh sequel `StoryState`
6. lock the predecessor as read-only
7. create the opening transcript state for the sequel
8. hydrate provider state

## Sequel Creation Algorithm

### Step 1: Validate source story
Reject sequel creation if:
- source story does not exist
- source story universe is missing
- chosen player character is from a different universe
- source story lacks enough canon state and the feature requires a fallback decision

Fallback rule:
- if `StoryState` is missing, still allow sequel creation using summary-only seed
- if both summary and `StoryState` are missing, still allow creation but show that canon carry-forward will be minimal

### Step 2: Resolve lineage
For source story `S`:
- `parentStoryId` of sequel = `S.id`
- `rootStoryId` of sequel = `S.rootStoryId ?? S.id`
- `lineageDepth` of sequel = `(S.lineageDepth ?? 0) + 1`
- `sequelSeedSourceStoryId` of sequel = `S.id`

### Step 3: Build sequel seed summary
Construct a compact inherited summary:
- use `S.currentSummary.trim()` if present
- otherwise use latest stored story summary
- otherwise synthesize a minimal summary from `StoryState`

Recommended top-level structure:

```text
Story Context

This story is a direct sequel to {sourceTitle}.
Previous events are canon.

Current state:
{summary}

Relationships:
{relationship summary}

Active world state:
{world facts / unresolved threads / durable conditions}
```

This summary is for sequel memory and AI context, not necessarily for the visible transcript.

### Step 4: Normalize inherited story state
Take predecessor `StoryState`, parse it through `safeParseStoryStateData()`, then produce a sequel-safe state:
- keep durable indexes
- keep world facts
- keep unresolved threads
- keep significant memories
- keep relationship state
- keep summaries as inherited base summaries
- drop or rewrite transient scene-local blocks
- stamp updated timestamps to sequel creation time

Recommended helper:

```ts
createSequelStoryState(params: {
  sourceStory: Story;
  sourceState: StoryState | null;
  sourceSummary: string;
  sequelStoryId: EntityId;
  now: Timestamp;
}): StoryState;
```

### Step 5: Create the new story
Create the sequel `Story` with:
- new UUID
- new title
- same universe by default
- selected player character
- inherited universe pack snapshot logic via existing `createStory()` behavior
- lineage metadata
- editable status
- empty transcript history

### Step 6: Lock the predecessor
Update the source story:
- `readOnlyReason = "sequel_prequel"`
- `readOnlyLockedAt = now`

The source remains visible but becomes immutable in standard UI and provider write flows.

### Step 7: Seed transcript start
Recommended v1 behavior:
- create exactly one opening user-visible message: `Chapter I.`

Alternative if a system message is preferred:
- keep structured sequel context only in `StoryState`
- do not add visible context text to transcript

Recommendation:
- do not dump the sequel context into the transcript as a visible block
- store it in `StoryState` and use it in AI context assembly
- keep the visible transcript clean

### Step 8: Save AI configuration
Prefer copying the predecessor's current story AI config into the sequel if one exists.

Reason:
- a sequel should usually preserve the same narrative model/provider defaults

If no per-story AI config exists:
- use current app defaults as existing story creation does

## AI Context Changes

### Sequel-aware prompt behavior
`buildStoryChatContext()` should become lineage-aware through the sequel's inherited `StoryState` and summary.

The prompt should naturally understand:
- this story follows a prior canon story
- predecessor events are already canon
- current state begins from inherited distilled memory

### Do not include predecessor transcript
Do not add predecessor messages to the `recentMessages` window or long-form history.

The entire point of the feature is to avoid transcript bloat.

### Prompt copy recommendation
If needed, add a short system block when a story has `parentStoryId`:

```text
Sequel Continuity

This story is a direct sequel to a prior canon story.
Treat inherited long-term memory, summaries, indexed relationships, and world facts as authoritative prior continuity.
Do not ask to replay or restate all prior events unless the player requests a recap.
Write this story as a new beginning with existing history behind it.
```

### Summary handling
The sequel's `Story.currentSummary` should begin with the inherited sequel seed summary, not an empty string.

This ensures:
- context is available immediately
- the new story does not begin with "No story summary is available yet"

## Read-Only Enforcement

### UI enforcement
When a story is locked as a predecessor:
- disable compose input
- disable regenerate
- disable message edit/delete
- disable any transcript mutation controls
- show a clear banner:
  - `This story is a locked prequel. Create or open a sequel to continue canon.`

### Provider enforcement
Do not rely on UI only. Provider write methods should reject mutation attempts for locked stories.

Guard at minimum:
- `createMessage`
- `updateMessage`
- `deleteMessage`
- `sendChatMessage`
- `editAssistantMessage`
- `regenerateLastAssistantMessage`
- any other canon-mutating methods

Recommended helper:

```ts
assertStoryWritable(story: Story): void
```

This should throw a clear user-facing error for read-only prequels.

## UI Changes (By Surface)

### `StoriesPage`
- add `Create Sequel` action on each story row/card
- add lineage badges:
  - `Root`
  - `Sequel`
  - `Prequel Locked`
- optionally add a small predecessor title subtitle

### `StoryWorkspacePage`
- show lineage panel near header or right sidebar:
  - predecessor link
  - child sequel links
- if current story is locked, replace compose area with read-only banner
- if current story is writable and has a predecessor, show `Direct sequel to {title}`

### `StorySettingsDrawer` or sidebar
- add `Create Sequel`
- if current story is locked, show explanation instead of write actions

### Home and sidebar navigation
- lineage context is useful in compact form:
  - small chain indicator
  - prequel/back navigation

## Suggested File Changes

### Types
- `src/types/models.ts`
  - extend `Story`
  - extend `StoryDraft`
  - add optional `SequelSeedData` type if kept in shared models

### Provider
- `src/app/providers/StoryEngineProvider.tsx`
  - add `createSequel()`
  - add writability guard helper
  - update mutation methods to respect read-only lock
  - optionally copy per-story AI config from source story

### Repository
- `src/lib/repository.ts`
  - add child-story lookup helpers
  - add sequel-seed fetch/assembly helpers if repository owns data collation

### AI context
- `src/lib/ai/contextBuilder.ts`
  - add sequel continuity block if needed
  - ensure inherited summary/state is used immediately

### State helpers
- `src/lib/storyStateV2.ts`
  - add helper to normalize predecessor state into sequel-safe state

### Pages/components
- `src/pages/StoriesPage.tsx`
- `src/pages/StoryWorkspacePage.tsx`
- `src/app/layout/StorySettingsDrawer.tsx`
- `src/components/cards/StoryCard.tsx`
- `src/components/story/StoryListRow.tsx`
- optional new lineage component such as:
  - `src/components/story/StoryLineagePanel.tsx`

## Edge Cases

### Source story has no `StoryState`
Allow sequel creation with summary-only inheritance.

### Source story has no summary and no `StoryState`
Allow sequel creation, but inherited canon is minimal. UI should warn:
- `This story has little or no indexed canon state yet. The sequel will start mostly fresh.`

### Source story already locked
Still allow additional sequels if branching is supported.

### Different player character
Allowed if:
- character belongs to same universe

Useful for spin-offs and ensemble sequels.

### Archived stories
Archived stories should still be valid sequel sources unless explicitly disallowed later.

### Imported or legacy stories
Legacy stories without lineage metadata should still support sequel creation cleanly.

### RP mode
If RP mode is active:
- carry forward only durable RP state that makes narrative sense
- do not blindly continue temporary combat turns or hyper-local tactical state

Open implementation choice:
- whether `rpStats` should carry fully, partially, or through a normalized sequel state adapter

Recommendation for v1:
- carry durable financial, health-condition, and relationship-relevant state only if it represents the character's actual ongoing condition
- clear temporary per-scene pending transactions and temporary prompt scaffolding

## Testing and Verification

### Unit tests
Add focused tests for:
- lineage field calculation
- sequel-safe `StoryState` transformation
- read-only mutation guard behavior
- summary fallback rules

Suggested targets:
- `src/lib/storyStateV2.ts`
- provider-level tests if test harness exists or is introduced

### Manual verification checklist
1. Create a normal story and accumulate transcript + indexed canon.
2. Create a sequel from that story.
3. Confirm the sequel has:
   - new story ID
   - fresh transcript
   - message 1 = `Chapter I.`
   - inherited summary/state available to AI
4. Confirm the predecessor is viewable but non-editable.
5. Confirm lineage links navigate correctly.
6. Confirm the sequel does not include prior transcript messages in the visible chat.
7. Confirm AI responses treat prior events as canon without replaying the whole prior transcript.
8. Confirm branching works when multiple sequels are created from the same predecessor.

## Rollout Plan

### Phase 1: data + provider foundation
- extend `Story` model
- add `createSequel()`
- add read-only guard helper
- add sequel `StoryState` generation helper

### Phase 2: UI entry points and locked-story behavior
- add `Create Sequel` actions
- add locked prequel banner/state
- disable composer and edit actions for locked prequels

### Phase 3: lineage display
- add predecessor/child navigation
- add compact chain/branch UI

### Phase 4: polish
- copy predecessor AI config
- add warnings for weak source canon
- refine inherited RP state rules

## Acceptance Criteria
- User can create a sequel from an existing story with one explicit action.
- New sequel gets a new UUID and fresh transcript.
- Predecessor becomes hard read-only.
- Sequel inherits distilled canon from predecessor summary + `StoryState`.
- AI uses inherited canon without loading the predecessor transcript into the new transcript context window.
- UI exposes predecessor/sequel lineage navigation.
- Multiple sequels from one predecessor are supported.

## Recommended Implementation Notes
- Prefer storing sequel canon in the sequel's own `StoryState` rather than inventing a one-off prompt-only cache.
- Keep the visible transcript clean. The inherited canon should live in state/prompt context, not as a giant opening dump.
- Make read-only enforcement provider-first so it cannot be bypassed accidentally by future UI surfaces.
- Keep lineage additive and optional so legacy stories remain untouched.

## Open Questions For Later
- Title suggestion strategy:
  - auto-suggest `Title II`
  - auto-suggest `Title: Season 2`
  - leave fully manual with a prefilled hint
- Whether to show full tree view for branches or only immediate links in v1 UI.
- Whether sequel creation should optionally run a final deep-index refresh on the source story before seeding canon.

Recommendation:
- if source indexing is stale, offer or automatically run `refreshStoryState(sourceStoryId)` before sequel creation so canon inheritance is based on the latest transcript state.

## Final Recommendation
Implement `Create Sequel` as a canonical story-lineage feature backed by structured inherited memory.

The architectural center of gravity should be:
- predecessor summary
- predecessor `StoryState`
- provider-enforced read-only prequels
- lineage-aware story navigation

This gives Story Engine a much stronger long-form storytelling model than an endless continuation transcript and aligns directly with the project's local-first, distilled-memory architecture.
