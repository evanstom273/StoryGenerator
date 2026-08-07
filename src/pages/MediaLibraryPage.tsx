import { useMemo, useState } from "react";
import type { MediaAssetCategory } from "../types/models";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/ui/Panel";
import {
	useMediaLibrary,
	type MediaAssetView,
} from "../app/providers/MediaLibraryProvider";
import {
	formatDurationMs,
	formatPlaybackProgress,
	MEDIA_ASSET_CATEGORY_LABELS,
} from "../lib/mediaLibrary/format";
import { formatRelativeTime } from "../lib/dates";
import { cn } from "../utils/cn";
import { MediaLibraryPlayButton } from "../components/mediaLibrary/MediaLibraryPlayButton";
import { MediaLibraryDeleteButton } from "../components/mediaLibrary/MediaLibraryDeleteButton";

const CATEGORY_FILTERS: Array<MediaAssetCategory | "all"> = [
	"all",
	"audiobook",
	"chapter",
	"ai_document",
	"podcast",
];

function MediaLibraryAssetCard({ asset }: { asset: MediaAssetView }) {
	const createdLabel = formatRelativeTime(new Date(asset.createdAtMs).toISOString());
	const progressLabel =
		asset.lastPositionMs > 0
			? formatPlaybackProgress(asset.lastPositionMs, asset.durationMs)
			: formatDurationMs(asset.durationMs);

	return (
		<Panel variant="flat" padding="sm" className="border-divider/[0.45]">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="text-[9px] font-bold uppercase tracking-[0.18em] text-accent-soft">
						{MEDIA_ASSET_CATEGORY_LABELS[asset.category]}
					</div>
					<div className="mt-2 truncate text-[15px] font-semibold text-ink">{asset.title}</div>
					<div className="mt-1 truncate text-sm text-ink-muted">{asset.subtitle}</div>
				</div>
				{asset.isOrphaned ? (
					<span className="shrink-0 rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-amber-100">
						Orphaned
					</span>
				) : null}
			</div>
			<div className="mt-3 flex flex-wrap items-center justify-between gap-3">
				<div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
					<span>{createdLabel}</span>
					<span>·</span>
					<span>{progressLabel}</span>
					<span>·</span>
					<span className="uppercase tracking-[0.12em]">{asset.format}</span>
				</div>
				<div className="flex items-center gap-1">
					<MediaLibraryPlayButton asset={asset} />
					<MediaLibraryDeleteButton assetId={asset.id} title={asset.title} />
				</div>
			</div>
		</Panel>
	);
}

export function MediaLibraryPage() {
	const { assets, loading } = useMediaLibrary();
	const [filter, setFilter] = useState<MediaAssetCategory | "all">("all");

	const filteredAssets = useMemo(
		() =>
			filter === "all" ? assets : assets.filter((asset) => asset.category === filter),
		[assets, filter],
	);

	return (
		<div className="space-y-6">
			<PageHeader
				title="Media Library"
				description="Browse generated audiobooks, chapter audio, AI document podcasts, and saved story audio from your local Story Engine library."
			/>

			<div className="flex flex-wrap gap-2">
				{CATEGORY_FILTERS.map((category) => (
					<button
						key={category}
						type="button"
						onClick={() => setFilter(category)}
						className={cn(
							"rounded-full border px-3 py-1.5 text-[11px] font-medium transition",
							filter === category
								? "border-accent/[0.35] bg-accent/[0.12] text-accent-soft"
								: "border-divider/[0.45] bg-panel-muted text-ink-muted hover:border-divider/[0.65] hover:text-ink-soft",
						)}
					>
						{category === "all" ? "All" : MEDIA_ASSET_CATEGORY_LABELS[category]}
					</button>
				))}
			</div>

			{loading ? (
				<Panel variant="flat" padding="lg">
					<p className="text-sm text-ink-muted">Loading your media library…</p>
				</Panel>
			) : filteredAssets.length ? (
				<div className="grid gap-3">
					{filteredAssets.map((asset) => (
						<MediaLibraryAssetCard key={asset.id} asset={asset} />
					))}
				</div>
			) : (
				<Panel variant="flat" padding="lg">
					<p className="text-sm leading-relaxed text-ink-muted">
						No media here yet. Generate podcast audio from Settings → AI Documents and it
						will appear automatically. Story audiobooks and chapter audio can be saved from
						the story playback bar or story settings.
					</p>
				</Panel>
			)}
		</div>
	);
}
