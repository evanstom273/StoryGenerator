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
const CUSTOM_ACCENT_KEY = "story-engine:theme:customAccent";

type ThemeContextValue = {
  themeKey: ThemeKey;
  theme: ThemeDefinition & {
    accentSecondary: string;
    accentSoft: string;
    accentHover: string;
    accentMuted: string;
    accentBorder: string;
    accentGlow: string;
    accentSurface: string;
    accentGradientStart: string;
    accentGradientEnd: string;
  };
  customAccent: string;
  setThemeKey: (next: ThemeKey) => void;
  setCustomAccent: (next: string) => boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function isValidHexColor(hex: string) {
  return /^#?[0-9a-fA-F]{6}$/.test(hex.trim());
}

function normalizeHexColor(hex: string) {
  const trimmed = hex.trim();
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return withHash.toUpperCase();
}

function hexToRgbTriplet(hex: string) {
  if (!isValidHexColor(hex)) {
    return null;
  }
  const normalized = normalizeHexColor(hex).replace(/^#/, "");
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

function toCssRgba(value: { r: number; g: number; b: number }, alpha: number) {
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${value.r}, ${value.g}, ${value.b}, ${a})`;
}

function srgbToLinear(channel: number) {
  const v = channel / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function relativeLuminance(rgb: { r: number; g: number; b: number }) {
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: number, b: number) {
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

function getContrastingTextRgb(accentRgb: { r: number; g: number; b: number }) {
  const lum = relativeLuminance(accentRgb);
  const whiteLum = 1;
  const blackLum = 0;
  const whiteRatio = contrastRatio(lum, whiteLum);
  const blackRatio = contrastRatio(lum, blackLum);
  return blackRatio >= whiteRatio ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
}

function deriveAccentVariants(accentRgb: { r: number; g: number; b: number }) {
  const white = { r: 255, g: 255, b: 255 };
  const accentSecondary = mixRgb(accentRgb, white, 0.32);
  const accentSoft = mixRgb(accentRgb, white, 0.62);
  const accentHover = mixRgb(accentRgb, white, 0.18);

  return {
    accentSecondary,
    accentSoft,
    accentHover,
    accentMuted: toCssRgba(accentRgb, 0.15),
    accentBorder: toCssRgba(accentRgb, 0.35),
    accentGlow: toCssRgba(accentRgb, 0.4),
    accentSurface: toCssRgba(accentRgb, 0.08),
    accentGradientStart: toCssRgba(accentRgb, 0.22),
    accentGradientEnd: toCssRgba(accentRgb, 0.05),
  };
}

function migrateThemeKey(value: string | null): ThemeKey {
  if (!value) {
    return "amethyst";
  }

  if (value === "purple") {
    return "amethyst";
  }

  if (value === "gold") {
    return "copper";
  }

  if (value in themes) {
    return value as ThemeKey;
  }

  return "amethyst";
}

function readStoredCustomAccent() {
  try {
    const stored = localStorage.getItem(CUSTOM_ACCENT_KEY);
    if (!stored) {
      return null;
    }
    if (!isValidHexColor(stored)) {
      return null;
    }
    return normalizeHexColor(stored);
  } catch {
    return null;
  }
}

export function buildThemeCssVariables(params: { themeKey: ThemeKey; customAccent: string }) {
  const base = themes[params.themeKey];
  const accent = params.themeKey === "custom" ? params.customAccent : base.accent;

  const accentRgb = hexToRgbTriplet(accent) ?? { r: 124, g: 58, b: 237 };
  const accentForegroundRgb = getContrastingTextRgb(accentRgb);
  const bgRgb = hexToRgbTriplet(base.bg) ?? { r: 10, g: 10, b: 10 };
  const bgElevatedRgb = hexToRgbTriplet(base.bgElevated) ?? { r: 18, g: 18, b: 18 };
  const surfaceRgb = hexToRgbTriplet(base.surface) ?? { r: 26, g: 26, b: 26 };
  const surfaceMutedRgb = hexToRgbTriplet(base.surfaceMuted) ?? { r: 20, g: 20, b: 20 };
  const surfaceStrongRgb = hexToRgbTriplet(base.surfaceStrong) ?? { r: 32, g: 32, b: 32 };
  const borderRgb = hexToRgbTriplet(base.border) ?? { r: 42, g: 42, b: 42 };
  const textRgb = hexToRgbTriplet(base.text) ?? { r: 248, g: 250, b: 252 };
  const textSoftRgb = hexToRgbTriplet(base.textSoft) ?? { r: 219, g: 228, b: 240 };
  const textMutedRgb = hexToRgbTriplet(base.textMuted) ?? { r: 148, g: 163, b: 184 };

  const derived = deriveAccentVariants(accentRgb);

  return {
    "--app-rgb": toCssRgbTriplet(bgRgb),
    "--app-elevated-rgb": toCssRgbTriplet(bgElevatedRgb),
    "--panel-rgb": toCssRgbTriplet(surfaceRgb),
    "--panel-muted-rgb": toCssRgbTriplet(surfaceMutedRgb),
    "--panel-strong-rgb": toCssRgbTriplet(surfaceStrongRgb),
    "--divider-rgb": toCssRgbTriplet(borderRgb),
    "--ink-rgb": toCssRgbTriplet(textRgb),
    "--ink-soft-rgb": toCssRgbTriplet(textSoftRgb),
    "--ink-muted-rgb": toCssRgbTriplet(textMutedRgb),
    "--accent-rgb": toCssRgbTriplet(accentRgb),
    "--accent-foreground-rgb": toCssRgbTriplet(accentForegroundRgb),
    "--accent-secondary-rgb": toCssRgbTriplet(derived.accentSecondary),
    "--accent-soft-rgb": toCssRgbTriplet(derived.accentSoft),
    "--accent-hover-rgb": toCssRgbTriplet(derived.accentHover),
    "--accent-muted": derived.accentMuted,
    "--accent-border": derived.accentBorder,
    "--accent-glow": derived.accentGlow,
    "--accent-surface": derived.accentSurface,
    "--accent-gradient-start": derived.accentGradientStart,
    "--accent-gradient-end": derived.accentGradientEnd,
    "--theme-primary-rgb": toCssRgbTriplet(accentRgb),
    "--theme-secondary-rgb": toCssRgbTriplet(derived.accentSecondary),
    "--theme-glow-rgb": toCssRgbTriplet(derived.accentSoft),
    "--theme-primary-hover-rgb": toCssRgbTriplet(derived.accentHover),
  } as const;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeKey, setThemeKeyState] = useState<ThemeKey>(() => {
    try {
      return migrateThemeKey(localStorage.getItem(STORAGE_KEY));
    } catch {}
    return "amethyst";
  });

  const [customAccent, setCustomAccentState] = useState<string>(() => {
    return readStoredCustomAccent() ?? themes.custom.accent;
  });

  const theme = useMemo(() => {
    const base = themes[themeKey];
    const accent = themeKey === "custom" ? customAccent : base.accent;
    const accentRgb = hexToRgbTriplet(accent) ?? { r: 124, g: 58, b: 237 };
    const derived = deriveAccentVariants(accentRgb);

    return {
      ...base,
      accent,
      accentSecondary: `rgb(${toCssRgbTriplet(derived.accentSecondary)})`,
      accentSoft: `rgb(${toCssRgbTriplet(derived.accentSoft)})`,
      accentHover: `rgb(${toCssRgbTriplet(derived.accentHover)})`,
      accentMuted: derived.accentMuted,
      accentBorder: derived.accentBorder,
      accentGlow: derived.accentGlow,
      accentSurface: derived.accentSurface,
      accentGradientStart: derived.accentGradientStart,
      accentGradientEnd: derived.accentGradientEnd,
    };
  }, [customAccent, themeKey]);

  useEffect(() => {
    const root = document.documentElement;
    const cssVars = buildThemeCssVariables({ themeKey, customAccent });
    Object.entries(cssVars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

    try {
      localStorage.setItem(STORAGE_KEY, themeKey);
    } catch {}
  }, [customAccent, themeKey]);

  const setThemeKey = useCallback((next: ThemeKey) => {
    setThemeKeyState(next);
  }, []);

  const setCustomAccent = useCallback((next: string) => {
    if (!isValidHexColor(next)) {
      return false;
    }

    const normalized = normalizeHexColor(next);
    setCustomAccentState(normalized);
    try {
      localStorage.setItem(CUSTOM_ACCENT_KEY, normalized);
    } catch {}
    return true;
  }, []);

  const value = useMemo(
    () => ({
      themeKey,
      theme,
      customAccent,
      setThemeKey,
      setCustomAccent,
    }),
    [customAccent, setCustomAccent, setThemeKey, theme, themeKey],
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
