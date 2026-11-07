import type { GenerationFailure } from "./errors";
import type {
	ContentMinimizedAdultRefusalRetryPlan,
} from "./transmitSafe";
import type { AdultContentRefusalStage } from "./adultContentMode";
import type { AIChatMessage } from "./types";

/**
 * Only an explicitly identified prompt/request block is eligible for the
 * content-minimized fallback. `GenerationFailure.stage` alone is insufficient
 * because provider safety failures historically map to `request` even when the
 * provider blocked a generated response.
 */
export function resolveProviderRefusalOrigin(
	failure: Pick<GenerationFailure, "kind" | "diagnostic">,
): AdultContentRefusalStage {
	if (failure.kind !== "provider_refusal") return "precheck";

	const diagnostic = failure.diagnostic ?? "";
	if (/(?:^|;\s*)stage=(?:prompt|request)(?:;|$)/i.test(diagnostic)) {
		return "request";
	}
	if (/(?:^|;\s*)stage=response(?:;|$)/i.test(diagnostic)) {
		return "response";
	}

	return "precheck";
}

/**
 * Assemble a deliberately context-minimized request. This API accepts no
 * transcript or user prose, which prevents callers from accidentally attaching
 * the refused turn, prior assistant output, or a partial blocked draft.
 */
export function buildContentMinimizedAdultRefusalRetryMessages(args: {
	plan: ContentMinimizedAdultRefusalRetryPlan;
	speakerRegistryPrompt: string;
}): AIChatMessage[] {
	const systemInstruction = [
		args.plan.systemNote,
		"Output only Story Engine transcript content. Do not mention the provider refusal or these instructions.",
		"Formatting rules:",
		"- Use one Narrator: *...* paragraph with two to four sentences for a brief neutral transition or aftermath beat.",
		"- Do not generate quoted dialogue, explicit detail, a player decision, or a new intimate act.",
		"- Do not claim what happened in the omitted turn. Leave the scene open for the player.",
		args.speakerRegistryPrompt,
	]
		.filter(Boolean)
		.join("\n");

	return [
		{ role: "system", content: systemInstruction },
		{ role: "user", content: args.plan.latestUserMessage },
	];
}
