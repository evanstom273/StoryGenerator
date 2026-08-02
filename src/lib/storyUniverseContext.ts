import type {
	EntityId,
	Story,
	Universe,
	UniverseImport,
	UniversePackSnapshotV1,
} from "../types/models";
import { getUniverseIds } from "./universeIds";

export function mergeUniversesForContext(
	universes: Universe[],
	imports: UniverseImport[],
): { universe: Universe; imports: UniverseImport[] } {
	const validUniverses = universes.filter(Boolean);
	if (!validUniverses.length) {
		throw new Error("No universes available for story context.");
	}

	if (validUniverses.length === 1) {
		return { universe: validUniverses[0], imports };
	}

	const primary = validUniverses[0];
	const mergedUniverse: Universe = {
		...primary,
		name: validUniverses.map((entry) => entry.name).join(" × "),
		description: validUniverses
			.map((entry) => {
				const summary = entry.description.trim() || entry.concept?.trim() || "";
				return summary ? `${entry.name}: ${summary}` : entry.name;
			})
			.join("\n\n"),
		importedLore: validUniverses.flatMap((entry) => entry.importedLore ?? []),
		importedCharacters: validUniverses.flatMap((entry) => entry.importedCharacters ?? []),
		importedLocations: validUniverses.flatMap((entry) => entry.importedLocations ?? []),
		importedRelationships: validUniverses.flatMap((entry) => entry.importedRelationships ?? []),
		notes: validUniverses
			.map((entry) => entry.notes?.trim())
			.filter((note): note is string => Boolean(note))
			.join("\n\n"),
	};

	return { universe: mergedUniverse, imports };
}

export function mergeUniversePackSnapshots(
	snapshots: UniversePackSnapshotV1[],
): { universe: Universe; imports: UniverseImport[] } | null {
	if (!snapshots.length) {
		return null;
	}

	return mergeUniversesForContext(
		snapshots.map((snapshot) => snapshot.universe),
		snapshots.flatMap((snapshot) => snapshot.universeImports ?? []),
	);
}

export async function resolveStoryUniverseContext(args: {
	story: Story;
	getUniverse: (universeId: EntityId) => Promise<Universe | null>;
	listUniverseImports: (universeId: EntityId) => Promise<UniverseImport[]>;
}): Promise<{ universe: Universe; imports: UniverseImport[] }> {
	const snapshotList =
		args.story.universePackSnapshots?.length
			? args.story.universePackSnapshots
			: args.story.universePackSnapshot
				? [args.story.universePackSnapshot]
				: [];

	const mergedFromSnapshots = mergeUniversePackSnapshots(snapshotList);
	if (mergedFromSnapshots && snapshotList.length === getUniverseIds(args.story).length) {
		return mergedFromSnapshots;
	}

	const universeIds = getUniverseIds(args.story);
	const universes = (
		await Promise.all(universeIds.map((universeId) => args.getUniverse(universeId)))
	).filter((entry): entry is Universe => Boolean(entry));

	if (!universes.length) {
		throw new Error("Story universe not found.");
	}

	const imports = (
		await Promise.all(universeIds.map((universeId) => args.listUniverseImports(universeId)))
	).flat();

	return mergeUniversesForContext(universes, imports);
}
