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
    <Panel className="h-full bg-panel-muted">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="accent">{universeName}</Badge>
          <Badge>{playerCharacterName}</Badge>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <h3 className="mt-4 text-[15px] font-bold tracking-tight text-ink">
        {story.title}
      </h3>
      <p className="mt-3 text-[13px] leading-6 text-ink-muted">
        {story.currentSummary || "No summary yet."}
      </p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
            Conversation Entries
          </dt>
          <dd className="mt-1 text-sm text-ink-soft">{messageCount}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.18em] text-ink-muted">
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
