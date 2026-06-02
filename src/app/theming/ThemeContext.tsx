import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { themes, type ThemeDefinition, type ThemeKey } from "./themes";

const STORAGE_KEY = "story-engine:theme";

type ThemeContextValue = {
  themeKey: ThemeKey;
  theme: ThemeDefinition;
  setThemeKey: (next: ThemeKey) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hexToRgbTriplet(hex: string) {
  const normalized = hex.trim().replace(/^#/, "");
  if (normalized.length !== 6) {
    return { r: 0, g: 0, b: 0 };
  }
  const value = Number.parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function mixRgb(left: { r: number; g: number; b: number }, right: { r: number; g: number; b: number }, ratioRight: number) {
  const t = Math.max(0, Math.min(1, ratioRight));
  return {
    r: clampByte(left.r * (1 - t) + right.r * t),
    g: clampByte(left.g * (1 - t) + right.g * t),
    b: clampByte(left.b * (1 - t) + right.b * t),
  };
}

function toCssRgbTriplet(value: { r: number; g: number; b: number }) {
  return `${value.r} ${value.g} ${value.b}`;
}

function computePrimaryHover(themeKey: ThemeKey, theme: ThemeDefinition) {
  if (themeKey === "purple") {
    return { r: 155, g: 115, b: 255 };
  }

  const primary = hexToRgbTriplet(theme.primary);
  const secondary = hexToRgbTriplet(theme.secondary);
  return mixRgb(primary, secondary, 0.55);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeKey, setThemeKeyState] = useState<ThemeKey>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && stored in themes) {
        return stored as ThemeKey;
      }
    } catch {}
    return "purple";
  });

  const theme = useMemo(() => themes[themeKey], [themeKey]);

  useEffect(() => {
    const root = document.documentElement;
    const primary = hexToRgbTriplet(theme.primary);
    const secondary = hexToRgbTriplet(theme.secondary);
    const glow = hexToRgbTriplet(theme.glow);
    const hover = computePrimaryHover(themeKey, theme);

    root.style.setProperty("--theme-primary-rgb", toCssRgbTriplet(primary));
    root.style.setProperty("--theme-secondary-rgb", toCssRgbTriplet(secondary));
    root.style.setProperty("--theme-glow-rgb", toCssRgbTriplet(glow));
    root.style.setProperty("--theme-primary-hover-rgb", toCssRgbTriplet(hover));

    try {
      localStorage.setItem(STORAGE_KEY, themeKey);
    } catch {}
  }, [theme, themeKey]);

  const setThemeKey = useCallback((next: ThemeKey) => {
    setThemeKeyState(next);
  }, []);

  const value = useMemo(
    () => ({
      themeKey,
      theme,
      setThemeKey,
    }),
    [setThemeKey, theme, themeKey],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider.");
  }
  return context;
}

