export type ChangelogEntry = {
  title: string;
  added?: string[];
  fixed?: string[];
  knownIssues?: string[];
};

export const APP_NAME = "Story Engine";
export const APP_VERSION = "1.2.1";

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
};
