import type { PlayerCharacter, Story, Universe } from "../../types/models";
import { formatLinkedCharacterSheetsForPrompt, resolveLinkedCharacterSheets } from "../characterLinks";
import { formatPlayerCharacterKnownTiesForPrompt, normalizePlayerCharacterAliases } from "../playerCharacterPrompt";
import { resolveStoryImportedCharacters } from "../storyImportedCharacters";

const MAX_LINKED_FIELD_CHARS = 700;

function sheetLines(character: PlayerCharacter) {
	const aliases = normalizePlayerCharacterAliases(character.aliases);
	return [
		`Name: ${character.name?.trim() ?? ""}`,
		`Sheet ID: ${character.id}`,
		aliases.length ? `Aliases: ${aliases.join(", ")}` : "",
		[character.pronouns, character.gender, character.age ? `age ${character.age}` : "", character.species]
			.map((value) => value?.trim())
			.filter(Boolean)
			.join(", ")
			.replace(/^(.+)$/, "Identity: $1"),
		character.characterConcept?.trim() ? `Concept: ${character.characterConcept.trim()}` : "",
		character.personality?.trim() ? `Personality: ${character.personality?.trim()}` : "",
		character.background?.trim() ? `Background: ${character.background?.trim()}` : "",
		character.notes?.trim() ? `Notes: ${character.notes?.trim()}` : "",
		formatPlayerCharacterKnownTiesForPrompt(character) ?? "",
	]
		.filter(Boolean)
		.join("\n");
}

/**
 * Pre-story canon for the indexer: the universe, the full player sheet, imported
 * story characters and the sheets they link to. Without it the indexer only sees
 * the transcript and cannot know, for example, who a character's parents are.
 */
export function buildIndexingSetupContext(params: {
	story: Pick<Story, "importedCharacterIds" | "playerCharacterId">;
	playerCharacter: PlayerCharacter;
	allCharacters: PlayerCharacter[];
	universe?: Universe | null;
}): string {
	const { story, playerCharacter, allCharacters, universe } = params;
	const imported = resolveStoryImportedCharacters(story, allCharacters);
	const linked = formatLinkedCharacterSheetsForPrompt(
		resolveLinkedCharacterSheets([playerCharacter, ...imported], allCharacters),
		{
			maxFieldChars: MAX_LINKED_FIELD_CHARS,
			universeNameById: (id) => (universe && universe.id === id ? universe.name : undefined),
		},
	);
	const referenced = (universe?.mode ?? "referenced") === "referenced";

	return [
		universe
			? [
					`Universe: ${universe.name}${referenced ? " (an established fictional universe)" : " (an original setting)"}`,
					universe.description?.trim() ? `Universe description: ${universe.description.trim()}` : "",
					referenced
						? "Well-known canon characters from this universe keep their canon identities, families, and histories unless the sheets or transcript say otherwise."
						: "",
				]
					.filter(Boolean)
					.join("\n")
			: "",
		`Player character sheet:\n${sheetLines(playerCharacter)}`,
		imported.length
			? `Imported story characters:\n\n${imported.map((character) => sheetLines(character)).join("\n\n")}`
			: "",
		linked ?? "",
	]
		.filter(Boolean)
		.join("\n\n");
}
