# Debug Session: generation-pipeline-audit [OPEN]

## Summary
- Goal: audit Story Engine's end-to-end generation pipeline and fix confirmed regressions in generation, rewrite, validation, formatting, fallback handling, diagnostics, and UI error reporting.
- Constraint: collect runtime evidence before changing business logic.

## Symptoms
- Generation that previously worked reliably now fails, misclassifies outputs, or behaves brittly.
- Failures may involve story generation, additive generation, MetaChat, retries, or provider-specific handling.

## Hypotheses
1. Provider refusal text is reaching rewrite/validation and being mislabeled as a local formatting or validation failure.
2. Rewrite/normalization logic is overfitted to older provider output shapes and breaks currently usable narrative.
3. Validation is too strict for current provider outputs, especially for plain narrative or MetaChat-style responses.
4. Story and MetaChat share brittle formatting/validation paths that should diverge.
5. Error reporting collapses distinct failure stages into generic user-facing failures, masking root cause.

## Planned Evidence
- Map current generation pipeline stages and shared helpers.
- Add structured trace instrumentation with debug server capture.
- Reproduce success/failure cases and compare traces.
- Implement only confirmed minimal fixes.

## Status
- Session opened.

## Progress
- Mapped live story generation, retry, MetaChat, validation, rewrite, provider, and UI error paths.
- Started fallback debug server at `http://127.0.0.1:7777/event` because Python is unavailable in this environment.
- Added first-pass instrumentation to:
  - `src/app/providers/StoryEngineProvider.tsx`
  - `src/lib/ai/geminiProvider.ts`
  - `src/lib/ai/errors.ts`
  - `src/pages/StoryWorkspacePage.tsx`
  - `src/components/story/MetaChatOverlay.tsx`
- Verified the instrumented app still builds with `npx vite build`.

## Current Blocker
- The local browser sandbox has no stories or AI settings, so meaningful end-to-end generation cannot be reproduced here without user data or manual reseeding.
- Awaiting either:
  - user reproduction in their normal workspace with the instrumented build, or
  - a supplied backup/import path to seed the browser environment.

## Evidence Collected
- User-reported Android failure:
  - `kind=validation_error`
  - `stage=validation`
  - `provider=gemini`
  - `model=gemini-2.5-pro`
  - `diagnostic=The model output could not be rewritten into a valid response format.`
- Static contradiction confirmed in `src/app/providers/StoryEngineProvider.tsx`:
  - size-rewrite prompt told the model narration should be `*...*`
  - validator/rewrite prompts require narration **not** be wrapped in `*...*`

## Confirmed Finding
- Hypothesis B confirmed: the rewrite layer contains at least one prompt/validator contradiction that can steer the model toward output the validator later rejects.

## Fix Applied
- Aligned the size-rewrite narration rule with the validator in both story-send and regenerate flows.
- Upgraded terminal validation failures to preserve rewrite-stage diagnostics and the last candidate preview instead of only surfacing the generic validation error.
- Rebuilt the app and copied the updated bundle into Android.
