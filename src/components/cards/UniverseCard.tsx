import type { ReactNode } from "react";
import type { Universe } from "../../types/models";
import { formatDate } from "../../lib/dates";
import { Badge } from "../ui/Badge";
import { Panel } from "../ui/Panel";

interface UniverseCardProps {
  universe: Universe;
  linkedStoryCount: number;
  linkedCharacterCount: number;
  actions?: ReactNode;
}

export function UniverseCard({
  universe,
  linkedStoryCount,
  linkedCharacterCount,
  actions,
}: UniverseCardProps) {
  return (
    <Panel variant="flat" className="h-full">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="accent">Universe</Badge>
          {universe.wikiUrl ? <Badge>Wiki linked</Badge> : <Badge>No wiki yet</Badge>}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <h3 className="mt-4 text-[15px] font-bold tracking-tight text-ink">
        {universe.name}
      </h3>
      <p className="mt-3 text-[13px] leading-6 text-ink-muted">
        {universe.description || "No description written yet."}
      </p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
            Player Characters
          </dt>
          <dd className="mt-1 text-sm text-ink-soft">{linkedCharacterCount}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
            Stories
          </dt>
          <dd className="mt-1 text-sm text-ink-soft">{linkedStoryCount}</dd>
        </div>
      </dl>
      <div className="mt-4 text-[11px] text-ink-muted">
        Added {formatDate(universe.createdAt)}
      </div>
    </Panel>
  );
}

