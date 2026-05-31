# Story Formatting Standard Plan (High Priority)

## Summary
Implement a single canonical formatting + validation pass for assistant-generated story text so the transcript always follows a consistent visual grammar:

- **Single-line speaker format only**: `Name: *action* "dialogue"`
- **Actions always italicized** (via `*...*` markers in stored text; markers never shown by the renderer)
- **Dialogue always quoted**
- **Narration separated** and rendered italic
- **Validation + repair** runs before saving and before rendering/exports
- **If speaker labels are missing (ambiguous)**: **regenerate to fix** (no guessing)

## Goal & Success Criteria
Given any model output, the engine guarantees:

1. Every non-narration line begins with `Speaker:`.
2. Any action text is represented as `*...*` (balanced), and never as plain prose within a speaker line.
3. Any dialogue text is represented as `"..."` (balanced) and never unquoted.
4. Mixed action + dialogue stays on the same speaker line: `Speaker: *...* "..."`.
5. No orphaned `*` or mismatched quotes survive to saved transcript, rendering, or exports.
6. Narration stays separate from speaker lines and is rendered italic consistently.

## Current State Analysis (Repo-Grounded)
### Current Formatting Pipeline
- Sanitization entrypoint: [transcriptSanitizer.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/storyText/transcriptSanitizer.ts#L531-L549)
  - Removes user-message echo: `removeEchoBlocks`
  - Removes narrator labels: `stripNarratorHeaders`
  - Removes limited markdown: `stripMarkdownArtifacts`
  - Heuristic action/dialogue normalization: `normalizeThirdPersonActions` + `formatInlineSpeakerText`
  - Strips some `*word*` emphasis: `stripInlineAsteriskEmphasis`
- Block parsing: [parseSceneBlocks.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/storyText/parseSceneBlocks.ts)
- Rendering:
  - Bubble: [StoryMessageBubble.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/components/story/StoryMessageBubble.tsx)
  - Transcript: [StoryTranscriptView.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/components/story/StoryTranscriptView.tsx)
- Exports sanitize assistant text via [storyExport.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/storyExport.ts#L36-L166) and [storyExportPdf.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/storyExportPdf.ts).

### Key Gaps vs Required Standard
- No explicit **validation** stage for quote/asterisk balance and “speaker label always present”.
- `normalizeThirdPersonActions` can improve structure but does not guarantee the full grammar:
  - dialogue may remain unquoted in some flows
  - action text may remain unmarked in some flows
  - missing speaker labels remain ambiguous
- Formatting logic is distributed between sanitizer + exports + renderers; the same content can be handled differently depending on the path.

## Proposed Changes (Decision-Complete)
### 1) Add a Canonical Story Standardizer
**New file:** `src/lib/storyText/storyStandardizer.ts`

Add a pure function that takes assistant text and returns a standardized, validated transcript:

```ts
type StandardizeResult = {
  text: string;
  valid: boolean;
  issues: Array<{ code: string; detail: string; line?: string }>;
};

export function standardizeAssistantStoryText(args: {
  text: string;
  playerName?: string | null;
}): StandardizeResult;
```

**Responsibilities**
- Parse into a sequence of blocks:
  - **Speaker blocks**: start at `Name:` (header-only or inline) or `Name - ...`
  - **Narration blocks**: anything outside speaker blocks
- For **speaker blocks**, enforce:
  - Any non-empty content becomes either:
    - `*action*` (balanced) OR
    - `"dialogue"` (balanced) OR
    - `*action* "dialogue"` (balanced)
  - Convert plain prose inside a speaker block into `*...*` unless it strongly looks like dialogue.
  - Convert dialogue-like unquoted text to `"..."`.
  - Merge consecutive action lines for the same speaker into a single action span where possible.
  - Strip/repair broken markers:
    - remove stray `*` not forming a valid `*...*` span
    - replace any embedded `"` inside dialogue content with `'` before wrapping, so the final quotes are always balanced
- For **narration blocks**, enforce:
  - Narration is serialized as full-line `*...*` so it always renders italic.
- Serialize to **single-line only** per speaker block:
  - `Speaker: *action* "dialogue"`
  - `Speaker: "dialogue"`
  - `Speaker: *action*`
  - Narration stays as standalone `*...*` lines.

**Validation**
- Validate final output:
  - No speaker lines without `Name:` prefix.
  - Every `*` in speaker/narration text is balanced into valid `*...*` spans (no orphan `*`).
  - Every dialogue is wrapped as exactly one `"..."` segment (balanced).
  - No “Narrator:” labels remain.

If validation fails due to **missing speaker labels for dialogue/actions** (ambiguous), return `valid: false` with `issues` that indicate regeneration is required.

### 2) Make Sanitization Call the Standardizer (Single Source of Truth)
**Modify:** [transcriptSanitizer.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/storyText/transcriptSanitizer.ts)

- Keep existing safe cleanup (echo stripping, narrator stripping, markdown stripping, inline `*word*` stripping, whitespace normalization).
- Replace or supersede `normalizeThirdPersonActions(...)` with `standardizeAssistantStoryText(...)` as the final step.
- Return flags indicating whether the result is fully valid or requires regeneration (for use during generation).

### 3) Enforce Standard During Generation (Regenerate on Missing Labels)
**Modify:** [StoryEngineProvider.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/app/providers/StoryEngineProvider.tsx)

After the model response:
1. Run `sanitizeAssistantTranscript(...)` (which calls the standardizer).
2. If formatting is invalid **because of missing speaker labels**:
   - Regenerate with a strict formatting rewrite prompt (no new story content, rewrite only):
     - Every character line must start with `Name:`
     - Actions must be `*...*` only
     - Dialogue must be quoted
     - Narration must be standalone italic (stored as `*...*` lines)
     - No narrator labels
     - Never speak/act for player character
   - Cap attempts (e.g., 2 total tries) to avoid loops.
3. Save the standardized text (per decision: “Save standardized”).

### 4) Keep Rendering Simple (Already Compatible)
**No major renderer rewrite required** because both:
- [StoryMessageBubble.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/components/story/StoryMessageBubble.tsx) and
- [StoryTranscriptView.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/components/story/StoryTranscriptView.tsx)

already render `*...*` as italic without showing the asterisks (via `parseActionSegments`).

Small optional polish (if needed after implementation):
- Increase spacing between narration blocks and speaker lines using existing layout classes (no behavior changes).

### 5) Export Parity (Use Stored Standardized Text)
Exports already sanitize assistant content during export:
- [storyExport.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/storyExport.ts)

After standardization is saved into message content, exports will naturally match UI. Keep export-side sanitization as a safety net, but it should become a no-op for already standardized text.

## Assumptions & Decisions (Locked)
- **UI format:** single-line only (`Name: *action* "dialogue"`).
- **Ambiguous missing speaker labels:** do not guess; regenerate to fix.
- **Persistence:** save standardized text into the message content so memory + exports match what the reader saw.

## Verification Steps
1. Typecheck: `npx tsc --noEmit`
2. Build: `npm run build` (Vercel parity)
3. Manual formatting cases (in-app):
   - Multiline speaker block:
     - `Claire:` + multiple unquoted lines → becomes `Claire: "..."` or `Claire: *...* "..."` depending on content.
   - Unquoted dialogue after action:
     - `Claire: *...* Hello there.` → becomes `Claire: *...* "Hello there."`
   - Speakerless dialogue/actions:
     - `"Hello."` or `*She nods.*` without a preceding `Name:` triggers regeneration instead of silently mislabeling.
   - Narration remains separate and italic:
     - `The room is quiet.` → stored as `*The room is quiet.*`

