import { describe, expect, it } from "vitest";
import { validateAssistantTranscriptForSave } from "../transcriptSanitizer";

const DIRECTOR_NOTE = `Director: *Jamie's not even really aware of them watching; he's in his own world. He switches to a different song. ("This Romeo is bleeding, but you can't see his blood. It's nothing on some feelings that this old dog kicked up...") One of his favourite songs, Always by Bon Jovi. He lets his voice open up just a little more on the chorus, leaning into the rasp, his fingers skipping easily over the strings. ("And I will love you, baby, always...") He nails the high note casually, with no effort at all. Jake, Amy, Ellie and especially Mac are in awe, as always with Jamie and his music.*`;

const REPLY = `Narrator: *The living room goes quiet as the chords shift into something slower.*

Jamie: *He switches songs without looking up.* "This Romeo is bleeding, but you can't see his blood. It's nothing on some feelings that this old dog kicked up..."

Jamie: *He leans into the chorus, the rasp catching on the edge of it.* "And I will love you, baby, always..."

Mac: *He stops picking at the rug, staring up at his brother.* "Okay. That's just unfair."`;

describe("Director-scripted player songs", () => {
	it("accepts a reply where the player sings the lyrics the Director note wrote", () => {
		const result = validateAssistantTranscriptForSave({
			text: REPLY,
			playerName: "Jamie Peralta",
			playerSceneName: "Jamie",
			playerPronouns: "he/him",
			characterGenders: { jamie: "male", mac: "male", jake: "male", amy: "female", ellie: "female" },
			allowDirectedPlayerControl: true,
			latestUserMessage: DIRECTOR_NOTE,
			hiddenDialoguePattern: /\byou said\b/i,
			knownTies: ["Mac", "Jake", "Amy", "Ellie"],
		});

		expect(result.speakerAttributionIssues).toEqual([]);
		expect(result.valid).toBe(true);
		expect(result.text).toContain('Jamie: *He switches songs without looking up.* "This Romeo is bleeding');
	});
});

const BABY_NOTE = `Director: *Jamie explains, ("It tells us that Mommy's got got a baby growing inside of her, like how you were before you were born bug. You're gonna be a big sister..."). Lyra stares at them, processing the words, while Sophie and the rest of the family watch her reaction with bated breath.*`;

const BABY_REPLY = `Jamie: *He crouches so he's level with her, holding up the scan.* "It means Mommy's got a baby growing in her tummy, just like you were before you were born, bug. You're gonna be a big sister."

Narrator: *Lyra stares at the grainy picture, her mouth slightly open.*

Sophie: *She squeezes Jamie's arm, watching her daughter.* "Take your time, sweetheart."`;

describe("Director-controlled player dialogue", () => {
	const base = {
		text: BABY_REPLY,
		playerName: "Jamie Peralta",
		playerSceneName: "Jamie",
		playerPronouns: "he/him",
		characterGenders: { jamie: "male", lyra: "female", sophie: "female" },
		latestUserMessage: BABY_NOTE,
		hiddenDialoguePattern: /\byou said\b/i,
		knownTies: ["Lyra", "Sophie"],
	} as const;

	it("accepts the player talking to and about others on a Director turn", () => {
		const result = validateAssistantTranscriptForSave({ ...base, allowDirectedPlayerControl: true });
		expect(result.speakerAttributionIssues).toEqual([]);
		expect(result.valid).toBe(true);
		expect(result.text).toContain('Jamie: *He crouches');
	});

	it("still applies the loose checks when the player was not under Director control", () => {
		const result = validateAssistantTranscriptForSave({ ...base, allowDirectedPlayerControl: false });
		expect(result.valid).toBe(false);
	});

	it("still rejects a player line that talks about the player by name on a Director turn", () => {
		const result = validateAssistantTranscriptForSave({
			...base,
			text: `Jamie: *He grins at the table.* "Jamie is going to be the best big brother ever, honestly."`,
			allowDirectedPlayerControl: true,
		});
		expect(result.speakerAttributionIssues.map((issue) => issue.evidence)).toContain(
			"dialogue_player_third_person_reference",
		);
	});
});
