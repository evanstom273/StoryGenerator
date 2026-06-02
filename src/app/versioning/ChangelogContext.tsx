import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ChangelogModal } from "./ChangelogModal";
import { ChangelogHistoryModal } from "./ChangelogHistoryModal";
import { APP_NAME, APP_VERSION, CHANGELOG, type ChangelogEntry } from "./version";

const STORAGE_KEY = "story-engine:changelog:last-viewed";

type ChangelogContextValue = {
  isChangelogOpen: boolean;
  openChangelog: () => void;
  closeChangelog: () => void;
  isChangelogHistoryOpen: boolean;
  openChangelogHistory: () => void;
  closeChangelogHistory: () => void;
  appLabel: string;
  entry: ChangelogEntry | null;
};

const ChangelogContext = createContext<ChangelogContextValue | null>(null);

export function ChangelogProvider({ children }: { children: ReactNode }) {
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [isChangelogHistoryOpen, setIsChangelogHistoryOpen] = useState(false);

  const entry = useMemo(() => {
    return CHANGELOG[APP_VERSION] ?? null;
  }, []);

  const appLabel = useMemo(() => `${APP_NAME} v${APP_VERSION}`, []);

  useEffect(() => {
    try {
      const lastViewed = localStorage.getItem(STORAGE_KEY);
      if (lastViewed !== APP_VERSION) {
        setIsChangelogOpen(true);
      }
    } catch {
      setIsChangelogOpen(true);
    }
  }, []);

  const openChangelog = useCallback(() => {
    setIsChangelogOpen(true);
  }, []);

  const closeChangelog = useCallback(() => {
    setIsChangelogOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, APP_VERSION);
    } catch {}
  }, []);

  const openChangelogHistory = useCallback(() => {
    setIsChangelogHistoryOpen(true);
  }, []);

  const closeChangelogHistory = useCallback(() => {
    setIsChangelogHistoryOpen(false);
  }, []);

  const value = useMemo(
    () => ({
      isChangelogOpen,
      openChangelog,
      closeChangelog,
      isChangelogHistoryOpen,
      openChangelogHistory,
      closeChangelogHistory,
      appLabel,
      entry,
    }),
    [
      appLabel,
      closeChangelog,
      closeChangelogHistory,
      entry,
      isChangelogHistoryOpen,
      isChangelogOpen,
      openChangelog,
      openChangelogHistory,
    ],
  );

  return (
    <ChangelogContext.Provider value={value}>
      {children}
      <ChangelogModal open={isChangelogOpen} appLabel={appLabel} entry={entry} onClose={closeChangelog} />
      <ChangelogHistoryModal open={isChangelogHistoryOpen} onClose={closeChangelogHistory} />
    </ChangelogContext.Provider>
  );
}

export function useChangelog() {
  const context = useContext(ChangelogContext);
  if (!context) {
    throw new Error("useChangelog must be used inside ChangelogProvider.");
  }
  return context;
}
