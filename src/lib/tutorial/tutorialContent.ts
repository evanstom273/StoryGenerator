import { APP_NAME, APP_VERSION } from "../../app/versioning/version";

export type TutorialLinkItem = {
	label: string;
	to: string;
};

export type TutorialTaskbarItem = {
	label: string;
	description: string;
};

export type TutorialBlock =
	| { type: "paragraph"; text: string }
	| { type: "subheading"; text: string }
	| { type: "steps"; items: string[] }
	| { type: "bullets"; items: string[] }
	| { type: "taskbar"; items: TutorialTaskbarItem[] }
	| { type: "links"; items: TutorialLinkItem[] };

export type TutorialSection = {
	title: string;
	blocks: TutorialBlock[];
};

export type TutorialDocument = {
	appName: string;
	version: string;
	title: string;
	intro: string[];
	sections: TutorialSection[];
};

export const TUTORIAL_DOCUMENT: TutorialDocument = {
	appName: APP_NAME,
	version: APP_VERSION,
	title: `Welcome to ${APP_NAME}`,
	intro: [
		"You always control your protagonist. The AI controls the world, NPCs, and narration around you — that's the core idea behind Story Engine.",
		`${APP_NAME} is a local-first storytelling workspace. You build universes and characters, then play through AI-assisted stories on your device until you choose to export them.`,
		"Use the sections below as an onboarding guide. Start with setup, then open a story and experiment with the workspace taskbar. You can download this tutorial as PDF, TXT, or Markdown from the bottom of this tab.",
	],
	sections: [
		{
			title: "Why Story Engine?",
			blocks: [
				{
					type: "paragraph",
					text: `${APP_NAME} is different because:`,
				},
				{
					type: "bullets",
					items: [
						"You always control your protagonist.",
						"Stories maintain continuity over long campaigns.",
						"Universes, characters, and stories can all be reused and connected.",
					],
				},
			],
		},
		{
			title: "Quick start — your first story",
			blocks: [
				{
					type: "steps",
					items: [
						"Open Settings → AI and add an API key for OpenAI, Gemini, OpenRouter, or Anthropic. Use Validate to confirm the connection works.",
						"Create a Universe — your world container. Use Custom mode to describe a setting, or Referenced mode to pull from wiki sources.",
						"Create a Player Character — your reusable protagonist. You can attach one or more universes (useful for crossovers).",
						"Create a Story — open the universe dropdown, check every world this story should use, pick a protagonist, add a title, and start at Chapter I.",
						"Open the story, type in the Chat composer, and press Send to generate the next scene.",
					],
				},
				{
					type: "links",
					items: [
						{ label: "New Universe", to: "/universes/new" },
						{ label: "New Character", to: "/player-characters/new" },
						{ label: "New Story", to: "/stories/new" },
					],
				},
			],
		},
		{
			title: "Install as an app (PWA)",
			blocks: [
				{
					type: "paragraph",
					text: "On supported browsers you can install Story Engine to your home screen for a full-screen, app-like experience with automatic updates when you open it.",
				},
				{
					type: "bullets",
					items: [
						"Use the Install banner on the home page when it appears, or your browser’s “Install app” / “Add to Home Screen” option.",
						"On iPhone: Share → Add to Home Screen.",
						"The installed PWA uses the same local data as the browser tab on that device.",
					],
				},
			],
		},
		{
			title: "The story workspace",
			blocks: [
				{
					type: "paragraph",
					text: "When you open a story, the workspace is where you read, write, and manage everything. The header shows your universe(s), protagonist, and story title. The transcript in the middle is your timeline. The Chat panel at the bottom is where you send turns.",
				},
				{ type: "subheading", text: "Bottom taskbar" },
				{
					type: "taskbar",
					items: [
						{
							label: "Settings",
							description:
								"Per-story options: AI model, accent color, RP mode, content mode, exports, sequel/branch actions, and indexing.",
						},
						{
							label: "Bubble view",
							description:
								"Chat-style bubbles with Edit, Regenerate, and Delete on each message. Good for reviewing recent turns.",
						},
						{
							label: "Archive",
							description:
								"Automatically summarises your story, characters, locations, relationships, and open plot threads so you don't have to remember everything yourself.",
						},
						{
							label: "Reader mode",
							description:
								"Distraction-free reading. Hides the composer and extra chrome so you can read like a book.",
						},
						{
							label: "MetaChat",
							description:
								"Out-of-canon AI chat for brainstorming, planning arcs, or comparing ideas — never written into the story.",
						},
						{
							label: "Character Sheet",
							description:
								"RP stats, HP, currency, in-story time, and event log when RP Mode is enabled.",
						},
						{
							label: "Relationships",
							description:
								"Track bonds between characters with tier tags (Devoted, Family, Rival, etc.) and short summaries, updated when you index.",
						},
						{
							label: "Manual entry",
							description:
								"Add or edit transcript lines directly — user, assistant, or system roles with specific speaker types.",
						},
					],
				},
			],
		},
		{
			title: "Transcript layout",
			blocks: [
				{
					type: "paragraph",
					text: "The transcript separates character dialogue from narrator prose so long scenes stay readable.",
				},
				{
					type: "bullets",
					items: [
						"Character lines show a blue name label (for example Morgan:, Elena:) followed by dialogue and actions.",
						"Narrator blocks are gray italic prose without a “Narrator:” header — omniscient description and scene-setting.",
						"When the AI embeds a character name inside narrator prose, the name stays in the text as natural writing (not a second dialogue label).",
						"Bubble view uses the same content with per-message edit controls.",
					],
				},
			],
		},
		{
			title: "Writing turns & AI generation",
			blocks: [
				{
					type: "paragraph",
					text: "Each Send sends your message and generates the next AI scene.",
				},
				{
					type: "bullets",
					items: [
						"Generate Response / Generate Direction — AI suggests your next turn. Before any scenes exist it proposes player dialogue or action; once scenes exist it defaults to a Director staging note (`Director: *beat*` with optional `(\"gist\")` for approximate dialogue) using full transcript context (you can edit before sending).",
						"Regenerate — replace the last AI message with a new version.",
						"Edit — change the last AI message manually.",
						"Response variants — when multiple candidates exist, use Previous / Next to pick the best one.",
						"Cancel — stop a generation that is still running.",
						"Retry — resend if a generation failed.",
					],
				},
				{
					type: "paragraph",
					text: "Use the story Settings drawer to override the AI provider or model for this story only, separate from global Settings → AI.",
				},
			],
		},
		{
			title: "View modes",
			blocks: [
				{
					type: "bullets",
					items: [
						"Transcript view (default) — prose layout with speaker tags, chapter banners, and RP time/gold when enabled.",
						"Bubble view — behind-the-scenes message list with Edit, Regenerate, and Delete on each entry. Shows Director, Continue, and other transcript commands hidden from the default prose view.",
						"Reader mode — clean reading without composer controls.",
						"Archive view — automatically summarises your story, characters, locations, relationships, and open plot threads. Use Jump to #N links to return to a transcript message.",
					],
				},
				{
					type: "paragraph",
					text: "Text size is in Settings → Theme (Small through Extra Large). Per-story accent colors are in the story Settings drawer (or use the global theme in Settings → Theme).",
				},
			],
		},
		{
			title: "Chapters",
			blocks: [
				{
					type: "paragraph",
					text: "Chapters break long stories into readable sections. They are created when you write chapter boundaries in your turns or when the story reaches natural chapter ends.",
				},
				{
					type: "bullets",
					items: [
						"Write “Chapter Two”, “end of chapter one”, or “The End” in a message to mark boundaries.",
						"Chapter banners appear in the transcript as “Chapter N” headers.",
						"Jump to Latest Chapter — floating button when you have two or more chapters; scrolls to the current chapter header.",
						"The End saves a final chapter break and can prompt you to create a sequel.",
					],
				},
			],
		},
		{
			title: "Director, author & continue",
			blocks: [
				{
					type: "paragraph",
					text: "Advanced speaker types in Manual entry or the composer let you steer the story without breaking immersion.",
				},
				{
					type: "bullets",
					items: [
						"Director — scene cuts and time skips (“three days later”, “cut to the tavern”). /time +2h, +30m, +3d also works in chat.",
						"Author — declare canon the AI should always remember (highest-priority truth). Example: “The king is secretly a vampire.”",
						"Secret, Reveal, and Retcon — record hidden facts, authorise when they surface, or correct earlier canon going forward.",
						"Continue — send a continue turn to nudge the AI forward without adding new player dialogue.",
						"Canon speaker lines — assistant messages attributed to named NPCs from your universe.",
						"Narrator — omniscient narration beats separate from character dialogue.",
					],
				},
			],
		},
		{
			title: "RP mode",
			blocks: [
				{
					type: "paragraph",
					text: "Turn on RP Mode in the Character Sheet overlay to track mechanics alongside narrative.",
				},
				{
					type: "bullets",
					items: [
						"HP tracking for your protagonist and NPCs — zero HP can trigger consequence prompts.",
						"Currency and in-story time shown in the taskbar when configured.",
						"Dice rolls — enable in RP Settings, then use [roll] or [roll str/dex/con/int/wis/cha] in messages.",
						"Character conditions — AI may suggest status effects you can accept or dismiss.",
						"Export RP data as JSON, Markdown, TXT, or PDF from the Character Sheet.",
					],
				},
			],
		},
		{
			title: "MetaChat & relationships",
			blocks: [
				{
					type: "paragraph",
					text: "MetaChat is separate from your story transcript. Use it to brainstorm plot ideas, compare character motivations, or plan future arcs. Reference entities with @Story, @Character, or @Universe. Library MetaChat on the home page works across your whole workspace.",
				},
				{
					type: "paragraph",
					text: "Relationships tracks how characters feel about each other using tier tags and short descriptions. Update or full reindex to sync with the transcript. The Archive view also surfaces relationships with evidence links.",
				},
			],
		},
		{
			title: "Sequels, branches & prequels",
			blocks: [
				{
					type: "bullets",
					items: [
						"Sequel — continue after The End. The original story becomes a locked read-only prequel; the sequel inherits distilled state and starts at Chapter I.",
						"Branch — fork the story into an editable copy at any point. The original stays editable.",
						"Follow-up links appear in the story header so you can navigate between related stories.",
					],
				},
				{
					type: "paragraph",
					text: "Create sequels from the post-ending prompt, story Settings, or New Story with a predecessor selected.",
				},
			],
		},
		{
			title: "Universes & characters",
			blocks: [
				{
					type: "bullets",
					items: [
						"Universes hold lore, reference sources, and imported wiki content.",
						"Multiple universes — characters and stories can span several worlds (crossovers). Use the universe dropdown and check each world you need.",
						"The character picker when creating a story includes library characters from any selected universe, plus characters tagged with multiple universes.",
						"Generate Universe / Generate Character Details — AI fills in blueprint or character fields.",
						"Import Universe — pull lore from wiki URLs into a new universe.",
						"Quick Character — create a story-local protagonist during story creation; promote to library later from story Settings.",
						"Archive stories from the story list or story Settings to hide them without deleting.",
					],
				},
			],
		},
		{
			title: "Indexing, exports & backups",
			blocks: [
				{
					type: "bullets",
					items: [
						"Automatic Indexing — in story Settings, index after N messages or each chapter so Archive stays current.",
						"Update index / Full reindex — refresh structured story state from the transcript.",
						"Exports — JSON, Markdown, TXT, PDF, and Archive PDF from story Settings or the right sidebar.",
						"Workspace backup — Settings → Data exports everything; import to restore or migrate.",
						"Automatic backups — about every 12 hours when data changes. Android opens a share sheet; web/PWA keeps the last five copies locally and downloads a file. See Settings → Data → Automatic Backups.",
						"Storage — Settings → Storage shows record counts and destructive delete options.",
					],
				},
			],
		},
		{
			title: "Tips for new players",
			blocks: [
				{
					type: "bullets",
					items: [
						"Write specific turns — actions, dialogue, and intent give the AI clearer direction.",
						"Use Director for time skips instead of narrating “nothing happened for a week.”",
						"Use Author directives for secrets the AI should know but characters should not.",
						"Check Archive after a few chapters to see what the index captured.",
						"Validate your AI key before starting a long session.",
						"Export a backup before major experiments or imports.",
						"Install the PWA on mobile so your library stays in one place on that device.",
					],
				},
			],
		},
		{
			title: "You're ready",
			blocks: [
				{
					type: "paragraph",
					text: "That's it! The best way to learn Story Engine is to create a universe, build a character, and start writing.",
				},
			],
		},
	],
};
