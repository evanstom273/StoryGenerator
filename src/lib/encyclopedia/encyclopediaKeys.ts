import type { EncyclopediaCategory } from "../../types/models";

export function normalizeEncyclopediaKey(value: string): string {
	return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function makeEncyclopediaId(name: string, prefix?: string): string {
	const slug = name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	const base = slug || "entry";
	return prefix ? `${prefix}-${base}` : base;
}

export function encyclopediaCategoryLabel(category: EncyclopediaCategory): string {
	switch (category) {
		case "characters":
			return "Characters";
		case "locations":
			return "Locations";
		case "events":
			return "Events";
		case "objects":
			return "Objects";
		case "organizations":
			return "Organizations";
		case "rules":
			return "Rules";
		case "technology":
			return "Technology";
	}
}
