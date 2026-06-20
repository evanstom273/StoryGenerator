import type { ReactNode } from "react";
import type { PlayerCharacter } from "../../types/models";
import { formatDate } from "../../lib/dates";
import { Badge } from "../ui/Badge";
import { Panel } from "../ui/Panel";

interface CharacterCardProps {
  character: PlayerCharacter;
  universeName: string;
  linkedStoryCount: number;
  actions?: ReactNode;
}

export function CharacterCard({
  character,
  universeName,
  linkedStoryCount,
  actions,
}: CharacterCardProps) {
  return (
    <Panel className="h-full border-divider/[0.6] bg-panel-muted p-3.5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="accent">Player Character</Badge>
          <Badge>{universeName}</Badge>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <h3 className="mt-5 text-lg font-semibold text-ink">
        {character.name}
      </h3>
      <p className="mt-2 text-[11px] font-medium text-accent">
        {character.age ? `Age ${character.age}` : "Age not specified"}
      </p>
      <p className="mt-4 text-sm leading-relaxed text-ink-soft">
        {character.background || "No background written yet."}
      </p>
      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-[9px] font-bold uppercase tracking-[0.22em] text-ink-muted/[0.5]">
            Goals
          </dt>
          <dd className="mt-1 text-sm text-ink-soft">
            {character.goals || "Not specified"}
          </dd>
        </div>
        <div>
          <dt className="text-[9px] font-bold uppercase tracking-[0.22em] text-ink-muted/[0.5]">
            Linked Stories
          </dt>
          <dd className="mt-1 text-sm text-ink-soft">{linkedStoryCount}</dd>
        </div>
      </dl>
      <div className="mt-6 text-sm text-ink-muted">
        Created {formatDate(character.createdAt)}
      </div>
    </Panel>
  );
}
