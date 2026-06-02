export type ThemeDefinition = {
  name: string;
  primary: string;
  secondary: string;
  glow: string;
  background: string;
  surface: string;
  text: string;
  mutedText: string;
};

export const themes = {
  purple: {
    name: "Purple",
    primary: "#8B5CF6",
    secondary: "#A78BFA",
    glow: "#C4B5FD",
    background: "#09090F",
    surface: "#12121A",
    text: "#FFFFFF",
    mutedText: "#A1A1AA",
  },
  gold: {
    name: "Gold",
    primary: "#D4A017",
    secondary: "#F0C75E",
    glow: "#FFD76A",
    background: "#0B0B0F",
    surface: "#141414",
    text: "#FFFFFF",
    mutedText: "#B8B8B8",
  },
} satisfies Record<string, ThemeDefinition>;

export type ThemeKey = keyof typeof themes;

