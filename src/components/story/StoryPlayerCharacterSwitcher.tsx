import { useMemo, useState } from "react";
import type { PlayerCharacter, Story } from "../../types/models";
import { useStoryEngine } from "../../app/providers/StoryEngineProvider";
import { getSwappablePlayerCharacters, isPlayerCharacterSheetEmpty } from "../../lib/storyPlayerCharacterSwap";
import { cn } from "../../utils/cn";
import { CharacterPreviewButton } from "../characters/CharacterSheetPreview";
import { Button } from "../ui/Button";

function describeCharacter(character: PlayerCharacter) {
  return [character.age ? `Age ${character.age}` : "", character.gender?.trim() ?? "", character.pronouns?.trim() ?? ""]
    .filter(Boolean)
    .join(" · ");
}

function CharacterSummary({ character }: { character: PlayerCharacter }) {
  const details = describeCharacter(character);
  const empty = isPlayerCharacterSheetEmpty(character);
  return (
    <>
      <span className="block text-sm font-semibold text-ink">{character.name}</span>
      {details ? <span className="mt-1 block text-xs font-medium text-accent-soft">{details}</span> : null}
      <span
        className={cn(
          "mt-1.5 block overflow-hidden text-xs leading-5 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]",
          empty ? "text-amber-200/90" : "text-ink-muted",
        )}
      >
        {empty ? "Empty sheet: only the name is set." : character.characterConcept?.trim() || "No character concept written yet."}
      </span>
    </>
  );
}

/** Story settings control for switching the story to a different player character sheet. */
export function StoryPlayerCharacterSwitcher({
  story,
  onNotice,
  onError,
}: {
  story: Story;
  onNotice: (message: string) => void;
  onError: (message: string | null) => void;
}) {
  const { playerCharacters, getPlayerCharacterById, changeStoryPlayerCharacter } = useStoryEngine();
  const current = getPlayerCharacterById(story.playerCharacterId);
  const candidates = useMemo(() => getSwappablePlayerCharacters(story, playerCharacters), [playerCharacters, story]);
  const [choosing, setChoosing] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const pending = pendingId ? candidates.find((character) => character.id === pendingId) : undefined;

  function closeChooser() {
    setChoosing(false);
    setPendingId(null);
  }

  async function confirmSwitch() {
    if (!pending) return;
    setSwitching(true);
    onError(null);
    try {
      await changeStoryPlayerCharacter(story.id, pending.id);
      onNotice(`Player character switched to ${pending.name}. Story memory is being rebuilt.`);
      closeChooser();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Unable to switch the player character.");
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="space-y-3">
      {current ? (
        <div className="relative rounded-[10px] border border-divider/[0.45] bg-panel-muted/40 py-3 pl-4 pr-28">
          <CharacterSummary character={current} />
          <CharacterPreviewButton character={current} className="absolute right-3 top-3" />
        </div>
      ) : (
        <p className="text-sm text-ink-muted">This story's character sheet could not be found.</p>
      )}

      {!choosing ? (
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          disabled={!candidates.length}
          onClick={() => setChoosing(true)}
        >
          {candidates.length ? "Change player character" : "No other characters in this universe"}
        </Button>
      ) : (
        <div className="space-y-3">
          <p className="text-xs leading-5 text-ink-muted">
            Pick the sheet this story should use. Preview opens the full sheet without choosing it.
          </p>
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {candidates.map((character) => {
              const selected = pendingId === character.id;
              return (
                <div key={character.id} className="relative">
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setPendingId(character.id)}
                    className={cn(
                      "w-full rounded-[10px] border py-3 pl-4 pr-28 text-left transition",
                      selected
                        ? "border-accent/50 bg-accent/[0.10]"
                        : "border-divider/[0.45] bg-panel-muted/40 hover:border-accent/[0.35] hover:bg-panel-muted/70",
                    )}
                  >
                    <CharacterSummary character={character} />
                  </button>
                  <CharacterPreviewButton character={character} className="absolute right-3 top-3" />
                </div>
              );
            })}
          </div>
          {pending ? (
            <div className="rounded-[8px] border border-divider bg-white/[0.02] px-3.5 py-3 text-xs leading-5 text-ink-muted">
              The transcript stays exactly as written. From now on {pending.name}'s sheet is the source of truth,
              and story memory is rebuilt from that sheet and the transcript. If the names differ, earlier lines
              keep the old name.
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button type="button" className="flex-1" disabled={!pending || switching} onClick={() => void confirmSwitch()}>
              {switching ? "Switching…" : pending ? `Switch to ${pending.name}` : "Choose a character"}
            </Button>
            <Button type="button" variant="ghost" disabled={switching} onClick={closeChooser}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
