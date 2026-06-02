import { createContext, useContext } from "react";

export type UiPrefs = {
  rightSidebarCollapsed: boolean;
  setRightSidebarCollapsed: (next: boolean) => void;
  readerMode: boolean;
  setReaderMode: (next: boolean) => void;
  showChrome: boolean;
  setShowChrome: (next: boolean) => void;
  textSize: "sm" | "md" | "lg" | "xl";
  setTextSize: (next: "sm" | "md" | "lg" | "xl") => void;
  storySettingsOpen: boolean;
  setStorySettingsOpen: (next: boolean) => void;
};

export const UI_PREFS_KEYS = {
  rightSidebarCollapsed: "story-engine:v2:right-collapsed",
  readerMode: "story-engine:v2:reader-mode",
  showChrome: "story-engine:v2:show-chrome",
  textSize: "story-engine:v2:text-size",
} as const;

export const UiPrefsContext = createContext<UiPrefs | null>(null);

export function useUiPrefs() {
  const context = useContext(UiPrefsContext);
  if (!context) {
    throw new Error("useUiPrefs must be used inside UiPrefsContext.Provider.");
  }
  return context;
}

export function readStoredBoolean(key: string, fallback: boolean) {
  try {
    const value = localStorage.getItem(key);
    if (value === null) return fallback;
    if (value === "true") return true;
    if (value === "false") return false;
    return fallback;
  } catch {
    return fallback;
  }
}

export function writeStoredBoolean(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "true" : "false");
  } catch {}
}

export function readStoredTextSize(
  key: string,
  fallback: "sm" | "md" | "lg" | "xl",
) {
  try {
    const value = localStorage.getItem(key);
    if (value === "sm" || value === "md" || value === "lg" || value === "xl") {
      return value;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export function writeStoredTextSize(key: string, value: "sm" | "md" | "lg" | "xl") {
  try {
    localStorage.setItem(key, value);
  } catch {}
}
