import type { ChapterSourceSegment } from "./types";

export const PODCAST_HOST_SAM = "Sam";
export const PODCAST_HOST_ALEX = "Alex";

export type ChapterDiscussionTier = "brief" | "standard" | "extended" | "deep";

export interface ChapterCoverageGuide {
	tier: ChapterDiscussionTier;
	wordCount: number;
	relativeLength: number;
	dialogueLineCount: number;
	eventHints: number;
	factors: string[];
	targetGuidance: string;
}

const EMOTIONAL_SIGNAL_PATTERN =
	/\b(death|died|kill|murder|love|heartbreak|grief|cry|cried|tragedy|terrified|horror|devastat|betray|funeral|goodbye)\b/gi;
const ACTION_SIGNAL_PATTERN =
	/\b(fight|attack|chase|escape|explod|crash|battle|shot|stab|run|sprint|punch|slam)\b/gi;
const REVEAL_SIGNAL_PATTERN =
	/\b(reveal|secret|truth|discover|realize|twist|shock|surprise|actually|turns out|plot twist)\b/gi;

function countMatches(text: string, pattern: RegExp) {
	return [...text.matchAll(pattern)].length;
}

function countDialogueLines(transcript: string) {
	return transcript.split("\n").filter((line) => /:\s*\S/.test(line)).length;
}

function countEventHints(transcript: string) {
	const timestampLines = transcript.split("\n").filter((line) => /^\[/.test(line.trim())).length;
	const sceneBreaks = countMatches(transcript, /\n\n/g);
	return timestampLines + sceneBreaks;
}

export function estimateChapterDiscussionCoverage(
	segment: ChapterSourceSegment,
	allSegments: ChapterSourceSegment[],
): ChapterCoverageGuide {
	const wordCount = segment.transcript.split(/\s+/).filter(Boolean).length;
	const averageWords =
		allSegments.reduce((sum, entry) => sum + entry.transcript.split(/\s+/).filter(Boolean).length, 0) /
		Math.max(allSegments.length, 1);
	const relativeLength = wordCount / Math.max(averageWords, 1);
	const dialogueLineCount = countDialogueLines(segment.transcript);
	const emotionalHits = countMatches(segment.transcript, EMOTIONAL_SIGNAL_PATTERN);
	const actionHits = countMatches(segment.transcript, ACTION_SIGNAL_PATTERN);
	const revealHits = countMatches(segment.transcript, REVEAL_SIGNAL_PATTERN);
	const eventHints = countEventHints(segment.transcript);

	const factors: string[] = [];
	if (wordCount < averageWords * 0.55) {
		factors.push("short chapter length");
	}
	if (wordCount > averageWords * 1.4) {
		factors.push("long chapter length");
	}
	if (dialogueLineCount > averageWords / 40) {
		factors.push("high dialogue density");
	}
	if (emotionalHits >= 3) {
		factors.push("emotional significance");
	}
	if (actionHits >= 3) {
		factors.push("action density");
	}
	if (revealHits >= 2) {
		factors.push("major reveals or turning points");
	}
	if (eventHints >= 8) {
		factors.push("many distinct events");
	}

	let tier: ChapterDiscussionTier = "standard";
	if (relativeLength < 0.55 && emotionalHits < 2 && actionHits < 2) {
		tier = "brief";
	} else if (relativeLength > 1.75 || emotionalHits >= 5 || revealHits >= 3) {
		tier = "deep";
	} else if (relativeLength > 1.15 || emotionalHits >= 3 || actionHits >= 4) {
		tier = "extended";
	}

	const targetGuidance =
		tier === "brief"
			? "Keep this chapter discussion short — about 1–2 brief exchanges or a single tight paragraph of back-and-forth. Transition chapters do not need equal airtime."
			: tier === "standard"
				? "Give this chapter a natural mid-length discussion — several back-and-forth exchanges covering the key beats without over-explaining."
				: tier === "extended"
					? "This chapter deserves extended coverage — multiple rounds of reaction, analysis, and speculation. Let the conversation breathe."
					: "This is a major chapter — give it deep, long-form discussion. Several pages of dialogue are appropriate if the material supports it.";

	return {
		tier,
		wordCount,
		relativeLength,
		dialogueLineCount,
		eventHints,
		factors,
		targetGuidance,
	};
}

export const PODCAST_HOST_PERSONALITIES = `
## Recurring hosts (always use these names and personalities)

**${PODCAST_HOST_SAM}**
- optimistic, emotional, relationship-focused
- tends to defend characters and notice heartfelt moments
- gets invested in character writing and bonds between people
- warm, reactive, sometimes swept up in the moment

**${PODCAST_HOST_ALEX}**
- analytical, slightly cynical, structure-minded
- loves plotting, foreshadowing, and worldbuilding
- notices mechanics, setups, and whether the story earns its turns
- dry humor, skeptical but fair

They are the same hosts every episode. Their voices must stay consistent.
Always label dialogue as **${PODCAST_HOST_SAM}:** and **${PODCAST_HOST_ALEX}:** on every spoken line.
`;

export const PODCAST_CONVERSATION_CRAFT = `
## Conversation craft (podcast transcript, not summary)

Write a genuine long-form podcast transcript. Two real presenters discussing the story — not two AI summaries agreeing with each other.

- Progress through the story in order. React as if experiencing each chapter when it arrives — not with full hindsight unless you have already discussed later events.
- Vary chapter coverage. Major emotional or plot-heavy chapters get more time. Short transition chapters get a paragraph or two.
- Allow natural disagreement sometimes (not constantly): "I wasn't convinced by that." / "That was my favourite chapter." / "You're giving him too much credit."
- Make predictions as you go: "I thought Liam was going to stick around." / "I assumed she wasn't surviving this." Later, revisit wrong predictions: "I was completely wrong about that."
- Use callbacks and running jokes when they emerge naturally: "This is where the trainers officially died." / "Remember what we said back in Chapter II?"
- Occasionally pause with "Hang on…" / "Did you notice…" / "I missed that the first time."
- Let themes surface during the story — do not hoard all theme talk for the end.
- Allow brief tangents when natural ("This reminds me of…") — do not overdo it.
- Respect emotional pacing: after tragedy, let seriousness breathe before comedy returns.
- Discuss foreshadowing retrospectively once a setup has paid off — do not spoil unrevealed future chapters.
- At the end of a chapter discussion, when it fits naturally, briefly note a favourite moment, quote, joke, or emotional beat — or chapter MVP. Do not force these every time.
- Allow interruptions, excitement, humour, and differing opinions. Avoid repetitive "Yeah, totally" agreement loops.
`;

export function buildPodcastChapterBreakdownSystemPrompt() {
	return [
		"You are generating a companion Markdown podcast transcript ABOUT a Story Engine story.",
		"This is NOT story continuation. Do not write new scenes or add canon.",
		"Base the podcast only on the supplied source material. If information is missing, say so briefly instead of inventing plot.",
		"Output ONLY Markdown. No JSON wrappers, no preamble outside the document.",
		PODCAST_HOST_PERSONALITIES,
		PODCAST_CONVERSATION_CRAFT,
		"",
		"Overall shape:",
		"- Introduction (hosts welcome listeners, set up the story without spoiling ahead)",
		"- One ### section per chapter in source order (hosts discuss each chapter in sequence)",
		"- Final Thoughts (rich closing discussion — not a dry summary table)",
		"",
		"The finished document should read like a transcript someone could feed to TTS and enjoy as a real retrospective podcast.",
	].join("\n");
}

export function buildPodcastIntroductionSectionPrompt() {
	return `
Write ONLY the opening of the podcast episode:
1. A title line (# heading) with an evocative podcast episode title and story name
2. A one-line topic/subtitle under the title
3. ### Introduction — ${PODCAST_HOST_SAM} and ${PODCAST_HOST_ALEX} welcome listeners, introduce themselves briefly as the regular hosts, and set up what story they are covering tonight
4. Tease the journey ahead without spoiling specific later chapters
5. Use labelled dialogue (**${PODCAST_HOST_SAM}:** / **${PODCAST_HOST_ALEX}:**) throughout

Do NOT discuss individual chapters yet. Do NOT write Final Thoughts or any chapter sections.
`;
}

export function buildPodcastChapterSectionPrompt(params: {
	chapterLabel: string;
	chapterIndex: number;
	totalChapters: number;
	coverage: ChapterCoverageGuide;
	priorDiscussions: string;
}) {
	const positionNote =
		params.chapterIndex === 0
			? "This is the first chapter — the hosts are just entering the story."
			: params.chapterIndex === params.totalChapters - 1
				? "This is the final chapter before Final Thoughts — let the ending land emotionally."
				: `Chapter ${params.chapterIndex + 1} of ${params.totalChapters} in the retrospective.`;

	const factorsLine =
		params.coverage.factors.length > 0
			? `Coverage signals: ${params.coverage.factors.join(", ")}.`
			: "Coverage signals: standard chapter weight.";

	const priorBlock = params.priorDiscussions.trim()
		? `
## What the hosts have already discussed (for callbacks and predictions only)
Use this to reference earlier jokes, predictions, and themes. Do NOT repeat these sections verbatim.
${params.priorDiscussions.trim()}
`
		: "";

	return `
Write ONLY the podcast section for **${params.chapterLabel.trim()}**.

Heading format: ### ${params.chapterLabel.trim()}: [short descriptive subtitle]

${positionNote}
${factorsLine}
${params.coverage.targetGuidance}

Rules for this chapter:
- Use ONLY the source material below for what happens in THIS chapter. Do not spoil or discuss events from later chapters.
- React in sequence: speculate about what might happen next based only on what has been covered so far.
- Reference prior host predictions or jokes from the "already discussed" block when natural.
- Match emotional pacing to the chapter — serious after tragedy, lighter when the story allows.
- Label every spoken line as **${PODCAST_HOST_SAM}:** or **${PODCAST_HOST_ALEX}:**.

Do NOT write Introduction, other chapters, or Final Thoughts.
${priorBlock}
`;
}

export function buildPodcastFinalThoughtsSectionPrompt() {
	return `
Write ONLY the closing section: ### Final Thoughts

This must be a rich, conversational wrap-up between ${PODCAST_HOST_SAM} and ${PODCAST_HOST_ALEX} — not a bullet summary.

Cover naturally through dialogue (when the story supports it):
- Favourite chapter and why
- Favourite character
- Biggest surprise
- Funniest moment
- Most emotional moment
- Favourite line or quote
- Favourite running joke or callback
- How themes evolved across the story
- Would they recommend this story to a listener?
- Overall score or rating (out of 10) with brief justification
- Final reflections and sign-off

Revisit predictions that were wrong or right. Allow disagreement on the score or favourites.
Use **${PODCAST_HOST_SAM}:** and **${PODCAST_HOST_ALEX}:** on every spoken line.

Do NOT repeat full chapter-by-chapter recaps. Do NOT write a markdown summary table unless a very brief table helps — dialogue is the priority.
`;
}

export function buildPodcastDiscussionSystemPrompt() {
	return [
		"You are generating a companion Markdown podcast transcript ABOUT a Story Engine story.",
		"This is NOT story continuation. Do not write new scenes or add canon.",
		"Base the podcast only on the supplied source material.",
		"Output ONLY Markdown.",
		PODCAST_HOST_PERSONALITIES,
		PODCAST_CONVERSATION_CRAFT,
		"",
		"Write a single long-form thematic podcast discussion of the full story.",
		"Include Introduction and Final Thoughts. Progress through major beats in order where possible.",
		"Label all dialogue as **Sam:** and **Alex:**.",
	].join("\n");
}

export function truncatePriorDiscussion(text: string, maxChars = 2200) {
	const trimmed = text.trim();
	if (trimmed.length <= maxChars) {
		return trimmed;
	}
	return `${trimmed.slice(0, maxChars).trim()}\n\n[Earlier discussion truncated for context.]`;
}

export function formatPriorDiscussionsForPrompt(
	segments: ChapterSourceSegment[],
	discussions: string[],
	upToIndex: number,
) {
	const blocks: string[] = [];
	for (let index = 0; index < upToIndex; index += 1) {
		const label = segments[index]?.label ?? `Chapter ${index + 1}`;
		const discussion = discussions[index]?.trim();
		if (!discussion) {
			continue;
		}
		blocks.push(`**${label}**\n${truncatePriorDiscussion(discussion)}`);
	}
	return blocks.join("\n\n");
}
