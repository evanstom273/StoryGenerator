import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Story } from "../../types/models";
import { formatDateTime } from "../../lib/dates";
import { cn } from "../../utils/cn";

interface StoryListRowProps {
  story: Story;
  universeName: string;
  playerCharacterName: string;
  to: string;
  active?: boolean;
  className?: string;
  actions?: ReactNode;
}

export function StoryListRow({
  story,
  universeName,
  playerCharacterName,
  to,
  active = false,
  className,
  actions,
}: StoryListRowProps) {
  return (
    <div
      className={cn(
        "rounded-[8px] border px-3.5 py-2.5 transition",
        active
          ? "border-accent/[0.25] bg-accent/[0.08]"
          : "border-divider/[0.45] bg-panel-muted/50 hover:border-divider/[0.65] hover:bg-panel-muted",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <Link to={to} className="group min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-ink">{story.title}</div>
          <div className="mt-0.5 truncate text-xs text-ink-muted">
            {universeName} · {playerCharacterName}
          </div>
          <div className="mt-1.5 truncate text-xs text-ink-soft">
            {story.openingPrompt || "No opening direction yet."}
          </div>
        </Link>
        <div className="shrink-0 space-y-2 text-right">
          <div className="text-[11px] text-ink-muted">
            {formatDateTime(story.updatedAt)}
          </div>
          {actions ? <div>{actions}</div> : null}
        </div>
      </div>
    </div>
  );
}
