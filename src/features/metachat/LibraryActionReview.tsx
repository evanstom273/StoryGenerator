import type { Universe } from "../../types/models";
import type { ProposedAction } from "./types";

const fieldLabels: Record<string, string> = {
  name: "Name",
  aliases: "Also known as",
  knownTies: "Known ties",
  age: "Age",
  gender: "Gender",
  species: "Species",
  pronouns: "Pronouns",
  characterConcept: "Concept",
  appearance: "Appearance",
  personality: "Personality",
  background: "Background",
  goals: "Goals",
  notes: "Notes",
  universeId: "Universe",
  universeIds: "Universes",
  description: "Description",
  wikiUrl: "Reference URL",
  wikiUrls: "Reference URLs",
  mode: "Universe type",
  concept: "Concept",
  genreTheme: "Genre and theme",
  tone: "Tone",
  universeBlueprint: "World details",
  importedLore: "Imported lore",
  importedCharacters: "Imported characters",
  importedLocations: "Imported locations",
  importedRelationships: "Imported relationships",
};
export function LibraryActionReview({
  action,
  universes,
  pending,
}: {
  action: ProposedAction;
  universes: Universe[];
  pending: boolean;
}) {
  const before = (action.before ?? {}) as unknown as Record<string, unknown>;
  const after = (action.after ?? {}) as unknown as Record<string, unknown>;
  const fields = Object.keys(fieldLabels).filter((key) => {
    if (key === "universeId" && (before.universeIds || after.universeIds))
      return false;
    if (key === "wikiUrl" && (before.wikiUrls || after.wikiUrls)) return false;
    if (action.operation === "update")
      return JSON.stringify(before[key]) !== JSON.stringify(after[key]);
    const value = action.operation === "delete" ? before[key] : after[key];
    return (
      value !== undefined &&
      value !== "" &&
      (!Array.isArray(value) || value.length > 0)
    );
  });
  function display(key: string, value: unknown): string {
    if (
      value === undefined ||
      value === "" ||
      (Array.isArray(value) && !value.length)
    )
      return "Not set";
    if (key === "universeId")
      return (
        universes.find((item) => item.id === value)?.name ??
        "Unavailable universe"
      );
    if (key === "universeIds" && Array.isArray(value))
      return value
        .map(
          (id) =>
            universes.find((item) => item.id === id)?.name ??
            "Unavailable universe",
        )
        .join(", ");
    if (key === "wikiUrls" && Array.isArray(value))
      return value
        .map((item) => `${item.label ? `${item.label}: ` : ""}${item.url}`)
        .join("\n");
    if (Array.isArray(value)) return value.join("\n");
    return String(value);
  }
  return (
    <details className="my-2 min-w-0" open={pending}>
      <summary className="cursor-pointer text-xs">
        {action.operation} {action.kind}: {action.summary}
      </summary>
      <dl className="mt-3 max-h-72 space-y-3 overflow-y-auto overscroll-contain text-xs">
        {fields.map((key) => (
          <div key={key} className="min-w-0">
            <dt className="mb-1 font-semibold text-ink-soft">
              {fieldLabels[key]}
            </dt>
            <dd className="whitespace-pre-wrap [overflow-wrap:anywhere]">
              {action.operation === "update" && (
                <div className="mb-1 text-ink-muted">
                  <span>Current: </span>
                  {display(key, before[key])}
                </div>
              )}
              <div>
                {action.operation === "update" && <span>Proposed: </span>}
                {display(
                  key,
                  action.operation === "delete" ? before[key] : after[key],
                )}
              </div>
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
