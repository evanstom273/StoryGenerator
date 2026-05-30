import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useParams } from "react-router-dom";
import { BrandMark } from "../../components/BrandMark";
import { MenuIcon } from "../../components/icons";
import { Button } from "../../components/ui/Button";
import { cn } from "../../utils/cn";
import {
  readStoredBoolean,
  UiPrefsContext,
  UI_PREFS_KEYS,
  writeStoredBoolean,
} from "../ui/UiPrefsContext";
import { StorySettingsDrawer } from "./StorySettingsDrawer";
import { V2LeftSidebar } from "./V2LeftSidebar";
import { V2RightSidebar } from "./V2RightSidebar";

export function V2Shell() {
  const { storyId } = useParams();
  const location = useLocation();
  const [leftOpen, setLeftOpen] = useState(false);
  const [storySettingsOpen, setStorySettingsOpen] = useState(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(() =>
    readStoredBoolean(UI_PREFS_KEYS.rightSidebarCollapsed, true),
  );
  const [readerMode, setReaderMode] = useState(() =>
    readStoredBoolean(UI_PREFS_KEYS.readerMode, false),
  );
  const [showChrome, setShowChrome] = useState(() =>
    readStoredBoolean(UI_PREFS_KEYS.showChrome, false),
  );

  useEffect(() => {
    setLeftOpen(false);
    setStorySettingsOpen(false);
  }, [location.pathname]);

  const activeStoryId = useMemo(() => (storyId ? String(storyId) : undefined), [storyId]);
  const readerActive = Boolean(activeStoryId) && readerMode;

  useEffect(() => {
    writeStoredBoolean(UI_PREFS_KEYS.readerMode, readerMode);
  }, [readerMode]);

  useEffect(() => {
    if (readerActive) {
      return;
    }
    writeStoredBoolean(UI_PREFS_KEYS.rightSidebarCollapsed, rightSidebarCollapsed);
  }, [readerActive, rightSidebarCollapsed]);

  useEffect(() => {
    writeStoredBoolean(UI_PREFS_KEYS.showChrome, showChrome);
  }, [showChrome]);

  return (
    <UiPrefsContext.Provider
      value={{
        rightSidebarCollapsed,
        setRightSidebarCollapsed,
        readerMode,
        setReaderMode,
        showChrome,
        setShowChrome,
        storySettingsOpen,
        setStorySettingsOpen,
      }}
    >
      <div className="min-h-screen bg-app text-ink">
        <div className="mx-auto min-h-screen max-w-[1800px]">
          <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-white/8 bg-app/80 px-4 py-4 backdrop-blur-xl lg:hidden">
            <BrandMark compact />
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="rounded-full"
                onClick={() => setLeftOpen(true)}
                aria-label="Open navigation"
              >
                <MenuIcon />
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="rounded-full"
                onClick={() => setStorySettingsOpen(true)}
                aria-label="Open story settings"
              >
                Settings
              </Button>
            </div>
          </header>

          <div
            className={cn(
              "grid min-h-screen",
              readerActive
                ? "lg:grid-cols-[minmax(0,1fr)]"
                : rightSidebarCollapsed
                  ? "lg:grid-cols-[320px_minmax(0,1fr)]"
                  : "lg:grid-cols-[320px_minmax(0,1fr)_360px]",
            )}
          >
            {readerActive ? null : (
              <aside className="hidden border-r border-white/8 bg-app-elevated lg:block">
                <div className="sticky top-0 h-screen">
                  <V2LeftSidebar activeStoryId={activeStoryId} />
                </div>
              </aside>
            )}

            <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
              <Outlet />
            </main>

            {readerActive || rightSidebarCollapsed ? null : (
              <aside className="hidden border-l border-white/8 bg-app-elevated lg:block">
                <div className="sticky top-0 h-screen">
                  <V2RightSidebar storyId={activeStoryId} />
                </div>
              </aside>
            )}
          </div>
        </div>

        <div
          className={cn(
            "fixed inset-0 z-50 lg:hidden",
            leftOpen ? "pointer-events-auto" : "pointer-events-none",
          )}
          aria-hidden={!leftOpen}
        >
          <button
            type="button"
            aria-label="Close navigation overlay"
            className={cn(
              "absolute inset-0 bg-slate-950/65 backdrop-blur-sm transition-opacity duration-200",
              leftOpen ? "opacity-100" : "opacity-0",
            )}
            onClick={() => setLeftOpen(false)}
          />
          <div
            className={cn(
              "absolute inset-y-0 left-0 flex w-[min(88vw,24rem)] flex-col border-r border-white/10 bg-app-elevated shadow-hero transition-transform duration-200",
              leftOpen ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <V2LeftSidebar
              activeStoryId={activeStoryId}
              onNavigate={() => setLeftOpen(false)}
            />
          </div>
        </div>

        <StorySettingsDrawer storyId={activeStoryId} />
      </div>
    </UiPrefsContext.Provider>
  );
}
