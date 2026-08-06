import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { BrandMark } from "../../components/BrandMark";
import { AnimatedOutlet } from "../../components/ui/AnimatedOutlet";
import { DRAWER_PANEL_CLASS, OVERLAY_BACKDROP_CLASS } from "../ui/motion";
import { MenuIcon } from "../../components/icons";
import { Button } from "../../components/ui/Button";
import { MetaChatOverlay } from "../../components/story/MetaChatOverlay";
import { cn } from "../../utils/cn";
import { META_CHAT_OPEN_STORAGE_KEY } from "../../lib/jobNotifications";
import { GLOBAL_META_CHAT_SCOPE_ID } from "../../lib/metaChatScope";
import {
  readStoredBoolean,
  readStoredTextSize,
  UiPrefsContext,
  UI_PREFS_KEYS,
  writeStoredBoolean,
  writeStoredTextSize,
} from "../ui/UiPrefsContext";
import { StorySettingsDrawer } from "./StorySettingsDrawer";
import { PwaInstallBanner } from "../../components/PwaInstallBanner";
import { V2LeftSidebar } from "./V2LeftSidebar";
import { V2RightSidebar } from "./V2RightSidebar";
import { BackgroundTasksButton } from "../../components/BackgroundTasksPanel";

export function V2Shell() {
  const { storyId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [leftOpen, setLeftOpen] = useState(false);
  const [storySettingsOpen, setStorySettingsOpen] = useState(false);
  const [globalMetaChatOpen, setGlobalMetaChatOpen] = useState(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(() =>
    readStoredBoolean(UI_PREFS_KEYS.rightSidebarCollapsed, true),
  );
  const [readerMode, setReaderMode] = useState(() =>
    readStoredBoolean(UI_PREFS_KEYS.readerMode, false),
  );
  const [showChrome, setShowChrome] = useState(() =>
    readStoredBoolean(UI_PREFS_KEYS.showChrome, false),
  );
  const [showArchivedStories, setShowArchivedStories] = useState(() =>
    readStoredBoolean(UI_PREFS_KEYS.showArchivedStories, false),
  );
  const [textSize, setTextSize] = useState<"sm" | "md" | "lg" | "xl">(() =>
    readStoredTextSize(UI_PREFS_KEYS.textSize, "md"),
  );

  useEffect(() => {
    setLeftOpen(false);
    setStorySettingsOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    try {
      if (localStorage.getItem(META_CHAT_OPEN_STORAGE_KEY) === GLOBAL_META_CHAT_SCOPE_ID) {
        localStorage.removeItem(META_CHAT_OPEN_STORAGE_KEY);
        setGlobalMetaChatOpen(true);
      }
    } catch {}
  }, [location.pathname]);

  useEffect(() => {
    function openGlobalMetaChat() {
      try {
        if (localStorage.getItem(META_CHAT_OPEN_STORAGE_KEY) === GLOBAL_META_CHAT_SCOPE_ID) {
          localStorage.removeItem(META_CHAT_OPEN_STORAGE_KEY);
        }
      } catch {}
      setGlobalMetaChatOpen(true);
    }

    window.addEventListener("story-engine:open-global-metachat", openGlobalMetaChat);
    return () =>
      window.removeEventListener("story-engine:open-global-metachat", openGlobalMetaChat);
  }, []);

  const activeStoryId = useMemo(() => (storyId ? String(storyId) : undefined), [storyId]);
  const readerActive = Boolean(activeStoryId) && readerMode;
  const effectiveShowChrome = readerActive ? false : showChrome;
  const showFloatingGlobalMetaChatButton = !activeStoryId;
  const leftOpenRef = useRef(leftOpen);
  const storySettingsOpenRef = useRef(storySettingsOpen);
  const pathnameRef = useRef(location.pathname);

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

  useEffect(() => {
    writeStoredBoolean(UI_PREFS_KEYS.showArchivedStories, showArchivedStories);
  }, [showArchivedStories]);

  useEffect(() => {
    writeStoredTextSize(UI_PREFS_KEYS.textSize, textSize);
  }, [textSize]);

  useEffect(() => {
    leftOpenRef.current = leftOpen;
  }, [leftOpen]);

  useEffect(() => {
    storySettingsOpenRef.current = storySettingsOpen;
  }, [storySettingsOpen]);

  useEffect(() => {
    pathnameRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    let removeListener: (() => void) | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) {
          return;
        }

        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("backButton", () => {
          if (leftOpenRef.current) {
            setLeftOpen(false);
            return;
          }

          if (storySettingsOpenRef.current) {
            setStorySettingsOpen(false);
            return;
          }

          const state = window.history.state as any;
          const historyIndex = typeof state?.idx === "number" ? state.idx : 0;
          const canGoBack = historyIndex > 0;

          if (canGoBack) {
            navigate(-1);
            return;
          }

          const pathname = pathnameRef.current;

          if (pathname !== "/") {
            navigate("/");
            return;
          }

          if (window.confirm("Exit Story Engine?")) {
            void App.exitApp();
          }
        });

        if (!cancelled) {
          removeListener = () => {
            void handle.remove();
          };
        } else {
          void handle.remove();
        }
      } catch {}
    })();

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, [navigate]);

  return (
    <UiPrefsContext.Provider
      value={{
        rightSidebarCollapsed,
        setRightSidebarCollapsed,
        readerMode,
        setReaderMode,
        showChrome,
        setShowChrome,
        showArchivedStories,
        setShowArchivedStories,
        textSize,
        setTextSize,
        storySettingsOpen,
        setStorySettingsOpen,
      }}
    >
      <div className="min-h-screen bg-app text-ink">
        <div className="mx-auto min-h-screen max-w-[1800px]">
          <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-divider bg-app/80 px-4 py-4 backdrop-blur-xl lg:hidden">
            <BrandMark compact />
            <div className="flex items-center gap-2">
              <BackgroundTasksButton />
              <Button
                variant="secondary"
                size="sm"
                className="rounded-full"
                onClick={() => setLeftOpen(true)}
                aria-label="Open navigation"
              >
                <MenuIcon />
              </Button>
              <button
                type="button"
                aria-label="Open library MetaChat"
                onClick={() => setGlobalMetaChatOpen(true)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-white/40 transition hover:bg-white/[0.06] hover:text-white/70"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="8" width="18" height="11" rx="2" />
                  <path d="M8 8V5" /><path d="M16 8V5" />
                  <circle cx="9" cy="13.5" r="1" fill="currentColor" stroke="none" />
                  <circle cx="15" cy="13.5" r="1" fill="currentColor" stroke="none" />
                </svg>
              </button>
              <button
                type="button"
                aria-label="Global settings"
                onClick={() => navigate("/settings")}
                className="flex h-8 w-8 items-center justify-center rounded-full text-white/40 transition hover:bg-white/[0.06] hover:text-white/70"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2.75v3" /><path d="m18.54 5.46-2.12 2.12" /><path d="M21.25 12h-3" /><path d="m18.54 18.54-2.12-2.12" /><path d="M12 18.25v3" /><path d="m7.58 16.42-2.12 2.12" /><path d="M5.75 12h-3" /><path d="m7.58 7.58-2.12-2.12" /><circle cx="12" cy="12" r="3.5" />
                </svg>
              </button>
            </div>
          </header>

          <div
            className={cn(
              "grid min-h-screen",
              readerActive
                ? "lg:grid-cols-[minmax(0,1fr)]"
                : rightSidebarCollapsed
                  ? "lg:grid-cols-[266px_minmax(0,1fr)]"
                  : "lg:grid-cols-[266px_minmax(0,1fr)_360px]",
            )}
          >
            {readerActive ? null : (
              <aside className="hidden border-r border-divider bg-app-elevated lg:block">
                <div className="sticky top-0 h-screen">
                  <V2LeftSidebar activeStoryId={activeStoryId} />
                </div>
              </aside>
            )}

            <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
              <PwaInstallBanner />
              <AnimatedOutlet />
            </main>

            {readerActive || rightSidebarCollapsed || !effectiveShowChrome ? null : (
              <aside className="hidden border-l border-divider bg-app-elevated lg:block">
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
              "absolute inset-0 bg-slate-950/65 backdrop-blur-sm",
              OVERLAY_BACKDROP_CLASS,
              leftOpen ? "opacity-100" : "opacity-0",
            )}
            onClick={() => setLeftOpen(false)}
          />
          <div
            className={cn(
              "absolute inset-y-0 left-0 flex w-[min(88vw,24rem)] flex-col border-r border-divider bg-app-elevated shadow-hero",
              DRAWER_PANEL_CLASS,
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
        {showFloatingGlobalMetaChatButton ? (
          <button
            type="button"
            aria-label="Open library MetaChat"
            onClick={() => setGlobalMetaChatOpen(true)}
            className="fixed right-4 bottom-4 z-40 hidden items-center gap-2 rounded-full border border-accent/25 bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground shadow-hero transition hover:bg-accent-hover lg:flex"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="8" width="18" height="11" rx="2" />
              <path d="M8 8V5" /><path d="M16 8V5" />
              <circle cx="9" cy="13.5" r="1" fill="currentColor" stroke="none" />
              <circle cx="15" cy="13.5" r="1" fill="currentColor" stroke="none" />
            </svg>
            Library MetaChat
          </button>
        ) : null}
        <MetaChatOverlay
          open={globalMetaChatOpen}
          storyId={GLOBAL_META_CHAT_SCOPE_ID}
          onClose={() => setGlobalMetaChatOpen(false)}
        />
      </div>
    </UiPrefsContext.Provider>
  );
}
