export type AIChatRole = "system" | "user" | "assistant";

export interface AIChatMessage {
  role: AIChatRole;
  content: string;
}

export interface GenerateResponseRequest {
  apiKey: string;
  model: string;
  messages: AIChatMessage[];
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
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
