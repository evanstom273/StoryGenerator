import { useEffect, useMemo, useRef } from "react";
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
  const drawerScrollRef = useRef<HTMLDivElement>(null);

  function scrollSectionIntoView(section: HTMLDivElement) {
    const scroller = drawerScrollRef.current;
    if (!scroller) return;

    const scrollerRect = scroller.getBoundingClientRect();
    const sectionRect = section.getBoundingClientRect();
    const targetTop = scroller.scrollTop + (sectionRect.top - scrollerRect.top) - 10;

    scroller.scrollTo({
      top: Math.max(0, targetTop),
      behavior: "smooth",
    });
  }

  useEffect(() => {
    if (!open) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerScrollRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  return (
    <div
      className={cn(
        OVERLAY_BACKDROP_CLASS,
        "fixed inset-x-0 bottom-0 top-14 z-[70] flex justify-end lg:inset-0",
        open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
      )}
      aria-hidden={!open}
      onClick={onClose}
    >
      <div
        className={cn(
          DRAWER_PANEL_CLASS,
          "flex h-full w-full max-w-2xl flex-col overflow-hidden overscroll-contain bg-app-elevated shadow-hero",
          open ? "translate-x-0" : "translate-x-full",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-divider bg-app/95 px-5 py-4 backdrop-blur">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">
              Story State
            </div>
            <div className="mt-1 text-xl font-bold text-ink">
              {story?.title ?? "Story Memory"}
            </div>
          </div>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
        <div ref={drawerScrollRef} className="flex-1 overflow-y-auto p-4 overscroll-contain">
          <StoryIndexSection storyId={storyId} onSectionOpen={scrollSectionIntoView} />
        </div>
      </div>
    </div>
  );
}
