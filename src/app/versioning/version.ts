export type ChangelogEntry = {
  title: string;
  added?: string[];
  fixed?: string[];
  knownIssues?: string[];
};

export const APP_NAME = "Story Engine";
export const APP_VERSION = "2.6.0";

export const CHANGELOG: Record<string, ChangelogEntry> = {
  "2.6.0": {
    title: "Continue Control + Directed Follow-Through",
    added: [
      "Stories now support a Continue control turn that lets the AI keep the current scene unfolding naturally without requiring fresh player dialogue or placeholder actions",
      "Continue can now inherit temporary player-character control when it immediately follows a Director turn, allowing directed scenes to keep playing out smoothly across multiple replies",
    ],
    fixed: [
      "Continue control messages are no longer shown in the story reading/chat surfaces, so pacing commands do not interrupt the visible prose flow",
      "Version wiring is now aligned to 2.6.0 across the app label, changelog, npm metadata, and Android release metadata",
    ],
    knownIssues: [],
  },
  "2.5.1": {
    title: "Ending Flow + Chapter Review Rebuild",
    added: [
      "Typing The End in story chat now functions as a final ending marker and offers a direct Create Sequel prompt",
      "MetaChat @ references now support live autocomplete suggestions while typing, with tap-to-insert and partial-name matching",
    ],
    fixed: [
      "Deep indexing now rebuilds chapter archive reviews from saved chapter boundaries instead of only refreshing story memory and indexes",
      "The sequel prompt after The End is now driven from saved transcript state so it appears more reliably after the ending message is recorded",
    ],
    knownIssues: [],
  },
  "2.5.0": {
    title: "Ensemble Storytelling + MetaChat Evolution",
    added: [
      "Narration guidance now supports ensemble scenes where supporting characters can joke, disagree, plan, gossip, and react without forcing the player character to be the center of every exchange",
      "MetaChat now supports additive @Story, @Character, and @Universe references so story conversations can compare outside canon context without replacing the active story",
      "A new library-level MetaChat is available from the main interface for cross-story and cross-universe analysis across the writing library",
    ],
    fixed: [
      "MetaChat now behaves more like a writers' room assistant, with stronger comparison, critique, brainstorming, and pattern-analysis guidance",
      "Reset Chat now clears only the MetaChat conversation while preserving the story, indexes, summaries, memory, and saved references",
    ],
    knownIssues: [],
  },
  "1.0.0": {
    title: "Initial Release",
    added: [
      "Universes, Player Characters, and Stories",
      "Story workspace with reader mode and transcript formatting",
      "Universe wiki imports for lore context",
      "Developer Notes (bugs, feature requests, testing notes) with JSON export",
      "Story export (JSON, Markdown, TXT, PDF)",
      "Workspace backup and restore",
    ],
    knownIssues: [],
  },
  "1.0.1": {
    title: "Bug Fixes & Quality",
    added: [
      "Android back navigation handling",
      "Player character species field",
      "Text size setting",
      "Version display + changelog modal",
    ],
    fixed: [
      "Story import universe matching (reuse existing universe when possible)",
      "Story import character matching (reuse existing player character when possible)",
      "Story import story matching (avoid duplicate story records when already present)",
      "Character alias recognition guidance (nicknames and shortened names)",
      "Canon naming persistence guidance (prefer familiar names after reveal)",
    ],
    knownIssues: [],
  },
  "1.1.0": {
    title: "Theme System Foundations",
    added: [
      "Theme architecture (ThemeProvider + CSS variables)",
      "Theme selection in Settings",
      "Gold theme (premium) alongside Purple default",
    ],
    fixed: [],
    knownIssues: [],
  },
  "1.2.0": {
    title: "UI Polish Pass",
    added: [
      "Neutral workspace surfaces and dividers (consistent across themes)",
      "Stronger theme identity in card borders, badges, focus and hover states",
      "Improved card separation (subtle themed border tint and glow)",
    ],
    fixed: [],
    knownIssues: [],
  },
  "1.2.1": {
    title: "Changelog Hotfix",
    added: [],
    fixed: ["Fix changelog history scrolling"],
    knownIssues: [],
  },
  "1.2.2": {
    title: "Summary & Story State Hotfix",
    added: [],
    fixed: [
      "PDF/Markdown/TXT/JSON exports now show the latest available summary even when story.currentSummary is empty",
      "Story exports trigger a story-state refresh when possible to reduce stale scene/state data",
    ],
    knownIssues: [],
  },
  "1.3.0": {
    title: "Memory Architecture v2 Schema (Phase 1)",
    added: [
      "Story state now supports optional v2 schema fields (indexes, scene snapshot, threads, indexing metadata)",
      "Story state saves include memory architecture metadata for future transcript-first indexing",
      "Safe story-state parsing helper for backward-compatible normalization",
    ],
    fixed: [],
    knownIssues: [],
  },
  "1.4.0": {
    title: "Memory Rebuild Engine (Phase 2)",
    added: [
      "Rebuild Memory & Indexes pipeline (chunked transcript-first rebuild with progress)",
      "Story Settings drawer action to rebuild memory and update story state safely",
    ],
    fixed: [],
    knownIssues: [],
  },
  "1.5.0": {
    title: "AI-Assisted Index System (Phase 3)",
    added: [
      "Transcript-stable message numbering for index evidence references",
      "Indexes section populated during rebuild (entities, facts, threads, memories, relationships with evidence)",
    ],
    fixed: [],
    knownIssues: [],
  },
  "1.6.0": {
    title: "Incremental Indexing & Evidence Viewer (Phase 4)",
    added: [
      "Automatic light indexing every 5 messages and deep re-index every 20 messages",
      "Story Settings Index / Archive viewer (threads, facts, characters, locations, relationships)",
      "Jump-to-evidence: clicking #N scrolls to and highlights transcript message N",
    ],
    fixed: [],
    knownIssues: [],
  },
  "1.6.1": {
    title: "Memory & Indexes Hotfix",
    added: [],
    fixed: ["Fix crash when rebuilding memory & indexes (defensive array checks in index sanitiser)"],
    knownIssues: [],
  },
  "1.7.0": {
    title: "Deep Indexing + PDF Metadata (Phase 5)",
    added: [
      "Deep-only automatic indexing every 20 messages (light indexing removed)",
      "Manual Re-index action in Story Settings",
      "PDF export metadata section (indexedAt, memory architecture version, indexed message count)",
    ],
    fixed: [],
    knownIssues: [],
  },
  "1.8.0": {
    title: "Archive PDF Export (Phase 6)",
    added: [
      "New Archive PDF export (metadata + indexes/registries + evidence + numbered transcript)",
    ],
    fixed: [],
    knownIssues: [],
  },
  "1.8.1": {
    title: "Transcript & PDF Formatting Fixes",
    added: [],
    fixed: [
      "Transcript mode is now script-like with speaker tags on every line (no giant player banner)",
      "Archive PDF relationship separator uses ASCII (<->) for reliable export/search",
      "Archive PDF transcript spacing no longer runs message headers into Time lines",
    ],
    knownIssues: [],
  },
  "1.9.0": {
    title: "Theme-Accented UX Polish",
    added: [
      "Player speaker tags now follow the active theme accent (matches NPC/canon tags)",
      "Top-left logo is clickable and returns to the homepage",
      "Homepage includes a New Story button for faster start",
    ],
    fixed: ["Vercel deployments now support deep links (SPA routing rewrite)"],
    knownIssues: [],
  },
  "1.10.0": {
    title: "Theme System 2.0",
    added: [
      "Theme ids migrated: Purple → Amethyst, Gold → Copper",
      "New themes: Emerald, Azure, Crimson, Silver",
      "Accessibility themes: High Contrast, Monochrome",
      "Custom theme with user-selected accent colour (persisted locally)",
      "Derived accent tokens (muted/border/glow/surface/gradients) applied via CSS variables",
      "Settings theme picker now shows preview cards",
    ],
    fixed: [],
    knownIssues: [],
  },
  "1.11.0": {
    title: "UX Cleanup",
    added: [],
    fixed: [
      "Removed the redundant show/hide sidebar button (Story Settings controls the sidebar)",
      "Removed the Opening Prompt concept from story creation/editing, prompting, and exports",
    ],
    knownIssues: [],
  },
  "1.12.0": {
    title: "Edit / Regenerate Last AI Message",
    added: [
      "Edit the last assistant message in-place (quick fix modal)",
      "Regenerate the last assistant message (re-run AI for the last turn)",
    ],
    fixed: [],
    knownIssues: [],
  },
  "1.13.0": {
    title: "Character Concepts + Quick Protagonists",
    added: [
      "Player characters now support a Character Concept field",
      "Generate character details from concept (and regenerate individual fields)",
      "Create a Quick Story Character during story creation and promote it to the library later",
    ],
    fixed: [],
    knownIssues: [],
  },
  "1.14.0": {
    title: "Reliability + Identity + Android Auto Backup",
    added: [
      "Automatic story-state refresh when the active protagonist identity changes",
      "Relationship indexes now merge by character pair and show dynamic metrics (trust/loyalty/tension/etc.)",
      "User messages can set a speaker label using a Name: prefix",
      "Custom theme accent now derives readable foreground text color for accent buttons",
      "Android auto-backup every ~12 hours (keeps last 5) with a share prompt",
    ],
    fixed: [
      "Auto indexing and manual deep indexing now share the same reconciliation step for consistent outputs",
    ],
    knownIssues: [],
  },
  "1.14.1": {
    title: "Cleanup & Promotion Hotfix",
    added: ["Story Settings tool: Cleanup Duplicates (merge likely duplicate characters and repoint stories)"],
    fixed: [
      "Promoting a Quick Character no longer creates duplicates (promotion converts the existing record in-place)",
      "Cleanup routine updates story character references and removes losing duplicate records safely",
    ],
    knownIssues: [],
  },
  "1.14.2": {
    title: "Auto Indexing Consistency Hotfix",
    added: [],
    fixed: [
      "Automatic story-state updates now run the same full deep indexing pipeline as manual Re-indexing for consistent results",
    ],
    knownIssues: [],
  },
  "1.15.0": {
    title: "Universe Packs + Archive UX + Support Bundle + Additive Assist",
    added: [
      "Universe Form 2.0 (structured fields with Randomise / Fill with AI / Clear)",
      "Universe Packs: universe export now produces a versioned universe_pack bundle, and new stories bind to a universe snapshot to prevent canon drift",
      "Archive-native story navigation: Archive view tab in the story workspace (indexes + evidence jumping)",
      "Export Support Bundle (.zip) containing story JSON + Archive PDF + diagnostics",
      "Generate Response is additive when text already exists in the input box (continuation mode)",
    ],
    fixed: [],
    knownIssues: [],
  },
  "1.16.0": {
    title: "Universe Blueprint UX + Collaboration + Archive Quality",
    added: [
      "Universe creation now supports the referenced/custom blueprint workflow with separate Concept and Description fields",
      "Archive view now surfaces Story Premise, Protagonist Focus, Current Situation, Recent Developments, and Character Status",
      "Archive view now shows automatic deep-index progress so you can see when the next auto refresh is due",
      "Story Settings now mirrors archive info in collapsible dropdown sections, including the auto deep-index countdown",
    ],
    fixed: [
      "Additive Generate Response now continues inline when the existing draft ends with an open delimiter like * or quotes",
      "AI generation now retries transient failures and surfaces clearer human-readable error categories",
      "Narrator guidance now more strongly treats explicit player-declared outcomes as canon and builds forward from them",
      "Android import pickers now allow JSON files to be selected reliably even when the OS mislabels the MIME type",
      "Edited assistant messages now preserve manual *action* formatting in the transcript instead of being re-sanitised away on display",
      "Automatic indexing now bootstraps correctly even when a story has no prior story-state record yet",
      "Archive extraction now better preserves premise, protagonist state, character status, and major turning points without dumping personal conditions into World Facts",
    ],
    knownIssues: [],
  },
  "1.17.0": {
    title: "Indexing Independence + Canon Consistency",
    added: [
      "Automatic indexing can now be configured per story with Disabled, 5, 10, 15, and 20 message intervals",
      "Story Settings now includes an Automatic Indexing selector for per-story auto-index cadence",
      "Story state now tracks automatic deep-index progress separately from manual re-indexing",
      "Archive extraction now separates persistent character traits from transient scene state",
    ],
    fixed: [
      "Manual Re-index no longer resets or delays the next automatic index run",
      "Archive and Settings countdowns now calculate from the current story-specific auto-index interval",
      "Player character sheet facts are now treated as stronger canon across narration, player assist, indexing, summaries, and memory rebuilds",
      "Temporary emotions, goals, and short-term reactions are less likely to drift into permanent character descriptions",
    ],
    knownIssues: [],
  },
  "1.18.0": {
    title: "Usability + Narrative Intelligence Upgrade",
    added: [
      "Archive PDF exports now re-index first, stay transcript-first, and include chapter summaries",
      "Story view now supports quicker daily use with theme switching, MetaChat, story archiving, and chapter-aware indexing",
      "Library search now covers stories, universes, and player characters using summaries, notes, and key lore fields",
      "Library browsing now includes stronger filtering/sorting across stories, universes, and player characters",
      "Implicit director intent now recognises time skips and scene cuts, and generation guidance applies temporal consequences",
      "Relationship dynamics now track richer evolving metrics including comfort, suspicion, fear, and affection",
    ],
    fixed: [
      "Archive and settings relationship views now surface dynamic metric values instead of only pair summaries",
      "Chapter-aware exports now present the reading experience first without losing index-driven analysis sections",
    ],
    knownIssues: [],
  },
  "1.18.1": {
    title: "Mature Fiction Context + Android Sync Hotfix",
    added: [
      "Story generation now uses a shared mature-fiction policy block that better recognises police, detective, military, action, fantasy, and psychological-drama storytelling as legitimate narrative context",
      "Player Assist now follows the same mature-fiction and narrative-parity rules as the main narrator, so suggested turns are less likely to get over-sanitised",
      "MetaChat now analyses difficult themes with the same serious, non-gratuitous fiction framing while staying firmly out of canon",
      "Summary and indexing prompts now preserve mature-but-legitimate story consequences in clear, non-sensational language",
    ],
    fixed: [
      "Normal genre-fiction themes such as shootouts, combat injuries, trauma, grief, panic, depression, relapse, and recovery are less likely to be misread as inherently unsafe just because the subject matter is intense",
      "Provider-side safety refusals are now classified more clearly, with user-facing messaging that explains the hard boundary still applies to exploitative, eroticised, predatory, illegal, or instructional harm",
      "Android Studio sync now receives the latest web bundle again after rebuilding and copying the updated app into the Android project",
      "Version wiring is now aligned to 1.18.1 across the app label, changelog, npm metadata, and Android release metadata",
    ],
    knownIssues: [],
  },
  "1.18.2": {
    title: "Fictional Injury Input Context Hotfix",
    added: [
      "Story input safety now analyses fictional-roleplay cues and recent canon context when a player writes about injury, pain, hospitals, trauma, or recovery",
      "The latest player turn is now sent to the model with clearer in-story labelling so ordinary first-person aftermath prose reads more obviously as fiction",
      "Input-safety context now includes recent transcript and story-state cues when the scene already supports injury or medical aftermath",
    ],
    fixed: [
      "Normal fictional aftermath lines such as shoulder pain, hospital wake-ups, antiseptic scene-setting, slings, IVs, and recovery prose are less likely to trigger over-literal safety refusals",
      "Narrative parity is improved when the AI has already established injuries, extraction, hospital care, trauma, or recovery and the player responds in plain language",
      "Safety refusal errors now make it clearer when the block came from the provider and when the request looks like a likely false positive in story context",
      "Version wiring is now aligned to 1.18.2 across the app label, changelog, npm metadata, and Android release metadata",
    ],
    knownIssues: [],
  },
  "1.19.0": {
    title: "Editorial UI Redesign + MetaChat Full-Screen",
    added: [
      "Full editorial dark-theme redesign: all panels, cards, forms, and drawers now match the homepage's near-black aesthetic with subtle border treatment",
      "MetaChat moved from a squashed sidebar popup to a full-screen overlay accessible via a new robot icon in the story toolbar",
      "Story settings sidebar sections are now collapsible accordions — Story Info, Story AI, and Index/Archive open by default",
      "Collapsible sections smooth-scroll themselves into view when opened",
      "Story workspace toolbar now uses compact icon buttons (Settings, Bubble View, Archive, Reader Mode, MetaChat, Manual Entry)",
      "Screenplay/transcript view is now the default display mode",
      "MetaChat responses now render markdown (bold, italic, lists, headings, code) instead of showing raw asterisks",
    ],
    fixed: [
      "Scrolling inside MetaChat or the story settings drawer no longer scrolls the story page behind it",
      "Secondary text brightness lifted across the sidebar and homepage for better legibility on dark backgrounds",
      "Version wiring aligned to 1.19.0 across app label, changelog, npm metadata, and Android build.gradle (versionCode 11900)",
    ],
    knownIssues: [],
  },
  "1.18.3": {
    title: "Background Jobs + Persistent MetaChat + Multi-Source Universes",
    added: [
      "Long-running story indexing now runs as a persistent background job with queued/running/complete/failed/cancelled states",
      "MetaChat drafts now persist when you leave the overlay, and MetaChat replies can complete as background jobs",
      "Universe references now support ordered multi-source wiki URLs with labels and precedence-aware prompt wiring",
    ],
    fixed: [
      "Starting a new chapter with flexible Chapter X syntax now implicitly closes the previous active chapter without breaking older Start/End markers",
      "Story settings now surfaces job state and duplicate deep-index requests no longer stack up for the same story",
      "Version wiring is now aligned to 1.18.3 across the app label and npm metadata",
    ],
    knownIssues: [],
  },
  "2.1.0": {
    title: "RP Mode — Time, Money & Transaction Intelligence",
    added: [
      "In-story time tracking: set a starting date/time and the clock advances automatically after each scene",
      "Per-message time chips in the transcript show when the in-story time changed",
      "Toolbar time display shows the current in-story time at a glance",
      "Calendar customisation: custom month names, weekday names, and year suffix for fantasy/sci-fi settings",
      "Recurring events: configure rent, wages, or any periodic income/expense to trigger automatically as story time passes",
      "Realistic currency inference: the AI infers prices from era/genre benchmarks when no explicit price is stated",
      "Transaction state tracking: multi-turn purchases (price announced → payment confirmed) are now treated as a single transaction — no more duplicate charges",
      "Player message context: the extractor now sees both the player's input and the narrator's response, so explicit prices stated by the player are correctly deducted",
    ],
    fixed: [
      "Time not persisting: rpStats was loaded through the Story State V2 parser which requires full index data — new stories without an index pass lost their saved time on every overlay re-open",
      "Double charge: the extractor was independently evaluating each narrator turn, causing the same purchase to be deducted when a price was announced and again when payment was confirmed",
      "Time over-estimate: quick counter/register interactions were bucketed into 15–30 min; added finer brackets so a bodega scan advances 2–5 min instead",
      "Gold not deducted: extractor only received narrator text, missing explicit prices stated by the player in their message",
    ],
    knownIssues: [],
  },
  "2.4.1": {
    title: "Branch Story + Editor Stability",
    added: [
      "Story settings now include a Branch Story action that forks the current transcript, context, index, summaries, and AI configuration into an editable alternate timeline",
      "Branch creation opens a dedicated flow that keeps the original story editable while preserving parent/child lineage between the source and the new branch",
    ],
    fixed: [
      "Universe and player character editors no longer repopulate local form text during autosave refreshes, which could occasionally overwrite or erase text while you were typing",
      "Text areas in universe creation, character creation, and story workspace editing are now larger and easier to resize, and the character appearance field has been expanded into a full-sized description box",
    ],
    knownIssues: [],
  },
  "2.4.0": {
    title: "Create Sequel + Canon Lineage",
    added: [
      "Stories now support a first-class Create Sequel flow that starts a fresh transcript while inheriting distilled canon from the source story",
      "Story creation can now open in sequel mode with the source story, universe, protagonist, and prior summary preloaded for continuity",
      "Sequels keep lineage metadata so the app can track direct predecessor relationships and seeded canon origin",
    ],
    fixed: [
      "Once a sequel is created, the predecessor story is now locked as a read-only prequel so canon cannot be accidentally continued in the old thread",
      "Sequel story state now carries forward durable summary, world facts, unresolved threads, relationships, and significant memories without copying the full transcript",
    ],
    knownIssues: [],
  },
  "2.3.0": {
    title: "Response Variant Cycling + Streaming Improvements",
    added: [
      "Regenerating the last AI message now creates a new candidate instead of silently overwriting — the previous response is preserved",
      "Response X of Y counter with Previous / Next buttons lets you cycle between all generated candidates for the current turn",
      "Switching candidates updates the transcript immediately so context, export, archive, and indexing always reflect the selected response",
      "Sending the next message locks the selected candidate and discards the rest — variants only exist until you continue the story",
      "Streaming panel now reads \"Generating candidate…\" during regeneration to make it clear a new alternative is being produced",
      "Deterministic narration repair: unlabelled italic prose blocks (_text_ or *text*) are now automatically promoted to Narrator: *text.* before format validation, reducing the number of rewrite attempts required",
      "All four AI providers (Gemini, OpenAI, Anthropic, OpenRouter) now fall back to non-streaming when the streaming endpoint fails before any content is received — generation succeeds instead of erroring",
      "Regenerating a scene streams in real time and clears the previous message immediately, matching the send-message experience",
    ],
    fixed: [
      "Pronoun-attributed lines (She: *action*, He: *speaks*) were incorrectly being wrapped as Narrator: blocks — the repair step now skips any block that already has a colon-prefixed speaker label",
      "Cancelling a generation no longer shows an error modal when no partial draft was produced",
      "AI provider errors are now classified more precisely: streaming endpoint failures, cancelled requests, and unknown providers each have distinct error codes",
    ],
    knownIssues: [],
  },
  "2.2.6": {
    title: "MetaChat Error Visibility",
    fixed: [
      "Failed MetaChat replies were invisible — if the AI call failed (API error, safety refusal, context too large), the user's message would appear but no reply or error was shown, making MetaChat appear broken. Failed jobs now surface their error message in the overlay with a Retry button.",
    ],
    knownIssues: [],
  },
  "2.2.5": {
    title: "Speaker Attribution Hotfix",
    fixed: [
      "\"As Jamie:\" and similar narrative transition phrases (\"As\", \"With\", \"After\", \"While\", etc.) were being treated as speaker labels, causing the following prose to appear under the wrong character. The parser now rejects any label whose first word is a narrative transition word, and the AI is explicitly instructed never to use \"As [Name]:\" as a speaker prefix.",
    ],
    knownIssues: [],
  },
  "2.2.4": {
    title: "Update Index & Narrator Attribution Fixes",
    fixed: [
      "Update index (incremental) was completing instantly without doing any work — the indexer was using the lightweight message counter (bumped after every AI turn) as its starting point, so it always saw 0 new messages. It now uses the actual last AI deep-index checkpoint",
      "Third-person prose describing multiple characters (e.g. \"Jake does X while Amy does Y\") was being written as an action beat inside the first character's block. The output format instructions now explicitly require any prose that mentions another character's actions to be placed in a Narrator: block",
    ],
    knownIssues: [],
  },
  "2.2.3": {
    title: "Gemini Formatting Fixes & Writing Quality",
    fixed: [
      "Trailing _ characters at the end of narrator paragraphs — Gemini wraps narrator text in _italic_ markdown; the italic-stripping regex now handles passages of any length, and any stray underscore delimiter left over is removed as a second pass",
      "Duplicate character speech blocks — if the model emits two consecutive blocks for the same speaker separated by a blank line, they are now merged into a single bubble instead of appearing as two",
      "Auto-indexing after chapters silently never firing — a state-save error could swallow the auto-index queue call; state-save and auto-index are now independent so the job is always queued",
      "Fan-fiction character caricature — when writing in a referenced universe the model now treats imported lore as the authoritative voice reference and is explicitly told not to amplify or exaggerate traits, even iconic ones",
    ],
    knownIssues: [],
  },
  "2.2.2": {
    title: "Time System Rework & Story Text Fixes",
    added: [
      "/time command: type /time +2h, /time +30m, /time +3d, /time +1w in any message to advance the in-story clock by an exact amount — the command is stripped before the AI sees it",
      "Natural language time phrases in messages (e.g. \"2 hours later\", \"skip 3 days\") are now detected and applied as exact arithmetic rather than AI estimation",
    ],
    fixed: [
      "Clock no longer advances from AI guesswork — only explicit player input (the /time command or a recognised natural language phrase) moves the clock",
      "Removed the large-time-skip confirmation modal that incorrectly triggered on words like \"sleep\"",
      "Character and universe generation failed silently on claude-sonnet-4-6 — the request was being rejected because Sonnet does not support assistant prefill; prefill removed, generation now works on all Claude models",
      "AI provider errors now surface the real failure message instead of always showing \"The AI request failed for an unknown reason\"",
      "Narrative colons (e.g. \"Note:\", \"Warning:\", \"Time:\") were being misread as speaker labels, causing the following text to be incorrectly formatted as dialogue or action",
      "Numbered speaker names like \"Paramedic 1\" and \"Guard 2\" were rejected as invalid speakers, causing their lines to bleed into the previous character's block",
      "Narrator text separated from a character block by a blank line was being appended to that character instead of starting its own paragraph",
      "Consecutive action lines within a speaker block were being merged with \", and\" — they are now emitted as separate segments",
    ],
    knownIssues: [],
  },
  "2.2.1": {
    title: "Bulk Delete, Recurring Event Fix & Countdown",
    added: [
      "Danger Zone section in Settings → Storage: bulk delete all stories (with full cascade), all characters, or all universes — each requires typing a confirmation phrase",
      "Recurring event rows now show a countdown to the next trigger (e.g. \"in 8 days\", \"in 4h\", \"due soon\")",
      "Recurring events now support an amount range (e.g. 500–1000) — a random value within the range is applied each time the event fires",
    ],
    fixed: [
      "Monthly recurring events now fire on the correct calendar day each month — the previous flat +30 day advance caused the date to drift by ±1 day over time",
      "Short months (Feb, 30-day months) clamp the day to the last valid day of that month rather than overflowing",
    ],
    knownIssues: [],
  },
  "2.2.0": {
    title: "Dice Roll System for RP Mode",
    added: [
      "Optional dice roll system for RP mode: write [roll] or [roll str/dex/con/int/wis/cha] in a message to trigger a d12 skill check; AI selects the stat automatically if not specified",
      "Dice modifiers (-2 to +2) per stat (STR/DEX/CON/INT/WIS/CHA) configurable in Character Sheet Settings",
      "Dice roll modal: displays stat and modifier, roll button, colour-coded outcome (SUCCESS green / FAILURE red / CRITICAL SUCCESS gold on natural 12)",
      "Roll results appear as a toast notification and are permanently logged in the Events tab with the triggering action text for context",
      "Transaction History table in RP Mode PDF export with colour-coded transaction types",
    ],
    fixed: [
      "Character Sheet, Relationships, and MetaChat overlays no longer cover the taskbar",
      "Stats tab removed from the Character Sheet (modifiers are now in Settings under Dice Rolls)",
      "PDF rule lines no longer intersect text headings",
      "Toolbar time chip no longer overflows into icon buttons on small screens",
    ],
    knownIssues: [],
  },
  "2.0.0": {
    title: "RP Mode — Relationships, AI Stat Integration & Export",
    added: [
      "Relationship system overhaul: AI-extracted tiers (stranger through nemesis/lover/family), dynamic trust/tension metrics, key turning-point history, and NPC relationship chips in the workspace toolbar",
      "RP Mode: HP, currency, and core stat tracking (STR/DEX/CON/INT/WIS/CHA) with manual editing, stat changelog, and live gold display in the story toolbar",
      "AI stat integration: narrator detects HP changes (damage, medication healing, rest recovery), currency transactions, and core stat shifts after each turn and applies them automatically",
      "NPC HP tracking: named NPCs gain HP entries when they suffer or recover from physical health events, visible in the Character Sheet HP tab",
      "RP Mode export: full character sheet snapshot including NPC HP, stat changelog, RP events log, and transcript as JSON, Markdown, TXT, or PDF",
      "Character Sheet overlay polish: scrollable tab bar, Export merged into Settings, starting gold change syncs to live balance",
    ],
    fixed: [
      "PDF RP events section no longer shows garbled wide-spaced text (Unicode arrow and dash characters sanitised for Latin-1 encoding)",
      "API key sanitisation strips non-ISO-8859-1 characters before HTTP requests to prevent fetch errors",
      "Notification errors handled gracefully when a service worker is present",
    ],
    knownIssues: [],
  },
};
