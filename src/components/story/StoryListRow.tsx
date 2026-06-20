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
        "group block rounded-[7px] border px-2.5 py-2 transition",
        active
          ? "border-accent/[0.24] bg-panel-muted"
          : "border-divider/[0.6] bg-app hover:bg-white/[0.03]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-ink">{story.title}</div>
          <div className="mt-1 truncate text-xs text-ink-muted">
            {universeName} · {playerCharacterName}
          </div>
        </div>
        <div className="shrink-0 text-[11px] text-ink-muted">
          {formatDateTime(story.updatedAt)}
        </div>
      </div>
      <div className="mt-2 truncate text-sm text-ink-soft">
        {story.currentSummary || "No summary yet."}
      </div>
    </Link>
  );
}
