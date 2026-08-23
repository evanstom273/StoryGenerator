import { describe, expect, it } from "vitest";
import { repairAssistantTranscript } from "../transcriptRepairPipeline";
import { buildPlayerTranscriptIdentityFromArgs } from "../playerTranscriptIdentity";
import {
	applyStoryLocalIdentityToAssistantTranscript,
	prevalidateAssistantTranscript,
	sanitizeMessageForDisplay,
} from "../transcriptSanitizer";
import type { StoryMessage } from "../../../types/models";

const BECCA_IDENTITY = buildPlayerTranscriptIdentityFromArgs({
	playerName: "Becca",
	playerSceneName: "Becca",
	playerPronouns: "she/her",
	aliases: ["Rebecca", 'Rebecca "Becca" Alvarez'],
	characterGenders: {
		rebecca: "female",
		becca: "female",
		rosa: "female",
	},
});

const USER_WINE_SCENE = `Rebecca:
Narrator: *They gentlies run a hand down her arm with a light laugh.*
"And how did the scam ring react to that?"

Narrator: *They s The movie plays on, a slow-burn thriller that neither of them is paying particularly close attention to.*

Rebecca:
Narrator: *They smile,s leaning down to press a kiss to her forehead.*
"Mostly. Maya tried to argue that spelling is an arbitrary construct designed to oppress creative freedom, but she still turned in all three pages. I called that a victory."

Rosa:
*She lets out a quiet, tired breath.*
"They looked traumatized."`;

function assistantMessage(content: string): StoryMessage {
	return {
		id: "msg-1",
		storyId: "story-1",
		role: "assistant",
		content,
		createdAt: new Date().toISOString(),
	};
}

describe("transcriptRepairPipeline", () => {
	it("repairs Rebecca speaker label when legal and scene name are both Becca", () => {
		const repaired = repairAssistantTranscript(
			'Rebecca: *They gently runs a hand down her arm.*',
			{ identity: BECCA_IDENTITY },
		);

		expect(repaired).toBe("Becca: *She gently runs a hand down her arm.*");
		expect(repaired).not.toContain("They");
	});

	it("repairs split-line Rebecca narrator corruption", () => {
		const repaired = repairAssistantTranscript(
			`Rebecca:\nNarrator: *They gentlies run a hand down her arm with a light laugh.*`,
			{ identity: BECCA_IDENTITY },
		);

		expect(repaired).toContain("*She gently runs a hand down her arm with a light laugh.*");
		expect(repaired).not.toMatch(/Rebecca:\s*\n\s*Narrator:/i);
	});

	it("repairs the full wine-night scene", () => {
		const repaired = repairAssistantTranscript(USER_WINE_SCENE, {
			identity: BECCA_IDENTITY,
		});

		expect(repaired).toContain("*She gently runs a hand down her arm with a light laugh.*");
		expect(repaired).toContain("*She smiles leaning down to press a kiss to her forehead.*");
		expect(repaired).toContain(
			"Narrator: *The movie plays on, a slow-burn thriller that neither of them is paying particularly close attention to.*",
		);
		expect(repaired).not.toContain("They s ");
		expect(repaired).not.toContain("smile,s");
		expect(repaired).not.toContain("gentlies");
	});

	it("maps denied pseudo-speaker labels like Saturday to the player scene name", () => {
		const repaired = repairAssistantTranscript(
			`Saturday: *They look around the room.*`,
			{ identity: BECCA_IDENTITY },
		);

		expect(repaired).toBe("Becca: *She looks around the room.*");
		expect(repaired).not.toMatch(/^Saturday:/m);
	});

	it("converts They pseudo-speaker action lines to narrator blocks", () => {
		const repaired = repairAssistantTranscript('They: Mac bolts across the room.', {
			identity: BECCA_IDENTITY,
		});

		expect(repaired).toContain("Narrator:");
		expect(repaired).not.toMatch(/^They:/m);
	});

	it("strips narrator They s fragments", () => {
		const repaired = repairAssistantTranscript(
			"Narrator: *They s The movie plays on quietly.*",
			{ identity: BECCA_IDENTITY },
		);

		expect(repaired).toBe("Narrator: *The movie plays on quietly.*");
	});
});

describe("unified identity through sanitizer entry points", () => {
	it("applyStoryLocalIdentity repairs Rebecca lines when legal equals scene name", () => {
		const saved = applyStoryLocalIdentityToAssistantTranscript(
			'Rebecca: *They gently runs a hand down her arm.*',
			{
				legalName: "Becca",
				sceneName: "Becca",
				pronouns: "she/her",
				aliases: ["Rebecca"],
				characterGenders: BECCA_IDENTITY.characterGenders,
			},
		);

		expect(saved).toBe("Becca: *She gently runs a hand down her arm.*");
	});

	it("prevalidateAssistantTranscript uses the same repair path", () => {
		const prepared = prevalidateAssistantTranscript({
			text: 'Rebecca: *They gently runs a hand down her arm.*',
			playerName: "Becca",
			playerSceneName: "Becca",
			playerPronouns: "she/her",
			playerAliases: ["Rebecca"],
			characterGenders: BECCA_IDENTITY.characterGenders,
		});

		expect(prepared).toBe("Becca: *She gently runs a hand down her arm.*");
	});

	it("sanitizeMessageForDisplay repairs raw stored garbage with aliases", () => {
		const display = sanitizeMessageForDisplay({
			message: assistantMessage('Rebecca: *They gently runs a hand down her arm.*'),
			playerName: "Becca",
			playerSceneName: "Becca",
			playerPronouns: "she/her",
			playerAliases: ["Rebecca"],
			characterGenders: BECCA_IDENTITY.characterGenders,
		});

		expect(display).toBe("Becca: *She gently runs a hand down her arm.*");
	});

	it("repairs orphan They player action lines from the wine-on-the-couch scene", () => {
		const raw = `Rosa: She leans back against Rebecca's shoulder. "Movie?"

They wraps an arm around Rosa's shoulders, lightly resting a hand on her arm.

Rosa: She takes a slow sip of her wine. "Nineteen minutes."

They laughs softly, resting their chin lightly against Rosa's hair while looking at the screen.`;

		const repaired = prevalidateAssistantTranscript({
			text: raw,
			playerName: "Becca",
			playerSceneName: "Becca",
			playerPronouns: "she/her",
			playerAliases: ["Rebecca"],
			characterGenders: BECCA_IDENTITY.characterGenders,
			latestUserMessage:
				"It's a quiet Saturday night. Becca and Rosa are on the couch in their apartment, wine glasses on the table, cuddling while watching a film.",
		});

		expect(repaired).toContain("Becca: *She wraps an arm around Rosa's shoulders, lightly resting a hand on her arm.*");
		expect(repaired).toContain("Becca: *She laughs softly, resting her chin lightly against Rosa's hair while looking at the screen.*");
		expect(repaired).not.toMatch(/^They wraps/im);
		expect(repaired).not.toMatch(/^They laughs/im);
	});
});
