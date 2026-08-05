export type AIChatRole = "system" | "user" | "assistant";

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
  /** Gemini 2.5+/3.x only. Set to 0 to disable thinking for short outputs. */
  thinkingBudget?: number;
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
