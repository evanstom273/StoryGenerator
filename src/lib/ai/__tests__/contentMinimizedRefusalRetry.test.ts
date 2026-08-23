import { describe, expect, it } from "vitest";
import {
	buildContentMinimizedAdultRefusalRetryMessages,
	resolveProviderRefusalOrigin,
} from "../contentMinimizedRefusalRetry";
import { buildContentMinimizedAdultRefusalRetryPlan } from "../transmitSafe";

describe("resolveProviderRefusalOrigin", () => {
	it("distinguishes confirmed prompt and response blocks", () => {
		expect(
			resolveProviderRefusalOrigin({
				kind: "provider_refusal",
				diagnostic:
					"status=200; provider=Gemini; stage=prompt; blockReason=PROHIBITED_CONTENT",
			}),
		).toBe("request");
		expect(
			resolveProviderRefusalOrigin({
				kind: "provider_refusal",
				diagnostic:
					"status=200; provider=Gemini; stage=response; finishReason=PROHIBITED_CONTENT",
			}),
		).toBe("response");
	});

	it("does not infer eligibility from redacted or unrelated diagnostics", () => {
		expect(
			resolveProviderRefusalOrigin({
				kind: "provider_refusal",
				diagnostic: "[redacted length=73 fingerprint=fnv1a:4d39258d]",
			}),
		).toBe("precheck");
		expect(
			resolveProviderRefusalOrigin({
				kind: "network",
				diagnostic: "stage=prompt",
			}),
		).toBe("precheck");
	});
});

describe("buildContentMinimizedAdultRefusalRetryMessages", () => {
	it("cannot carry refused or generated prose into the retry", () => {
		const plan = buildContentMinimizedAdultRefusalRetryPlan({
			providerType: "gemini",
			mode: "explicit_consensual_adults",
			failureStage: "request",
		});
		expect(plan).not.toBeNull();
		if (!plan) return;

		const messages = buildContentMinimizedAdultRefusalRetryMessages({
			plan,
			speakerRegistryPrompt: "Eligible scene speakers: Rosa.",
		});
		const serialized = JSON.stringify(messages);

		expect(messages).toHaveLength(2);
		expect(messages[0]?.role).toBe("system");
		expect(messages[1]).toEqual({
			role: "user",
			content: plan.latestUserMessage,
		});
		expect(serialized).toContain("mature, non-graphic");
		expect(serialized).toContain("Eligible scene speakers: Rosa.");
		expect(serialized).not.toContain("SOURCE_EXPLICIT_STAGING_7f91");
		expect(serialized).not.toContain("PARTIAL_GENERATED_SCENE_29cd");
	});
});
