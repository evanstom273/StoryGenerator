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
  lineageLabel?: string;
  readOnly?: boolean;
  actions?: ReactNode;
}

export function StoryListRow({
  story,
  universeName,
  playerCharacterName,
  to,
  active = false,
  className,
  lineageLabel,
  readOnly,
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
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {lineageLabel ? (
              <span className="rounded-full border border-divider/[0.5] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
                {lineageLabel}
              </span>
            ) : null}
            {readOnly ? (
              <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-200">
                Prequel Locked
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 truncate text-xs text-ink-soft">
            {story.currentSummary || "No summary yet."}
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
