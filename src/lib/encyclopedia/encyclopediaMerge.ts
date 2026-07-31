import type {
	EncyclopediaCharacterPage,
	EncyclopediaEventPage,
	EncyclopediaLinkRef,
	EncyclopediaLocationPage,
	EncyclopediaObjectPage,
	EncyclopediaOrganizationPage,
	EncyclopediaRulePage,
	EncyclopediaTechnologyPage,
	StoryEncyclopedia,
} from "../../types/models";
import { makeEncyclopediaId, normalizeEncyclopediaKey } from "./encyclopediaKeys";

function trimStrings(values: string[] | undefined, max = 20): string[] | undefined {
	if (!values?.length) return undefined;
	const seen = new Set<string>();
	const out: string[] = [];
	for (const value of values) {
		const trimmed = value.trim();
		if (!trimmed) continue;
		const key = trimmed.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(trimmed);
		if (out.length >= max) break;
	}
	return out.length ? out : undefined;
}

function mergeLinks(left?: EncyclopediaLinkRef[], right?: EncyclopediaLinkRef[]): EncyclopediaLinkRef[] | undefined {
	const combined = [...(left ?? []), ...(right ?? [])];
	if (!combined.length) return undefined;
	const seen = new Set<string>();
	const out: EncyclopediaLinkRef[] = [];
	for (const link of combined) {
		if (!link?.id || !link.type) continue;
		const key = `${link.type}::${link.id}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(link);
	}
	return out.length ? out.slice(0, 40) : undefined;
}

function mergeStringField(left?: string, right?: string): string | undefined {
	const a = left?.trim();
	const b = right?.trim();
	if (b && b.length >= (a?.length ?? 0)) return b;
	return a || b || undefined;
}

function mergeRecordPages<T extends { id: string; name: string; related?: EncyclopediaLinkRef[] }>(
	left: Record<string, T> | undefined,
	right: Record<string, T> | undefined,
	mergeEntry: (a: T, b: T) => T,
): Record<string, T> | undefined {
	const out: Record<string, T> = { ...(left ?? {}) };
	for (const [key, entry] of Object.entries(right ?? {})) {
		const normalizedKey = normalizeEncyclopediaKey(entry.name);
		const existingKey =
			Object.keys(out).find((k) => normalizeEncyclopediaKey(out[k]!.name) === normalizedKey) ?? key;
		const existing = out[existingKey];
		out[existingKey] = existing ? mergeEntry(existing, entry) : entry;
	}
	return Object.keys(out).length ? out : undefined;
}

function mergeCharacter(left: EncyclopediaCharacterPage, right: EncyclopediaCharacterPage): EncyclopediaCharacterPage {
	return {
		...left,
		...right,
		name: mergeStringField(left.name, right.name) ?? left.name,
		aliases: trimStrings([...(left.aliases ?? []), ...(right.aliases ?? [])], 12),
		description: mergeStringField(left.description, right.description),
		status: mergeStringField(right.status, left.status),
		relationships: trimStrings([...(left.relationships ?? []), ...(right.relationships ?? [])], 16),
		family: trimStrings([...(left.family ?? []), ...(right.family ?? [])], 12),
		occupation: mergeStringField(right.occupation, left.occupation),
		firstAppearance: left.firstAppearance ?? right.firstAppearance,
		latestAppearance: right.latestAppearance ?? left.latestAppearance,
		history: trimStrings([...(left.history ?? []), ...(right.history ?? [])], 24),
		majorEvents: trimStrings([...(left.majorEvents ?? []), ...(right.majorEvents ?? [])], 16),
		currentLocation: mergeStringField(right.currentLocation, left.currentLocation),
		quotes: trimStrings([...(left.quotes ?? []), ...(right.quotes ?? [])], 8),
		related: mergeLinks(left.related, right.related),
	};
}

function mergeLocation(left: EncyclopediaLocationPage, right: EncyclopediaLocationPage): EncyclopediaLocationPage {
	return {
		...left,
		...right,
		name: mergeStringField(left.name, right.name) ?? left.name,
		description: mergeStringField(left.description, right.description),
		firstAppearance: left.firstAppearance ?? right.firstAppearance,
		currentState: mergeStringField(right.currentState, left.currentState),
		associatedCharacters: trimStrings(
			[...(left.associatedCharacters ?? []), ...(right.associatedCharacters ?? [])],
			24,
		),
		events: trimStrings([...(left.events ?? []), ...(right.events ?? [])], 20),
		chapterLabels: trimStrings([...(left.chapterLabels ?? []), ...(right.chapterLabels ?? [])], 30),
		related: mergeLinks(left.related, right.related),
	};
}

function mergeObject(left: EncyclopediaObjectPage, right: EncyclopediaObjectPage): EncyclopediaObjectPage {
	return {
		...left,
		...right,
		name: mergeStringField(left.name, right.name) ?? left.name,
		description: mergeStringField(left.description, right.description),
		purpose: mergeStringField(right.purpose, left.purpose),
		currentOwner: mergeStringField(right.currentOwner, left.currentOwner),
		history: trimStrings([...(left.history ?? []), ...(right.history ?? [])], 20),
		relatedEvents: trimStrings([...(left.relatedEvents ?? []), ...(right.relatedEvents ?? [])], 16),
		related: mergeLinks(left.related, right.related),
	};
}

function mergeOrganization(
	left: EncyclopediaOrganizationPage,
	right: EncyclopediaOrganizationPage,
): EncyclopediaOrganizationPage {
	return {
		...left,
		...right,
		name: mergeStringField(left.name, right.name) ?? left.name,
		description: mergeStringField(left.description, right.description),
		type: mergeStringField(right.type, left.type),
		members: trimStrings([...(left.members ?? []), ...(right.members ?? [])], 24),
		roleInStory: mergeStringField(right.roleInStory, left.roleInStory),
		related: mergeLinks(left.related, right.related),
	};
}

function mergeTechnology(left: EncyclopediaTechnologyPage, right: EncyclopediaTechnologyPage): EncyclopediaTechnologyPage {
	return {
		...left,
		...right,
		name: mergeStringField(left.name, right.name) ?? left.name,
		description: mergeStringField(left.description, right.description),
		capabilities: trimStrings([...(left.capabilities ?? []), ...(right.capabilities ?? [])], 16),
		upgrades: trimStrings([...(left.upgrades ?? []), ...(right.upgrades ?? [])], 12),
		currentState: mergeStringField(right.currentState, left.currentState),
		related: mergeLinks(left.related, right.related),
	};
}

function mergeRule(left: EncyclopediaRulePage, right: EncyclopediaRulePage): EncyclopediaRulePage {
	return {
		...left,
		...right,
		title: mergeStringField(left.title, right.title) ?? left.title,
		description: mergeStringField(left.description, right.description),
		scope: mergeStringField(right.scope, left.scope),
		currentState: mergeStringField(right.currentState, left.currentState),
		history: trimStrings([...(left.history ?? []), ...(right.history ?? [])], 16),
		related: mergeLinks(left.related, right.related),
	};
}

function mergeEvents(left: EncyclopediaEventPage[] | undefined, right: EncyclopediaEventPage[] | undefined): EncyclopediaEventPage[] | undefined {
	const combined = [...(left ?? []), ...(right ?? [])];
	if (!combined.length) return undefined;
	const byKey = new Map<string, EncyclopediaEventPage>();
	for (const event of combined) {
		const key = normalizeEncyclopediaKey(event.title);
		const existing = byKey.get(key);
		if (!existing) {
			byKey.set(key, event);
			continue;
		}
		byKey.set(key, {
			...existing,
			...event,
			title: mergeStringField(existing.title, event.title) ?? existing.title,
			description: mergeStringField(event.description, existing.description),
			chapterLabel: event.chapterLabel ?? existing.chapterLabel,
			messageNumber: event.messageNumber ?? existing.messageNumber,
			participants: trimStrings([...(existing.participants ?? []), ...(event.participants ?? [])], 16),
			location: mergeStringField(event.location, existing.location),
			related: mergeLinks(existing.related, event.related),
		});
	}
	return Array.from(byKey.values()).slice(0, 80);
}

export function mergeEncyclopediaEntries(left: StoryEncyclopedia | undefined, right: StoryEncyclopedia): StoryEncyclopedia {
	const merged: StoryEncyclopedia = {
		...left,
		...right,
		version: "1.0",
		characters: mergeRecordPages(left?.characters, right.characters, mergeCharacter),
		locations: mergeRecordPages(left?.locations, right.locations, mergeLocation),
		objects: mergeRecordPages(left?.objects, right.objects, mergeObject),
		organizations: mergeRecordPages(left?.organizations, right.organizations, mergeOrganization),
		technology: mergeRecordPages(left?.technology, right.technology, mergeTechnology),
		events: mergeEvents(left?.events, right.events),
		rules: (() => {
			const combined = [...(left?.rules ?? []), ...(right.rules ?? [])];
			if (!combined.length) return undefined;
			const byKey = new Map<string, EncyclopediaRulePage>();
			for (const rule of combined) {
				const key = normalizeEncyclopediaKey(rule.title);
				const existing = byKey.get(key);
				byKey.set(key, existing ? mergeRule(existing, rule) : rule);
			}
			return Array.from(byKey.values()).slice(0, 60);
		})(),
	};
	return merged;
}

export function normalizeEncyclopediaDelta(delta: Partial<StoryEncyclopedia>): StoryEncyclopedia {
	const normalizeRecord = <T extends { id: string; name: string }>(
		entries: Record<string, T> | undefined,
	): Record<string, T> | undefined => {
		if (!entries) return undefined;
		const out: Record<string, T> = {};
		for (const entry of Object.values(entries)) {
			if (!entry?.name?.trim()) continue;
			const id = entry.id?.trim() || makeEncyclopediaId(entry.name);
			out[id] = { ...entry, id, name: entry.name.trim() };
		}
		return Object.keys(out).length ? out : undefined;
	};

	const events = delta.events
		?.filter((e) => e?.title?.trim())
		.map((e) => ({
			...e,
			id: e.id?.trim() || makeEncyclopediaId(e.title, "event"),
			title: e.title.trim(),
		}));

	const rules = delta.rules
		?.filter((r) => r?.title?.trim())
		.map((r) => ({
			...r,
			id: r.id?.trim() || makeEncyclopediaId(r.title, "rule"),
			title: r.title.trim(),
		}));

	return {
		version: "1.0",
		characters: normalizeRecord(delta.characters),
		locations: normalizeRecord(delta.locations),
		objects: normalizeRecord(delta.objects),
		organizations: normalizeRecord(delta.organizations),
		technology: normalizeRecord(delta.technology),
		events: events?.length ? events.slice(0, 40) : undefined,
		rules: rules?.length ? rules.slice(0, 30) : undefined,
	};
}

export function isEncyclopediaIndexed(encyclopedia: StoryEncyclopedia | undefined): boolean {
	return Boolean(encyclopedia?.indexedAt && (encyclopedia.indexedMessageCount ?? 0) > 0);
}

export function countEncyclopediaEntries(encyclopedia: StoryEncyclopedia | undefined): number {
	if (!encyclopedia) return 0;
	return (
		Object.keys(encyclopedia.characters ?? {}).length +
		Object.keys(encyclopedia.locations ?? {}).length +
		(encyclopedia.events?.length ?? 0) +
		Object.keys(encyclopedia.objects ?? {}).length +
		Object.keys(encyclopedia.organizations ?? {}).length +
		(encyclopedia.rules?.length ?? 0) +
		Object.keys(encyclopedia.technology ?? {}).length
	);
}
