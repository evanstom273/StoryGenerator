import { useEffect, useState } from "react";
import { Button } from "../ui/Button";
import { useStoryEngine } from "../../app/providers/StoryEngineProvider";
import type { RelationshipHistoryEntry, RelationshipIndexEntry, RelationshipTier } from "../../types/models";
import { makeRelationshipPairKey } from "../../lib/relationshipIndex";
import { filterPlayerRelationships } from "../../lib/storyRelationshipLoad";
import { cn } from "../../utils/cn";

const TIER_GROUPS: { label: string; tiers: RelationshipTier[] }[] = [
	{ label: "Close", tiers: ["devoted", "lover", "partner", "best friend", "confidant", "close friend", "friend", "family"] },
	{ label: "Support & Care", tiers: ["mentor", "mentee", "caregiver", "patient"] },
	{ label: "Professional", tiers: ["ally", "colleague", "professional"] },
	{ label: "Neutral", tiers: ["acquaintance", "stranger"] },
	{ label: "Complicated", tiers: ["complicated", "guarded", "distant", "estranged"] },
	{ label: "Negative", tiers: ["rival", "adversary", "enemy", "nemesis", "threat"] },
];

const TIER_COLOR: Record<RelationshipTier, string> = {
	devoted: "bg-rose-500/15 text-rose-400 border-rose-500/20",
	lover: "bg-rose-500/15 text-rose-400 border-rose-500/20",
	partner: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
	"best friend": "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
	confidant: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
	"close friend": "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
	friend: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
	family: "bg-violet-500/15 text-violet-400 border-violet-500/20",
	mentor: "bg-sky-500/15 text-sky-400 border-sky-500/20",
	mentee: "bg-sky-500/15 text-sky-400 border-sky-500/20",
	caregiver: "bg-violet-500/15 text-violet-400 border-violet-500/20",
	patient: "bg-violet-500/15 text-violet-400 border-violet-500/20",
	ally: "bg-sky-500/15 text-sky-400 border-sky-500/20",
	colleague: "bg-white/5 text-white/48 border-white/10",
	professional: "bg-white/5 text-white/48 border-white/10",
	acquaintance: "bg-white/5 text-white/48 border-white/10",
	stranger: "bg-white/5 text-white/38 border-white/10",
	complicated: "bg-amber-500/15 text-amber-400 border-amber-500/20",
	guarded: "bg-amber-500/15 text-amber-400 border-amber-500/20",
	distant: "bg-amber-500/15 text-amber-400 border-amber-500/20",
	estranged: "bg-amber-500/15 text-amber-400 border-amber-500/20",
	rival: "bg-orange-500/15 text-orange-400 border-orange-500/20",
	adversary: "bg-orange-500/15 text-orange-400 border-orange-500/20",
	enemy: "bg-red-500/15 text-red-400 border-red-500/20",
	nemesis: "bg-red-500/15 text-red-400 border-red-500/20",
	threat: "bg-red-500/15 text-red-400 border-red-500/20",
};

const TIER_ORDER: RelationshipTier[] = [
	"devoted", "lover", "partner", "best friend", "confidant", "close friend", "family", "friend",
	"mentor", "mentee", "caregiver", "patient", "ally", "colleague", "professional",
	"acquaintance", "stranger",
	"complicated", "guarded", "distant", "estranged",
	"rival", "adversary", "enemy", "nemesis", "threat",
];

function sortByTier(rels: RelationshipIndexEntry[]): RelationshipIndexEntry[] {
	return [...rels].sort((a, b) => {
		const ai = TIER_ORDER.indexOf(a.tier ?? "stranger");
		const bi = TIER_ORDER.indexOf(b.tier ?? "stranger");
		return ai - bi;
	});
}

function makePairKey(a: string, b: string) {
	const [x, y] = [a.toLowerCase().trim(), b.toLowerCase().trim()].sort();
	return `${x}::${y}`;
}

function TierSelect({ value, onChange, className }: { value: RelationshipTier; onChange: (t: RelationshipTier) => void; className?: string }) {
	return (
		<select
			className={cn("rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-1.5 text-sm text-ink outline-none", className)}
			value={value}
			onChange={(e) => onChange(e.target.value as RelationshipTier)}
		>
			{TIER_GROUPS.map((g) => (
				<optgroup key={g.label} label={g.label}>
					{g.tiers.map((t) => (
						<option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
					))}
				</optgroup>
			))}
		</select>
	);
}

function RelationshipListCard({
	entry,
	onClick,
}: {
	entry: RelationshipIndexEntry;
	onClick: () => void;
}) {
	const colorClass = TIER_COLOR[entry.tier ?? "stranger"];
	return (
		<button
			type="button"
			onClick={onClick}
			className="w-full rounded-[10px] border border-divider/40 bg-panel-muted/40 px-4 py-3 text-left hover:border-divider/70 hover:bg-panel-muted/60 transition"
		>
			<div className="flex flex-wrap items-center gap-2">
				<span className="font-semibold text-ink">{entry.a}</span>
				<span className="text-xs text-ink-muted">↔</span>
				<span className="font-semibold text-ink">{entry.b}</span>
				<span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize", colorClass)}>
					{entry.tier ?? "stranger"}
				</span>
				<span className="ml-auto text-[10px] text-ink-muted/50">→</span>
			</div>
			{entry.summary ? (
				<p className="mt-1 text-xs text-ink-muted">{entry.summary}</p>
			) : null}
		</button>
	);
}

interface DetailDraft {
	tier: RelationshipTier;
	summary: string;
	playerIntention: string;
}

function toDraft(entry: RelationshipIndexEntry): DetailDraft {
	return {
		tier: entry.tier ?? "stranger",
		summary: entry.summary ?? "",
		playerIntention: entry.playerIntention ?? "",
	};
}

function fromDraft(entry: RelationshipIndexEntry, draft: DetailDraft): RelationshipIndexEntry {
	return {
		a: entry.a,
		b: entry.b,
		tier: draft.tier,
		summary: draft.summary.trim() || undefined,
		playerIntention: draft.playerIntention.trim() || undefined,
		...(entry.history?.length ? { history: entry.history } : {}),
		...(entry.evidence ? { evidence: entry.evidence } : {}),
	};
}

function SectionLabel({ children }: { children: React.ReactNode }) {
	return <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">{children}</p>;
}

function RelationshipDetailPanel({
	entry,
	onSave,
	onDelete,
}: {
	entry: RelationshipIndexEntry;
	onSave: (updated: RelationshipIndexEntry) => Promise<void>;
	onDelete: () => void;
}) {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState<DetailDraft>(() => toDraft(entry));
	const [saving, setSaving] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(false);

	useEffect(() => {
		setDraft(toDraft(entry));
		setEditing(false);
	}, [entry]);

	async function handleSave() {
		setSaving(true);
		try {
			await onSave(fromDraft(entry, draft));
			setEditing(false);
		} finally {
			setSaving(false);
		}
	}

	const colorClass = TIER_COLOR[entry.tier ?? "stranger"];
	const hasHistory = Array.isArray(entry.history) && entry.history.length > 0;

	if (editing) {
		return (
			<div className="space-y-5 pb-8">
				<div className="space-y-3 rounded-[10px] border border-accent/20 bg-panel-muted/40 px-4 py-3">
					<SectionLabel>Relationship</SectionLabel>
					<label className="block space-y-1">
						<span className="text-[10px] text-ink-muted">Tier</span>
						<TierSelect value={draft.tier} onChange={(t) => setDraft((d) => ({ ...d, tier: t }))} className="w-full" />
					</label>
					<label className="block space-y-1">
						<span className="text-[10px] text-ink-muted">Summary</span>
						<textarea
							rows={3}
							className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-1.5 text-sm text-ink outline-none resize-none"
							value={draft.summary}
							onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))}
							placeholder="1-2 sentence description…"
						/>
					</label>
				</div>

				<div className="space-y-2 rounded-[10px] border border-divider/40 bg-panel-muted/40 px-4 py-3">
					<SectionLabel>Your Intention</SectionLabel>
					<textarea
						rows={2}
						className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-1.5 text-sm text-ink outline-none resize-none"
						value={draft.playerIntention}
						onChange={(e) => setDraft((d) => ({ ...d, playerIntention: e.target.value }))}
						placeholder="What are you trying to build, repair, or protect in this relationship?…"
					/>
					<p className="text-[10px] text-ink-muted/50">Injected into story context to nudge the AI.</p>
				</div>

				<div className="flex gap-2">
					<Button variant="primary" size="sm" disabled={saving} onClick={() => void handleSave()}>{saving ? "Saving…" : "Save"}</Button>
					<Button variant="ghost" size="sm" onClick={() => { setDraft(toDraft(entry)); setEditing(false); }}>Cancel</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-5 pb-8">
			<div className="flex items-start justify-between gap-3">
				<div>
					<span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize", colorClass)}>
						{entry.tier ?? "stranger"}
					</span>
					{entry.summary ? (
						<p className="mt-1.5 text-sm text-ink-muted">{entry.summary}</p>
					) : null}
				</div>
				<div className="flex shrink-0 gap-2">
					<button type="button" onClick={() => setEditing(true)} className="text-xs text-ink-muted hover:text-ink">Edit</button>
					{confirmDelete ? (
						<>
							<button type="button" onClick={onDelete} className="text-xs text-red-400 hover:text-red-300">Confirm delete</button>
							<button type="button" onClick={() => setConfirmDelete(false)} className="text-xs text-ink-muted hover:text-ink">Cancel</button>
						</>
					) : (
						<button type="button" onClick={() => setConfirmDelete(true)} className="text-xs text-ink-muted hover:text-red-400">Delete</button>
					)}
				</div>
			</div>

			<div className="rounded-[10px] border border-divider/30 bg-panel-muted/30 px-4 py-3 space-y-1.5">
				<SectionLabel>Your Intention</SectionLabel>
				{entry.playerIntention ? (
					<p className="text-sm text-ink">{entry.playerIntention}</p>
				) : (
					<p className="text-sm text-ink-muted/50 italic">Not set — tap Edit to add what you're trying to build here.</p>
				)}
			</div>

			{hasHistory ? (
				<div className="space-y-2 rounded-[10px] border border-divider/30 bg-panel-muted/30 px-4 py-3">
					<SectionLabel>Key Moments (Indexed)</SectionLabel>
					{(entry.history as RelationshipHistoryEntry[]).map((h, i) => (
						<div key={i} className="flex items-start gap-2 text-xs text-ink-muted">
							<span className="mt-px shrink-0 text-[10px] text-white/20">#{i + 1}</span>
							<span>{h.summary}</span>
						</div>
					))}
				</div>
			) : null}
		</div>
	);
}

type Filter = "player" | "all";

export function RelationshipsOverlay(props: {
	open: boolean;
	storyId: string;
	playerName?: string;
	playerAliases?: string[];
	universeImportedCharacters?: string[];
	onClose: () => void;
	refreshKey?: number;
	onRelationshipsChange?: () => void;
}) {
	const { loadStoryRelationships, updateRelationshipsIndex, queueStoryIndexJob } = useStoryEngine();
	const [relationships, setRelationships] = useState<RelationshipIndexEntry[]>([]);
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const [filter, setFilter] = useState<Filter>("player");
	const [selectedEntry, setSelectedEntry] = useState<RelationshipIndexEntry | null>(null);
	const [addingNew, setAddingNew] = useState(false);
	const [newEntry, setNewEntry] = useState({ a: "", b: "", tier: "stranger" as RelationshipTier, summary: "" });

	useEffect(() => {
		if (!props.open) return;
		setLoading(true);
		void loadStoryRelationships(props.storyId).then((rels) => {
			setRelationships(rels);
			setSelectedEntry((prev) => {
				if (!prev) return null;
				const key = makeRelationshipPairKey(prev.a, prev.b);
				return rels.find((r) => makeRelationshipPairKey(r.a, r.b) === key) ?? null;
			});
			setLoading(false);
		});
		document.body.style.overflow = "hidden";
		return () => { document.body.style.overflow = ""; };
	}, [props.open, props.storyId, props.refreshKey]);

	if (!props.open) return null;

	const pcName = props.playerName?.trim().toLowerCase() ?? "";
	const filtered = filter === "player" && pcName
		? filterPlayerRelationships(relationships, props.playerName, props.playerAliases)
		: relationships;
	const sorted = sortByTier(filtered);

	async function persist(next: RelationshipIndexEntry[]) {
		setRelationships(next);
		setSaving(true);
		try {
			await updateRelationshipsIndex(props.storyId, next);
			props.onRelationshipsChange?.();
		} finally {
			setSaving(false);
		}
	}

	async function handleSaveEntry(updated: RelationshipIndexEntry) {
		const key = makePairKey(updated.a, updated.b);
		const next = relationships.map((r) => makePairKey(r.a, r.b) === key ? updated : r);
		setSelectedEntry(updated);
		await persist(next);
	}

	function handleDelete(entry: RelationshipIndexEntry) {
		const key = makePairKey(entry.a, entry.b);
		void persist(relationships.filter((r) => makePairKey(r.a, r.b) !== key));
		setSelectedEntry(null);
	}

	function handleAdd() {
		const a = newEntry.a.trim();
		const b = newEntry.b.trim();
		if (!a || !b) return;
		const key = makePairKey(a, b);
		if (relationships.some((r) => makePairKey(r.a, r.b) === key)) return;
		const entry: RelationshipIndexEntry = {
			a, b, tier: newEntry.tier,
			...(newEntry.summary.trim() ? { summary: newEntry.summary.trim() } : {}),
		};
		void persist([...relationships, entry]);
		setNewEntry({ a: "", b: "", tier: "stranger", summary: "" });
		setAddingNew(false);
	}

	async function handleRefresh(incremental: boolean) {
		setRefreshing(true);
		try {
			await queueStoryIndexJob(props.storyId, { trigger: "manual", incremental, force: !incremental });
		} finally {
			setRefreshing(false);
		}
	}

	const detailNpcName = selectedEntry
		? (selectedEntry.a.toLowerCase().trim() === pcName ? selectedEntry.b : selectedEntry.a)
		: "";

	return (
		<div className="fixed top-0 left-0 right-0 bottom-12 z-[55] flex flex-col bg-app">
			<div className="flex shrink-0 items-center justify-between border-b border-divider/[0.3] px-4 py-3">
				{selectedEntry ? (
					<div className="flex items-center gap-3 min-w-0">
						<button type="button" onClick={() => setSelectedEntry(null)} className="shrink-0 text-sm text-ink-muted hover:text-ink">← Back</button>
						<div className="min-w-0">
							<h2 className="truncate text-base font-bold text-ink">{detailNpcName}</h2>
							<p className="text-xs text-ink-muted truncate">
								{selectedEntry.a} ↔ {selectedEntry.b}
							</p>
						</div>
					</div>
				) : (
					<div>
						<h2 className="text-base font-bold text-ink">Relationships</h2>
						<p className="text-xs text-ink-muted">{relationships.length} indexed</p>
					</div>
				)}
				<div className="flex shrink-0 items-center gap-2">
					{saving ? <span className="text-xs text-ink-muted">Saving…</span> : null}
					{!selectedEntry && (
						<>
							<Button variant="ghost" size="sm" disabled={refreshing} onClick={() => void handleRefresh(true)}>
								{refreshing ? "Queued…" : "Update"}
							</Button>
							<Button variant="ghost" size="sm" disabled={refreshing} onClick={() => void handleRefresh(false)}>
								Full reindex
							</Button>
							<div className="flex rounded-lg border border-divider/40 bg-panel-muted/50 p-0.5">
								{(["player", "all"] as Filter[]).map((f) => (
									<button
										key={f}
										type="button"
										onClick={() => setFilter(f)}
										className={cn(
											"rounded-md px-3 py-1 text-xs font-medium transition",
											filter === f ? "bg-accent text-accent-foreground" : "text-ink-muted hover:text-ink",
										)}
									>
										{f === "player" ? "Mine" : "All"}
									</button>
								))}
							</div>
						</>
					)}
					<Button variant="ghost" size="sm" onClick={props.onClose}>Close</Button>
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
				{selectedEntry ? (
					<RelationshipDetailPanel
						entry={selectedEntry}
						onSave={handleSaveEntry}
						onDelete={() => handleDelete(selectedEntry)}
					/>
				) : (
					<div className="space-y-3">
						{addingNew ? (
							<div className="rounded-[10px] border border-accent/30 bg-panel-muted/60 px-4 py-3 space-y-3">
								<p className="text-xs font-semibold text-ink-soft">New Relationship</p>
								<div className="grid grid-cols-2 gap-2">
									<label className="block space-y-1">
										<span className="text-[10px] text-ink-muted">Person A</span>
										<input className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-1.5 text-sm text-ink outline-none" value={newEntry.a} onChange={(e) => setNewEntry((n) => ({ ...n, a: e.target.value }))} placeholder="Name…" />
									</label>
									<label className="block space-y-1">
										<span className="text-[10px] text-ink-muted">Person B</span>
										<input className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-1.5 text-sm text-ink outline-none" value={newEntry.b} onChange={(e) => setNewEntry((n) => ({ ...n, b: e.target.value }))} placeholder="Name…" />
									</label>
								</div>
								<label className="block space-y-1">
									<span className="text-[10px] text-ink-muted">Tier</span>
									<TierSelect value={newEntry.tier} onChange={(t) => setNewEntry((n) => ({ ...n, tier: t }))} className="w-full" />
								</label>
								<label className="block space-y-1">
									<span className="text-[10px] text-ink-muted">Summary</span>
									<textarea rows={2} className="w-full rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-1.5 text-sm text-ink outline-none resize-none" value={newEntry.summary} onChange={(e) => setNewEntry((n) => ({ ...n, summary: e.target.value }))} placeholder="Optional summary…" />
								</label>
								<div className="flex gap-2">
									<Button variant="primary" size="sm" onClick={handleAdd} disabled={!newEntry.a.trim() || !newEntry.b.trim()}>Add</Button>
									<Button variant="ghost" size="sm" onClick={() => setAddingNew(false)}>Cancel</Button>
								</div>
							</div>
						) : (
							<button
								type="button"
								onClick={() => setAddingNew(true)}
								className="flex w-full items-center gap-2 rounded-[10px] border border-dashed border-divider/40 px-4 py-2.5 text-xs text-ink-muted hover:border-divider hover:text-ink transition"
							>
								<span className="text-base leading-none">+</span> Add relationship manually
							</button>
						)}

						{loading ? (
							<p className="text-xs text-ink-muted">Loading…</p>
						) : sorted.length === 0 ? (
							<div className="space-y-2">
								<p className="text-sm text-ink-muted">
									{filter === "player" && pcName
										? `No relationships indexed for ${props.playerName} yet.`
										: "No relationships indexed yet."}
								</p>
								<p className="text-xs text-ink-muted/60">Hit Update to queue a new index, or add relationships manually above.</p>
							</div>
						) : (
							sorted.map((rel, i) => (
								<RelationshipListCard
									key={`${makePairKey(rel.a, rel.b)}-${i}`}
									entry={rel}
									onClick={() => setSelectedEntry(rel)}
								/>
							))
						)}
					</div>
				)}
			</div>
		</div>
	);
}
