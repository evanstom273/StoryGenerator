# Plan: Scene-State Duplication + Narration Misclassified as Actions

## Summary
Fix two formatting regressions that reduce immersion:

1. **Scene-state duplication** (assistant re-narrates the player’s just-established facts before continuing).
2. **Narration misclassified as actions** (narration/exposition stored as `*...*`, which implies “action semantics” and can be interpreted as an action by later prompts).

Key decisions (confirmed):
- **Narration should render italic**, but **italics must not require `*...*` markers in stored story text**.
- **Scene-state duplication should be fixed via silent rewrite in the background** (no player-facing error).

## Current State Analysis (Repo-Grounded)
### Where the behavior comes from
- Canonical transcript shaping currently happens in:
  - [transcriptSanitizer.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/storyText/transcriptSanitizer.ts#L531-L552) → calls the standardizer and returns `formatValid/formatIssues`.
  - [storyStandardizer.ts](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/storyText/storyStandardizer.ts#L296-L416)
    - `pushNarration` currently serializes narration as `*...*` (via `wrapAction`) which treats narration as “action-marked text” (even if visually hidden later).
  - Rendering forces narration italic regardless:
    - Transcript: [StoryTranscriptView.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/components/story/StoryTranscriptView.tsx#L121-L139)
    - Bubble: [StoryMessageBubble.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/components/story/StoryMessageBubble.tsx#L217-L225)
- Generation already has a background rewrite loop for formatting + ownership:
  - [StoryEngineProvider.tsx](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/app/providers/StoryEngineProvider.tsx#L930-L1110)

### Why narration-as-`*...*` is a problem
- The system prompt explicitly treats `*...*` as actions (react to it as an action), so storing narration as `*...*` risks downstream “action semantics” and misclassification.
- Even if the UI hides literal `*`, the semantic layer sees it.

### Why scene-state duplication happens
- The model often “re-establishes” the moment (arrival/chaos/reveal) even though the player already wrote those facts.
- The current sanitizer removes exact/near-exact echoes of the user message ([removeEchoBlocks](file:///c:/Users/evans/Documents/StoryGenRepo/StoryGenerator/src/lib/storyText/transcriptSanitizer.ts#L478-L520)), but does not detect paraphrased “player event re-narration”.

## Proposed Changes (Decision-Complete)
### 1) Decouple narration italics from `*...*` markers
**Goal:** narration remains italic in UI/PDF, but stored text uses **plain prose lines** for narration; `*...*` reserved for character actions only.

**Files**
- Modify: `src/lib/storyText/storyStandardizer.ts`
  - Change `pushNarration` to output plain narration lines (no `wrapAction`).
  - Update validation rules:
    - Narration lines must **not** contain stray `*` or stray `"`.
    - Narration lines are allowed to be plain text (no longer required to be `*...*`).
  - Keep speaker-line grammar unchanged:
    - `Name: *action* "dialogue"` (single line)
    - `Name: *action*`
    - `Name: "dialogue"`
  - Ensure action markers are only emitted on speaker lines, never on narration.

- Modify: `src/components/story/StoryTranscriptView.tsx`
  - Keep narration rendering italic **without relying on `*...*` markers**:
    - Narration blocks: render with `forceItalic: true` (already does).
    - Speaker blocks: italics only for action segments from `parseActionSegments` (already does).

- Modify: `src/components/story/StoryMessageBubble.tsx`
  - Same: narration stays italic via `forceItalic`, actions italic via segments.

- Modify exports for parity:
  - `src/lib/storyExport.ts`
    - Markdown: still italicize narration (via markdown `*...*`) but do not rely on narration being stored as `*...*`.
    - TXT: no literal `*` should appear.
  - `src/lib/storyExportPdf.ts`
    - Italicize narration lines (as it does today), but treat narration as plain lines (no need to parse `*...*` to decide narration italics).

### 2) Add a scene-state duplication detector (paraphrase-aware heuristic)
**Goal:** detect when the assistant re-narrates the player’s just-established facts (arrival/scene state reveal) at the top of the response.

**New helper (in transcript layer):**
- Add `detectSceneStateRenarration({ latestUserMessage, assistantText })` in `src/lib/storyText/transcriptSanitizer.ts` or a small new file under `src/lib/storyText/`.

**Heuristic algorithm (no embeddings):**
- Extract assistant “lead-in” window:
  - Take the first 1–3 non-empty narration lines and first 0–1 speaker lines.
  - Stop at the first blank-line boundary or after ~450 chars.
- Normalize both texts:
  - Lowercase; remove punctuation; collapse whitespace.
  - Remove speaker labels (`Name:`), quotes, and action markers.
- Compute overlap:
  - Token set overlap ratio and bigram overlap ratio.
  - Collect named entities (capitalized words in original) intersection.
- Trigger if:
  - Overlap is high (e.g. token overlap ≥ 0.55 OR bigram overlap ≥ 0.35), AND
  - The assistant lead-in contains a “re-establishing” cue (e.g. `a few minutes later`, `suddenly`, `the situation is`, `it is immediately apparent`, `as X arrives`), OR intersects strongly on named entities + key verbs.

**Output:**
- `{ triggered: boolean; snippet: string; reason: string }` for console logging.

### 3) Silent rewrite loop to remove scene-state duplication
**Goal:** if the detector triggers, silently rewrite the assistant output to remove re-narration and continue from the current moment.

**File**
- Modify: `src/app/providers/StoryEngineProvider.tsx`

**Integration**
- Inside the existing background loop (already up to N attempts), after:
  - `sanitizeAssistantTranscript(...)` passes formatting validation, and
  - ownership validation passes,
  - run `detectSceneStateRenarration(...)`.
- If triggered:
  - Call provider rewrite with a strict “continue from current moment” prompt, including:
    - The latest player message (as canon scene-state)
    - Instruction: “Do not restate the player’s events; begin at the consequence boundary.”
    - Keep formatting grammar rules (Name/action/dialogue) and mystery/info ownership rules.
  - Re-sanitize and re-check.
- Never show the player a “rewrite happened” notice (background only); only surface a generic failure if attempts are exhausted.

### 4) Strengthen prompt guidance to reduce re-narration in the first place
**File**
- Modify: `src/lib/ai/contextBuilder.ts`

**Add explicit instruction**
- “Treat the player’s latest message as canon scene state that already happened; do not re-describe it; continue from the next beat.”

Also add same line into the formatting/ownership rewrite prompts in `StoryEngineProvider.tsx` to prevent re-narration after rewrite passes.

## Assumptions & Decisions
- Narration is italic in UI/PDF, but not stored with `*...*` markers.
- `*...*` semantics are reserved for character actions only.
- Scene-state duplication is fixed via silent background rewrite (no user-facing notice).
- Heuristic detection is intentionally conservative to avoid deleting/rewriting legitimate “new” narration.

## Verification
1. Typecheck: `npx tsc --noEmit`
2. Build: `npm run build`
3. Manual scenarios:
   - Player: “A few minutes later Claire arrives… It’s chaos… It’s Yaphit.”
     - Assistant must start at consequence boundary (Claire reacting / NPC reactions) without re-stating arrival/chaos/Yaphit reveal.
   - Narration/exposition lines must render italic but not be stored/treated as `*...*` actions.
   - Character actions remain `*...*` within speaker lines; dialogue remains quoted.

