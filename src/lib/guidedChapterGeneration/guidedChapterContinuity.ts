import type { StoryMessage } from "../../types/models";
import { sortByTimestampAsc } from "../dates";

const DOCKING_BAY_RE = /\bdocking\s+bay\s+([A-Za-z0-9]+)/gi;
const SHUTTLE_NAME_RE = /\bshuttle\s+([A-Z][A-Za-z0-9]*)/g;
const LOCATION_ASSIGNMENT_RE =
	/\b(?:meet(?:ing)?|waiting|head(?:ing)?|go(?:ing)?|walk(?:ing)?|sent|dispatch(?:ed)?)\s+(?:to|at|down to|toward|for)\s+(?:the\s+)?([^.,;!"']{3,60})/gi;

const NUMBER_WORDS: Record<string, string> = {
	one: "1",
	two: "2",
	three: "3",
	four: "4",
	five: "5",
	six: "6",
	seven: "7",
	eight: "8",
	nine: "9",
	ten: "10",
};

function normalizeBayToken(token: string): string {
	const trimmed = token.trim();
	const mapped = NUMBER_WORDS[trimmed.toLowerCase()];
	return mapped ?? trimmed;
}

function normalizeWhitespace(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function isAssistantProse(message: StoryMessage): boolean {
	return message.role === "assistant" && Boolean(message.content.trim());
}

export function sliceMessagesSinceChapterStart(
	messages: StoryMessage[],
	chapterStartMessageId: string,
): StoryMessage[] {
	const sorted = sortByTimestampAsc(messages);
	const startIndex = sorted.findIndex((message) => message.id === chapterStartMessageId);
	if (startIndex === -1) {
		return sorted;
	}
	return sorted.slice(startIndex);
}

const SENIOR_OFFICER_RE = /\b(?:captain|commander|mercer|grayson)\b/i;
const SPEAKER_LINE_RE = /^([^:\n]{2,40}):/;

function extractSpeakerFromAssistantContent(content: string): string | undefined {
	const firstLine = content.split("\n").find((line) => line.trim())?.trim() ?? "";
	const match = firstLine.match(SPEAKER_LINE_RE);
	return match?.[1]?.trim();
}

function resolveAuthoritativeDockingBay(
	messages: StoryMessage[],
): { label: string; conflict: boolean } | null {
	const mentions: Array<{ label: string; bayKey: string; speaker?: string }> = [];

	for (const message of messages) {
		if (!isAssistantProse(message)) {
			continue;
		}
		const speaker = extractSpeakerFromAssistantContent(message.content);
		for (const match of message.content.matchAll(DOCKING_BAY_RE)) {
			const rawToken = match[1] ?? "";
			const normalized = normalizeBayToken(rawToken);
			const label = `Docking Bay ${normalized}`;
			mentions.push({
				label,
				bayKey: normalized.toLowerCase(),
				speaker,
			});
		}
	}

	if (!mentions.length) {
		return null;
	}

	const uniqueBayKeys = new Set(mentions.map((mention) => mention.bayKey));
	const seniorMention = mentions.find((mention) => SENIOR_OFFICER_RE.test(mention.speaker ?? ""));
	const authoritative = seniorMention ?? mentions[0];

	return {
		label: authoritative.label,
		conflict: uniqueBayKeys.size > 1,
	};
}

export function buildGuidedChapterContinuityLedger(messages: StoryMessage[]): string[] {
	const proseMessages = messages.filter(isAssistantProse);
	if (!proseMessages.length) {
		return [];
	}

	const dockingBayResolution = resolveAuthoritativeDockingBay(proseMessages);
	const shuttles = new Set<string>();
	const assignments: string[] = [];

	for (const message of proseMessages) {
		const content = message.content;

		for (const match of content.matchAll(SHUTTLE_NAME_RE)) {
			const name = match[1]?.trim();
			if (name) {
				shuttles.add(name);
			}
		}

		for (const match of content.matchAll(LOCATION_ASSIGNMENT_RE)) {
			const phrase = normalizeWhitespace(match[1] ?? "");
			if (!phrase || phrase.length < 4) {
				continue;
			}
			const lowered = phrase.toLowerCase();
			if (
				lowered.includes("minute") ||
				lowered.includes("conversation") ||
				lowered.includes("attitude")
			) {
				continue;
			}
			assignments.push(phrase);
		}
	}

	const ledger: string[] = [];

	if (dockingBayResolution) {
		ledger.push(`Authoritative arrival docking bay: ${dockingBayResolution.label}`);
		if (dockingBayResolution.conflict) {
			ledger.push(
				`Earlier beats mentioned other bay numbers — keep every officer aligned to ${dockingBayResolution.label} unless a senior officer explicitly corrects it on-screen`,
			);
		}
	}

	if (shuttles.size) {
		ledger.push(`Shuttle(s) named: ${[...shuttles].join(", ")}`);
	}

	const uniqueAssignments = [...new Set(assignments)].slice(0, 6);
	for (const assignment of uniqueAssignments) {
		ledger.push(`Movement / meeting: ${assignment}`);
	}

	return ledger;
}

export function formatGuidedChapterContinuityNotes(messages: StoryMessage[]): string | undefined {
	const ledger = buildGuidedChapterContinuityLedger(messages);
	if (!ledger.length) {
		return undefined;
	}

	return [
		"Established facts this chapter (do not contradict):",
		...ledger.map((entry) => `- ${entry}`),
		"- Reuse exact location names, bay numbers, shuttle names, and assignments already stated.",
		"- Do not assign a different docking bay for the same shuttle arrival unless a senior officer explicitly corrects it on-screen.",
	].join("\n");
}

export async function buildContinuityNotesForChapter(
	listMessages: () => Promise<StoryMessage[]>,
	chapterStartMessageId: string,
	baseContext: {
		overallDirection?: string;
		chapterOverview?: string;
		chapterLabel?: string;
		sceneOverview?: string;
	},
): Promise<{
	overallDirection?: string;
	chapterOverview?: string;
	chapterLabel?: string;
	sceneOverview?: string;
	continuityNotes?: string;
}> {
	const messages = await listMessages();
	const chapterMessages = sliceMessagesSinceChapterStart(messages, chapterStartMessageId);
	const continuityNotes = formatGuidedChapterContinuityNotes(chapterMessages);
	return {
		...baseContext,
		continuityNotes,
	};
}
