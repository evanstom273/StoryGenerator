export type ThemeGroup = "standard" | "accessibility" | "custom";

export type ThemeDefinition = {
	name: string;
	description: string;
	accent: string;
	bg: string;
	bgElevated: string;
	surface: string;
	surfaceMuted: string;
	surfaceStrong: string;
	border: string;
	text: string;
	textSoft: string;
	textMuted: string;
	group: ThemeGroup;
};

const STANDARD_SURFACES = {
	bg: "#0A0A0A",
	bgElevated: "#121212",
	surface: "#1A1A1A",
	surfaceMuted: "#141414",
	surfaceStrong: "#202020",
	border: "#2A2A2A",
	text: "#F8FAFC",
	textSoft: "#E8EEF8",
	textMuted: "#94A3B8",
} as const;

function accentTheme(
	name: string,
	description: string,
	accent: string,
): ThemeDefinition {
	return {
		name,
		description,
		accent,
		...STANDARD_SURFACES,
		group: "standard",
	};
}

export const themes = {
	amethyst: accentTheme("Amethyst", "Violet gem accent", "#7C3AED"),
	copper: accentTheme("Copper", "Warm metal accent", "#C47A2C"),
	emerald: accentTheme("Emerald", "Green gem accent", "#10B981"),
	azure: accentTheme("Azure", "Bright sky-blue accent", "#3B82F6"),
	crimson: accentTheme("Crimson", "Deep red accent", "#DC2626"),
	silver: accentTheme("Silver", "Cool metallic accent", "#94A3B8"),
	sapphire: accentTheme("Sapphire", "Royal blue gem accent", "#2563EB"),
	ruby: accentTheme("Ruby", "Rich red gem accent", "#E11D48"),
	topaz: accentTheme("Topaz", "Golden gem accent", "#F59E0B"),
	turquoise: accentTheme("Turquoise", "Bright aqua gem accent", "#2DD4BF"),
	garnet: accentTheme("Garnet", "Wine-red gem accent", "#BE185D"),
	bronze: accentTheme("Bronze", "Warm bronze metal accent", "#D97706"),
	rosegold: accentTheme("Rose Gold", "Soft pink-gold metal accent", "#F472B6"),
	peridot: accentTheme("Peridot", "Lime-green gem accent", "#84CC16"),
	highContrast: {
		name: "High Contrast",
		description: "Maximum contrast for readability",
		accent: "#22D3EE",
		bg: "#000000",
		bgElevated: "#0A0A0A",
		surface: "#000000",
		surfaceMuted: "#000000",
		surfaceStrong: "#111111",
		border: "#FFFFFF",
		text: "#FFFFFF",
		textSoft: "#FFFFFF",
		textMuted: "#E5E7EB",
		group: "accessibility",
	},
	monochrome: {
		name: "Monochrome",
		description: "Neutral grayscale palette",
		accent: "#D4D4D4",
		bg: "#0B0B0B",
		bgElevated: "#111111",
		surface: "#161616",
		surfaceMuted: "#121212",
		surfaceStrong: "#1F1F1F",
		border: "#2F2F2F",
		text: "#F5F5F5",
		textSoft: "#E5E5E5",
		textMuted: "#A3A3A3",
		group: "accessibility",
	},
	custom: {
		name: "Custom",
		description: "Pick any accent hex colour",
		accent: "#7C3AED",
		...STANDARD_SURFACES,
		group: "custom",
	},
} satisfies Record<string, ThemeDefinition>;

export type ThemeKey = keyof typeof themes;

export const THEME_GROUP_ORDER: ThemeGroup[] = ["standard", "accessibility", "custom"];

export const THEME_GROUP_LABELS: Record<ThemeGroup, string> = {
	standard: "Gems & metals",
	accessibility: "Accessibility",
	custom: "Custom",
};

export const ACCESSIBILITY_THEME_KEYS = ["highContrast", "monochrome"] as const satisfies readonly ThemeKey[];

export type AccessibilityThemeKey = (typeof ACCESSIBILITY_THEME_KEYS)[number];

export type AccentThemeKey = Exclude<ThemeKey, AccessibilityThemeKey>;

export const ACCENT_THEME_KEYS = (Object.keys(themes) as ThemeKey[]).filter(isAccentThemeKey);

export function isAccessibilityThemeKey(key: ThemeKey): boolean {
	return themes[key].group === "accessibility";
}

export function isAccentThemeKey(key: string): key is AccentThemeKey {
	if (!(key in themes)) {
		return false;
	}
	return themes[key as ThemeKey].group !== "accessibility";
}

export function listThemeEntries(options?: { accentOnly?: boolean }) {
	const entries = Object.entries(themes) as Array<[ThemeKey, ThemeDefinition]>;
	if (options?.accentOnly) {
		return entries.filter(([key]) => isAccentThemeKey(key));
	}
	return entries;
}

export function listThemesGrouped(options?: { accentOnly?: boolean }) {
	const grouped: Record<ThemeGroup, Array<[ThemeKey, ThemeDefinition]>> = {
		standard: [],
		accessibility: [],
		custom: [],
	};

	for (const entry of listThemeEntries(options)) {
		grouped[entry[1].group].push(entry);
	}

	return grouped;
}

export const CUSTOM_ACCENT_SWATCHES: string[] = [
	"#7C3AED",
	"#2563EB",
	"#10B981",
	"#F59E0B",
	"#E11D48",
	"#2DD4BF",
	"#F472B6",
	"#84CC16",
	"#C47A2C",
	"#94A3B8",
];
