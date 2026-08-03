import { describe, expect, it } from "vitest";
import { planGeminiPodcastTtsChunks } from "../aiDocumentGenerator/geminiAudio";
import {
	normalizePodcastScript,
	resolvePodcastHosts,
} from "../aiDocumentGenerator/podcastScript";

describe("podcastScript host consistency", () => {
	it("resolves Sam and Alex from the full document regardless of section order", () => {
		const markdown = `
**Sam:** Opening from Sam.
**Alex:** Alex replies.

### Chapter 1
**Alex:** Alex opens chapter one.
**Sam:** Sam answers.

### Chapter 2
**Alex:** Alex opens chapter two again.
**Sam:** Sam answers again.
`;

		expect(resolvePodcastHosts(markdown)).toEqual({
			hostOne: "Sam",
			hostTwo: "Alex",
		});
	});

	it("keeps the same host voice mapping for every TTS chunk", () => {
		const markdown = `
**Sam:** Intro line.
**Alex:** Intro reply.

### Chapter 1
**Sam:** Chapter one Sam.
**Alex:** Chapter one Alex.

### Chapter 2
**Alex:** Chapter two starts with Alex.
**Sam:** Then Sam.
`;

		const chunks = planGeminiPodcastTtsChunks(markdown);
		expect(chunks.length).toBeGreaterThan(1);

		for (const chunk of chunks) {
			expect(chunk.hostOne).toBe("Sam");
			expect(chunk.hostTwo).toBe("Alex");
		}

		const chapterTwoChunk = chunks.find((chunk) =>
			chunk.script.includes("Chapter two starts with Alex"),
		);
		expect(chapterTwoChunk?.script).toMatch(/^Alex: Chapter two starts with Alex/);
	});

	it("normalizes case-insensitive speaker labels to canonical host names", () => {
		const script = "SAM: hello\nalex: hi there";
		expect(normalizePodcastScript(script, "Sam", "Alex")).toBe(
			"Sam: hello\nAlex: hi there",
		);
	});
});
