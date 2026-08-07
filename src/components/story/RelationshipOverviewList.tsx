import type { RelationshipIndexEntry, RelationshipTier } from "../../types/models";
import { relationshipCounterparty } from "../../lib/storyRelationshipLoad";
import { cn } from "../../utils/cn";

const TIER_COLOR: Partial<Record<RelationshipTier, string>> = {
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

type Props = {
	relationships: RelationshipIndexEntry[];
	playerName?: string;
	playerAliases?: string[];
	limit?: number;
	className?: string;
	emptyLabel?: string;
};

export function RelationshipOverviewList({
	relationships,
	playerName,
	playerAliases,
	limit,
	className,
	emptyLabel = "No relationships indexed yet.",
}: Props) {
	const visible = limit != null ? relationships.slice(0, limit) : relationships;

	if (!visible.length) {
		return <p className="text-xs text-ink-muted">{emptyLabel}</p>;
	}

	return (
		<div className={cn("space-y-3", className)}>
			{visible.map((entry, index) => {
				const counterparty = relationshipCounterparty(entry, playerName, playerAliases);
				const tier = entry.tier ?? "stranger";
				return (
					<div
						key={`${entry.a}-${entry.b}-${index}`}
						className="rounded-[8px] border border-divider/[0.4] bg-panel-muted/40 px-3 py-3"
					>
						<div className="flex items-center gap-2 flex-wrap">
							<span className="font-semibold text-ink-soft">{counterparty}</span>
							<span
								className={cn(
									"rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize",
									TIER_COLOR[tier] ?? "bg-white/5 text-ink-muted border-white/10",
								)}
							>
								{tier}
							</span>
						</div>
						{entry.summary ? (
							<p className="mt-1 text-xs text-ink-muted line-clamp-2">{entry.summary}</p>
						) : null}
					</div>
				);
			})}
		</div>
	);
}
