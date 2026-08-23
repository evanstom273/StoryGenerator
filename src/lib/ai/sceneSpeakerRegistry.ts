import type {
	PlayerCharacter,
	StoryMessage,
	StoryStateData,
	StoryStateDataV2,
} from "../../types/models";
import { parseSceneBlocks } from "../storyText/parseSceneBlocks";
import { normalizeSceneSpeakerLabel } from "../storyText/speakerLabels";
import type { AIChatMessage } from "./types";

export interface SceneSpeakerIdentity {
	canonicalName: string;
	aliases: string[];
}

export interface ActiveSceneSpeakerIdentity extends SceneSpeakerIdentity {
	evidence: string[];
}

export interface ActiveSceneSpeakerRegistry {
	player: SceneSpeakerIdentity;
	eligibleNonPlayerSpeakers: ActiveSceneSpeakerIdentity[];
}

type RegistryMessage = Pick<StoryMessage, "role" | "content">;

function normalizeIdentityKey(value: string | null | undefined): string {
	return (value ?? "")
		.normalize("NFKC")
		.trim()
		.toLocaleLowerCase()
		.replace(/[’‘]/g, "'")
		.replace(/\s+/g, " ");
}

function uniqueNames(values: Array<string | null | undefined>): string[] {
	const names: string[] = [];
	const seen = new Set<string>();

	for (const value of values) {
		const trimmed = value?.trim();
		const key = normalizeIdentityKey(trimmed);
		if (!trimmed || !key || seen.has(key)) {
			continue;
		}
		seen.add(key);
		names.push(trimmed);
	}

	return names;
}

function containsIdentity(text: string, names: string[]): boolean {
	const normalizedText = normalizeIdentityKey(text);
	return names.some((name) => {
		const key = normalizeIdentityKey(name);
		if (!key) return false;
		const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "iu").test(
			normalizedText,
		);
	});
}

function isReservedSpeaker(value: string): boolean {
	return /^(?:narrator|director|author|system|continue|player)$/i.test(value.trim());
}

/**
 * Build the small, evidence-backed cast that is eligible to own generated blocks in
 * the current scene. This is intentionally not a story-wide character allow-list:
 * a local repair must never pick an absent character merely because they exist.
 */
export function buildActiveSceneSpeakerRegistry(params: {
	player: SceneSpeakerIdentity;
	storyState?: StoryStateData | StoryStateDataV2 | null;
	importedCharacters?: Array<Pick<PlayerCharacter, "name" | "aliases">>;
	recentMessages?: RegistryMessage[];
	latestUserMessage?: string;
}): ActiveSceneSpeakerRegistry {
	const rawPlayerNames = uniqueNames([params.player.canonicalName, ...params.player.aliases]);
	const player: SceneSpeakerIdentity = {
		canonicalName: params.player.canonicalName.trim(),
		aliases: uniqueNames([
			...rawPlayerNames,
			...rawPlayerNames.map((name) => normalizeSceneSpeakerLabel(name)),
		]),
	};
	const playerKeys = new Set(player.aliases.map(normalizeIdentityKey));

	type MutableIdentity = {
		canonicalName: string;
		aliases: Set<string>;
		evidence: Set<string>;
	};
	const identities: MutableIdentity[] = [];

	const findIdentity = (names: string[]) => {
		const keys = new Set(names.map(normalizeIdentityKey).filter(Boolean));
		return identities.find((identity) =>
			Array.from(identity.aliases).some((alias) => keys.has(normalizeIdentityKey(alias))),
		);
	};

	const addIdentity = (
		canonicalName: string | null | undefined,
		aliases: Array<string | null | undefined> = [],
	) => {
		const rawNames = uniqueNames([canonicalName, ...aliases]);
		const names = uniqueNames([
			...rawNames,
			...rawNames.map((name) => normalizeSceneSpeakerLabel(name)),
		]);
		if (!names.length || names.some((name) => playerKeys.has(normalizeIdentityKey(name)))) {
			return null;
		}

		const existing = findIdentity(names);
		if (existing) {
			for (const name of names) existing.aliases.add(name);
			return existing;
		}

		const identity: MutableIdentity = {
			canonicalName: names[0]!,
			aliases: new Set(names),
			evidence: new Set(),
		};
		identities.push(identity);
		return identity;
	};

	for (const character of params.importedCharacters ?? []) {
		addIdentity(normalizeSceneSpeakerLabel(character.name), [
			character.name,
			...(character.aliases ?? []),
		]);
	}

	for (const [key, character] of Object.entries(params.storyState?.characters ?? {})) {
		addIdentity(
			character.narrativeName || character.displayName || character.canonicalName || key,
			[
				key,
				character.canonicalName,
				character.displayName,
				character.narrativeName,
				...(character.aliases ?? []),
			],
		);
	}

	for (const [key, character] of Object.entries(params.storyState?.indexes?.characters ?? {})) {
		addIdentity(character.narrativeName || character.name || key, [
			key,
			character.name,
			character.narrativeName,
			...(character.aliases ?? []),
		]);
	}

	for (const key of Object.keys(params.storyState?.npcs ?? {})) {
		addIdentity(key);
	}

	const markByName = (rawName: string, evidence: string) => {
		if (!rawName.trim() || isReservedSpeaker(rawName)) return false;
		const identity = addIdentity(rawName);
		if (identity) {
			identity.canonicalName = rawName.trim();
			identity.evidence.add(evidence);
			return true;
		}
		return false;
	};

	for (const participant of params.storyState?.scene?.activeParticipants ?? []) {
		markByName(participant, "story_state_active_participant");
	}

	const assistantMessages = (params.recentMessages ?? [])
		.filter((message) => message.role === "assistant")
		.slice(-3)
		.reverse();
	for (const message of assistantMessages) {
		let foundNonPlayerSpeaker = false;
		for (const block of parseSceneBlocks(message.content)) {
			if (block.speakerLabel) {
				foundNonPlayerSpeaker =
					markByName(block.speakerLabel, "latest_relevant_assistant_speaker") ||
					foundNonPlayerSpeaker;
			}
		}
		if (foundNonPlayerSpeaker) break;
	}

	const latestUserMessage = params.latestUserMessage?.trim() ?? "";
	const currentSceneText = [
		...(params.storyState?.sceneState ?? []),
		params.storyState?.scene?.sceneSummary ?? "",
		params.storyState?.scene?.currentObjective ?? "",
	].join("\n");

	for (const identity of identities) {
		const names = Array.from(identity.aliases);
		if (latestUserMessage && containsIdentity(latestUserMessage, names)) {
			identity.evidence.add("latest_user_message");
		}
		if (currentSceneText && containsIdentity(currentSceneText, names)) {
			identity.evidence.add("current_scene_state");
		}
	}

	let active = identities.filter((identity) => identity.evidence.size > 0);
	if (!active.length && identities.length === 1) {
		identities[0]!.evidence.add("sole_known_non_player");
		active = identities;
	}

	return {
		player,
		eligibleNonPlayerSpeakers: active
			.map((identity) => ({
				canonicalName: identity.canonicalName,
				aliases: uniqueNames(Array.from(identity.aliases)),
				evidence: Array.from(identity.evidence),
			}))
			.sort((left, right) => left.canonicalName.localeCompare(right.canonicalName)),
	};
}

export function formatSceneSpeakerRegistryPrompt(
	registry: ActiveSceneSpeakerRegistry,
	allowDirectedPlayerControl: boolean,
): string {
	const formatIdentity = (identity: SceneSpeakerIdentity) => {
		const aliases = identity.aliases.filter(
			(alias) => normalizeIdentityKey(alias) !== normalizeIdentityKey(identity.canonicalName),
		);
		return aliases.length
			? `${identity.canonicalName} (aliases: ${aliases.join(", ")})`
			: identity.canonicalName;
	};

	const eligible = registry.eligibleNonPlayerSpeakers.length
		? registry.eligibleNonPlayerSpeakers.map(formatIdentity).join(", ")
		: "none established with enough current-scene evidence";

	return [
		"Active speaker ownership registry (apply this semantically, not just syntactically):",
		`- Player character: ${formatIdentity(registry.player)}.`,
		allowDirectedPlayerControl
			? "- This directed turn may control the player character, but every Name: block must still belong to the person acting and speaking in it."
			: "- Never emit a player-character Name: block on this turn; other characters may address or physically interact with the player.",
		`- Non-player speakers established in the current scene: ${eligible}.`,
		"- A Name: header owns both the action beat and quoted dialogue in that block.",
		`- A block that looks at, touches, names, or addresses ${registry.player.canonicalName} as another person cannot also be owned by ${registry.player.canonicalName}. Label it with the actual established actor/speaker.`,
		"- Never invent a speaker from pronouns alone. If ownership is unclear, use Narrator: for neutral prose or omit the uncertain beat.",
	].join("\n");
}

/** Insert the registry immediately before the live user turn so it cannot be buried in history. */
export function injectSceneSpeakerRegistry(
	messages: AIChatMessage[],
	registry: ActiveSceneSpeakerRegistry,
	allowDirectedPlayerControl: boolean,
): AIChatMessage[] {
	const note: AIChatMessage = {
		role: "system",
		content: formatSceneSpeakerRegistryPrompt(registry, allowDirectedPlayerControl),
	};
	let lastUserIndex = -1;
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		if (messages[index]?.role === "user") {
			lastUserIndex = index;
			break;
		}
	}
	if (lastUserIndex < 0) return [...messages, note];
	return [...messages.slice(0, lastUserIndex), note, ...messages.slice(lastUserIndex)];
}
