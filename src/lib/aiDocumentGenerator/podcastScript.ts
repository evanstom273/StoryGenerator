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

export function extractPodcastDialogueFromMarkdown(markdown: string) {
	const lines = markdown.split("\n");
	const dialogueLines: string[] = [];
	let hostOne = "Host A";
	let hostTwo = "Host B";

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
		} else if (dialogueLines.length === 1 && speaker !== hostOne) {
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
