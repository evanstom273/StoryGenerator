# MetaChat 2.0

MetaChat is an independent, out-of-canon conversation subsystem. The existing full-page shell in `pages/MetaChatPage.tsx` uses `MetaChatProvider` and `ConversationService`; `StoryEngineProvider` no longer handles its prompts, messages, context, proposals, drafts or background jobs.

## Boundaries and reused infrastructure

- `types.ts`: conversation, attachment, request, revision and proposal records. Conversations have their own IDs; no owning `storyId`.
- `repository.ts`: atomic IndexedDB conversation commits with revision checks, and non-destructive legacy import.
- `conversationService.ts`: send/edit/retry/cancel, restart recovery, rename/delete and attachment validation. Web Locks prevent parallel writers across tabs where supported; IndexedDB revision checks are always enforced. BroadcastChannel refreshes open tabs; cancellation persists before late responses can be accepted.
- `contextResolver.ts`: read-only access to existing story metadata, Story State, semantic indexes, chapter boundaries and transcript evidence. No embeddings or external database.
- `memory.ts`: recent messages, incremental compact discussion summaries, and relevant exact earlier quotations. Original messages and superseded revisions remain inspectable.
- `responseGenerator.ts`: independent conversational instructions using the existing AI provider factory, request cancellation, error classification and retry configuration. Uses `metachatModels`, falling back to the provider default, never to the Director model or a story override.
- `libraryActions.ts`: validated proposals and explicit accept/reject. Uses the same character/universe record constructors and dependency guards as ordinary library controls, extracted to `lib/libraryRecords.ts`. Does not invoke the story editor's state-refresh side effects.

## Storage and upgrade

IndexedDB version 13 adds `metaChatThreads`. Each record holds its messages, attachments, discussion memory, revision archive, request state and proposal receipts. A user turn plus its pending request, and a completed response plus its memory/proposal, each commit atomically. History contains only started conversations; opening a blank workspace or attaching a story writes no conversation.

Old `metaChatConversations`, `storyMetaMessages` and `storyUiStates` remain intact. Legacy message groups are copied to deterministic independent IDs and the former owning story becomes an attachment. Empty legacy headers and drafts remain in their original stores without creating phantom chats. Import is repeatable; tombstones prevent deleted migrated chats from reappearing. Deleting a story no longer deletes legacy discussions or independent conversations.

Workspace backups include both new conversations and legacy records. Importing older backups without MetaChat fields preserves current chats, including in replace mode. Explicit workspace clearing clears all chat stores. The old export serializer/storage types remain for compatibility, while all active orchestration is retired. Old `metachat_generate` job shapes remain readable but are never scheduled or executed.

On restart a pending request becomes retryable without duplicating the user turn. A currently running request in another tab keeps its Web Lock. Editing archives the old branch, drops all later turns from active history, invalidates the old summary, and generates from the revised user turn. Already confirmed library changes are not undone by editing conversation text.

## Retrieval and memory

Intent determines the resource evidence budget: approximately 2,500 characters for casual conversation, 18,000 for focused questions and 64,000 for reviews, with per-resource shares. These are input budgets, not fixed reply-length rules. Casual turns never read transcripts or chapter records. Focused questions use named indexed characters, relationships, source message IDs, ranked relevant excerpts and recent scene turns. Chapter requests accept Roman/numeric labels and retrieve actual chapter content using existing boundary helpers, plus relevant continuity and current Story State. Comparisons label each story's evidence separately. Metadata-only library discovery avoids the legacy `listStories()` transcript normalization path.

Attachments grant access; they do not force full resource contents into requests. Exact natural names are resolved conservatively. Ambiguous names and missing resources produce explicit evidence limitations. If no story is selected, existing semantic indexes can identify a uniquely relevant story. Large transcripts are marked as excerpts; the model is instructed not to claim an exhaustive review. Current Story State is not presented as a historical chapter snapshot. In current StoryEngine, runtime/author directives live in Story State, while indexed characters, relationships and chapter summaries live in Story Index.

Recent discussion stays verbatim. Older discussion is incrementally summarized in bounded batches, preserving decisions/corrections and unresolved topics. A summary failure falls back to exact excerpts and never discards original history. Relevant older quotations are retrieved by lexical matching, with priority for explicit user corrections and decisions. This is discussion memory, not a second narrative state system.

## Library action safety

Only character/universe create, update and delete actions are accepted. Fields, types, URLs, universe IDs, record scope, targets and batch size are validated before presentation. There is no permanent player/supporting role field. Story-scoped starting sheets and all story canon operations are rejected.

The review shows exact current and proposed records. Confirmation rechecks current records and dependencies inside one IndexedDB transaction spanning conversation receipts and library stores. Stale proposals and linked-story deletions fail without writes. Character references in supporting casts also prevent deletion. A bulk batch either commits completely with its receipt or makes no library changes. Each action gets an actual result; repeated confirmation cannot replay an accepted proposal. Rejecting and ordinary conversational agreement execute no mutations.

## Verification and limits

Run `npm run typecheck`, `npm test`, `npm run test:e2e`, and `npm run build`. Browser tests use Chromium (system Chromium if available; otherwise run `npx playwright install chromium`) and mocked Gemini HTTP responses. They exercise the real provider adapter/repositories/UI at desktop, 390px and 320px widths, including reload, editing, confirmation, viewport bounds, attachment focus and returning to the originating story.

Provider output quality is model-dependent; automated tests do not make paid live-provider requests. Retrieval is deterministic lexical/index selection, not unrestricted semantic search. Up to four stories and 30 library changes fit one request/proposal; larger tasks must be narrowed or split. A character referencing a newly proposed universe requires confirming that universe first. Oversized chapters are explicitly partial evidence. Generation continues while navigating inside the running application, but closing the application interrupts it and offers retry on the next launch; no server-side/background job service is introduced.
