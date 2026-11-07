export type AIChatRole = "system" | "user" | "assistant";

import type { GeminiThinkingSettings } from "./geminiThinking";

export interface AIChatMessage {
  role: AIChatRole;
  content: string;
}

export type OnChunkCallback = (chunk: string) => void;

export interface GenerateResponseRequest {
  apiKey: string;
  model: string;
  messages: AIChatMessage[];
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  /** Gemini only. Use resolveGeminiMinimalThinkingSettings for short outputs. */
  thinking?: GeminiThinkingSettings;
  /** Gemini only. Relax sexually-explicit safety filtering for Mature Fiction stories. */
  geminiMatureFictionMode?: boolean;
  timeoutMs?: number;
  idleTimeoutMs?: number;
  signal?: AbortSignal;
  onChunk?: OnChunkCallback;
}

export interface GenerateResponseResult {
  content: string;
}

export interface GenerateSummaryRequest {
  apiKey: string;
  model: string;
  storyTitle: string;
  messages: AIChatMessage[];
  existingSummary?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface AIProvider {
  validateConnection: (apiKey: string, model: string) => Promise<void>;
  generateResponse: (request: GenerateResponseRequest) => Promise<GenerateResponseResult>;
  generateSummary: (request: GenerateSummaryRequest) => Promise<string>;
}
