export type AiDocumentPresetId =
	| "podcast-chapter-breakdown"
	| "podcast-discussion"
	| "story-summary"
	| "character-guide"
	| "timeline"
	| "lore-bible"
	| "episode-guide"
	| "writer-commentary"
	| "character-analysis"
	| "relationship-analysis"
	| "previously-on"
	| "custom";

export const AI_DOCUMENT_CUSTOM_PRESET_ID: AiDocumentPresetId = "custom";

export interface AiDocumentPreset {
	id: AiDocumentPresetId;
	displayName: string;
	filenameStem: string;
	systemPrompt: string;
	defaultStructure?: "single" | "chapter-by-chapter";
	supportsGeminiTts?: boolean;
}

const SHARED_RULES = [
	"You are generating a companion Markdown document ABOUT a Story Engine story.",
	"This is NOT story continuation. Do not write new scenes as the narrator or add canon to the story.",
	"Base the document only on the supplied source material. If information is missing, say so briefly instead of inventing plot.",
	"Output ONLY Markdown. No JSON wrappers, no preamble outside the document.",
	"Use clear headings, lists, and structure appropriate to the document type.",
].join("\n");

const PODCAST_HOST_RULES = [
	"Use two hosts in a natural back-and-forth podcast conversation.",
	"Label speakers consistently on every line (e.g. **Host A:** / **Host B:** or named hosts like Sam and Alex).",
	"Balance analysis, recap, and reaction — not a dry transcript readout.",
].join("\n");

export const AI_DOCUMENT_PRESETS: AiDocumentPreset[] = [
	{
		id: "podcast-chapter-breakdown",
		displayName: "Podcast Chapter Breakdown",
		filenameStem: "podcast-chapter-breakdown",
		defaultStructure: "chapter-by-chapter",
		supportsGeminiTts: true,
		systemPrompt: `${SHARED_RULES}

${PODCAST_HOST_RULES}

Create a podcast episode that combines a chapter-by-chapter recap with thematic discussion.

Include:
- Podcast title, host names, and topic line
- Introduction that sets up the story and family/world context
- One section per chapter (use chapter labels from the source), each with a descriptive subtitle and host dialogue
- Summary table: Chapter | Key Location | Core Events
- Themes & Character Arcs (core themes + character evolution bullets)
- Open Questions for Listeners (numbered)

Match the energy of a thoughtful recap show: warm when appropriate, serious when the story turns heavy.`,
	},
	{
		id: "podcast-discussion",
		displayName: "Podcast Discussion",
		filenameStem: "podcast-discussion",
		supportsGeminiTts: true,
		systemPrompt: `${SHARED_RULES}

${PODCAST_HOST_RULES}

Write a thematic podcast discussion about the full story (not necessarily chapter-by-chapter).
Include major beats, emotional pivots, themes, character arcs, and open questions for listeners.`,
	},
	{
		id: "story-summary",
		displayName: "Story Summary",
		filenameStem: "story-summary",
		systemPrompt: `${SHARED_RULES}

Write a polished story summary suitable for a back-cover or wiki entry.
Include setup, major turns, and where the story stands without spoiling beyond the source.`,
	},
	{
		id: "character-guide",
		displayName: "Character Guide",
		filenameStem: "character-guide",
		systemPrompt: `${SHARED_RULES}

Create a character guide covering major characters: role, personality, goals, relationships, and notable beats.
Group by importance. Include the player character prominently.`,
	},
	{
		id: "timeline",
		displayName: "Timeline",
		filenameStem: "timeline",
		systemPrompt: `${SHARED_RULES}

Produce a chronological timeline of events from the story.
Use dated or ordered entries. Note uncertainty when the source does not specify timing.`,
	},
	{
		id: "lore-bible",
		displayName: "Lore Bible",
		filenameStem: "lore-bible",
		systemPrompt: `${SHARED_RULES}

Compile a lore bible: setting, factions, rules of the world, locations, technology/magic, and established facts.
Separate canon from speculation.`,
	},
	{
		id: "episode-guide",
		displayName: "Episode Guide",
		filenameStem: "episode-guide",
		defaultStructure: "chapter-by-chapter",
		systemPrompt: `${SHARED_RULES}

Write an episode guide organized by chapter.
For each chapter: title, synopsis, key characters, and notable developments.`,
	},
	{
		id: "writer-commentary",
		displayName: "Writer Commentary",
		filenameStem: "writer-commentary",
		systemPrompt: `${SHARED_RULES}

Write writer's commentary in first person as if the author reflecting on the work.
Discuss intent, structure, character choices, and craft — grounded in what the source actually contains.`,
	},
	{
		id: "character-analysis",
		displayName: "Character Analysis",
		filenameStem: "character-analysis",
		systemPrompt: `${SHARED_RULES}

Provide deep character analysis focused on motivation, conflict, growth, and subtext.
Prioritize the protagonist and recurring figures.`,
	},
	{
		id: "relationship-analysis",
		displayName: "Relationship Analysis",
		filenameStem: "relationship-analysis",
		systemPrompt: `${SHARED_RULES}

Analyze relationships and dynamics: alliances, tensions, power shifts, and emotional arcs.
Use pairs or small groups where helpful.`,
	},
	{
		id: "previously-on",
		displayName: "Previously On...",
		filenameStem: "previously-on",
		systemPrompt: `${SHARED_RULES}

Write a "Previously on…" recap in the style of a TV cold open.
Short, punchy, dramatic — catch someone up before the next chapter.`,
	},
	{
		id: AI_DOCUMENT_CUSTOM_PRESET_ID,
		displayName: "Custom",
		filenameStem: "custom-document",
		systemPrompt: SHARED_RULES,
	},
];

export function getAiDocumentPreset(id: AiDocumentPresetId): AiDocumentPreset {
	return AI_DOCUMENT_PRESETS.find((preset) => preset.id === id) ?? AI_DOCUMENT_PRESETS[0];
}

export function buildAiDocumentFilename(
	stem: string,
	storyTitle?: string,
	extension: "md" | "wav" = "md",
) {
	const safeStem = stem.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
	const safeTitle = storyTitle
		?.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	if (safeTitle) {
		return `${safeTitle}-${safeStem}.${extension}`;
	}
	return `${safeStem}.${extension}`;
}
