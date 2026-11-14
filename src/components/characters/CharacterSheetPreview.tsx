import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { PlayerCharacter } from "../../types/models";
import { useStoryEngine } from "../../app/providers/StoryEngineProvider";
import { isPlayerCharacterSheetEmpty } from "../../lib/storyPlayerCharacterSwap";
import { getUniverseIds } from "../../lib/universeIds";
import { cn } from "../../utils/cn";
import { Button } from "../ui/Button";
import { PlayerCharacterSheetView } from "./PlayerCharacterSheetView";

export function CharacterSheetPreviewModal({
  character,
  onClose,
}: {
  character: PlayerCharacter;
  onClose: () => void;
}) {
  const { getUniverseById, getPlayerCharacterById } = useStoryEngine();
  const universeNames = getUniverseIds(character)
    .map((id) => getUniverseById(id)?.name)
    .filter((name): name is string => Boolean(name));
  const empty = isPlayerCharacterSheetEmpty(character);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [onClose]);

  return createPortal(
    // Stop clicks reaching whatever list or drawer opened the preview.
    <div className="fixed inset-0 z-[90]" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        aria-label="Close character preview"
        className="absolute inset-0 bg-slate-950/65 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="pointer-events-none absolute inset-0 flex items-stretch justify-center sm:items-center sm:p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${character.name} character sheet`}
          className="pointer-events-auto flex h-full w-full flex-col overflow-hidden border-divider bg-app-elevated shadow-hero sm:h-auto sm:max-h-[88vh] sm:max-w-2xl sm:rounded-[14px] sm:border"
        >
          <div className="flex items-start justify-between gap-3 border-b border-divider px-5 py-4">
            <div className="min-w-0">
              <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">Character sheet</div>
              <div className="mt-1 break-words text-lg font-bold text-ink">{character.name}</div>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            {empty ? (
              <div className="mb-4 rounded-[8px] border border-amber-400/25 bg-amber-400/10 px-3.5 py-3 text-sm text-amber-100">
                This sheet is empty. A story using it only knows the name.
              </div>
            ) : null}
            <PlayerCharacterSheetView
              character={character}
              universeNames={universeNames}
              getPlayerCharacterById={getPlayerCharacterById}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** A small "Preview" button that opens the full sheet without selecting the character. */
export function CharacterPreviewButton({
  character,
  className,
}: {
  character: PlayerCharacter;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        type="button"
        aria-label={`Preview ${character.name}'s character sheet`}
        title="Preview the full character sheet"
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-divider/[0.6] bg-panel-muted/60 px-2.5 py-1.5 text-xs font-medium text-ink-soft transition hover:border-accent/[0.35] hover:text-ink",
          className,
        )}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <svg aria-hidden width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        Preview
      </button>
      {open ? <CharacterSheetPreviewModal character={character} onClose={close} /> : null}
    </>
  );
}
