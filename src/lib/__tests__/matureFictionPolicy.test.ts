import { describe, expect, it } from "vitest";
import {
	buildMatureFictionModeNote,
	buildContentMinimizedRefusalRetryPolicyBlock,
	buildMatureFictionPolicyBlock,
} from "../ai/matureFictionPolicy";

describe("buildMatureFictionPolicyBlock", () => {
	it("keeps strict intimacy limits when adult intimacy is disabled", () => {
		const policy = buildMatureFictionPolicyBlock({ includeParity: true });
		expect(policy).toContain("eroticised");
		expect(policy).not.toContain("strap-ons");
	});

	it("allows consensual adult intimacy when mature mode is enabled", () => {
		const policy = buildMatureFictionPolicyBlock({
			includeParity: true,
			includeAdultIntimacy: true,
		});
		expect(policy).toContain("consensual adult intimacy");
		expect(policy).toContain("strap-ons");
		expect(policy).toContain("Do not refuse, sanitize, fade-to-black");
		expect(policy).not.toContain("eroticised");
	});
});

describe("buildContentMinimizedRefusalRetryPolicyBlock", () => {
	it("keeps a provider-refusal retry non-graphic and one-shot", () => {
		const policy = buildContentMinimizedRefusalRetryPolicyBlock();
		expect(policy).toContain("mature, non-graphic continuation only");
		expect(policy).toContain("Provider policies and safety controls remain authoritative");
		expect(policy).toContain("do not retry or rephrase it again");
	});
});

describe("buildMatureFictionModeNote", () => {
	it("returns an adult-intimacy note when enabled", () => {
		expect(buildMatureFictionModeNote(true)).toContain("consensual adult intimacy");
	});

	it("returns empty text when disabled", () => {
		expect(buildMatureFictionModeNote(false)).toBe("");
	});
});
