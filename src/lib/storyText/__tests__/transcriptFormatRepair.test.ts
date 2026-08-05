import { describe, expect, it } from "vitest";
import { repairMalformedTranscriptFormat } from "../transcriptFormatRepair";
import { sanitizeAssistantTranscript } from "../transcriptSanitizer";

const BROKEN_CHAPTER_III = `*Narrator: *The comfortable, focused quiet of Room 204 is abruptly broken by three sharp, heavy knocks against the heavy oak classroom door. Before can take two steps from where she stands beside Maya's desk, the handle turns and the door swings open.*

Narrator: *Two plainclothes figures step into the doorway, immediately cutting through the subdued high school atmosphere. One is a man in a rumpled leather jacket and loosened tie with an NYPD badge hanging from a lanyard around his neck; beside him stands a woman in a fitted black leather coat, her arms crossed and her eyes scanning the classroom with sharp, uncompromising authority.*

Jake: *adjusts his badge strap with a dramatic flourish and scans the rows of desks.* "All right, nobody move! Just kidding, you can totally move—please don't jump out the windows, that would be terrible paperwork for everyone. Is this Rebecca fifth-period English class? Because if so—boom—you've just been visited by the NYPD."

Rosa: *gives Jake a look of profound, silent irritation without moving her head.* "Peralta, stop talking. You're making it sound like a raid." *.* *steps forward, her eyes locking onto Rebecca.* "Rebecca?"

steps smoothly into the middle aisle, placing herself between the officers and her class while keeping her hand resting lightly on her lesson folder.

Narrator: *Along the second row, Marcus and Jordan immediately strain in their seats to get a better look at the silver badges, while Maya quietly slips a paper bookmark between the pages of her text.*

Marcus: *whispers loudly across to Jordan.* "I told you! I told you she was involved in something crazy!"

Rosa: *flicks a cold, razor-sharp glance toward Marcus that instantly shuts him up.* "Back to your book, kid." *.* *turns back to Rebecca, her voice flat and strictly professional.* "We need a couple of minutes of your time, Ms. Alvarez. In private."

Narrator: *The tension in Room 204 spikes instantly as twenty-six pairs of eyes lock onto the two badges. Rebecca doesn't flinch under Detective intense gaze, nor does she allow Detective theatrical entrance to undermine her authority.*

Rebecca: *steps to the front of her desk, sweeping a calm, commanding look across the rows of desks.* "All right, everyone. Books closed, pack up your things quietly. Head down to the media center for the remainder of the period and check in with Mr. Lin. I expect chapter four finished and those three margin notes completed by tomorrow morning."

Marcus: *hastily zips his backpack, leaning forward with wide eyes.* "Wait, for real? Are you getting arrested, Ms. Alvarez?"

Rebecca: *gives Marcus a sharp, instant teacher look that cuts off any further debate.* "No, Marcus. I am not getting arrested. Now move along, all of you—quietly in the hallways."

Narrator: *The ninth-graders don't dare push their luck. They gather their notebooks and text books in record time, stealing lingering, curious looks at the two detectives as they file past them out into the hallway. The heavy door swings shut behind the last student, cutting off the noise of the corridor and leaving Room 204 entirely quiet.*

Rebecca: *turns completely to face the two plainclothes officers, crossing her arms with a cool, unbothered posture.* "Interrupting an active classroom is a major disruption, officers. Now, mind telling me who you two are and why you're barging into my fifth-period lesson?"

Jake: *flashes a bright, overly enthusiastic grin and flips open his leather badge wallet.* "Right! Proper introductions. I'm, this is my stoic and terrifying partner, Detective, Ninety-Ninth. And first of all—incredible classroom management. That death glare you gave the kid in row two? Art. Pure art."

Rosa: *gives Jake a silent, side-eye glare before focusing entirely on Rebecca.* "Peralta, shut up."`;

describe("transcriptFormatRepair", () => {
	it("repairs wrapped narrator labels and orphan player actions", () => {
		const repaired = repairMalformedTranscriptFormat(BROKEN_CHAPTER_III, {
			playerName: "Rebecca Alvarez",
		});

		expect(repaired).toMatch(/^Narrator: \*The comfortable, focused quiet/i);
		expect(repaired).toContain("Before Rebecca can take two steps");
		expect(repaired).toContain("Rebecca: *steps smoothly into the middle aisle");
		expect(repaired).not.toContain("*.*");
		expect(repaired).toContain("Detective Diaz's intense gaze");
		expect(repaired).toContain("Detective Peralta's theatrical entrance");
	});

	it("passes validation after automatic transcript repair", () => {
		const result = sanitizeAssistantTranscript({
			text: BROKEN_CHAPTER_III,
			playerName: "Rebecca Alvarez",
		});

		expect(result.formatValid).toBe(true);
		expect(result.text).toContain("Rebecca: *steps smoothly into the middle aisle");
		expect(result.text).not.toContain("*.*");
	});
});
