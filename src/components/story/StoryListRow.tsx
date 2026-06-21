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
}

export function StoryListRow({
  story,
  universeName,
  playerCharacterName,
  to,
  active = false,
  className,
}: StoryListRowProps) {
  return (
    <Link
      to={to}
      className={cn(
        "group block rounded-[8px] border px-3.5 py-2.5 transition",
        active
          ? "border-accent/[0.25] bg-accent/[0.08]"
          : "border-divider/[0.45] bg-panel-muted/50 hover:border-divider/[0.65] hover:bg-panel-muted",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-ink">{story.title}</div>
          <div className="mt-0.5 truncate text-xs text-ink-muted">
            {universeName} · {playerCharacterName}
          </div>
        </div>
        <div className="shrink-0 text-[11px] text-ink-muted">
          {formatDateTime(story.updatedAt)}
        </div>
      </div>
      <div className="mt-1.5 truncate text-xs text-ink-soft">
        {story.currentSummary || "No summary yet."}
      </div>
    </Link>
  );
}
