import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "../ui/Button";
import { useStoryEngine } from "../../app/providers/StoryEngineProvider";
import { navigateToStoryMessageNumber } from "../../lib/events/storyNavigation";
import { encyclopediaCategoryLabel } from "../../lib/encyclopedia/encyclopediaKeys";
import { isEncyclopediaIndexed } from "../../lib/encyclopedia/encyclopediaMerge";
import type {
	BackgroundJob,
	EncyclopediaCategory,
	EncyclopediaCharacterPage,
	EncyclopediaEventPage,
	EncyclopediaLinkRef,
	EncyclopediaLocationPage,
	EncyclopediaObjectPage,
	EncyclopediaOrganizationPage,
	EncyclopediaRulePage,
	EncyclopediaTechnologyPage,
	StoryEncyclopedia,
} from "../../types/models";
import { cn } from "../../utils/cn";

type EncyclopediaOverlayProps = {
	open: boolean;
	storyId: string;
	messageCount: number;
	onClose: () => void;
	refreshKey?: number;
};

type SelectedEntry =
	| { category: "characters"; id: string; entry: EncyclopediaCharacterPage }
	| { category: "locations"; id: string; entry: EncyclopediaLocationPage }
	| { category: "events"; id: string; entry: EncyclopediaEventPage }
	| { category: "objects"; id: string; entry: EncyclopediaObjectPage }
	| { category: "organizations"; id: string; entry: EncyclopediaOrganizationPage }
	| { category: "rules"; id: string; entry: EncyclopediaRulePage }
	| { category: "technology"; id: string; entry: EncyclopediaTechnologyPage };

const CATEGORY_ORDER: EncyclopediaCategory[] = [
	"characters",
	"locations",
	"events",
	"objects",
	"organizations",
	"rules",
	"technology",
];

function estimateIndexingLabel(messageCount: number): string {
	if (messageCount <= 40) return "approximately 30 seconds";
	if (messageCount <= 200) return "approximately 1–2 minutes";
	if (messageCount <= 600) return "approximately 2–4 minutes";
	return "approximately 3–5 minutes";
}

function FieldSection({ title, children }: { title: string; children: ReactNode }) {
	if (!children) return null;
	return (
		<div className="mt-4">
			<h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">{title}</h4>
			<div className="mt-2 text-sm leading-relaxed text-ink-soft">{children}</div>
		</div>
	);
}

function BulletList({ items }: { items?: string[] }) {
	if (!items?.length) return null;
	return (
		<ul className="list-disc space-y-1 pl-5">
			{items.map((item) => (
				<li key={item}>{item}</li>
			))}
		</ul>
	);
}

function RelatedLinks({
	links,
	onNavigate,
}: {
	links?: EncyclopediaLinkRef[];
	onNavigate: (link: EncyclopediaLinkRef) => void;
}) {
	if (!links?.length) return null;
	return (
		<div className="mt-4 flex flex-wrap gap-2">
			{links.map((link) => (
				<button
					key={`${link.type}-${link.id}`}
					type="button"
					onClick={() => onNavigate(link)}
					className="rounded-full border border-accent/25 bg-accent-surface px-3 py-1 text-xs text-accent-secondary transition hover:border-accent/40"
				>
					{link.label ?? link.id}
				</button>
			))}
		</div>
	);
}

function EntryDetail({
	selected,
	onNavigateLink,
	onJumpToEvent,
}: {
	selected: SelectedEntry;
	onNavigateLink: (link: EncyclopediaLinkRef) => void;
	onJumpToEvent: (event: EncyclopediaEventPage) => void;
}) {
	const { entry, category } = selected;

	return (
		<div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
			<h3 className="text-xl font-semibold text-ink">
				{"name" in entry ? entry.name : "title" in entry ? entry.title : ""}
			</h3>
			<p className="mt-1 text-xs uppercase tracking-[0.12em] text-ink-muted">
				{encyclopediaCategoryLabel(category)}
			</p>

			{category === "characters" && (
				<>
					<FieldSection title="Description">{entry.description}</FieldSection>
					<FieldSection title="Status">{entry.status}</FieldSection>
					<FieldSection title="Occupation">{entry.occupation}</FieldSection>
					<FieldSection title="Current location">{entry.currentLocation}</FieldSection>
					<FieldSection title="Aliases"><BulletList items={entry.aliases} /></FieldSection>
					<FieldSection title="Relationships"><BulletList items={entry.relationships} /></FieldSection>
					<FieldSection title="Family"><BulletList items={entry.family} /></FieldSection>
					<FieldSection title="History"><BulletList items={entry.history} /></FieldSection>
					<FieldSection title="Major events"><BulletList items={entry.majorEvents} /></FieldSection>
					<FieldSection title="Quotes"><BulletList items={entry.quotes} /></FieldSection>
				</>
			)}

			{category === "locations" && (
				<>
					<FieldSection title="Description">{entry.description}</FieldSection>
					<FieldSection title="Current state">{entry.currentState}</FieldSection>
					<FieldSection title="Associated characters"><BulletList items={entry.associatedCharacters} /></FieldSection>
					<FieldSection title="Events"><BulletList items={entry.events} /></FieldSection>
					<FieldSection title="Chapters"><BulletList items={entry.chapterLabels} /></FieldSection>
				</>
			)}

			{category === "events" && (
				<>
					<FieldSection title="Description">{entry.description}</FieldSection>
					<FieldSection title="Participants"><BulletList items={entry.participants} /></FieldSection>
					<FieldSection title="Location">{entry.location}</FieldSection>
					{entry.messageNumber ? (
						<div className="mt-4">
							<Button size="sm" onClick={() => onJumpToEvent(entry)}>
								Go to scene (Message {entry.messageNumber})
							</Button>
						</div>
					) : null}
				</>
			)}

			{category === "objects" && (
				<>
					<FieldSection title="Description">{entry.description}</FieldSection>
					<FieldSection title="Purpose">{entry.purpose}</FieldSection>
					<FieldSection title="Current owner">{entry.currentOwner}</FieldSection>
					<FieldSection title="History"><BulletList items={entry.history} /></FieldSection>
					<FieldSection title="Related events"><BulletList items={entry.relatedEvents} /></FieldSection>
				</>
			)}

			{category === "organizations" && (
				<>
					<FieldSection title="Description">{entry.description}</FieldSection>
					<FieldSection title="Type">{entry.type}</FieldSection>
					<FieldSection title="Role in story">{entry.roleInStory}</FieldSection>
					<FieldSection title="Members"><BulletList items={entry.members} /></FieldSection>
				</>
			)}

			{category === "rules" && (
				<>
					<FieldSection title="Description">{entry.description}</FieldSection>
					<FieldSection title="Scope">{entry.scope}</FieldSection>
					<FieldSection title="Current state">{entry.currentState}</FieldSection>
					<FieldSection title="History"><BulletList items={entry.history} /></FieldSection>
				</>
			)}

			{category === "technology" && (
				<>
					<FieldSection title="Description">{entry.description}</FieldSection>
					<FieldSection title="Current state">{entry.currentState}</FieldSection>
					<FieldSection title="Capabilities"><BulletList items={entry.capabilities} /></FieldSection>
					<FieldSection title="Upgrades"><BulletList items={entry.upgrades} /></FieldSection>
				</>
			)}

			<RelatedLinks links={entry.related} onNavigate={onNavigateLink} />
		</div>
	);
}

export function EncyclopediaOverlay(props: EncyclopediaOverlayProps) {
	const {
		loadStoryEncyclopedia,
		queueEncyclopediaIndexJob,
		getJobsForStory,
		encyclopediaIndexStatus,
		cancelBackgroundJob,
	} = useStoryEngine();

	const [encyclopedia, setEncyclopedia] = useState<StoryEncyclopedia | undefined>();
	const [loading, setLoading] = useState(false);
	const [activeCategory, setActiveCategory] = useState<EncyclopediaCategory>("characters");
	const [selected, setSelected] = useState<SelectedEntry | null>(null);
	const [queueing, setQueueing] = useState(false);

	const jobs = getJobsForStory(props.storyId);
	const runningJob = jobs.find(
		(job: BackgroundJob) =>
			job.type === "encyclopedia_index" && (job.status === "queued" || job.status === "running"),
	);
	const progress =
		encyclopediaIndexStatus?.storyId === props.storyId && encyclopediaIndexStatus.phase !== "idle"
			? encyclopediaIndexStatus
			: null;

	const indexed = isEncyclopediaIndexed(encyclopedia);

	useEffect(() => {
		if (!props.open) return;
		setLoading(true);
		void loadStoryEncyclopedia(props.storyId).then((data) => {
			setEncyclopedia(data);
			setLoading(false);
		});
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = "";
		};
	}, [props.open, props.storyId, props.refreshKey, loadStoryEncyclopedia]);

	useEffect(() => {
		if (progress?.phase === "done") {
			void loadStoryEncyclopedia(props.storyId).then((data) => setEncyclopedia(data));
		}
	}, [progress?.phase, props.storyId, loadStoryEncyclopedia]);

	const entries = useMemo(() => {
		if (!encyclopedia) return [];
		switch (activeCategory) {
			case "characters":
				return Object.values(encyclopedia.characters ?? {}).map((entry: EncyclopediaCharacterPage) => ({
					id: entry.id,
					label: entry.name,
					entry,
				}));
			case "locations":
				return Object.values(encyclopedia.locations ?? {}).map((entry: EncyclopediaLocationPage) => ({
					id: entry.id,
					label: entry.name,
					entry,
				}));
			case "events":
				return (encyclopedia.events ?? []).map((entry: EncyclopediaEventPage) => ({
					id: entry.id,
					label: entry.title,
					entry,
				}));
			case "objects":
				return Object.values(encyclopedia.objects ?? {}).map((entry: EncyclopediaObjectPage) => ({
					id: entry.id,
					label: entry.name,
					entry,
				}));
			case "organizations":
				return Object.values(encyclopedia.organizations ?? {}).map((entry: EncyclopediaOrganizationPage) => ({
					id: entry.id,
					label: entry.name,
					entry,
				}));
			case "rules":
				return (encyclopedia.rules ?? []).map((entry: EncyclopediaRulePage) => ({
					id: entry.id,
					label: entry.title,
					entry,
				}));
			case "technology":
				return Object.values(encyclopedia.technology ?? {}).map((entry: EncyclopediaTechnologyPage) => ({
					id: entry.id,
					label: entry.name,
					entry,
				}));
		}
	}, [activeCategory, encyclopedia]);

	async function startIndex(rebuild = false) {
		setQueueing(true);
		try {
			await queueEncyclopediaIndexJob(props.storyId, {
				trigger: "manual",
				incremental: !rebuild && indexed,
				rebuild,
				force: rebuild,
			});
		} finally {
			setQueueing(false);
		}
	}

	function resolveLink(link: EncyclopediaLinkRef) {
		if (!encyclopedia) return;
		const category = link.type;
		setActiveCategory(category);
		if (category === "events") {
			const event = encyclopedia.events?.find((e) => e.id === link.id);
			if (event) setSelected({ category, id: event.id, entry: event });
			return;
		}
		if (category === "rules") {
			const rule = encyclopedia.rules?.find((r) => r.id === link.id);
			if (rule) setSelected({ category, id: rule.id, entry: rule });
			return;
		}
		const recordMap = encyclopedia[category] as Record<string, { id: string }> | undefined;
		const entry = recordMap?.[link.id] ?? Object.values(recordMap ?? {}).find((e) => e.id === link.id);
		if (!entry) return;
		setSelected({ category, id: entry.id, entry } as SelectedEntry);
	}

	function jumpToEvent(event: EncyclopediaEventPage) {
		if (!event.messageNumber) return;
		navigateToStoryMessageNumber(props.storyId, event.messageNumber);
		props.onClose();
	}

	if (!props.open) return null;

	return (
		<div className="fixed inset-0 z-[55] flex flex-col bg-app/95 backdrop-blur-md bottom-12">
			<div className="flex items-center justify-between border-b border-divider px-4 py-3 sm:px-6">
				<div>
					<h2 className="text-lg font-semibold text-ink">📖 Encyclopedia</h2>
					{indexed && encyclopedia?.lastUpdatedChapter ? (
						<p className="text-xs text-ink-muted">
							Last updated: Chapter {encyclopedia.lastUpdatedChapter}
						</p>
					) : null}
				</div>
				<div className="flex items-center gap-2">
					{indexed ? (
						<Button variant="secondary" size="sm" disabled={queueing || Boolean(runningJob)} onClick={() => void startIndex(true)}>
							Rebuild Encyclopedia
						</Button>
					) : null}
					<Button variant="secondary" size="sm" onClick={props.onClose}>Close</Button>
				</div>
			</div>

			{(progress || runningJob) && (
				<div className="border-b border-divider bg-panel-muted/40 px-4 py-3 text-sm text-ink-soft sm:px-6">
					<div className="flex items-center justify-between gap-3">
						<span>
							{progress?.message ??
								runningJob?.progress?.label ??
								"Indexing encyclopedia from transcript…"}
						</span>
						{runningJob ? (
							<Button
								variant="secondary"
								size="sm"
								onClick={() => void cancelBackgroundJob(runningJob.id)}
							>
								Cancel
							</Button>
						) : null}
					</div>
					{progress && progress.totalMessages > 0 ? (
						<div className="mt-2 h-1.5 rounded-full bg-white/10">
							<div
								className="h-full rounded-full bg-accent transition-all"
								style={{
									width: `${Math.min(
										100,
										Math.round((progress.processedMessages / progress.totalMessages) * 100),
									)}%`,
								}}
							/>
						</div>
					) : null}
				</div>
			)}

			{loading ? (
				<div className="flex flex-1 items-center justify-center text-sm text-ink-muted">Loading encyclopedia…</div>
			) : !indexed ? (
				<div className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center px-6 text-center">
					<p className="text-base font-medium text-ink">This story hasn&apos;t been indexed yet.</p>
					<p className="mt-3 text-sm leading-relaxed text-ink-muted">
						Build an interactive encyclopedia from the entire story transcript — characters, locations,
						events, objects, organizations, rules, and technology.
					</p>
					<p className="mt-2 text-sm text-ink-muted">
						Estimated time: {estimateIndexingLabel(props.messageCount)} depending on story size.
					</p>
					<Button className="mt-6" disabled={queueing || Boolean(runningJob)} onClick={() => void startIndex(false)}>
						Index Story
					</Button>
				</div>
			) : (
				<div className="flex min-h-0 flex-1 flex-col lg:flex-row">
					<aside className="border-b border-divider lg:w-56 lg:border-b-0 lg:border-r">
						<div className="flex gap-1 overflow-x-auto px-3 py-3 lg:flex-col lg:overflow-visible">
							{CATEGORY_ORDER.map((category) => {
								const count =
									category === "events" || category === "rules"
										? (encyclopedia?.[category]?.length ?? 0)
										: Object.keys(encyclopedia?.[category] ?? {}).length;
								return (
									<button
										key={category}
										type="button"
										onClick={() => {
											setActiveCategory(category);
											setSelected(null);
										}}
										className={cn(
											"rounded-lg px-3 py-2 text-left text-sm transition",
											activeCategory === category
												? "bg-accent-surface text-ink"
												: "text-ink-muted hover:bg-white/[0.04] hover:text-ink-soft",
										)}
									>
										{encyclopediaCategoryLabel(category)}
										<span className="ml-2 text-xs text-ink-muted">{count}</span>
									</button>
								);
							})}
						</div>
					</aside>

					<div className="flex min-h-0 flex-1 flex-col lg:flex-row">
						<div className="min-h-0 border-b border-divider lg:w-72 lg:border-b-0 lg:border-r">
							<div className="max-h-48 overflow-y-auto lg:max-h-none lg:h-full">
								{entries.length === 0 ? (
									<p className="px-4 py-6 text-sm text-ink-muted">No entries in this category yet.</p>
								) : (
									entries.map(({ id, label, entry }) => (
										<button
											key={id}
											type="button"
											onClick={() => setSelected({ category: activeCategory, id, entry } as SelectedEntry)}
											className={cn(
												"block w-full border-b border-divider/40 px-4 py-3 text-left text-sm transition hover:bg-white/[0.03]",
												selected?.id === id && selected?.category === activeCategory
													? "bg-accent-surface/60 text-ink"
													: "text-ink-soft",
											)}
										>
											{label}
										</button>
									))
								)}
							</div>
						</div>

						{selected ? (
							<EntryDetail
								selected={selected}
								onNavigateLink={resolveLink}
								onJumpToEvent={jumpToEvent}
							/>
						) : (
							<div className="flex flex-1 items-center justify-center px-6 text-sm text-ink-muted">
								Select an entry to explore the world.
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
