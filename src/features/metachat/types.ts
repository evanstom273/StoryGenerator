import type {
  MetaChatReference,
  PlayerCharacter,
  Universe,
} from "../../types/models";

export type Attachment = MetaChatReference;
export type LibraryAction = {
  kind: "character" | "universe";
  operation: "create" | "update" | "delete";
  targetId?: string;
  summary: string;
  draft?: Record<string, unknown>;
};
export interface ProposedAction extends LibraryAction {
  id: string;
  /** Exact reviewed record. Confirmation rejects stale targets. */
  before?: PlayerCharacter | Universe;
  after?: PlayerCharacter | Universe;
}
export interface ActionResult {
  actionId: string;
  status: "applied" | "failed" | "not_applied";
  detail: string;
}
export interface LibraryProposal {
  id: string;
  status: "pending" | "accepted" | "rejected" | "failed";
  actions: ProposedAction[];
  results?: ActionResult[];
}
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  attachments?: Attachment[];
  proposal?: LibraryProposal;
}
export interface ConversationMemory {
  throughMessageId: string;
  summary: string;
}
export interface Conversation {
  version: 2;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  attachments: Attachment[];
  messages: ChatMessage[];
  memory?: ConversationMemory;
  /** Superseded turns remain inspectable but never enter active AI context. */
  revisions: Array<{ editedAt: string; messages: ChatMessage[] }>;
  request?: {
    id: string;
    userMessageId: string;
    status: "pending" | "failed" | "cancelled";
    error?: string;
    mode: "chat" | "actions";
  };
  migratedFrom?: string;
  /** Tombstone also prevents archived legacy records being reimported. */
  deletedAt?: string;
}
export interface ResourceCatalog {
  stories: import("../../types/models").Story[];
  characters: PlayerCharacter[];
  universes: Universe[];
}
export interface ResolvedContext {
  text: string;
  intent: "casual" | "focused" | "review";
  resources: Attachment[];
  limitations: string[];
}
