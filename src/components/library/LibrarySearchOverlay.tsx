import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { SearchIcon } from "../icons";
import { Button } from "../ui/Button";
import { OVERLAY_BACKDROP_CLASS } from "../../app/ui/motion";
import { useStoryEngine } from "../../app/providers/StoryEngineProvider";
import { useUiPrefs } from "../../app/ui/UiPrefsContext";
import { formatRelativeTime } from "../../lib/dates";
import {
	DEFAULT_LIBRARY_SEARCH_FILTERS,
	searchLibrary,
	type LibrarySearchContentType,
	type LibrarySearchFilters,
	type LibrarySearchResult,
	type LibrarySearchSort,
	type LibrarySearchStoryStatus,
} from "../../lib/librarySearch";
import { cn } from "../../utils/cn";

const selectClasses =
	"w-full rounded-[8px] border border-divider bg-panel-muted px-3 py-2 text-[13px] text-ink outline-none transition focus:border-accent/[0.4] focus:ring-2 focus:ring-accent/[0.15]";

function ResultBadge({ label }: { label: string }) {
	return (
		<span className="rounded-full border border-divider/[0.45] bg-panel-muted/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
			{label}
		</span>
	);
}

function LibrarySearchResultRow({
	result,
	onNavigate,
}: {
	result: LibrarySearchResult;
	onNavigate: () => void;
}) {
	return (
		<Link
			to={result.href}
			onClick={onNavigate}
			className="flex items-start justify-between gap-3 rounded-[8px] border border-transparent px-3 py-2.5 transition hover:border-divider/[0.35] hover:bg-panel-muted/60"
		>
			<div className="min-w-0">
				<div className="flex flex-wrap items-center gap-2">
					<span className="truncate text-[13px] font-semibold text-ink">{result.title}</span>
					{result.badges.map((badge) => (
						<ResultBadge key={`${result.id}-${badge}`} label={badge} />
					))}
				</div>
				{result.subtitle ? (
					<div className="mt-1 truncate text-[12px] text-ink-muted">{result.subtitle}</div>
				) : null}
				{result.meta ? (
					<div className="mt-1 line-clamp-2 text-[11px] leading-5 text-ink-muted/80">{result.meta}</div>
				) : null}
			</div>
			<div className="shrink-0 pt-0.5 text-[10px] text-ink-muted">
				{formatRelativeTime(result.updatedAt)}
			</div>
		</Link>
	);
}

export function LibrarySearchOverlay({
	open,
	initialQuery = "",
	onClose,
}: {
	open: boolean;
	initialQuery?: string;
	onClose: () => void;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	const {
		stories,
		universes,
		playerCharacters,
		getUniverseById,
		getPlayerCharacterById,
	} = useStoryEngine();
	const { showArchivedStories } = useUiPrefs();
	const [filters, setFilters] = useState<LibrarySearchFilters>(() => ({
		...DEFAULT_LIBRARY_SEARCH_FILTERS,
		query: initialQuery,
		storyStatus: showArchivedStories ? "all" : "active",
	}));

	useEffect(() => {
		if (!open) {
			return;
		}
		setFilters({
			...DEFAULT_LIBRARY_SEARCH_FILTERS,
			query: initialQuery,
			storyStatus: showArchivedStories ? "all" : "active",
		});
	}, [initialQuery, open, showArchivedStories]);

	useEffect(() => {
		if (!open) {
			return;
		}
		const frame = window.requestAnimationFrame(() => {
			inputRef.current?.focus();
			inputRef.current?.select();
		});
		return () => window.cancelAnimationFrame(frame);
	}, [open]);

	useEffect(() => {
		if (!open) {
			return;
		}
		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				onClose();
			}
		}
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [onClose, open]);

	const results = useMemo(
		() =>
			searchLibrary(filters, {
				stories,
				universes,
				playerCharacters,
				getUniverseById,
				getPlayerCharacterById,
			}),
		[filters, getPlayerCharacterById, getUniverseById, playerCharacters, stories, universes],
	);

	const groupedCounts = useMemo(() => {
		const counts = { story: 0, universe: 0, character: 0 };
		for (const result of results) {
			counts[result.type] += 1;
		}
		return counts;
	}, [results]);

	function updateFilter<K extends keyof LibrarySearchFilters>(key: K, value: LibrarySearchFilters[K]) {
		setFilters((current) => ({ ...current, [key]: value }));
	}

	if (!open) {
		return null;
	}

	return (
		<div className="fixed inset-0 z-[90]">
			<button
				type="button"
				aria-label="Close library search"
				className={cn("absolute inset-0 bg-app/85 backdrop-blur-sm", OVERLAY_BACKDROP_CLASS)}
				onClick={onClose}
			/>
			<div className="absolute inset-x-0 top-0 flex max-h-[100dvh] flex-col border-b border-divider bg-app shadow-hero sm:inset-x-4 sm:top-6 sm:max-h-[calc(100dvh-3rem)] sm:rounded-[14px] sm:border lg:inset-x-auto lg:left-1/2 lg:top-10 lg:w-[min(920px,calc(100vw-2rem))] lg:-translate-x-1/2">
				<div className="border-b border-divider/[0.35] px-4 py-4 sm:px-5">
					<div className="flex items-center gap-3">
						<SearchIcon className="h-4 w-4 text-ink-muted" />
						<input
							ref={inputRef}
							value={filters.query}
							onChange={(event) => updateFilter("query", event.target.value)}
							placeholder="Search stories, universes, and characters…"
							className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-muted"
						/>
						<Button variant="ghost" size="sm" onClick={onClose}>
							Close
						</Button>
					</div>
				</div>

				<div className="border-b border-divider/[0.35] px-4 py-3 sm:px-5">
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
						<label className="space-y-1.5">
							<span className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-muted">
								Content
							</span>
							<select
								className={selectClasses}
								value={filters.contentType}
								onChange={(event) =>
									updateFilter("contentType", event.target.value as LibrarySearchContentType)
								}
							>
								<option value="all">All content</option>
								<option value="story">Stories</option>
								<option value="universe">Universes</option>
								<option value="character">Characters</option>
							</select>
						</label>

						<label className="space-y-1.5">
							<span className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-muted">
								Story status
							</span>
							<select
								className={selectClasses}
								value={filters.storyStatus}
								onChange={(event) =>
									updateFilter("storyStatus", event.target.value as LibrarySearchStoryStatus)
								}
							>
								<option value="active">Active stories</option>
								<option value="archived">Archived stories</option>
								<option value="all">All stories</option>
							</select>
						</label>

						<label className="space-y-1.5">
							<span className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-muted">
								Universe
							</span>
							<select
								className={selectClasses}
								value={filters.universeId}
								onChange={(event) => updateFilter("universeId", event.target.value)}
							>
								<option value="all">All universes</option>
								{universes.map((universe) => (
									<option key={universe.id} value={universe.id}>
										{universe.name}
									</option>
								))}
							</select>
						</label>

						<label className="space-y-1.5">
							<span className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-muted">
								Sort
							</span>
							<select
								className={selectClasses}
								value={filters.sort}
								onChange={(event) => updateFilter("sort", event.target.value as LibrarySearchSort)}
							>
								<option value="relevance">Best match</option>
								<option value="updated">Recently updated</option>
								<option value="created">Recently created</option>
								<option value="alpha">Alphabetical</option>
							</select>
						</label>
					</div>
				</div>

				<div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-3">
					<div className="flex items-center justify-between gap-3 px-3 py-2">
						<div className="text-[11px] font-medium text-ink-muted">
							{results.length} result{results.length === 1 ? "" : "s"}
							{filters.contentType === "all"
								? ` · ${groupedCounts.story} stories · ${groupedCounts.universe} universes · ${groupedCounts.character} characters`
								: null}
						</div>
					</div>

					{results.length ? (
						<div className="space-y-1">
							{results.map((result) => (
								<LibrarySearchResultRow key={`${result.type}-${result.id}`} result={result} onNavigate={onClose} />
							))}
						</div>
					) : (
						<div className="px-3 py-10 text-center text-sm text-ink-muted">
							{filters.query.trim()
								? "No matches for that search. Try different keywords or broaden your filters."
								: "Type to search your library, or adjust filters to browse everything."}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
