# Plan: Speaker Turn Cohesion

## Summary
Fix a formatting/reading regression where one character’s “turn” is split into multiple speaker blocks when actions and dialogue are interleaved. Enforce this rule:

- Once a speaker begins a turn, subsequent actions and dialogue that belong to that speaker remain attached to that turn until another speaker begins, a scene break occurs, or an intentional narration block interrupts.

Scope decision (confirmed): apply to **UI + exports**.
Attribution decision (confirmed): unlabeled mid-turn lines attach to the **current speaker by default**.

## Current State Analysis (Repo-Grounded)
### Root cause 1: Standardizer collapses ordering
- The canonical formatting pass runs through [sanitizeAssistantTranscript](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/storyText/transcriptSanitizer.ts) → [standardizeAssistantStoryText](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/storyText/storyStandardizer.ts#L296-L579).
- In [storyStandardizer.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/storyText/storyStandardizer.ts#L369-L383), `flushSpeaker()` merges **all** action fragments into one `*...*` and **all** dialogue fragments into one `"..."`.
  - This loses interleaving order (e.g., `"First speech."` → `*Action*` → `"Second speech."` cannot be represented).

### Root cause 2: Parser/rendering encourages “one-line per speaker”
- [parseSceneBlocks.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/storyText/parseSceneBlocks.ts#L57-L78) currently treats inline `Name: ...` lines as standalone blocks, which increases turn fragmentation.
- Rendering collapses speaker-block newlines into a single line:
  - [StoryMessageBubble.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/components/story/StoryMessageBubble.tsx#L167-L176) (`renderInlineSpeakerLine`)
  - [StoryTranscriptView.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/components/story/StoryTranscriptView.tsx#L121-L139) (`renderInlineContent(lines.join(" "))`)

### Exports depend on parsed blocks
- Markdown export uses `parseSceneBlocks(sanitized)` and then formats blocks: [storyExport.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/storyExport.ts#L85-L121)
- PDF export also uses `parseSceneBlocks(sanitized)` and iterates per-line: [storyExportPdf.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/storyExportPdf.ts#L156-L192)

## Proposed Changes (Decision-Complete)
### 1) Preserve interleaving inside a speaker turn (formatter)
**File:** `src/lib/storyText/storyStandardizer.ts`

**Change:** Replace the “merge all actions + merge all dialogue” approach with an ordered representation:
- Track `currentSpeaker` + `speakerLines: string[]` instead of `actionParts/dialogueParts`.
- Each parsed fragment becomes one of:
  - Action line: `*...*`
  - Dialogue line: `"..."` (ensured quoted)
  - Blank line: `""` (kept for readability)
- When the source line contains both action + dialogue (e.g. `*He winces.* "Fine."`), split into two lines to preserve order.
- Apply “consecutive actions” consolidation (Rule 7): consecutive action lines for the same speaker are merged into a single `*...*` line.

**Output shape (canonical):**
```
Yaphit:
"First speech."
*Action.*
"Second speech."
```

**Validation updates:**
- Speaker header-only lines (`Name:` with no trailing content) are valid.
- Lines inside a speaker block must be either:
  - Full action line `*...*` with balanced markers, or
  - Full dialogue line `"..."` with balanced quotes, or
  - Blank line
- Narration lines (no current speaker) must:
  - Contain no `*` and no `"` (narration italics are a rendering concern, not marker-based storage).

### 2) Turn cohesion in scene block parsing
**File:** `src/lib/storyText/parseSceneBlocks.ts`

**Change:** When a speaker is active:
- Repeated `Name:` headers for the same `Name` do **not** start a new block; they are treated as continuation.
- Inline `Name: ...` lines:
  - Start the block if no current speaker
  - Continue the same block if `Name` matches current speaker
  - Switch blocks only when `Name` changes
- Unlabeled lines inside an active speaker block stay attached (per decision: attach by default).

**Scene breaks:**
- Treat a line that is exactly `---` (or `***`) as an explicit scene break:
  - Flush current speaker block and start narration after it.

### 3) Render speaker blocks as multi-line turns
**Files:**
- `src/components/story/StoryMessageBubble.tsx`
- `src/components/story/StoryTranscriptView.tsx`

**Change:** For speaker blocks:
- Render the speaker label once (accent + bold).
- Render the block body with newline preservation (use the existing `renderTextLines(...)` logic instead of collapsing to a single line).
- Action styling continues to come from `parseActionSegments` (no visible markers).

Narration continues to render italic via `forceItalic: true` (as currently implemented).

### 4) Export parity (Markdown)
**File:** `src/lib/storyExport.ts`

**Change:** Output speaker turns in the same “block” form:
```
Yaphit:
"First speech."
*Action.*
"Second speech."
```

For narration blocks:
- Wrap narration lines in markdown italics during export (`*...*`) without relying on narration being stored as `*...*`.

PDF export already iterates per-line and will automatically benefit from the block structure.

## Verification
1. `npx tsc --noEmit`
2. `npm run build`
3. Manual test cases:
   - Interleaving:
     - Input/AI output leading to: `Yaphit:` `"First"` `*Action*` `"Second"` must render as one cohesive turn with no repeated Yaphit label.
   - Continuation:
     - `Yaphit: "First"` then later `Yaphit: "Second"` with only blank lines between must stay one block.
   - Export:
     - Markdown export preserves the same turn cohesion and line breaks.

