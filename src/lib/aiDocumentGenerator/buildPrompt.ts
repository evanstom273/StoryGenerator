import type { AiDocumentPreset, AiDocumentPresetId } from "./presets";
import { AI_DOCUMENT_CUSTOM_PRESET_ID } from "./presets";

export function buildAiDocumentMessages(params: {
	preset: AiDocumentPreset;
	customPrompt?: string;
	sourceLabel: string;
	sourceMaterial: string;
}) {
	const customInstructions =
		params.preset.id === AI_DOCUMENT_CUSTOM_PRESET_ID
			? params.customPrompt?.trim()
			: params.preset.systemPrompt;

	if (!customInstructions) {
		throw new Error("Describe the document you want generated.");
	}

	const systemContent =
		params.preset.id === AI_DOCUMENT_CUSTOM_PRESET_ID
			? `${params.preset.systemPrompt}\n\nCustom instructions:\n${customInstructions}`
			: customInstructions;

	const userContent = [
		`Source: ${params.sourceLabel}`,
		"",
		"---",
		"",
		"Use the following Story Engine source material as your only reference:",
		"",
		params.sourceMaterial,
	].join("\n");

	return [
		{ role: "system" as const, content: systemContent },
		{ role: "user" as const, content: userContent },
	];
}

export function resolvePresetId(value: string): AiDocumentPresetId | null {
	const normalized = value.trim();
	if (!normalized) {
		return null;
	}
	return normalized as AiDocumentPresetId;
}
