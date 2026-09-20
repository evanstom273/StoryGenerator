# Story Engine v3.4.0 Audit Report

## Transcript message state and protagonist pronoun drift

Audit date: 13 September 2026  
Repository: StoryGenerator  
Audited revision: 0e5c7ab  
Package version: 3.4.0

## 1. Executive summary

Two mechanisms are confirmed.

First, Edit Last AI Message saves the text in the textarea to the persisted StoryMessage.content field. Transcript view and Bubble view then run that field through semantic display repair before rendering. The editor therefore shows stored source text while rendered views can show transformed text. The problem is not a separately persisted displayContent field or a stale parser tree: repair is performed dynamically at render time.

Second, the effective-pronoun resolver gives story-state and transcript inference precedence over the configured PlayerCharacter pronouns. Jamie's profile can correctly say he/him while prompts and transcript repair use she/her inferred from derived state, Director notes, or assistant prose.

The RP Character Sheet's Current Situation is a separate AI-derived field, saved as rpStats.characterState. Its extractor receives the generated scene and partial context but no explicit canonical protagonist identity/pronoun contract. Archive's summaries.currentSituation is another, distinct field produced by story-state extraction. Both can preserve or repeat erroneous references.

The supplied examples fit these code paths, but the first bad stored value in Jamie's particular story cannot be proven without inspecting that story's state and generation records. Normal generation and indexing load the protagonist by stable IDs, so cross-story contamination is not established. A cleanup routine does merge some same-name characters within a universe and is a separate risk.

No application code, tests, commits, or stored story data were changed during the audit. At audit time the working tree was clean at 0e5c7ab. Selected tests could not be run because Vitest was unavailable in the existing node_modules installation.

Confidence labels:

- CONFIRMED: directly demonstrated by code or an existing test.
- HIGH-CONFIDENCE HYPOTHESIS: the code permits the failure and the reported symptoms fit, but affected story data was not inspected.
- POSSIBLE / NEEDS RUNTIME VERIFICATION: static inspection cannot prove that it occurred in the affected story.

## 2. Transcript and edit bug

### Data model and source of truth

StoryMessage has one persisted content string plus metadata such as speaker attribution, editedAt, regeneratedAt, and revision. There is no separate rawContent, displayContent, or stored parser tree in this path. The persisted content field is the intended canonical message body.

Evidence: src/types/models.ts: approximately 280-343; src/lib/storyText/assistantMessagePersistence.ts:3-27.

### Edit, save, persistence, and rerender

Opening Edit Last AI Message sets the editor's message to latestAssistantMessage and initializes the textarea from latestAssistantMessage.content. Save passes the message ID and textarea text to editAssistantMessage. The provider reloads the stored message by ID, constructs a replacement object with content set to content.trim(), clears speakerAttribution, updates editedAt, increments revision, saves it, touches the story, and hydrates application state.

There is no parent message body that remains unchanged and no separate parsed transcript record for the edit handler to forget. The saved StoryMessage.content is updated under the same ID.

Evidence: src/pages/StoryWorkspacePage.tsx:1187-1235 and 1592-1615; src/app/providers/StoryEngineProvider.tsx:6878-6901; src/lib/storyText/assistantMessagePersistence.ts:3-15.

### Rendered transcript versus saved content

Transcript view calls sanitizeMessageForDisplay on assistant messages and then passes the returned string to parseSceneBlocks. Bubble view calls the same sanitizer. The sanitizer runs repairAssistantTranscript with current player identity, aliases, character-gender hints, and the latest user message. It can normalize speaker blocks, action beats, and pronouns. The editor shows the saved content directly and does not apply this transformation.

Consequently, the textarea can contain exactly what was saved while Transcript view and Bubble view display different wording. Copy behavior is also separate from the sanitized render path, so copied text can differ from visible text.

Evidence: src/components/story/StoryTranscriptView.tsx:469-485; src/components/story/StoryMessageBubble.tsx:221-237; src/lib/storyText/transcriptSanitizer.ts:1058-1096.

**CONFIRMED root cause:** display-time semantic repair is applied after save and is not bypassed for manually edited messages. Saving text does not guarantee that the same text is rendered.

Parsing is dynamic. No stale AST or cached speaker-block object was identified as the primary cause. The provider hydrates after saving. Reload restores the persisted content and the renderers run repair again. A different rendered result after reload would require changed sanitizer inputs or another story-state change; the code path does not persist a separate rendered string.

### Response variants and regenerate

VariantCandidate and VariantSession are React state in StoryWorkspacePage, not durable variants on StoryMessage. Regeneration snapshots the current content as the first candidate, generates a new response, saves the new content to the same message record, and adds it to the in-memory candidate list. Previous/Next selection optimistically changes selectedIndex and then writes the chosen candidate's content and speakerAttribution into that same persisted message.

The selected candidate becomes canonical message content after a successful write. Other candidates are transient and disappear on reload or after a new user turn. Editing clears the variant session. Candidate selection increments revision but preserves editedAt; regeneration spreads the previous record and updates regeneratedAt without clearing editedAt. Therefore editedAt alone cannot establish that the current content is still the manual edit.

There is a narrow possible race: selectedIndex changes before the candidate write finishes, and edit availability is not consistently gated by isSwitchingVariant. This can make the transient selection disagree briefly with the persisted content if a switch is pending or fails.

Evidence: src/pages/StoryWorkspacePage.tsx:383-395, 1025-1079, 1112-1137, variant controls around 1872-1912; src/lib/storyText/assistantMessagePersistence.ts:17-27; src/app/providers/StoryEngineProvider.tsx:7400-7418.

### Indexing and reload

Editing calls save, touch, and hydrate, but does not trigger a deep reindex. Archive freshness compares indexed message count to current message count. An edit that leaves message count unchanged can therefore remain marked fresh, and incremental indexing uses message-count cursors that can skip the edited record.

Evidence: src/app/providers/StoryEngineProvider.tsx:6878-6901; src/lib/archiveIndexing.ts:18-23 and 72-130; src/lib/ai/rebuildMemory.ts:201-229.

### Reproduction

1. Open a story and generate an assistant reply with multiple speaker blocks or action beats.
2. Open Edit Last AI Message and record the message ID, content, revision, and editedAt.
3. Change a distinctive phrase and save.
4. Read the stored StoryMessage.content for the same ID. It should equal the trimmed textarea text.
5. Compare it with Transcript view, Bubble view, copied text, and the output of sanitizeMessageForDisplay followed by parseSceneBlocks.
6. Reload and repeat. The stored text should persist; display repair will run again.
7. Regenerate to create candidates, select Previous and Next, then reload. Record the candidate list, selected index, persisted content, attribution, revision, and timestamps.
8. Edit a message without changing transcript count and inspect Archive index status. Count-only freshness may not mark it stale.

## 3. Pronoun and identity drift bug

### Canonical source and effective identity

The profile reads a PlayerCharacter record. Normal generation and indexing load the protagonist using story.playerCharacterId. However, generation and rendering often use an EffectivePlayerIdentity computed from profile data plus story-state and transcript text.

resolveEffectivePlayerPronouns uses this precedence:

1. Pronouns in the story-state character entry.
2. Identity detected from messages.
3. Pronouns inferred from Director notes.
4. Pronouns inferred from assistant messages.
5. PlayerCharacter.pronouns as the fallback.

An existing unit test explicitly asserts that story-state she/her overrides character-sheet he/him.

Evidence: src/lib/playerCharacterPrompt.ts:303-352; src/lib/__tests__/playerCharacterPrompt.test.ts:147-172; src/app/providers/StoryEngineProvider.tsx:6943-6950; src/lib/ai/rebuildMemory.ts:141-150.

**CONFIRMED root cause:** explicit profile pronouns are not the highest authority. Derived story state or heuristic transcript inference can replace them without a structured, confirmed protagonist identity transition.

### How incorrect pronouns can enter

Three heuristics can create a false transition:

- detectEstablishedPlayerIdentityFromMessages scans message text for explicit pronoun strings and daughter language without proving the text describes the protagonist. It scans all roles.
- inferPlayerPronounsFromDirectorNotes searches Director messages globally for gendered tokens without binding them to Jamie.
- inferPlayerPronounsFromMessages scans up to the latest 20 assistant messages. If Jamie's legal or scene name appears anywhere in a message, it counts feminine and masculine pronouns across the entire message. It does not bind pronouns to the matching speaker or grammatical subject.

Thus Rosa's she/her references, or phrases such as daughter and her mother, can contribute evidence about Jamie when the same assistant response names Jamie. The supplied response also mixes female references with a later male relationship phrase, so the result depends on the complete recent transcript and any story-state entry.

Evidence: src/lib/storyText/playerSceneName.ts:163-234, 236-265, 272-320.

**HIGH-CONFIDENCE HYPOTHESIS:** the supplied assistant response can trigger a false female inference because the heuristic scores whole messages rather than subject-bound references. The effective value for the affected story depends on all recent messages and stored story state.

### Current Situation and other derived state

The RP Character Sheet's Current Situation is rendered from rpStats.characterState. After a scene, extractRpStatChanges receives the generated assistant text, stats/configuration, and partial context: player background, universe lore, latest player message, and pending transaction. It does not receive a distinct canonical identity/pronoun object. Its returned characterStateSummary is saved to rpStats.characterState and displayed by RPCharacterSheetOverlay.

This is a direct path by which the displayed sentence can say “her mother” while the profile fields remain Jamie's configured he/him values.

Evidence: src/app/providers/StoryEngineProvider.tsx:9334-9351 and 9459-9462; src/lib/ai/rpStatsExtractor.ts:80-129; src/components/story/RPCharacterSheetOverlay.tsx:522-529.

Archive's summaries.currentSituation is separate. The story-state extractor formats that field into long-term memory. Its prompt includes the Player Character Sheet but says it is the starting identity and that the transcript may override it. It resolves effective identity before formatting the sheet. Existing story state is also preferred during extraction, so a mistaken pronoun can be repeated.

Evidence: src/lib/ai/storyStateExtractor.ts:72-99, 234-255, 554-575; src/lib/ai/rebuildMemory.ts:318-326.

### Prompt flow and precedence

| Operation | Identity and context path | Risk |
|---|---|---|
| Normal turn, Continue, Director, Author | Loads the story's protagonist, resolves effective identity, and calls the shared story context builder. Context includes identity, summaries, long-term memory, current scene state, RP sheet, guidance, and recent messages. | False inferred identity can be embedded in guidance while conflicting summaries and transcript are also included. |
| Regenerate | Loads story.playerCharacterId and story state, resolves identity from recent messages, and rebuilds context through the story chat context builder. | Same precedence problem as normal generation. |
| Response variants | Regeneration produces candidates; selecting one writes its content into the base message. | Selected prose can become new transcript evidence for later inference and indexing. |
| Deep index / Archive | rebuildMemory loads story, protagonist, state, and messages by stable IDs. Extraction receives a resolved Player Character Sheet, state snapshot, and current message chunk. | The prompt permits transcript override and favors existing state; false pronouns can be stored or repeated. |
| RP Character Sheet Current Situation | Separate extractor receives generated text plus stats and partial context, then persists characterStateSummary. | No explicit canonical identity contract is passed. |
| Story/chapter summaries | Summarization uses transcript and often prior summary/state. | Incorrect transcript or prior summary may be repeated. |
| Sequel creation | Seeds sequel summary and state from the source story, including source currentSituation when needed. | Poisoned summary/state can carry into the sequel. |

The story context places Universe Information, imported lore, Story Summary, Long-Term Memory, Current Scene State, author/director context, RP Character Sheet, and Scene Direction before recent chat history. Scene guidance says not to infer different pronouns from name or gender, but also says transcript and Long-Term Memory can establish an in-story pronoun change and that the sheet is only the starting identity. Since the resolver may already have accepted a false transition, this wording does not establish a reliable authority order.

Evidence: src/lib/ai/contextBuilder.ts:247-302, 447-471, 655-718; src/lib/ai/storyStateExtractor.ts:91-97 and 234-255.

### Self-reinforcing failure path

A plausible path is:

1. Assistant prose contains she/her references.
2. The resolver infers she/her from broad message text, or a story-state entry already contains she/her.
3. The resolved value is supplied to story prompts and transcript repair.
4. RP extraction stores a female-pronoun Current Situation in rpStats.characterState.
5. Deep indexing stores or repeats the language in summaries, character entries, or relationships.
6. Later prompts include those derived fields and the recent transcript.
7. Sequel creation can copy source summaries and state.

Code confirms these paths are possible. It does not establish which one first occurred in the affected story. The earliest possible source for the Character Sheet sentence is the RP extractor response; the earliest possible source for Archive Current Situation is story-state extraction. Effective identity can become wrong even earlier through transcript inference.

### Story and character ID checks

Normal generation and indexing load characters by stable playerCharacterId and story state by storyId. Cross-story contamination through ordinary loading was not found. The story-state character map is name-keyed inside a story-scoped state record.

One separate risk exists in cleanupDuplicatePlayerCharacters: it groups by universeId plus normalized character name, merges library and story-scoped records, and rewires stories to the winning character ID. Distinct same-name characters in one universe could be merged if this cleanup runs. No evidence connects that routine to the reported Jamie issue.

Evidence: src/lib/ai/rebuildMemory.ts:141-150 and 193-198; src/app/providers/StoryEngineProvider.tsx:6167-6231.

### Director time skip

The UI formats the time-skip label from Director intent. The inspected structured intent helper applies scene participation overrides and does not replace assistant transcript content. Time skip updates story-time/RP state, but no direct transcript rewrite path was found. It is not a confirmed cause.

Evidence: src/pages/StoryWorkspacePage.tsx:1140-1162; src/app/providers/StoryEngineProvider.tsx:8704-8723; src/lib/sceneParticipation/capabilityOverrides.ts:315-340.

### Pronoun reproduction

1. Create a protagonist with Gender Male and Pronouns He/him.
2. Create a story and include a supporting character with different pronouns, such as Jamie's mother Rosa.
3. Generate assistant messages mentioning both Jamie and Rosa, including Rosa's pronouns and relationship terms.
4. Inspect resolveEffectivePlayerIdentity before and after each message. Record the source that supplies the effective pronouns and the exact messages contributing evidence.
5. Run RP extraction and inspect its request inputs and returned characterStateSummary.
6. Run deep indexing and inspect existing state, formatted identity, returned characters, and summaries.currentSituation.
7. Generate another turn and compare canonical sheet fields, effective identity, summaries, RP sheet, and transcript.
8. If a wrong state appears, compare stored storyId, playerCharacterId, state record ID, and request trace to exclude cross-story selection.

## 4. Shared causes

There is no single immediate function causing both defects. Transcript divergence is caused by render-time repair after persistence. Pronoun drift is caused by derived identity precedence and unscoped inference. The shared architectural weakness is that persisted user-authored content and profile facts coexist with multiple AI-derived projections, but those projections lack explicit provenance, authority, and invalidation rules.

An edited message is not reindexed automatically. A stale archive can therefore coexist with newly edited content. Incorrect summaries can then be fed back into later prompts. This connects the two issues operationally without making them the same bug.

## 5. Other dangerous patterns

- Archive freshness is based on message count, not content revision/hash. Same-count edits may be treated as current.
- Incremental deep indexing uses message-count cursors and may skip edited messages.
- editedAt survives candidate selection and regeneration, so it is not a reliable marker of the current content's provenance.
- Sequel creation copies or composes from source summary and story state.
- cleanupDuplicatePlayerCharacters merges same-name records within a universe and can rewire stories.
- Existing generation identity diagnostics log profile and effective identity but do not identify the exact message/span that caused a pronoun override.

## 6. Test coverage and missing regression tests

Existing coverage:

- assistantMessagePersistence tests check helper output, content replacement, attribution, editedAt, and revision. They do not test provider persistence, UI rendering, reload, or indexing.
- transcript repair tests verify display transformations. They do not assert that manually edited content renders unchanged.
- playerCharacterPrompt and playerSceneName tests exercise inference. A current test explicitly expects story-state she/her to override sheet he/him.
- archiveIndexing tests cover count-based freshness and indexing gaps, not same-count edits.
- No focused RP extractor test was found for Current Situation identity consistency.

Missing regression coverage:

1. Save, reload, and render equality for a manually edited assistant message.
2. Transcript and Bubble view agreement with canonical content and parsed segments.
3. Regenerate, Previous/Next selection, edit, reload, and selected-variant consistency.
4. Same-count content edits invalidating Archive state and being reindexed.
5. Canonical he/him surviving unrelated female references to Rosa and unscoped Director wording.
6. RP Current Situation extraction for a male protagonist with a mother in the scene.
7. Prompt contract tests for normal, Continue, Director, Author, regenerate, indexing, summary, and sequel paths.
8. Repair tests proving derived state cannot silently override a canonical profile without an explicit player identity transition.

Test files inspected: src/lib/storyText/__tests__/assistantMessagePersistence.test.ts; src/lib/storyText/__tests__/transcriptRepairPipeline.test.ts; src/lib/__tests__/playerCharacterPrompt.test.ts; src/lib/__tests__/playerSceneName.test.ts; src/lib/__tests__/archiveIndexing.test.ts. Vitest was unavailable in the existing node_modules installation, so the tests were not run.

## 7. Recommended fix plan

Smallest safe fixes first:

1. Make display rendering lossless for persisted assistant content. Keep semantic repair in generation validation before save; parse the canonical saved string without rewriting it. If historical repair is still needed, make it an explicit operation that writes a reviewed result into StoryMessage.content.
2. Make explicit PlayerCharacter pronouns authoritative by default. Do not infer protagonist identity transitions from assistant prose, unrelated NPC pronouns, or unscoped Director notes. Only an explicit, protagonist-bound, player-authorized transition should override the profile, with evidence source recorded.
3. Pass canonical identity explicitly to RP Current Situation, summary, and indexing calls. Validate identity claims in returned state before persistence.
4. Add message content revision/hash invalidation to Archive indexes. Saving an edit or selected candidate must mark affected derived state stale or trigger targeted reindexing.
5. Define variant durability explicitly. Either persist variants with stable IDs and selectedVariantId, or treat alternatives as transient and ensure the UI updates selection only after the canonical message write succeeds.

Data repair and migration:

- No migration is needed to make display lossless if StoryMessage.content remains canonical.
- If adding provenance or content revision fields, older records need safe defaults. Do not treat old editedAt as proof the current bytes are still the manual edit after regeneration.
- Existing bad values in story-state pronouns, rpStats.characterState, summaries.currentSituation, currentSummary, relationship summaries, and sequel seeds will remain until repaired or regenerated.
- Any repair should be scoped by story ID, preserve the user's transcript, use corrected precedence, and show before/after derived values for review. Do not mass-edit transcript prose.

Runtime instrumentation to prove the affected story's first bad value:

- At edit open/save and persistence: log storyId, messageId, revision, textarea hash, saved content hash, editedAt, and regeneratedAt. Hashes must match after trim.
- At both render boundaries: log messageId, raw and sanitized content hashes, effective pronouns/source, revision, and editedAt. A hash mismatch proves display rewriting.
- In resolveEffectivePlayerPronouns: log playerCharacterId, canonical pronouns, story-state pronouns, effective pronouns, inference source, matching message IDs, and matched evidence spans.
- At RP extraction: log storyId, playerCharacterId, input message IDs, supplied identity, returned characterStateSummary, and saved RP state revision.
- At deep indexing: log storyId, playerCharacterId, chunk IDs/content hashes, prior and returned pronouns/currentSituation, identity formatting, and index cursor.
- At variant selection: log messageId, candidate ID, old/new selected index, content hash, and write completion/result.

An existing pre-generation audit hook is in src/app/providers/StoryEngineProvider.tsx:1652-1683. It records an identity snapshot and prompt fragment; add provenance evidence there rather than logging entire transcripts.

## 8. Exact files for a later implementation pass

Transcript source-of-truth and display:

- src/lib/storyText/transcriptSanitizer.ts
- src/components/story/StoryTranscriptView.tsx
- src/components/story/StoryMessageBubble.tsx
- src/lib/storyText/assistantMessagePersistence.ts
- src/pages/StoryWorkspacePage.tsx
- src/app/providers/StoryEngineProvider.tsx
- src/types/models.ts

Pronoun authority and context:

- src/lib/playerCharacterPrompt.ts
- src/lib/storyText/playerSceneName.ts
- src/lib/ai/contextBuilder.ts
- src/app/providers/StoryEngineProvider.tsx

RP Current Situation, indexing, and Archive:

- src/lib/ai/rpStatsExtractor.ts
- src/lib/ai/storyStateExtractor.ts
- src/lib/ai/rebuildMemory.ts
- src/lib/archiveIndexing.ts
- src/lib/storyStateV2.ts
- src/app/providers/StoryEngineProvider.tsx

Sequel propagation and tests:

- src/lib/storyStateV2.ts
- src/app/providers/StoryEngineProvider.tsx
- src/lib/storyText/__tests__/assistantMessagePersistence.test.ts
- src/lib/storyText/__tests__/transcriptRepairPipeline.test.ts
- src/lib/__tests__/playerCharacterPrompt.test.ts
- src/lib/__tests__/playerSceneName.test.ts
- src/lib/__tests__/archiveIndexing.test.ts
- New RP extractor and provider integration tests
