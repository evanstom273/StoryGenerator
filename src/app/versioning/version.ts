export type ChangelogEntry = {
  title: string;
  added?: string[];
  fixed?: string[];
  knownIssues?: string[];
};

export const APP_NAME = "Story Engine";
export const APP_VERSION = "1.18.3";

export const CHANGELOG: Record<string, ChangelogEntry> = {
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
};
