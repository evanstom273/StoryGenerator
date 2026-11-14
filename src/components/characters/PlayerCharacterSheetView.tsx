import type { ReactNode } from "react";
import type { PlayerCharacter } from "../../types/models";
import {
  normalizeLinkedCharacterIds,
  normalizePlayerCharacterAliases,
  normalizePlayerCharacterKnownTies,
} from "../../lib/playerCharacterPrompt";

function SheetRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-[11px] text-ink-muted">{label}</dt>
      <dd className="text-right text-[13px] text-ink-soft">{children}</dd>
    </div>
  );
}

/** Read-only view of every field on a character sheet, shared by the sheet page and previews. */
export function PlayerCharacterSheetView({
  character,
  universeNames,
  getPlayerCharacterById,
  renderLinkedCharacter = (linked) => <span>{linked.name}</span>,
}: {
  character: PlayerCharacter;
  universeNames: string[];
  getPlayerCharacterById: (id: string) => PlayerCharacter | undefined;
  renderLinkedCharacter?: (linked: PlayerCharacter) => ReactNode;
}) {
  const aliases = normalizePlayerCharacterAliases(character.aliases);
  const knownTies = normalizePlayerCharacterKnownTies(character.knownTies);
  const linkedIds = normalizeLinkedCharacterIds(character.linkedCharacterIds, character.id);

  return (
    <>
      <dl className="divide-y divide-divider/[0.3]">
        <SheetRow label="Universes">{universeNames.join(", ") || "Not specified"}</SheetRow>
        <SheetRow label="Age">{character.age || "Not specified"}</SheetRow>
        <SheetRow label="Gender">{character.gender || "Not specified"}</SheetRow>
        <SheetRow label="Pronouns">{character.pronouns || "Not specified"}</SheetRow>
        <SheetRow label="Species">{character.species || "Not specified"}</SheetRow>
        {aliases.length ? <SheetRow label="Aliases">{aliases.join(", ")}</SheetRow> : null}
        {knownTies.length ? <SheetRow label="Known ties">{knownTies.join("; ")}</SheetRow> : null}
        {linkedIds.length ? (
          <SheetRow label="Linked characters">
            <span className="flex flex-wrap justify-end gap-x-2 gap-y-1">
              {linkedIds.map((id) => {
                const linked = getPlayerCharacterById(id);
                return linked ? (
                  <span key={id}>{renderLinkedCharacter(linked)}</span>
                ) : (
                  <span key={id} className="text-ink-muted">Missing sheet</span>
                );
              })}
            </span>
          </SheetRow>
        ) : null}
      </dl>
      <div className="mt-4 space-y-4">
        {[
          { label: "Character concept", value: character.characterConcept },
          { label: "Appearance", value: character.appearance },
          { label: "Personality", value: character.personality },
          { label: "Background", value: character.background },
          { label: "Goals", value: character.goals },
          { label: "Notes", value: character.notes },
        ].map(({ label, value }) => (
          <div key={label}>
            <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-ink-muted">{label}</div>
            <div className="mt-1.5 whitespace-pre-wrap text-[13px] leading-6 text-ink-soft">
              {value?.trim() || "Not specified"}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
