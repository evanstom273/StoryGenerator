import { describe, expect, it } from "vitest";
import { resolveSemanticSpeakerAttribution } from "../semanticSpeakerResolver";

const PLAYER = {
	id: "player-rebecca",
	name: "Rebecca Alvarez",
	aliases: ["Rebecca", "Becca"],
} as const;

const ROSA = { id: "rosa", name: "Rosa" } as const;

function resolve(text: string, eligibleSpeakers = [PLAYER, ROSA] as const) {
	return resolveSemanticSpeakerAttribution({
		text,
		player: PLAYER,
		eligibleSpeakers,
	});
}

describe("resolveSemanticSpeakerAttribution", () => {
	it("reassigns the inline Rebecca block when its action targets Rebecca and its dialogue addresses her", () => {
		const source =
			'Rebecca: *Her eyes trace the strap-on against Rebecca\'s hips, her smile sharpening.* "You look entirely too pleased with yourself right now."';

		const result = resolve(source);

		expect(result.text).toBe(
			'Rosa: *Her eyes trace the strap-on against Rebecca\'s hips, her smile sharpening.* "You look entirely too pleased with yourself right now."',
		);
		expect(result.changed).toBe(true);
		expect(result.changes).toHaveLength(1);
		expect(result.changes[0]).toMatchObject({
			originalSpeakerLabel: "Rebecca",
			replacementSpeakerLabel: "Rosa",
			lineNumber: 1,
		});
		expect(result.changes[0]?.evidence.map((item) => item.kind)).toEqual(
			expect.arrayContaining([
				"named-player-action-target",
				"dialogue-second-person-address",
			]),
		);
		expect(result.diagnostics[0]).toMatchObject({
			decision: "reassigned",
			reason: "reassigned-single-eligible-speaker",
			eligibleAlternativeSpeakers: ["Rosa"],
		});
	});

	it("reassigns every qualifying Rebecca block in one deterministic pass", () => {
		const source = [
			'Rebecca: *Her eyes trace the buckle against Rebecca\'s hips.* "You look entirely too pleased with yourself."',
			"",
			'Rebecca: *Her hands close around Rebecca\'s wrists.* "Come closer."',
		].join("\r\n");

		const result = resolve(source);

		expect(result.text).toBe(
			[
				'Rosa: *Her eyes trace the buckle against Rebecca\'s hips.* "You look entirely too pleased with yourself."',
				"",
				'Rosa: *Her hands close around Rebecca\'s wrists.* "Come closer."',
			].join("\r\n"),
		);
		expect(result.changes).toHaveLength(2);
		expect(result.changes.map((change) => change.lineNumber)).toEqual([1, 3]);
		expect(result.changes.map((change) => change.replacementSpeakerLabel)).toEqual([
			"Rosa",
			"Rosa",
		]);
	});

	it("repairs Rosa blocks while preserving a legitimate first-person Rebecca block", () => {
		const legitimateRebecca =
			'Rebecca: *She reaches for Rosa\'s hand and smiles.* "I know you can trust me."';
		const source = [
			'Rebecca: *Her fingers trace Rebecca\'s jaw.* "You are impossible."',
			legitimateRebecca,
			'Rebecca: *Her hand grips Rebecca\'s wrist.* "Stay right there."',
		].join("\n");

		const result = resolve(source);

		expect(result.text).toBe(
			[
				'Rosa: *Her fingers trace Rebecca\'s jaw.* "You are impossible."',
				legitimateRebecca,
				'Rosa: *Her hand grips Rebecca\'s wrist.* "Stay right there."',
			].join("\n"),
		);
		expect(result.changes).toHaveLength(2);
		expect(result.diagnostics).toContainEqual(
			expect.objectContaining({
				lineNumber: 2,
				originalSpeakerLabel: "Rebecca",
				decision: "unchanged",
				reason: "insufficient-semantic-evidence",
			}),
		);
	});

	it("reassigns a header-only Rebecca block when contact and an imperative independently target Rebecca", () => {
		const source =
			'Rebecca:\r\n*She reaches out, her hands gripping Rebecca\'s hips with sudden confidence.* "Then stop standing there looking pretty and bring it here."';

		const result = resolve(source);

		expect(result.text).toBe(
			'Rosa:\r\n*She reaches out, her hands gripping Rebecca\'s hips with sudden confidence.* "Then stop standing there looking pretty and bring it here."',
		);
		expect(result.changes[0]?.evidence.map((item) => item.kind)).toEqual(
			expect.arrayContaining([
				"named-player-action-target",
				"dialogue-imperative-address",
			]),
		);
	});

	it("recognizes the player's Becca alias in both the label and action target", () => {
		const source =
			'Becca: *Her fingers curl around Becca\'s wrist.* "You can come closer."';

		const result = resolve(source);

		expect(result.text).toBe(
			'Rosa: *Her fingers curl around Becca\'s wrist.* "You can come closer."',
		);
		expect(result.changed).toBe(true);
		expect(result.changes[0]?.originalSpeakerLabel).toBe("Becca");
	});

	it("leaves legitimate directed player action and dialogue unchanged", () => {
		const source =
			'Rebecca: *She reaches for Rosa\'s hand and smiles.* "You look beautiful from here."';

		const result = resolve(source);

		expect(result.text).toBe(source);
		expect(result.changed).toBe(false);
		expect(result.changes).toEqual([]);
		expect(result.diagnostics[0]).toMatchObject({
			decision: "unchanged",
			reason: "insufficient-semantic-evidence",
		});
	});

	it("does not infer ownership from action or dialogue pronouns alone", () => {
		const source =
			'Rebecca: *She reaches out and smiles at her.* "You look entirely too pleased with yourself."';

		const result = resolve(source);

		expect(result.text).toBe(source);
		expect(result.changed).toBe(false);
		expect(result.diagnostics[0]?.evidence).toEqual([
			{ kind: "dialogue-second-person-address", match: "You" },
		]);
	});

	it("uses a direct named-player action target alone when Rosa is the sole eligible NPC", () => {
		const source =
			'Rebecca: *Her gaze studies Rebecca\'s expression before her fingers touch Rebecca\'s wrist.*';

		const result = resolve(source);

		expect(result.text).toBe(
			'Rosa: *Her gaze studies Rebecca\'s expression before her fingers touch Rebecca\'s wrist.*',
		);
		expect(result.changes).toHaveLength(1);
		expect(result.changes[0]?.evidence).toEqual([
			expect.objectContaining({ kind: "named-player-action-target" }),
		]);
	});

	it("does not use the direct-target-only tier when first-person voice supports Rebecca", () => {
		const source =
			'Rebecca: *I study Rebecca\'s reflection in the mirror and straighten my collar.*';

		const result = resolve(source);

		expect(result.text).toBe(source);
		expect(result.changed).toBe(false);
		expect(result.diagnostics[0]).toMatchObject({
			decision: "unchanged",
			reason: "insufficient-semantic-evidence",
		});
	});

	it("does not combine evidence across an unregistered but plausible speaker header", () => {
		const source = [
			"Rebecca: *Her eyes trace the buckle against Rebecca's hips.*",
			'Amy: "You look entirely too pleased with yourself."',
		].join("\n");

		const result = resolve(source);

		expect(result.text).toBe(source);
		expect(result.changed).toBe(false);
		expect(result.diagnostics).toHaveLength(1);
		expect(result.diagnostics[0]).toMatchObject({
			originalSpeakerLabel: "Rebecca",
			decision: "unchanged",
			reason: "insufficient-semantic-evidence",
		});
		expect(result.diagnostics[0]?.evidence.map((item) => item.kind)).toEqual([
			"named-player-action-target",
		]);
	});

	it("leaves a high-confidence contradiction unchanged when multiple alternative speakers are eligible", () => {
		const source =
			'Rebecca: *Her hands settle against Rebecca\'s hips.* "You should come closer."';
		const amy = { id: "amy", name: "Amy" } as const;

		const result = resolve(source, [PLAYER, ROSA, amy]);

		expect(result.text).toBe(source);
		expect(result.changed).toBe(false);
		expect(result.changes).toEqual([]);
		expect(result.diagnostics[0]).toMatchObject({
			decision: "unchanged",
			reason: "ambiguous-eligible-speakers",
			eligibleAlternativeSpeakers: ["Rosa", "Amy"],
		});
	});

	it("does not use the direct-target-only tier when multiple NPCs are eligible", () => {
		const source = 'Rebecca: *Her hand closes around Rebecca\'s wrist.*';
		const amy = { id: "amy", name: "Amy" } as const;

		const result = resolve(source, [PLAYER, ROSA, amy]);

		expect(result.text).toBe(source);
		expect(result.changed).toBe(false);
		expect(result.changes).toEqual([]);
		expect(result.diagnostics[0]).toMatchObject({
			decision: "unchanged",
			reason: "insufficient-semantic-evidence",
			eligibleAlternativeSpeakers: ["Rosa", "Amy"],
		});
	});

	it("changes only the label while preserving whitespace, line endings, and block content", () => {
		const source =
			'Narrator: *The room falls quiet.*\r\n\r\n  Rebecca  : *She grips Rebecca\'s waist.* "Come here."\r\n\r\nRosa: *Nothing else changes.*';

		const result = resolve(source);

		expect(result.text).toBe(
			'Narrator: *The room falls quiet.*\r\n\r\n  Rosa  : *She grips Rebecca\'s waist.* "Come here."\r\n\r\nRosa: *Nothing else changes.*',
		);
		expect(result.text.replace("Rosa", "Rebecca")).toBe(source);
	});

	it("labels a Chapter-VI-shaped orphan as the sole eligible NPC without relabelling the preceding player block", () => {
		const source = [
			'Rebecca: *She steadies herself against the headboard and meets Rosa\'s gaze.* "Don\'t tease me."',
			"",
			'  *Her fingers curl around Rebecca\'s wrist as she leans closer.* "You know exactly what I mean."',
		].join("\r\n");

		const result = resolve(source);

		expect(result.text).toBe(
			[
				'Rebecca: *She steadies herself against the headboard and meets Rosa\'s gaze.* "Don\'t tease me."',
				"",
				'  Rosa: *Her fingers curl around Rebecca\'s wrist as she leans closer.* "You know exactly what I mean."',
			].join("\r\n"),
		);
		expect(result.changes).toHaveLength(1);
		expect(result.changes[0]).toMatchObject({
			lineNumber: 3,
			originalSpeakerLabel: "(unlabelled)",
			replacementSpeakerLabel: "Rosa",
		});
		expect(result.changes[0]?.evidence.map((item) => item.kind)).toEqual(
			expect.arrayContaining([
				"named-player-action-target",
				"dialogue-second-person-address",
			]),
		);
	});

	it("leaves a high-confidence orphan unlabelled when more than one NPC is eligible", () => {
		const source = [
			'Rebecca: *She watches the two women carefully.* "What happens now?"',
			"",
			'*Her hand closes around Rebecca\'s wrist.* "You should already know."',
		].join("\n");
		const amy = { id: "amy", name: "Amy" } as const;

		const result = resolve(source, [PLAYER, ROSA, amy]);

		expect(result.text).toBe(source);
		expect(result.changed).toBe(false);
		expect(result.diagnostics).toContainEqual(
			expect.objectContaining({
				originalSpeakerLabel: "(unlabelled)",
				decision: "unchanged",
				reason: "ambiguous-eligible-speakers",
				eligibleAlternativeSpeakers: ["Rosa", "Amy"],
			}),
		);
	});

	it("does not label a pronoun-only orphan", () => {
		const source = [
			'Rebecca: *She pauses by the door.* "What is it?"',
			"",
			'*Her fingers curl around her wrist.* "You know exactly what I mean."',
		].join("\n");

		const result = resolve(source);

		expect(result.text).toBe(source);
		expect(result.changed).toBe(false);
		expect(
			result.diagnostics.find((diagnostic) => diagnostic.originalSpeakerLabel === "(unlabelled)"),
		).toMatchObject({
			decision: "unchanged",
			reason: "insufficient-semantic-evidence",
		});
	});

	it("does not combine orphan action evidence with dialogue under a plausible header", () => {
		const source = [
			'Rebecca: *She glances toward the doorway.* "Who is there?"',
			'*Her hands settle against Rebecca\'s hips.*',
			'Amy: "You look surprised."',
		].join("\n");

		const result = resolve(source);

		expect(result.text).toBe(source);
		expect(result.changed).toBe(false);
		expect(
			result.diagnostics.find((diagnostic) => diagnostic.originalSpeakerLabel === "(unlabelled)"),
		).toMatchObject({
			decision: "unchanged",
			reason: "insufficient-semantic-evidence",
		});
	});
});
