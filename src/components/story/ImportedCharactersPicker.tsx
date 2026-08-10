import { useMemo, useState } from "react";
import type { PlayerCharacter } from "../../types/models";
import { TextInput } from "../forms/Fields";
import { Badge } from "../ui/Badge";
import { Panel } from "../ui/Panel";

function getCharacterInitials(name: string) {
	const tokens = name.trim().split(/\s+/).filter(Boolean);
	if (!tokens.length) {
		return "?";
	}

	if (tokens.length === 1) {
		return tokens[0]!.slice(0, 2).toUpperCase();
	}

	return `${tokens[0]!.charAt(0)}${tokens[tokens.length - 1]!.charAt(0)}`.toUpperCase();
}

function CharacterAvatar({ name }: { name: string }) {
	return (
		<div
			aria-hidden
			className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-divider/[0.45] bg-panel-muted/70 text-xs font-semibold uppercase tracking-[0.08em] text-accent-soft"
		>
			{getCharacterInitials(name)}
		</div>
	);
}

export function ImportedCharactersPicker({
	selectedIds,
	onChange,
	universeIds,
	excludeCharacterId,
	disabled,
	getPlayerCharactersForUniverse,
	getUniverseById,
	getPlayerCharacterById,
}: {
	selectedIds: string[];
	onChange: (nextIds: string[]) => void;
	universeIds: string[];
	excludeCharacterId?: string;
	disabled?: boolean;
	getPlayerCharactersForUniverse: (universeIds: string[]) => PlayerCharacter[];
	getUniverseById: (id: string) => { name: string } | undefined;
	getPlayerCharacterById: (id: string) => PlayerCharacter | undefined;
}) {
	const [search, setSearch] = useState("");

	const libraryCharacters = useMemo(() => {
		if (!universeIds.length) {
			return [];
		}

		return getPlayerCharactersForUniverse(universeIds).filter(
			(character) => character.id !== excludeCharacterId,
		);
	}, [excludeCharacterId, getPlayerCharactersForUniverse, universeIds]);

	const selectedCharacters = useMemo(
		() =>
			selectedIds
				.map((id) => getPlayerCharacterById(id))
				.filter((character): character is PlayerCharacter => Boolean(character)),
		[getPlayerCharacterById, selectedIds],
	);

	const availableCharacters = useMemo(
		() => libraryCharacters.filter((character) => !selectedIds.includes(character.id)),
		[libraryCharacters, selectedIds],
	);

	const filteredCharacters = useMemo(() => {
		const query = search.trim().toLowerCase();
		if (!query) {
			return availableCharacters;
		}

		return availableCharacters.filter((character) => {
			const universeName = getUniverseById(character.universeId)?.name ?? "";
			const haystack = [
				character.name,
				character.characterConcept ?? "",
				character.background,
				universeName,
			]
				.join(" ")
				.toLowerCase();

			return haystack.includes(query);
		});
	}, [availableCharacters, getUniverseById, search]);

	function addCharacter(characterId: string) {
		if (disabled || selectedIds.includes(characterId)) {
			return;
		}

		onChange([...selectedIds, characterId]);
		setSearch("");
	}

	function removeCharacter(characterId: string) {
		if (disabled) {
			return;
		}

		onChange(selectedIds.filter((id) => id !== characterId));
	}

	if (!universeIds.length) {
		return (
			<p className="text-sm text-ink-muted">
				Select a universe first to browse importable library characters.
			</p>
		);
	}

	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<TextInput
					value={search}
					disabled={disabled}
					placeholder="Search library characters…"
					onChange={(event) => setSearch(event.target.value)}
				/>
				<p className="text-[11px] text-ink-muted">
					Imported characters are added to AI context only. They are not auto-spawned into scenes.
				</p>
			</div>

			{selectedCharacters.length ? (
				<div className="space-y-2">
					<p className="text-xs uppercase tracking-[0.18em] text-ink-muted">Imported</p>
					<div className="space-y-2">
						{selectedCharacters.map((character) => {
							const universeName = getUniverseById(character.universeId)?.name ?? "Unknown universe";
							return (
								<Panel key={character.id} variant="flat" className="p-3">
									<div className="flex items-start gap-3">
										<CharacterAvatar name={character.name} />
										<div className="min-w-0 flex-1">
											<div className="flex flex-wrap items-center gap-2">
												<h4 className="text-sm font-semibold text-ink">{character.name}</h4>
												<Badge>{universeName}</Badge>
											</div>
											<p className="mt-1 text-xs text-ink-muted">
												{character.characterConcept?.trim() ||
													character.background.trim() ||
													"No concept written yet."}
											</p>
										</div>
										<button
											type="button"
											disabled={disabled}
											className="shrink-0 rounded-[8px] border border-divider px-2.5 py-1.5 text-xs font-medium text-ink-soft transition hover:bg-panel-muted disabled:cursor-not-allowed disabled:opacity-50"
											onClick={() => removeCharacter(character.id)}
										>
											Remove
										</button>
									</div>
								</Panel>
							);
						})}
					</div>
				</div>
			) : (
				<p className="text-sm text-ink-muted">No imported characters selected yet.</p>
			)}

			<div className="space-y-2">
				<p className="text-xs uppercase tracking-[0.18em] text-ink-muted">Library</p>
				{filteredCharacters.length ? (
					<div className="max-h-72 space-y-2 overflow-y-auto pr-1">
						{filteredCharacters.map((character) => {
							const universeName = getUniverseById(character.universeId)?.name ?? "Unknown universe";
							return (
								<button
									key={character.id}
									type="button"
									disabled={disabled}
									className="flex w-full items-start gap-3 rounded-[10px] border border-divider/[0.45] bg-panel-muted/40 px-3 py-3 text-left transition hover:border-accent/[0.35] hover:bg-panel-muted/70 disabled:cursor-not-allowed disabled:opacity-50"
									onClick={() => addCharacter(character.id)}
								>
									<CharacterAvatar name={character.name} />
									<span className="min-w-0 flex-1">
										<span className="flex flex-wrap items-center gap-2">
											<span className="text-sm font-semibold text-ink">{character.name}</span>
											<Badge>{universeName}</Badge>
										</span>
										<span className="mt-1 block text-xs text-ink-muted">
											{character.characterConcept?.trim() ||
												character.background.trim() ||
												"No concept written yet."}
										</span>
									</span>
									<span className="shrink-0 text-xs font-medium text-accent-soft">Add</span>
								</button>
							);
						})}
					</div>
				) : (
					<p className="text-sm text-ink-muted">
						{libraryCharacters.length
							? "No library characters match your search."
							: "No library characters are available for the selected universe(s)."}
					</p>
				)}
			</div>
		</div>
	);
}
