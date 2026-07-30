import { Link } from "react-router-dom";
import { Panel } from "../ui/Panel";

function TutorialSection({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<Panel variant="flat">
			<div className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">{title}</div>
			<div className="mt-3 space-y-3 text-[13px] leading-6 text-ink-muted">{children}</div>
		</Panel>
	);
}

function TutorialLink({ to, children }: { to: string; children: React.ReactNode }) {
	return (
		<Link to={to} className="font-semibold text-ink-soft underline decoration-accent/40 underline-offset-2 hover:text-accent">
			{children}
		</Link>
	);
}

function StepList({ items }: { items: string[] }) {
	return (
		<ol className="list-decimal space-y-2 pl-5 marker:text-accent-soft marker:font-semibold">
			{items.map((item) => (
				<li key={item}>{item}</li>
			))}
		</ol>
	);
}

function BulletList({ items }: { items: string[] }) {
	return (
		<ul className="list-disc space-y-1.5 pl-5 marker:text-accent-soft">
			{items.map((item) => (
				<li key={item}>{item}</li>
			))}
		</ul>
	);
}

function TaskbarItem({ label, description }: { label: string; description: string }) {
	return (
		<div className="rounded-[8px] border border-divider/[0.35] bg-panel-muted/40 px-3 py-2.5">
			<div className="text-[12px] font-semibold text-ink-soft">{label}</div>
			<div className="mt-1 text-[12px] leading-5 text-ink-muted">{description}</div>
		</div>
	);
}

export function TutorialSettingsTab() {
	return (
		<div className="space-y-5">
			<Panel variant="flat">
				<div className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">Tutorial</div>
				<p className="mt-3 text-[15px] font-semibold text-ink">Welcome to Story Engine</p>
				<p className="mt-2 text-[13px] leading-6 text-ink-muted">
					Story Engine is a local-first storytelling workspace. You build universes and characters, then play through
					AI-assisted stories where you control your protagonist and the AI narrates the world around you. Everything
					lives on your device until you choose to export it.
				</p>
				<p className="mt-2 text-[12px] text-ink-muted">
					Use the sections below as an onboarding guide. Start with setup, then open a story and experiment with the
					workspace taskbar.
				</p>
			</Panel>

			<TutorialSection title="Quick start — your first story">
				<StepList
					items={[
						"Open Settings → AI and add an API key for OpenAI, Gemini, or OpenRouter. Use Validate to confirm the connection works.",
						"Create a Universe — your world container. Use Custom mode to describe a setting, or Referenced mode to pull from wiki sources.",
						"Create a Player Character — your reusable protagonist library entry, tied to that universe.",
						"Create a Story — pick universe + character, add a title, and start at Chapter I.",
						"Open the story, type in the Chat composer, and press Send to generate the next scene.",
					]}
				/>
				<p>
					<TutorialLink to="/universes/new">New Universe</TutorialLink>
					{" · "}
					<TutorialLink to="/player-characters/new">New Character</TutorialLink>
					{" · "}
					<TutorialLink to="/stories/new">New Story</TutorialLink>
				</p>
			</TutorialSection>

			<TutorialSection title="The story workspace">
				<p>
					When you open a story, the workspace is where you read, write, and manage everything. The header shows your
					universe, protagonist, and story title. The transcript in the middle is your timeline. The Chat panel at the
					bottom is where you send turns.
				</p>
				<p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-soft">Bottom taskbar</p>
				<div className="grid gap-2 sm:grid-cols-2">
					<TaskbarItem
						label="Settings"
						description="Per-story options: AI model, RP mode, content mode, exports, sequel/branch actions, and indexing."
					/>
					<TaskbarItem
						label="Bubble view"
						description="Chat-style bubbles with Edit, Regenerate, and Delete on each message. Good for reviewing recent turns."
					/>
					<TaskbarItem
						label="Archive"
						description="Browse indexed story state: premise, open threads, characters, locations, relationships, and memories."
					/>
					<TaskbarItem
						label="Reader mode"
						description="Distraction-free reading. Hides the composer and extra chrome so you can read like a book."
					/>
					<TaskbarItem
						label="MetaChat"
						description="Out-of-canon AI chat for brainstorming, planning arcs, or comparing ideas — never written into the story."
					/>
					<TaskbarItem
						label="Character Sheet"
						description="RP stats, HP, currency, in-story time, and event log when RP Mode is enabled."
					/>
					<TaskbarItem
						label="Relationships"
						description="Track bonds between characters with trust, affection, and other metrics the AI can reference."
					/>
					<TaskbarItem
						label="Manual entry"
						description="Add or edit transcript lines directly — user, assistant, or system roles with specific speaker types."
					/>
				</div>
			</TutorialSection>

			<TutorialSection title="Writing turns & AI generation">
				<p>
					Each <strong className="text-ink-soft">Send</strong> sends your message and generates the next AI scene. The
					AI narrates the world and NPCs but does not control your player character — you always own your protagonist&apos;s
					actions and dialogue.
				</p>
				<BulletList
					items={[
						"Generate Response — AI suggests what your character might say or do next (you can edit before sending).",
						"Regenerate — replace the last AI message with a new version.",
						"Edit — change the last AI message manually.",
						"Response variants — when multiple candidates exist, use Previous / Next to pick the best one.",
						"Cancel — stop a generation that is still running.",
						"Retry — resend if a generation failed.",
					]}
				/>
				<p>
					Use the story <strong className="text-ink-soft">Settings</strong> drawer to override the AI provider or model
					for this story only, separate from global Settings → AI.
				</p>
			</TutorialSection>

			<TutorialSection title="View modes">
				<BulletList
					items={[
						"Transcript view (default) — prose layout with speaker tags, chapter banners, and RP time/gold when enabled.",
						"Bubble view — compact chat bubbles; best for editing individual messages.",
						"Reader mode — clean reading without composer controls.",
						"Archive view — structured index of story state, not the live transcript. Use Jump to #N links to return to a message.",
					]}
				/>
				<p>
					Text size can be changed in <strong className="text-ink-soft">Settings → Theme</strong> (Small through Extra
					Large).
				</p>
			</TutorialSection>

			<TutorialSection title="Chapters">
				<p>
					Chapters break long stories into readable sections. They are created when you write chapter boundaries in your
					turns or when the story reaches natural chapter ends.
				</p>
				<BulletList
					items={[
						"Write “Chapter Two”, “end of chapter one”, or “The End” in a message to mark boundaries.",
						"Chapter banners appear in the transcript as “Chapter N” headers.",
						"Jump to Latest Chapter — floating button when you have two or more chapters; scrolls to the current chapter header.",
						"The End saves a final chapter break and can prompt you to create a sequel.",
					]}
				/>
			</TutorialSection>

			<TutorialSection title="Director, author & continue">
				<p>Advanced speaker types in Manual entry or the composer let you steer the story without breaking immersion.</p>
				<BulletList
					items={[
						"Director — scene cuts and time skips (“three days later”, “cut to the tavern”). /time +2h, +30m, +3d also works in chat.",
						"Author — canon declarations, secrets, reveals, and retcons. Highest-priority truth for the AI.",
						"Continue — send a continue turn to nudge the AI forward without adding new player dialogue.",
						"Canon speaker lines — assistant messages attributed to named NPCs from your universe.",
						"Narrator — omniscient narration beats separate from character dialogue.",
					]}
				/>
			</TutorialSection>

			<TutorialSection title="RP mode">
				<p>
					Turn on <strong className="text-ink-soft">RP Mode</strong> in the Character Sheet overlay to track mechanics
					alongside narrative.
				</p>
				<BulletList
					items={[
						"HP tracking for your protagonist and NPCs — zero HP can trigger consequence prompts.",
						"Currency and in-story time shown in the taskbar when configured.",
						"Dice rolls — enable in RP Settings, then use [roll] or [roll str/dex/con/int/wis/cha] in messages.",
						"Character conditions — AI may suggest status effects you can accept or dismiss.",
						"Export RP data as JSON, Markdown, TXT, or PDF from the Character Sheet.",
					]}
				/>
			</TutorialSection>

			<TutorialSection title="MetaChat & relationships">
				<p>
					<strong className="text-ink-soft">MetaChat</strong> is separate from your story transcript. Use it to brainstorm
					plot ideas, compare character motivations, or plan future arcs. Reference entities with @Story, @Character, or
					@Universe. Library MetaChat on the home page works across your whole workspace.
				</p>
				<p>
					<strong className="text-ink-soft">Relationships</strong> tracks how characters feel about each other. Update or
					full reindex to sync with the transcript. The Archive view also surfaces relationship metrics with evidence links.
				</p>
			</TutorialSection>

			<TutorialSection title="Sequels, branches & prequels">
				<BulletList
					items={[
						"Sequel — continue after The End. The original story becomes a locked read-only prequel; the sequel inherits distilled state and starts at Chapter I.",
						"Branch — fork the story into an editable copy at any point. The original stays editable.",
						"Follow-up links appear in the story header so you can navigate between related stories.",
					]}
				/>
				<p>
					Create sequels from the post-ending prompt, story Settings, or{" "}
					<TutorialLink to="/stories/new">New Story</TutorialLink> with a predecessor selected.
				</p>
			</TutorialSection>

			<TutorialSection title="Universes & characters">
				<BulletList
					items={[
						"Universes hold lore, reference sources, and imported wiki content.",
						"Generate Universe / Generate Character Details — AI fills in blueprint or character fields.",
						"Import Universe — pull lore from wiki URLs into a new universe.",
						"Quick Character — create a story-local protagonist during story creation; promote to library later from story Settings.",
						"Archive stories from the story list or story Settings to hide them without deleting.",
					]}
				/>
			</TutorialSection>

			<TutorialSection title="Indexing, exports & backups">
				<BulletList
					items={[
						"Automatic Indexing — in story Settings, index after N messages or each chapter so Archive stays current.",
						"Update index / Full reindex — refresh structured story state from the transcript.",
						"Exports — JSON, Markdown, TXT, PDF, and Archive PDF from story Settings or the right sidebar.",
						"Workspace backup — Settings → Data exports everything; import to restore or migrate.",
						"Storage — Settings → Storage shows record counts and destructive delete options.",
					]}
				/>
			</TutorialSection>

			<TutorialSection title="Tips for new players">
				<BulletList
					items={[
						"Write specific turns — actions, dialogue, and intent give the AI clearer direction.",
						"Use Director for time skips instead of narrating “nothing happened for a week.”",
						"Use Author directives for secrets the AI should know but characters should not.",
						"Check Archive after a few chapters to see what the index captured.",
						"Validate your AI key before starting a long session.",
						"Export a backup before major experiments or imports.",
					]}
				/>
			</TutorialSection>
		</div>
	);
}
