import type { ReactNode } from "react";
import type { Story } from "../../types/models";
import { formatDateTime } from "../../lib/dates";
import { Badge } from "../ui/Badge";
import { Panel } from "../ui/Panel";

interface StoryCardProps {
  story: Story;
  universeName: string;
  playerCharacterName: string;
  messageCount: number;
  actions?: ReactNode;
}

export function StoryCard({
  story,
  universeName,
  playerCharacterName,
  messageCount,
  actions,
}: StoryCardProps) {
  return (
    <Panel className="h-full border-divider/[0.6] bg-panel-muted p-3.5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="accent">{universeName}</Badge>
          <Badge>{playerCharacterName}</Badge>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <h3 className="mt-5 text-lg font-semibold text-ink">
        {story.title}
      </h3>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        {story.currentSummary || "No summary yet."}
      </p>
      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-[9px] font-bold uppercase tracking-[0.22em] text-ink-muted/[0.5]">
            Conversation Entries
          </dt>
          <dd className="mt-1 text-sm text-ink-soft">{messageCount}</dd>
        </div>
        <div>
          <dt className="text-[9px] font-bold uppercase tracking-[0.22em] text-ink-muted/[0.5]">
            Updated
          </dt>
          <dd className="mt-1 text-sm text-ink-soft">
            {formatDateTime(story.updatedAt)}
          </dd>
        </div>
      </dl>
    </Panel>
  );
}
