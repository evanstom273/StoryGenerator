import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { SearchIcon } from "../icons";
import { Button } from "../ui/Button";
import { OVERLAY_BACKDROP_CLASS } from "../../app/ui/motion";
import { useStoryEngine } from "../../app/providers/StoryEngineProvider";
import { useUiPrefs } from "../../app/ui/UiPrefsContext";
import { formatRelativeTime } from "../../lib/dates";
import {
	DEFAULT_LIBRARY_SEARCH_FILTERS,
	LIBRARY_SEARCH_CHAPTER_PRESETS,
	LIBRARY_SEARCH_MESSAGE_PRESETS,
	LIBRARY_SEARCH_STORY_COUNT_PRESETS,
	searchLibrary,
	type LibrarySearchAutoIndexMode,
	type LibrarySearchCharacterActivity,
	type LibrarySearchContentType,
	type LibrarySearchFilters,
	type LibrarySearchResult,
	type LibrarySearchSort,
	type LibrarySearchStoryFeatures,
	type LibrarySearchStoryStatus,
	type LibrarySearchUniverseMode,
} from "../../lib/librarySearch";
import { cn } from "../../utils/cn";

const selectClasses =
	"w-full rounded-[8px] border border-divider bg-panel-muted px-3 py-2 text-[13px] text-ink outline-none transition focus:border-accent/[0.4] focus:ring-2 focus:ring-accent/[0.15]";

function FilterLabel({ children }: { children: ReactNode }) {
	return (
		<span className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-muted">
			{children}
		</span>
	);
}

function ResultBadge({ label }: { label: string }) {
	return (
		<span className="rounded-full border border-divider/[0.45] bg-panel-muted/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
			{label}
		</span>
	);
}

function formatResultStats(result: LibrarySearchResult) {
	if (result.type === "story") {
		const parts: string[] = [];
		if (typeof result.stats.messageCount === "number") {
			parts.push(`${result.stats.messageCount} msgs`);
		}
		if (typeof result.stats.chapterCount === "number" && result.stats.chapterCount > 0) {
			parts.push(`${result.stats.chapterCount} ch`);
		}
		return parts.join(" · ");
	}
	if (result.type === "universe") {
		return `${result.stats.storyCount ?? 0} stories · ${result.stats.characterCount ?? 0} chars`;
	}
	return `${result.stats.storyCount ?? 0} stories`;
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
			<div className="shrink-0 pt-0.5 text-right text-[10px] text-ink-muted">
				<div>{formatResultStats(result)}</div>
				<div className="mt-1">{formatRelativeTime(result.updatedAt)}</div>
			</div>
		</Link>
	);
}

function NumberFilterField({
	label,
	value,
	onChange,
	presets,
	placeholder,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
	presets: readonly string[];
	placeholder: string;
}) {
	return (
		<label className="space-y-1.5">
			<FilterLabel>{label}</FilterLabel>
			<input
				type="number"
				min={0}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				placeholder={placeholder}
				className={selectClasses}
			/>
			<div className="flex flex-wrap gap-1.5">
				{presets.map((preset) => (
					<button
						key={preset}
						type="button"
						className={cn(
							"rounded-full border px-2 py-0.5 text-[10px] font-medium transition",
							value === preset
								? "border-accent/40 bg-accent/10 text-accent-soft"
								: "border-divider/[0.45] text-ink-muted hover:border-divider",
						)}
						onClick={() => onChange(value === preset ? "" : preset)}
					>
						{preset}
					</button>
				))}
			</div>
		</label>
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
		getMessagesForStory,
		getChaptersForStory,
	} = useStoryEngine();
	const { showArchivedStories } = useUiPrefs();
	const [showAdvanced, setShowAdvanced] = useState(false);
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
		setShowAdvanced(false);
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

	const libraryCharacters = useMemo(
		() => playerCharacters.filter((character) => (character.scope ?? "library") === "library"),
		[playerCharacters],
	);

	const results = useMemo(
		() =>
			searchLibrary(filters, {
				stories,
				universes,
				playerCharacters,
				getUniverseById,
				getPlayerCharacterById,
				getMessagesForStory,
				getChaptersForStory,
			}),
		[
			filters,
			getChaptersForStory,
			getMessagesForStory,
			getPlayerCharacterById,
			getUniverseById,
			playerCharacters,
			stories,
			universes,
		],
	);

	const groupedCounts = useMemo(() => {
		const counts = { story: 0, universe: 0, character: 0 };
		for (const result of results) {
			counts[result.type] += 1;
		}
		return counts;
	}, [results]);

	const activeFilterCount = useMemo(() => {
		let count = 0;
		if (filters.contentType !== "all") count += 1;
		if (filters.storyStatus !== "active") count += 1;
		if (filters.universeId !== "all") count += 1;
		if (filters.playerCharacterId !== "all") count += 1;
		if (filters.sort !== "relevance") count += 1;
		if (filters.storyFeatures !== "all") count += 1;
		if (filters.universeMode !== "all") count += 1;
		if (filters.characterActivity !== "all") count += 1;
		if (filters.autoIndexMode !== "all") count += 1;
		if (filters.minMessages || filters.maxMessages) count += 1;
		if (filters.minChapters || filters.maxChapters) count += 1;
		if (filters.minStories || filters.maxStories) count += 1;
		return count;
	}, [filters]);

	function updateFilter<K extends keyof LibrarySearchFilters>(key: K, value: LibrarySearchFilters[K]) {
		setFilters((current) => ({ ...current, [key]: value }));
	}

	function resetFilters() {
		setFilters({
			...DEFAULT_LIBRARY_SEARCH_FILTERS,
			query: filters.query,
			storyStatus: showArchivedStories ? "all" : "active",
		});
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
			<div className="absolute inset-x-0 top-0 flex max-h-[100dvh] flex-col border-b border-divider bg-app shadow-hero sm:inset-x-4 sm:top-6 sm:max-h-[calc(100dvh-3rem)] sm:rounded-[14px] sm:border lg:inset-x-auto lg:left-1/2 lg:top-10 lg:w-[min(980px,calc(100vw-2rem))] lg:-translate-x-1/2">
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
							<FilterLabel>Content</FilterLabel>
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
							<FilterLabel>Sort</FilterLabel>
							<select
								className={selectClasses}
								value={filters.sort}
								onChange={(event) => updateFilter("sort", event.target.value as LibrarySearchSort)}
							>
								<option value="relevance">Best match</option>
								<option value="updated">Recently updated</option>
								<option value="created">Recently created</option>
								<option value="alpha">Name A–Z</option>
								<option value="alpha-desc">Name Z–A</option>
								<option value="messages-desc">Most messages</option>
								<option value="messages-asc">Fewest messages</option>
								<option value="chapters-desc">Most chapters</option>
								<option value="chapters-asc">Fewest chapters</option>
								<option value="story-count-desc">Most stories</option>
								<option value="story-count-asc">Fewest stories</option>
								<option value="type">Group by type</option>
							</select>
						</label>

						<label className="space-y-1.5">
							<FilterLabel>Story status</FilterLabel>
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
							<FilterLabel>Universe</FilterLabel>
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
					</div>

					<div className="mt-3 flex flex-wrap items-center gap-2">
						<Button
							type="button"
							variant="secondary"
							size="sm"
							onClick={() => setShowAdvanced((current) => !current)}
						>
							{showAdvanced ? "Hide advanced filters" : "More filters"}
							{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
						</Button>
						{activeFilterCount > 0 ? (
							<Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
								Reset filters
							</Button>
						) : null}
					</div>

					{showAdvanced ? (
						<div className="mt-4 grid gap-3 border-t border-divider/[0.25] pt-4 sm:grid-cols-2 lg:grid-cols-3">
							<label className="space-y-1.5">
								<FilterLabel>Protagonist</FilterLabel>
								<select
									className={selectClasses}
									value={filters.playerCharacterId}
									onChange={(event) => updateFilter("playerCharacterId", event.target.value)}
								>
									<option value="all">Any protagonist</option>
									{libraryCharacters.map((character) => (
										<option key={character.id} value={character.id}>
											{character.name}
										</option>
									))}
								</select>
							</label>

							<label className="space-y-1.5">
								<FilterLabel>Story features</FilterLabel>
								<select
									className={selectClasses}
									value={filters.storyFeatures}
									onChange={(event) =>
										updateFilter("storyFeatures", event.target.value as LibrarySearchStoryFeatures)
									}
								>
									<option value="all">Any story</option>
									<option value="rp">RP mode on</option>
									<option value="non-rp">RP mode off</option>
									<option value="mature">Mature fiction on</option>
									<option value="non-mature">Mature fiction off</option>
									<option value="has-summary">Has summary</option>
									<option value="no-summary">No summary</option>
									<option value="playable">Playable (not prequel)</option>
									<option value="prequel">Locked prequel</option>
									<option value="sequel">Sequel</option>
									<option value="branch">Branch</option>
									<option value="guided-history">Guided story history</option>
									<option value="no-guided-history">No guided history</option>
								</select>
							</label>

							<label className="space-y-1.5">
								<FilterLabel>Auto-indexing</FilterLabel>
								<select
									className={selectClasses}
									value={filters.autoIndexMode}
									onChange={(event) =>
										updateFilter("autoIndexMode", event.target.value as LibrarySearchAutoIndexMode)
									}
								>
									<option value="all">Any indexing mode</option>
									<option value="disabled">Indexing disabled</option>
									<option value="messages">Every N messages</option>
									<option value="chapter">After each chapter</option>
								</select>
							</label>

							<label className="space-y-1.5">
								<FilterLabel>Universe type</FilterLabel>
								<select
									className={selectClasses}
									value={filters.universeMode}
									onChange={(event) =>
										updateFilter("universeMode", event.target.value as LibrarySearchUniverseMode)
									}
								>
									<option value="all">Any universe type</option>
									<option value="custom">Custom universes</option>
									<option value="referenced">Referenced / wiki universes</option>
								</select>
							</label>

							<label className="space-y-1.5">
								<FilterLabel>Character activity</FilterLabel>
								<select
									className={selectClasses}
									value={filters.characterActivity}
									onChange={(event) =>
										updateFilter(
											"characterActivity",
											event.target.value as LibrarySearchCharacterActivity,
										)
									}
								>
									<option value="all">Any character</option>
									<option value="active">In active stories</option>
									<option value="idle">Not in any active story</option>
								</select>
							</label>

							<NumberFilterField
								label="Min messages"
								value={filters.minMessages}
								onChange={(value) => updateFilter("minMessages", value)}
								presets={LIBRARY_SEARCH_MESSAGE_PRESETS}
								placeholder="No minimum"
							/>
							<NumberFilterField
								label="Max messages"
								value={filters.maxMessages}
								onChange={(value) => updateFilter("maxMessages", value)}
								presets={LIBRARY_SEARCH_MESSAGE_PRESETS}
								placeholder="No maximum"
							/>
							<NumberFilterField
								label="Min chapters"
								value={filters.minChapters}
								onChange={(value) => updateFilter("minChapters", value)}
								presets={LIBRARY_SEARCH_CHAPTER_PRESETS}
								placeholder="No minimum"
							/>
							<NumberFilterField
								label="Max chapters"
								value={filters.maxChapters}
								onChange={(value) => updateFilter("maxChapters", value)}
								presets={LIBRARY_SEARCH_CHAPTER_PRESETS}
								placeholder="No maximum"
							/>
							<NumberFilterField
								label="Min linked stories"
								value={filters.minStories}
								onChange={(value) => updateFilter("minStories", value)}
								presets={LIBRARY_SEARCH_STORY_COUNT_PRESETS}
								placeholder="No minimum"
							/>
							<NumberFilterField
								label="Max linked stories"
								value={filters.maxStories}
								onChange={(value) => updateFilter("maxStories", value)}
								presets={LIBRARY_SEARCH_STORY_COUNT_PRESETS}
								placeholder="No maximum"
							/>
						</div>
					) : null}
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
