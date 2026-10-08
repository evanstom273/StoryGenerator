import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createIndexedDbStoryEngineRepository } from "../../lib/repository";
import { createConversationRepository } from "./repository";
import { ConversationService } from "./conversationService";
import { createResponseGenerator } from "./responseGenerator";
import type { Conversation } from "./types";

interface MetaChatContextValue {
  service: ConversationService;
  conversations: Conversation[];
  loading: boolean;
  error: string | null;
}
const MetaChatContext = createContext<MetaChatContextValue | null>(null);
export function MetaChatProvider({
  children,
  service: suppliedService,
}: {
  children: ReactNode;
  service?: ConversationService;
}) {
  const service = useMemo(() => {
    if (suppliedService) return suppliedService;
    const resources = createIndexedDbStoryEngineRepository();
    return new ConversationService(
      createConversationRepository(),
      resources,
      createResponseGenerator(() => resources.getAISettings()),
    );
  }, [suppliedService]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      try {
        const next = await service.repository.list();
        if (!disposed) setConversations(next);
      } catch (cause) {
        if (!disposed)
          setError(cause instanceof Error ? cause.message : String(cause));
      }
    };
    const channel =
      typeof window.BroadcastChannel === "function"
        ? new window.BroadcastChannel("story-engine:metachat")
        : null;
    if (channel)
      channel.onmessage = () => {
        void refresh();
      };
    const unsubscribe = service.subscribe(() => {
      void refresh();
      channel?.postMessage("changed");
    });
    void service
      .initialize()
      .then(refresh)
      .catch((cause) => {
        if (!disposed)
          setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    const focus = () => {
      void refresh();
    };
    window.addEventListener("focus", focus);
    return () => {
      disposed = true;
      unsubscribe();
      channel?.close();
      window.removeEventListener("focus", focus);
    };
  }, [service]);
  return (
    <MetaChatContext.Provider
      value={{ service, conversations, loading, error }}
    >
      {children}
    </MetaChatContext.Provider>
  );
}
export function useMetaChat() {
  const context = useContext(MetaChatContext);
  if (!context) throw new Error("MetaChatProvider is missing.");
  return context;
}
