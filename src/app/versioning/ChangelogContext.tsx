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
  latestEntry: ChangelogEntry | null;
};

const ChangelogContext = createContext<ChangelogContextValue | null>(null);

function parseSemver(value: string) {
  const cleaned = value.trim().replace(/^v/i, "");
  const parts = cleaned.split(".").map((part) => Number(part));
  return {
    major: Number.isFinite(parts[0]) ? parts[0] : 0,
    minor: Number.isFinite(parts[1]) ? parts[1] : 0,
    patch: Number.isFinite(parts[2]) ? parts[2] : 0,
  };
}

function compareSemver(a: string, b: string) {
  const left = parseSemver(a);
  const right = parseSemver(b);
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  return left.patch - right.patch;
}

export function ChangelogProvider({ children }: { children: ReactNode }) {
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [isChangelogHistoryOpen, setIsChangelogHistoryOpen] = useState(false);
  const [visibleVersions, setVisibleVersions] = useState<string[]>([APP_VERSION]);

  const latestEntry = useMemo(() => {
    return CHANGELOG[APP_VERSION] ?? null;
  }, []);

  const appLabel = useMemo(() => `${APP_NAME} v${APP_VERSION}`, []);

  useEffect(() => {
    try {
      const lastViewed = localStorage.getItem(STORAGE_KEY);
      if (lastViewed !== APP_VERSION) {
        const knownVersions = Object.keys(CHANGELOG).sort(compareSemver);
        const currentIndex = knownVersions.indexOf(APP_VERSION);
        const lastIndex = lastViewed ? knownVersions.indexOf(lastViewed) : -1;
        const missed =
          lastIndex >= 0 && currentIndex >= 0
            ? knownVersions.slice(lastIndex + 1, currentIndex + 1)
            : [APP_VERSION];
        setVisibleVersions(missed.length ? missed : [APP_VERSION]);
        setIsChangelogOpen(true);
      }
    } catch {
      setIsChangelogOpen(true);
    }
  }, []);

  const openChangelog = useCallback(() => {
    setVisibleVersions([APP_VERSION]);
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
      latestEntry,
    }),
    [
      appLabel,
      closeChangelog,
      closeChangelogHistory,
      latestEntry,
      isChangelogHistoryOpen,
      isChangelogOpen,
      openChangelog,
      openChangelogHistory,
    ],
  );

  const releases = useMemo(() => {
    const ordered = [...visibleVersions].sort(compareSemver);
    return ordered
      .map((version) => ({ version, entry: CHANGELOG[version] ?? null }))
      .filter((release) => release.entry);
  }, [visibleVersions]);

  return (
    <ChangelogContext.Provider value={value}>
      {children}
      <ChangelogModal open={isChangelogOpen} appLabel={appLabel} releases={releases} onClose={closeChangelog} />
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
