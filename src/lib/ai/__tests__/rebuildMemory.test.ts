import { describe, expect, it, vi } from "vitest";
import type { StoryEngineRepository } from "../../repository";
import type { PlayerCharacter, Story, StoryMessage, StoryState } from "../../../types/models";
import type { AIProvider, GenerateResponseRequest } from "../types";
import { AIError } from "../errors";
import { rebuildStoryMemoryAndIndexes } from "../rebuildMemory";
import { safeParseStoryStateData } from "../../storyStateV2";
import {
	isDeterministicIndexingNoop,
	isPureChapterMarkerMessage,
} from "../indexingMessageClassification";

const story = {
	id: "story-1",
	title: "Test Story",
	universeId: "universe-1",
	playerCharacterId: "player-1",
	currentSummary: "",
	createdAt: "2026-08-25T00:00:00.000Z",
	updatedAt: "2026-08-25T00:00:00.000Z",
} as Story;

const player = {
	id: "player-1",
	universeId: "universe-1",
	name: "Rebecca",
	aliases: ["Becca"],
	age: "35",
	gender: "woman",
	species: "human",
	pronouns: "she/her",
	appearance: "",
	personality: "",
	background: "PRIVATE SHEET BACKGROUND",
	goals: "",
	notes: "",
	createdAt: "2026-08-25T00:00:00.000Z",
} as PlayerCharacter;

function message(number: number, content: string, role: StoryMessage["role"] = "assistant"): StoryMessage {
	return {
		id: `message-${number}`,
		storyId: story.id,
		role,
		content,
		timestamp: `2026-08-25T00:00:${String(number).padStart(2, "0")}.000Z`,
	};
}

function validExtraction(currentSituation: string) {
	return JSON.stringify({
		updatedAt: "2026-08-25T00:01:00.000Z",
		characters: {},
		worldFacts: [],
		unresolvedThreads: [],
		summaries: { currentSituation },
		indexes: { messageCount: 3, messageNumberingVersion: "1.0" },
	});
}

function createRepository(messages: StoryMessage[], initialState?: StoryState) {
	let storedState = initialState ?? null;
	const saves: StoryState[] = [];
	const repository = {
		getStory: vi.fn(async () => story),
		getStoryState: vi.fn(async () => storedState),
		listStoryMessages: vi.fn(async () => messages),
		getPlayerCharacter: vi.fn(async (id: string) => id === player.id ? player : null),
		saveStoryState: vi.fn(async (record: StoryState) => {
			storedState = record;
			saves.push(record);
			return record;
		}),
	} as unknown as StoryEngineRepository;
	return { repository, saves, getStoredState: () => storedState };
}

function createProvider(generateResponse: (request: GenerateResponseRequest) => Promise<{ content: string }>) {
	return {
		validateConnection: vi.fn(async () => {}),
		generateSummary: vi.fn(async () => ""),
		generateResponse: vi.fn(generateResponse),
	} as AIProvider;
}

describe("indexing message classification", () => {
	it("bypasses Continue-only and pure chapter marker messages, but not chapter prose", () => {
		expect(isDeterministicIndexingNoop(message(1, "Continue", "user"))).toBe(true);
		expect(isPureChapterMarkerMessage(message(2, "*End of Chapter I.*"))).toBe(true);
		expect(isPureChapterMarkerMessage(message(3, "## Chapter II: Homecoming"))).toBe(true);
		expect(isPureChapterMarkerMessage(message(4, "Chapter II\nRebecca opened the door."))).toBe(false);
	});
});

describe("rebuildStoryMemoryAndIndexes refusal recovery", () => {
	it.each([
		["Continue", "user" as const],
		["## Chapter II: Homecoming", "assistant" as const],
	])("persists a valid first checkpoint for a structural message: %s", async (content, role) => {
		const messages = [message(1, content, role)];
		const { repository, saves } = createRepository(messages);
		const provider = createProvider(async () => {
			throw new Error("Structural messages must not call the provider.");
		});

		await rebuildStoryMemoryAndIndexes({
			storyId: story.id,
			repository,
			provider,
			apiKey: "test-key",
			model: "gemini-test",
		});

		expect(provider.generateResponse).not.toHaveBeenCalled();
		expect(saves).toHaveLength(1);
		expect(safeParseStoryStateData(saves[0]!.stateJson)).toMatchObject({
			characters: {},
			worldFacts: [],
			unresolvedThreads: [],
			lastDeepIndexAttemptedMessageCount: 1,
		});
	});

	it("preserves existing fields in structural-message checkpoints", async () => {
		const initialState: StoryState = {
			id: `story-state:${story.id}`,
			storyId: story.id,
			updatedAt: "2026-08-25T00:01:00.000Z",
			stateJson: JSON.stringify({
				updatedAt: "2026-08-25T00:01:00.000Z",
				characters: { Rosa: { status: "Waiting at home" } },
				worldFacts: ["The family lives in the suburbs."],
				unresolvedThreads: ["Return home safely."],
				summaries: { currentSituation: "The family is searching." },
			}),
		};
		const { repository, saves } = createRepository(
			[message(1, "Continue", "user")],
			initialState,
		);
		const provider = createProvider(async () => {
			throw new Error("Structural messages must not call the provider.");
		});

		await rebuildStoryMemoryAndIndexes({
			storyId: story.id,
			repository,
			provider,
			apiKey: "test-key",
			model: "gemini-test",
		});

		const checkpoint = safeParseStoryStateData(saves[0]!.stateJson);
		expect(checkpoint).toMatchObject({
			characters: { Rosa: { status: "Waiting at home" } },
			worldFacts: ["The family lives in the suburbs."],
			unresolvedThreads: ["Return home safely."],
			summaries: { currentSituation: "The family is searching." },
		});
	});

	it("uses one minimum-context retry, records a gap, and continues with a contiguous cursor", async () => {
		const messages = [
			message(1, "Continue", "user"),
			message(2, "Ellie was found safe beside the pond."),
			message(3, "The family returned home together."),
		];
		const { repository, saves } = createRepository(messages);
		let calls = 0;
		const provider = createProvider(async () => {
			calls += 1;
			if (calls <= 2) {
				throw new AIError("safety_refusal", "Gemini blocked the prompt.", 400, {
					diagnostic: "provider=Gemini; stage=prompt; blockReason=PROHIBITED_CONTENT; echoed transcript",
				});
			}
			return { content: validExtraction("The family is home.") };
		});

		const result = await rebuildStoryMemoryAndIndexes({
			storyId: story.id,
			repository,
			provider,
			apiKey: "test-key",
			model: "gemini-test",
		});

		expect(provider.generateResponse).toHaveBeenCalledTimes(3);
		const prompts = vi.mocked(provider.generateResponse).mock.calls.map(([request]) => request.messages);
		expect(prompts[0]?.map((entry) => entry.content).join("\n")).toContain("PRIVATE SHEET BACKGROUND");
		const minimumPrompt = prompts[1]?.map((entry) => entry.content).join("\n") ?? "";
		expect(minimumPrompt).toContain("Ellie was found safe beside the pond.");
		expect(minimumPrompt).not.toContain("PRIVATE SHEET BACKGROUND");
		expect(minimumPrompt).not.toContain("Continuity Snapshot JSON");
		expect(minimumPrompt).not.toContain("The family returned home together.");
		expect(saves).toHaveLength(3);
		expect(saves.every((save) => safeParseStoryStateData(save.stateJson) !== null)).toBe(true);

		const parsed = JSON.parse(result.stateJson);
		expect(parsed.lastDeepIndexAttemptedMessageCount).toBe(3);
		expect(parsed.lastDeepIndexedMessageCount).toBe(1);
		expect(parsed.indexingGaps).toMatchObject([
			{
				messageNumber: 2,
				code: "provider_refusal",
				model: "gemini-test",
				stage: "prompt",
			},
		]);
		expect(JSON.stringify(parsed.indexingGaps)).not.toContain("echoed transcript");
	});

	it("persists and resumes from a valid first-message refusal checkpoint", async () => {
		const messages = [message(1, "Blocked opening scene.")];
		const { repository, saves } = createRepository(messages);
		const refusingProvider = createProvider(async () => {
			throw new AIError("safety_refusal", "Gemini blocked the prompt.", 400, {
				diagnostic: "provider=Gemini; stage=prompt; blockReason=PROHIBITED_CONTENT",
			});
		});

		await rebuildStoryMemoryAndIndexes({
			storyId: story.id,
			repository,
			provider: refusingProvider,
			apiKey: "test-key",
			model: "gemini-test",
		});

		expect(refusingProvider.generateResponse).toHaveBeenCalledTimes(2);
		const refusalCheckpoint = safeParseStoryStateData(saves.at(-1)!.stateJson);
		expect(refusalCheckpoint).toMatchObject({
			characters: {},
			worldFacts: [],
			unresolvedThreads: [],
			lastDeepIndexedMessageCount: 0,
			lastDeepIndexAttemptedMessageCount: 1,
			indexingGaps: [{ messageNumber: 1, code: "provider_refusal" }],
		});

		messages.push(message(2, "The next scene continues safely."));
		const resumingProvider = createProvider(async (request) => {
			const prompt = request.messages.map((entry) => entry.content).join("\n");
			expect(prompt).toContain("The next scene continues safely.");
			expect(prompt).not.toContain("Blocked opening scene.");
			return { content: validExtraction("The story continued.") };
		});

		const resumed = await rebuildStoryMemoryAndIndexes({
			storyId: story.id,
			repository,
			provider: resumingProvider,
			apiKey: "test-key",
			model: "gemini-test",
			incremental: true,
		});

		expect(resumingProvider.generateResponse).toHaveBeenCalledTimes(1);
		expect(safeParseStoryStateData(resumed.stateJson)).toMatchObject({
			lastDeepIndexedMessageCount: 0,
			lastDeepIndexAttemptedMessageCount: 2,
			indexingGaps: [{ messageNumber: 1, code: "provider_refusal" }],
		});
	});

	it("resumes after the attempted cursor without automatically resending a known gap", async () => {
		const messages = [message(1, "Opening scene."), message(2, "Blocked scene."), message(3, "Aftermath scene.")];
		const initialState: StoryState = {
			id: `story-state:${story.id}`,
			storyId: story.id,
			updatedAt: "2026-08-25T00:01:00.000Z",
			stateJson: JSON.stringify({
				updatedAt: "2026-08-25T00:01:00.000Z",
				characters: {},
				worldFacts: [],
				unresolvedThreads: [],
				lastDeepIndexedMessageCount: 1,
				lastDeepIndexAttemptedMessageCount: 2,
				indexingGaps: [{
					messageNumber: 2,
					code: "provider_refusal",
					occurredAt: "2026-08-25T00:00:30.000Z",
				}],
			}),
		};
		const { repository } = createRepository(messages, initialState);
		const provider = createProvider(async (request) => {
			const prompt = request.messages.map((entry) => entry.content).join("\n");
			expect(prompt).toContain("Aftermath scene.");
			expect(prompt).not.toContain("Blocked scene.");
			return { content: validExtraction("Aftermath") };
		});

		const result = await rebuildStoryMemoryAndIndexes({
			storyId: story.id,
			repository,
			provider,
			apiKey: "test-key",
			model: "gemini-test",
			incremental: true,
		});

		expect(provider.generateResponse).toHaveBeenCalledTimes(1);
		const parsed = JSON.parse(result.stateJson);
		expect(parsed.lastDeepIndexAttemptedMessageCount).toBe(3);
		expect(parsed.lastDeepIndexedMessageCount).toBe(1);
		expect(parsed.indexingGaps).toHaveLength(1);
	});

	it("keeps the previous message checkpoint when a later non-safety failure aborts", async () => {
		const messages = [message(1, "Opening scene."), message(2, "Next scene.")];
		const { repository, getStoredState, saves } = createRepository(messages);
		let calls = 0;
		const provider = createProvider(async () => {
			calls += 1;
			if (calls === 1) return { content: validExtraction("Opening") };
			throw new AIError("invalid_api_key", "Invalid API key.", 401);
		});

		await expect(rebuildStoryMemoryAndIndexes({
			storyId: story.id,
			repository,
			provider,
			apiKey: "test-key",
			model: "gemini-test",
		})).rejects.toThrow("Invalid API key");

		expect(saves).toHaveLength(1);
		const checkpoint = JSON.parse(getStoredState()!.stateJson);
		expect(checkpoint.lastDeepIndexedMessageCount).toBe(1);
		expect(checkpoint.lastDeepIndexAttemptedMessageCount).toBe(1);
	});

	it("cannot create capability overrides from extracted memory and preserves existing ones", async () => {
		const existingOverride = {
			participantKey: "Rosa",
			capabilities: { canSpeak: true, canPerformPhysicalActions: false },
			source: "director_instruction",
		};
		const initialState: StoryState = {
			id: `story-state:${story.id}`,
			storyId: story.id,
			updatedAt: "2026-08-25T00:01:00.000Z",
			stateJson: JSON.stringify({
				updatedAt: "2026-08-25T00:01:00.000Z",
				characters: {},
				worldFacts: [],
				unresolvedThreads: [],
				scene: {
					currentLocation: "Apartment",
					participantCapabilityOverrides: [existingOverride],
				},
			}),
		};
		const messages = [message(1, 'Rosa: "Stay on the line."')];
		const { repository } = createRepository(messages, initialState);
		const provider = createProvider(async () => ({
			content: JSON.stringify({
				updatedAt: "2026-08-25T00:02:00.000Z",
				characters: {},
				worldFacts: [],
				unresolvedThreads: [],
				scene: {
					currentLocation: "Apartment",
					participantCapabilityOverrides: [
						{
							participantKey: "Amy",
							capabilities: { canSpeak: false },
							source: "live_scene_state",
						},
					],
				},
				summaries: { currentSituation: "Rosa is speaking from another room." },
			}),
		}));

		const result = await rebuildStoryMemoryAndIndexes({
			storyId: story.id,
			repository,
			provider,
			apiKey: "test-key",
			model: "gemini-test",
		});

		const parsed = safeParseStoryStateData(result.stateJson);
		expect(parsed?.scene?.participantCapabilityOverrides).toEqual([existingOverride]);
	});
});
