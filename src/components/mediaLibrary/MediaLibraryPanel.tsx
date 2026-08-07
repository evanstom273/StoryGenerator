import { Link } from "react-router-dom";
import { useMemo } from "react";
import type { MediaAssetCategory } from "../../types/models";
import {
	useMediaLibrary,
	type MediaAssetView,
} from "../../app/providers/MediaLibraryProvider";
import {
	formatDurationMs,
	formatPlaybackProgress,
	MEDIA_ASSET_CATEGORY_LABELS,
} from "../../lib/mediaLibrary/format";
import { formatRelativeTime } from "../../lib/dates";
import { cn } from "../../utils/cn";
import { MediaLibraryPlayButton } from "./MediaLibraryPlayButton";
import { MediaLibraryDeleteButton } from "./MediaLibraryDeleteButton";

function MediaAssetRow({ asset }: { asset: MediaAssetView }) {
	const createdLabel = formatRelativeTime(new Date(asset.createdAtMs).toISOString());
	const progressLabel =
		asset.lastPositionMs > 0
			? formatPlaybackProgress(asset.lastPositionMs, asset.durationMs)
			: formatDurationMs(asset.durationMs);

	return (
		<div className="rounded-[8px] border border-divider/[0.35] bg-panel-muted/40 px-3 py-2.5">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="truncate text-xs font-semibold text-ink-soft">{asset.title}</div>
					<div className="mt-0.5 truncate text-[11px] text-ink-muted">{asset.subtitle}</div>
				</div>
				{asset.isOrphaned ? (
					<span className="shrink-0 rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-amber-100">
						Orphaned
					</span>
				) : null}
			</div>
			<div className="mt-2 flex items-center justify-between gap-2">
				<div className="flex flex-wrap items-center gap-2 text-[10px] text-white/30">
					<span>{createdLabel}</span>
					<span className="text-white/15">·</span>
					<span>{progressLabel}</span>
				</div>
				<div className="flex shrink-0 items-center gap-1">
					<MediaLibraryPlayButton asset={asset} className="shrink-0" />
					<MediaLibraryDeleteButton assetId={asset.id} title={asset.title} className="shrink-0" />
				</div>
			</div>
		</div>
	);
}

function CategorySection({
	category,
	assets,
}: {
	category: MediaAssetCategory;
	assets: MediaAssetView[];
}) {
	if (!assets.length) {
		return null;
	}

	return (
		<div className="space-y-2">
			<div className="text-[9px] font-bold uppercase tracking-[0.22em] text-white/20">
				{MEDIA_ASSET_CATEGORY_LABELS[category]}
			</div>
			<div className="flex flex-col gap-2">
				{assets.map((asset) => (
					<MediaAssetRow key={asset.id} asset={asset} />
				))}
			</div>
		</div>
	);
}

interface MediaLibraryPanelProps {
	limitPerCategory?: number;
	compact?: boolean;
	className?: string;
}

export function MediaLibraryPanel({
	limitPerCategory = 3,
	compact = false,
	className,
}: MediaLibraryPanelProps) {
	const { assets, loading } = useMediaLibrary();

	const grouped = useMemo(() => {
		const categories: MediaAssetCategory[] = ["audiobook", "chapter", "ai_document", "podcast"];
		return categories.map((category) => ({
			category,
			assets: assets.filter((asset) => asset.category === category).slice(0, limitPerCategory),
		}));
	}, [assets, limitPerCategory]);

	const hasAssets = assets.length > 0;

	return (
		<div className={cn("flex flex-col", className)}>
			<div className="mb-2.5 flex items-center justify-between">
				<span className="text-[9px] font-bold uppercase tracking-[0.22em] text-white/20">
					Media Library
				</span>
				<Link
					to="/media-library"
					className="text-[11px] font-medium text-accent transition hover:text-accent-hover"
				>
					{compact ? "All →" : "Open library →"}
				</Link>
			</div>

			{loading ? (
				<div className="py-3 text-xs text-white/25">Loading media…</div>
			) : !hasAssets ? (
				<div className="rounded-[8px] border border-dashed border-divider/[0.4] px-3 py-4 text-xs leading-relaxed text-white/28">
					Generated audiobooks, chapter audio, and AI document podcasts will appear here.
					Audio from Settings → AI Documents is saved automatically.
				</div>
			) : (
				<div className="flex flex-col gap-4">
					{grouped.map(({ category, assets: categoryAssets }) => (
						<CategorySection key={category} category={category} assets={categoryAssets} />
					))}
				</div>
			)}
		</div>
	);
}
