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
