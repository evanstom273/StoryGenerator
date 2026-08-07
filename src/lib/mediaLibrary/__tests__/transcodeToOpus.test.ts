import { describe, expect, it } from "vitest";
import { canTranscodeToOpus } from "../transcodeToOpus";

describe("transcodeToOpus", () => {
	it("reports WebCodecs availability in the current runtime", () => {
		expect(canTranscodeToOpus()).toBe(typeof AudioEncoder !== "undefined");
	});
});
