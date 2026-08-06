import { PODCAST_HOST_ONE, PODCAST_HOST_TWO } from "./podcastPrompt";

function parseSpeakerLine(line: string) {
	const boldMatch = line.match(/^\*\*(.+?):\*\*\s*(.*)$/);
	if (boldMatch) {
		return { speaker: boldMatch[1]!.trim(), text: boldMatch[2]!.trim() };
	}

	const plainMatch = line.match(/^([^:\n]{1,40}):\s*(.+)$/);
	if (plainMatch) {
		return { speaker: plainMatch[1]!.trim(), text: plainMatch[2]!.trim() };
	}

	return null;
}

function equalsIgnoreCase(left: string, right: string) {
	return left.localeCompare(right, undefined, { sensitivity: "accent" }) === 0;
}

function collectSpeakerNames(markdown: string) {
	const names: string[] = [];
	const seen = new Set<string>();

	for (const line of markdown.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("|") || trimmed.startsWith("---")) {
			continue;
		}
		if (trimmed.startsWith("*") && trimmed.endsWith("*") && !trimmed.includes(":")) {
			continue;
		}

		const parsed = parseSpeakerLine(trimmed);
		if (!parsed?.text) {
			continue;
		}

		const key = parsed.speaker.toLowerCase();
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		names.push(parsed.speaker);
	}

	return names;
}

function findSpeakerName(names: string[], target: string) {
	return names.find((name) => equalsIgnoreCase(name, target));
}

export function resolvePodcastHosts(markdown: string) {
	const speakers = collectSpeakerNames(markdown);
	const hostOneMatch = findSpeakerName(speakers, PODCAST_HOST_ONE);
	const hostTwoMatch = findSpeakerName(speakers, PODCAST_HOST_TWO);

	if (hostOneMatch && hostTwoMatch) {
		return { hostOne: hostOneMatch, hostTwo: hostTwoMatch };
	}

	const dialogue = extractPodcastDialogueFromMarkdown(markdown);
	if (dialogue) {
		return { hostOne: dialogue.hostOne, hostTwo: dialogue.hostTwo };
	}

	return { hostOne: PODCAST_HOST_ONE, hostTwo: PODCAST_HOST_TWO };
}

export function normalizePodcastScript(script: string, hostOne: string, hostTwo: string) {
	return script
		.split("\n")
		.map((line) => {
			const parsed = parseSpeakerLine(line);
			if (!parsed) {
				return line;
			}

			let speaker = parsed.speaker;
			if (equalsIgnoreCase(speaker, hostOne) || equalsIgnoreCase(speaker, PODCAST_HOST_ONE)) {
				speaker = hostOne;
			} else if (
				equalsIgnoreCase(speaker, hostTwo) ||
				equalsIgnoreCase(speaker, PODCAST_HOST_TWO)
			) {
				speaker = hostTwo;
			}

			return `${speaker}: ${parsed.text}`;
		})
		.join("\n");
}

export function extractPodcastDialogueFromMarkdown(markdown: string) {
	const lines = markdown.split("\n");
	const dialogueLines: string[] = [];
	let hostOne = PODCAST_HOST_ONE;
	let hostTwo = PODCAST_HOST_TWO;

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}
		if (trimmed.startsWith("#")) {
			continue;
		}
		if (trimmed.startsWith("|")) {
			continue;
		}
		if (trimmed.startsWith("---")) {
			continue;
		}
		if (trimmed.startsWith("*") && trimmed.endsWith("*") && !trimmed.includes(":")) {
			continue;
		}

		const parsed = parseSpeakerLine(trimmed);
		if (!parsed || !parsed.text) {
			continue;
		}

		const speaker = parsed.speaker;
		const text = parsed.text;

		if (dialogueLines.length === 0) {
			hostOne = speaker;
		} else if (dialogueLines.length === 1 && !equalsIgnoreCase(speaker, hostOne)) {
			hostTwo = speaker;
		}

		dialogueLines.push(`${speaker}: ${text}`);
	}

	if (!dialogueLines.length) {
		return null;
	}

	return {
		hostOne,
		hostTwo,
		script: dialogueLines.join("\n"),
	};
}

export function buildGeminiTtsInput(script: string, hostOne: string, hostTwo: string) {
	return `TTS the following podcast conversation between ${hostOne} and ${hostTwo}:\n\n${script}`;
}
