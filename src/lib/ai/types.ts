export type AIChatRole = "system" | "user" | "assistant";

export interface AIChatMessage {
  role: AIChatRole;
  content: string;
}

export interface GenerateResponseRequest {
  apiKey: string;
  model: string;
  messages: AIChatMessage[];
  timeoutMs?: number;
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
}

export interface AIProvider {
  validateConnection: (apiKey: string, model: string) => Promise<void>;
  generateResponse: (request: GenerateResponseRequest) => Promise<GenerateResponseResult>;
  generateSummary: (request: GenerateSummaryRequest) => Promise<string>;
}
