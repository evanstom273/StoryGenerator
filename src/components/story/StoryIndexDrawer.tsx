import { useEffect, useMemo } from "react";
import { useStoryEngine } from "../../app/providers/StoryEngineProvider";
import { Button } from "../ui/Button";
import { DRAWER_PANEL_CLASS, OVERLAY_BACKDROP_CLASS } from "../../app/ui/motion";
import { cn } from "../../utils/cn";
import { StoryIndexSection } from "./StoryIndexSection";

interface StoryIndexDrawerProps {
  open: boolean;
  onClose: () => void;
  storyId: string;
}

export function StoryIndexDrawer({ open, onClose, storyId }: StoryIndexDrawerProps) {
  const { stories } = useStoryEngine();
  const story = useMemo(() => stories.find((s) => s.id === storyId), [stories, storyId]);

  useEffect(() => {
    if (!open) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={cn(OVERLAY_BACKDROP_CLASS, "fixed inset-0 z-[70] flex justify-end")}
      onClick={onClose}
    >
      <div
        className={cn(
          DRAWER_PANEL_CLASS,
          "flex h-full w-full max-w-2xl flex-col overflow-hidden overscroll-contain",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-divider bg-app/95 px-5 py-4 backdrop-blur">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">
              Story Index
            </div>
            <div className="mt-1 text-xl font-bold text-ink">
              {story?.title ?? "Story Memory"}
            </div>
          </div>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 overscroll-contain">
          <StoryIndexSection storyId={storyId} />
        </div>
      </div>
    </div>
  );
}
