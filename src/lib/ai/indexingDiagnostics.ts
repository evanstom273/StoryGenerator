import type { AIChatMessage } from "./types";

export function isIndexingDiagnosticsEnabled(): boolean {
	return Boolean(import.meta.env.DEV);
}

export function estimateTokensFromText(text: string): number {
	const normalized = text.trim();
	if (!normalized) {
		return 0;
	}
	return Math.max(1, Math.ceil(normalized.length / 4));
}

export function estimatePromptTokens(messages: AIChatMessage[]): number {
	return messages.reduce((total, message) => total + estimateTokensFromText(message.content ?? ""), 0);
}

export interface IndexingCallDiagnostics {
	storyId: string;
	messageNumber: number;
	totalMessages: number;
	model: string;
	promptCharacters: number;
	estimatedInputTokens: number;
	estimatedOutputTokens: number;
	durationMs: number;
	continuitySnapshotCharacters: number;
	fullStateCharacters: number;
}

export function logIndexingCallDiagnostics(diagnostics: IndexingCallDiagnostics): void {
	if (!isIndexingDiagnosticsEnabled()) {
		return;
	}

	console.debug("[indexing]", {
		storyId: diagnostics.storyId,
		message: `${diagnostics.messageNumber}/${diagnostics.totalMessages}`,
		model: diagnostics.model,
		promptCharacters: diagnostics.promptCharacters,
		estimatedInputTokens: diagnostics.estimatedInputTokens,
		estimatedOutputTokens: diagnostics.estimatedOutputTokens,
		durationMs: diagnostics.durationMs,
		snapshotSavedCharacters: diagnostics.fullStateCharacters - diagnostics.continuitySnapshotCharacters,
	});
}
