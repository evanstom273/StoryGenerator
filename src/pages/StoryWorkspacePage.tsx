import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { Field, SelectInput, TextAreaInput, TextInput } from "../components/forms/Fields";
import { StoryArchiveView } from "../components/story/StoryArchiveView";
import { StoryMessageBubble } from "../components/story/StoryMessageBubble";
import { StoryTranscriptView } from "../components/story/StoryTranscriptView";
import { GenerationFailureModal } from "../components/story/GenerationFailureModal";
import { MetaChatOverlay } from "../components/story/MetaChatOverlay";
import { RPCharacterSheetOverlay } from "../components/story/RPCharacterSheetOverlay";
import { RelationshipsOverlay } from "../components/story/RelationshipsOverlay";
import { META_CHAT_OPEN_STORAGE_KEY } from "../lib/jobNotifications";
import { Button, buttonClasses } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";
import { useUiPrefs } from "../app/ui/UiPrefsContext";
import { cn } from "../utils/cn";
import { appendAdditiveText } from "../lib/ai/additiveJoin";
import { isGenerationFailureError, type GenerationFailure } from "../lib/ai/errors";
import { STORY_NAVIGATION_EVENT, type StoryNavigationDetail } from "../lib/events/storyNavigation";
import { normalizeStoryStateToV2, safeParseStoryStateData } from "../lib/storyStateV2";
import type {
  RelationshipIndexEntry,
  StoryMessage,
  StoryMessageRole,
  StoryMessageSpeakerType,
} from "../types/models";

const GENERATION_AUDIT_URL = "http://127.0.0.1:7777/event";
const GENERATION_AUDIT_SESSION = "generation-pipeline-audit";

function reportWorkspaceUiAudit(args: {
  msg: string;
  data?: Record<string, unknown>;
}) {
  // #region debug-point E:workspace-ui
  void fetch(GENERATION_AUDIT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: GENERATION_AUDIT_SESSION,
      runId: "pre-fix",
      hypothesisId: "E",
      location: "StoryWorkspacePage.tsx",
      msg: `[DEBUG] ${args.msg}`,
      data: args.data,
      ts: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

function WorkspaceIconBtn({
  icon,
  label,
  active,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-[6px] p-[7px] transition disabled:opacity-40",
        active
          ? "bg-panel-muted text-accent"
          : "text-white/35 hover:bg-white/[0.05] hover:text-white/60",
      )}
    >
      {icon}
    </button>
  );
}

interface MessageComposerState {
  role: StoryMessageRole;
  speakerType: StoryMessageSpeakerType;
  speakerName: string;
  content: string;
}

const initialComposerState: MessageComposerState = {
  role: "user",
  speakerType: "player",
  speakerName: "",
  content: "",
};

export function StoryWorkspacePage() {
  const { storyId } = useParams();
  const {
    readerMode,
    setReaderMode,
    showChrome,
    setShowChrome,
    textSize,
    setStorySettingsOpen,
  } = useUiPrefs();
  const {
    createMessage,
    deleteMessage,
    getMessagesForStory,
    getChaptersForStory,
    getPlayerCharacterById,
    getStoryById,
    getUniverseById,
    editAssistantMessage,
    fetchStoryState,
    generatePlayerAssistMessage,
    regenerateLastAssistantMessage,
    sendChatMessage,
    setMessageDirectorIntent,
    updateMessage,
  } = useStoryEngine();
  const story = storyId ? getStoryById(storyId) : undefined;
  const universe = story ? getUniverseById(story.universeId) : undefined;
  const playerCharacter = story
    ? getPlayerCharacterById(story.playerCharacterId)
    : undefined;
  const messages = useMemo(
    () => (story ? getMessagesForStory(story.id) : []),
    [getMessagesForStory, story],
  );
  const [composerState, setComposerState] = useState(initialComposerState);
  const [editingMessage, setEditingMessage] = useState<StoryMessage | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [isSavingMessage, setIsSavingMessage] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [generationFailure, setGenerationFailure] = useState<GenerationFailure | null>(null);
  const [generationFailureOpen, setGenerationFailureOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [lastChatContent, setLastChatContent] = useState<string | null>(null);
  const [isGeneratingAssist, setIsGeneratingAssist] = useState(false);
  const [assistError, setAssistError] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [archiveMode, setArchiveMode] = useState(false);
  const [metaChatOpen, setMetaChatOpen] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [assistantEditMessage, setAssistantEditMessage] = useState<StoryMessage | null>(null);
  const [assistantEditContent, setAssistantEditContent] = useState("");
  const [assistantEditError, setAssistantEditError] = useState<string | null>(null);
  const [isAssistantEditSaving, setIsAssistantEditSaving] = useState(false);
  const [toolbarRelationships, setToolbarRelationships] = useState<RelationshipIndexEntry[]>([]);
  const [rpSheetOpen, setRpSheetOpen] = useState(false);
  const [relationshipsOpen, setRelationshipsOpen] = useState(false);

  useEffect(() => {
    if (!storyId) return;
    let cancelled = false;
    fetchStoryState(storyId).then((state) => {
      if (cancelled || !state) return;
      const parsed = normalizeStoryStateToV2(safeParseStoryStateData(state.stateJson));
      const rels = parsed?.indexes?.relationships;
      if (Array.isArray(rels)) setToolbarRelationships(rels);
    });
    return () => { cancelled = true; };
  }, [storyId, fetchStoryState, messages.length]);

  useEffect(() => {
    setEditingMessage(null);
    setComposerState(initialComposerState);
    setChatInput("");
    setChatError(null);
    setIsGenerating(false);
    setIsRegenerating(false);
    setLastChatContent(null);
    setIsGeneratingAssist(false);
    setAssistError(null);
    setManualMode(false);
    setArchiveMode(false);
    setMetaChatOpen(false);
    setAssistantEditMessage(null);
    setAssistantEditContent("");
    setAssistantEditError(null);
    setIsAssistantEditSaving(false);
    setRpSheetOpen(false);
    setRelationshipsOpen(false);
  }, [storyId]);

  useEffect(() => {
    function handleJump(event: Event) {
      const custom = event as CustomEvent<StoryNavigationDetail>;
      const detail = custom.detail;
      if (!detail || detail.storyId !== storyId) {
        return;
      }

      const target = messages[detail.messageNumber - 1];
      if (!target) {
        return;
      }

      setHighlightedMessageId(target.id);

      requestAnimationFrame(() => {
        const element = document.getElementById(`story-message-${target.id}`);
        element?.scrollIntoView({ block: "center", behavior: "smooth" });
      });

      window.setTimeout(() => {
        setHighlightedMessageId((current) => (current === target.id ? null : current));
      }, 1500);
    }

    window.addEventListener(STORY_NAVIGATION_EVENT, handleJump);
    return () => window.removeEventListener(STORY_NAVIGATION_EVENT, handleJump);
  }, [messages, storyId]);

  useEffect(() => {
    if (!storyId) return;
    try {
      if (localStorage.getItem(META_CHAT_OPEN_STORAGE_KEY) === storyId) {
        localStorage.removeItem(META_CHAT_OPEN_STORAGE_KEY);
        setMetaChatOpen(true);
      }
    } catch {}
  }, [storyId]);

  useEffect(() => {
    if (!readerMode) {
      return;
    }

    setManualMode(false);
    setEditingMessage(null);
  }, [readerMode]);

  const latestAssistantMessage = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role === "assistant") {
        return message;
      }
    }
    return null;
  }, [messages]);

  const latestDirectorIntentMessage = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role === "user" && message.directorIntent) {
        return message;
      }
    }
    return null;
  }, [messages]);

  if (!story || !universe || !playerCharacter) {
    return (
      <div className="space-y-8">
        <PageHeader
          eyebrow="Story Workspace"
          title="This story could not be found"
          description="Return to the stories list and open a different campaign."
        />
        <EmptyState
          title="Missing story"
          description="The requested story is not available in local storage."
          action={
            <Link to="/stories" className={buttonClasses()}>
              Back to Stories
            </Link>
          }
        />
      </div>
    );
  }

  const activeStory = story;
  const activeUniverse = universe;
  const activePlayerCharacter = playerCharacter;

  async function handleSendChat() {
    if (!chatInput.trim()) {
      setChatError("Message content is required.");
      return;
    }

    const content = chatInput;
    setIsGenerating(true);
    setChatError(null);
    setLastChatContent(content);
    setChatInput("");

    try {
      await sendChatMessage(activeStory.id, content);
    } catch (error) {
      reportWorkspaceUiAudit({
        msg: "Story workspace displayed generation error",
        data: {
          storyId: activeStory.id,
          originalUserText: content,
          failureKind: isGenerationFailureError(error) ? error.failure.kind : null,
          failureStage: isGenerationFailureError(error) ? error.failure.stage : null,
          errorMessage: error instanceof Error ? error.message : "Unable to generate a response.",
        },
      });
      if (isGenerationFailureError(error)) {
        setGenerationFailure(error.failure);
        setGenerationFailureOpen(true);
        setChatError(error.failure.summaryMessage);
      } else {
        setChatError(
          error instanceof Error ? error.message : "Unable to generate a response.",
        );
      }
      setChatInput(content);
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleRetryChat() {
    if (!lastChatContent) {
      return;
    }

    setIsGenerating(true);
    setChatError(null);

    try {
      await sendChatMessage(activeStory.id, lastChatContent);
    } catch (error) {
      reportWorkspaceUiAudit({
        msg: "Story workspace displayed retry generation error",
        data: {
          storyId: activeStory.id,
          originalUserText: lastChatContent,
          failureKind: isGenerationFailureError(error) ? error.failure.kind : null,
          failureStage: isGenerationFailureError(error) ? error.failure.stage : null,
          errorMessage: error instanceof Error ? error.message : "Unable to generate a response.",
        },
      });
      if (isGenerationFailureError(error)) {
        setGenerationFailure(error.failure);
        setGenerationFailureOpen(true);
        setChatError(error.failure.summaryMessage);
      } else {
        setChatError(
          error instanceof Error ? error.message : "Unable to generate a response.",
        );
      }
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleRegenerateLastAssistant() {
    if (!latestAssistantMessage || !messages.length || messages[messages.length - 1]?.id !== latestAssistantMessage.id) {
      return;
    }

    const confirmed = window.confirm("Replace the last AI message?");
    if (!confirmed) {
      return;
    }

    setIsRegenerating(true);
    setChatError(null);

    try {
      await regenerateLastAssistantMessage(activeStory.id);
    } catch (error) {
      setChatError(
        error instanceof Error ? error.message : "Unable to regenerate the last reply.",
      );
    } finally {
      setIsRegenerating(false);
    }
  }

  function formatDirectorIntent(intent: NonNullable<StoryMessage["directorIntent"]>) {
    const parts: string[] = [];
    if (intent.timeSkip) {
      parts.push(`Time skip: ${intent.timeSkip.amount} ${intent.timeSkip.unit}`);
    }
    if (intent.sceneCut) {
      parts.push(intent.target?.trim() ? `Scene cut: ${intent.target.trim()}` : "Scene cut");
    }
    return parts.length ? parts.join(" · ") : "Director intent";
  }

  async function handleUndoDirectorIntent() {
    if (!latestDirectorIntentMessage) {
      return;
    }

    if (!latestAssistantMessage || messages[messages.length - 1]?.id !== latestAssistantMessage.id) {
      return;
    }

    setChatError(null);
    try {
      await setMessageDirectorIntent(latestDirectorIntentMessage.id, null);
      await regenerateLastAssistantMessage(activeStory.id);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Unable to undo director intent.");
    }
  }

  function handleOpenAssistantEdit() {
    if (!latestAssistantMessage || !messages.length || messages[messages.length - 1]?.id !== latestAssistantMessage.id) {
      return;
    }

    setAssistantEditMessage(latestAssistantMessage);
    setAssistantEditContent(latestAssistantMessage.content);
    setAssistantEditError(null);
  }

  async function handleSaveAssistantEdit() {
    if (!assistantEditMessage) {
      return;
    }

    if (assistantEditMessage.role !== "assistant") {
      setAssistantEditError("Only assistant messages can be edited.");
      return;
    }

    if (!assistantEditContent.trim()) {
      setAssistantEditError("Message content is required.");
      return;
    }

    setIsAssistantEditSaving(true);
    setAssistantEditError(null);

    try {
      await editAssistantMessage(assistantEditMessage.id, assistantEditContent);
      setAssistantEditMessage(null);
      setAssistantEditContent("");
    } catch (error) {
      setAssistantEditError(
        error instanceof Error ? error.message : "Unable to save changes.",
      );
    } finally {
      setIsAssistantEditSaving(false);
    }
  }

  function handleCloseAssistantEdit() {
    if (isAssistantEditSaving) {
      return;
    }
    setAssistantEditMessage(null);
    setAssistantEditContent("");
    setAssistantEditError(null);
  }

  async function handleGeneratePlayerAssist() {
    setIsGeneratingAssist(true);
    setAssistError(null);

    try {
      const existingText = chatInput;
      const suggestion = await generatePlayerAssistMessage(activeStory.id, {
        existingText: existingText.trim() ? existingText : undefined,
      });

      setChatInput((current) => {
        const base = current ?? "";
        if (!base.trim()) {
          return suggestion;
        }
        return appendAdditiveText(base, suggestion);
      });
    } catch (error) {
      setAssistError(
        error instanceof Error ? error.message : "Unable to generate a player suggestion.",
      );
    } finally {
      setIsGeneratingAssist(false);
    }
  }

  function applyComposerPreset(role: StoryMessageRole, speakerType?: StoryMessageSpeakerType) {
    if (role === "user") {
      setComposerState({
        role: "user",
        speakerType: "player",
        speakerName: "",
        content: "",
      });
      setEditingMessage(null);
      return;
    }

    if (role === "system") {
      setComposerState({
        role: "system",
        speakerType: "system",
        speakerName: "",
        content: "",
      });
      setEditingMessage(null);
      return;
    }

    setComposerState({
      role: "assistant",
      speakerType: speakerType ?? "canon",
      speakerName: "",
      content: "",
    });
    setEditingMessage(null);
  }

  function populateComposerFromMessage(message: StoryMessage) {
    setEditingMessage(message);
    setComposerState({
      role: message.role,
      speakerType:
        message.speakerType ??
        (message.role === "user"
          ? "player"
          : message.role === "system"
            ? "system"
            : "canon"),
      speakerName: message.speakerName ?? "",
      content: message.content,
    });
  }

  async function handleSubmitMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!composerState.content.trim()) {
      setPageError("Message content is required.");
      return;
    }

    if (
      composerState.role === "assistant" &&
      composerState.speakerType === "canon" &&
      !composerState.speakerName.trim()
    ) {
      setPageError("Canon lines need a speaker name for the timeline.");
      return;
    }

    setIsSavingMessage(true);
    setPageError(null);

    try {
      if (editingMessage) {
        await updateMessage(editingMessage.id, {
          role: composerState.role,
          speakerType:
            composerState.role === "user"
              ? "player"
              : composerState.role === "system"
                ? "system"
                : composerState.speakerType,
          speakerName:
            composerState.role === "assistant" &&
            composerState.speakerType === "canon"
              ? composerState.speakerName
              : undefined,
          content: composerState.content,
        });
      } else {
        await createMessage({
          storyId: activeStory.id,
          role: composerState.role,
          speakerType:
            composerState.role === "user"
              ? "player"
              : composerState.role === "system"
                ? "system"
                : composerState.speakerType,
          speakerName:
            composerState.role === "assistant" &&
            composerState.speakerType === "canon"
              ? composerState.speakerName
              : undefined,
          content: composerState.content,
        });
      }

      setEditingMessage(null);
      setComposerState(initialComposerState);
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Unable to save the message.",
      );
    } finally {
      setIsSavingMessage(false);
    }
  }

  async function handleDeleteMessage(message: StoryMessage) {
    const confirmed = window.confirm("Delete this message from the timeline?");

    if (!confirmed) {
      return;
    }

    await deleteMessage(message.id);

    if (editingMessage?.id === message.id) {
      setEditingMessage(null);
      setComposerState(initialComposerState);
    }
  }

  return (
    <div className="flex min-h-[72vh] flex-col pb-14">
      <GenerationFailureModal
        open={generationFailureOpen}
        failure={generationFailure}
        onClose={() => setGenerationFailureOpen(false)}
        onRetry={() => {
          setGenerationFailureOpen(false);
          void handleRetryChat();
        }}
      />
      <div
        className={[
          "fixed inset-0 z-[70]",
          assistantEditMessage ? "pointer-events-auto" : "pointer-events-none",
        ].join(" ")}
        aria-hidden={!assistantEditMessage}
      >
        <button
          type="button"
          aria-label="Close editor"
          className={[
            "absolute inset-0 bg-app/80 backdrop-blur-sm transition-opacity duration-200",
            assistantEditMessage ? "opacity-100" : "opacity-0",
          ].join(" ")}
          onClick={handleCloseAssistantEdit}
        />
        <div
          className={[
            "absolute inset-0 flex items-center justify-center p-4 transition-opacity duration-200",
            assistantEditMessage ? "opacity-100" : "opacity-0",
          ].join(" ")}
        >
          <div className="w-full max-w-2xl">
            <Panel variant="flat" padding="lg" role="dialog" aria-modal="true">
              <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">
                Edit Last AI Message
              </div>
              <div className="mt-4 space-y-4">
                <TextAreaInput
                  value={assistantEditContent}
                  onChange={(event) => setAssistantEditContent(event.target.value)}
                />
                {assistantEditError ? (
                  <div className="rounded-[8px] border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
                    {assistantEditError}
                  </div>
                ) : null}
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <Button variant="ghost" onClick={handleCloseAssistantEdit}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveAssistantEdit} disabled={isAssistantEditSaving}>
                    {isAssistantEditSaving ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
            </Panel>
          </div>
        </div>
      </div>
      <div className="border-b border-divider/[0.3] pb-4">
        <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">
          {activeUniverse.name} · {activePlayerCharacter.name}
        </div>
        <h1 className="mt-2 text-[22px] font-extrabold leading-tight tracking-[-0.02em] text-ink">
          {activeStory.title}
        </h1>
        {!readerMode && activeStory.currentSummary ? (
          <p className="mt-1.5 line-clamp-2 text-[13px] leading-6 text-ink-muted">
            {activeStory.currentSummary}
          </p>
        ) : null}
      </div>

      <div
        className={[
          "fixed bottom-0 right-0 z-30 flex items-center justify-between border-t border-divider/[0.3] bg-app/90 px-4 py-2 backdrop-blur-md",
          readerMode ? "left-0" : "left-0 lg:left-[266px]",
        ].join(" ")}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="shrink-0 text-[11px] text-white/30">
            {messages.length} {messages.length === 1 ? "entry" : "entries"}
          </span>
          {(() => {
            const pcName = activePlayerCharacter?.name?.trim().toLowerCase() ?? "";
            const topRels = toolbarRelationships
              .filter((r) => {
                const aLow = r.a.trim().toLowerCase();
                const bLow = r.b.trim().toLowerCase();
                return aLow !== bLow && !(aLow === pcName || bLow === pcName ? false : true)
                  && (aLow === pcName || bLow === pcName);
              })
              .slice(0, 3);
            if (!topRels.length) return null;
            const tierColor: Record<string, string> = {
              friend: "border-emerald-500/25 bg-emerald-500/10 text-emerald-400",
              ally: "border-emerald-500/25 bg-emerald-500/10 text-emerald-400",
              lover: "border-emerald-500/25 bg-emerald-500/10 text-emerald-400",
              stranger: "border-white/10 bg-white/5 text-white/38",
              acquaintance: "border-white/10 bg-white/5 text-white/38",
              rival: "border-orange-500/25 bg-orange-500/10 text-orange-400",
              enemy: "border-red-500/25 bg-red-500/10 text-red-400",
              nemesis: "border-red-500/25 bg-red-500/10 text-red-400",
            };
            return (
              <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                {topRels.map((rel, i) => {
                  const npcName = rel.a.trim().toLowerCase() === pcName ? rel.b : rel.a;
                  const colorClass = rel.tier ? (tierColor[rel.tier] ?? "border-white/10 bg-white/5 text-white/38") : "border-white/10 bg-white/5 text-white/38";
                  return (
                    <span key={i} className={cn("flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium", colorClass)}>
                      <span className="max-w-[80px] truncate">{npcName}</span>
                      {rel.tier ? <span className="opacity-60">· {rel.tier}</span> : null}
                    </span>
                  );
                })}
              </div>
            );
          })()}
        </div>
        <div className="flex items-center gap-0.5">
          <WorkspaceIconBtn
            label="Settings"
            onClick={() => setStorySettingsOpen(true)}
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06-.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>}
          />
          <WorkspaceIconBtn
            label="Bubble view"
            active={showChrome}
            onClick={() => setShowChrome(!showChrome)}
            disabled={isGenerating}
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>}
          />
          <WorkspaceIconBtn
            label="Archive"
            active={archiveMode}
            onClick={() => setArchiveMode((c) => !c)}
            disabled={isGenerating}
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>}
          />
          <WorkspaceIconBtn
            label="Reader mode"
            active={readerMode}
            onClick={() => setReaderMode(!readerMode)}
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>}
          />
          <WorkspaceIconBtn
            label="MetaChat"
            active={metaChatOpen}
            onClick={() => setMetaChatOpen((c) => !c)}
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="18" height="13" rx="2"/><circle cx="9" cy="14" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="14" r="1.2" fill="currentColor" stroke="none"/><path d="M9 18.5h6"/><path d="M12 2v6"/><path d="M8.5 8V5"/><path d="M15.5 8V5"/></svg>}
          />
          <WorkspaceIconBtn
            label="Character Sheet"
            active={rpSheetOpen}
            onClick={() => setRpSheetOpen((c) => !c)}
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><path d="M12 11v2"/><path d="M10 13h4"/></svg>}
          />
          <WorkspaceIconBtn
            label="Relationships"
            active={relationshipsOpen}
            onClick={() => setRelationshipsOpen((c) => !c)}
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="7" r="3"/><circle cx="17" cy="8" r="2.5"/><path d="M3 21v-2a5 5 0 0 1 5-5h2"/><path d="M13 21v-1.5a3.5 3.5 0 0 1 7 0V21"/></svg>}
          />
          {readerMode || archiveMode ? null : (
            <WorkspaceIconBtn
              label="Manual entry"
              active={manualMode}
              onClick={() => setManualMode((c) => !c)}
              disabled={isGenerating}
              icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>}
            />
          )}
        </div>
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-auto pr-1">
        {archiveMode ? (
          <StoryArchiveView storyId={activeStory.id} />
        ) : messages.length ? (
          showChrome && !readerMode ? (
            <div className="space-y-1">
              {(() => {
                const nodes: React.ReactNode[] = [];
                let latestUserMessage: string | null = null;

                for (const message of messages) {
                  if (message.role === "user") {
                    latestUserMessage = message.content;
                  }

                  nodes.push(
                    <StoryMessageBubble
                      key={message.id}
                      message={message}
                      playerCharacterName={activePlayerCharacter.name}
                      latestUserMessage={latestUserMessage}
                      onEdit={populateComposerFromMessage}
                      onQuickEdit={handleOpenAssistantEdit}
                      onRegenerate={handleRegenerateLastAssistant}
                      isLatestAssistant={message.id === latestAssistantMessage?.id}
                      onDelete={handleDeleteMessage}
                      highlighted={highlightedMessageId === message.id}
                    />,
                  );
                }

                return nodes;
              })()}
            </div>
          ) : (
            <StoryTranscriptView
              messages={messages}
              playerCharacterName={activePlayerCharacter.name}
              chapters={getChaptersForStory(activeStory.id)}
              highlightedMessageId={highlightedMessageId}
              className={[
                readerMode ? "pb-8" : "",
                textSize === "sm"
                  ? "text-[14px] leading-7 sm:text-[14px] sm:leading-7"
                  : textSize === "lg"
                    ? "text-[18px] leading-9 sm:text-[17px] sm:leading-8"
                    : textSize === "xl"
                      ? "text-[20px] leading-10 sm:text-[18px] sm:leading-9"
                      : "",
              ]
                .filter(Boolean)
                .join(" ")}
            />
          )
        ) : (
          <EmptyState
            title="No timeline entries yet"
            description="Add user turns, canon character lines, narrator beats, or system notes to start the story."
          />
        )}
      </div>

      {readerMode || archiveMode ? null : (
        latestAssistantMessage && messages[messages.length - 1]?.id === latestAssistantMessage.id ? (
          <Panel variant="flat" className="mt-4" padding="sm">
            {latestDirectorIntentMessage?.directorIntent ? (
              <div className="mb-3 flex flex-col gap-3 rounded-[9px] border border-divider/[0.4] bg-panel-muted/50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-ink-muted">
                  Director intent applied:{" "}
                  <span className="text-ink-soft">
                    {formatDirectorIntent(latestDirectorIntentMessage.directorIntent)}
                  </span>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleUndoDirectorIntent()}
                  disabled={isGenerating || isGeneratingAssist || isRegenerating}
                >
                  Undo
                </Button>
              </div>
            ) : null}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-ink-muted">Last AI message</div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  variant="secondary"
                  onClick={handleOpenAssistantEdit}
                  disabled={isGenerating || isGeneratingAssist || isRegenerating}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleRegenerateLastAssistant}
                  disabled={isGenerating || isGeneratingAssist || isRegenerating}
                >
                  {isRegenerating ? "Regenerating..." : "Regenerate"}
                </Button>
              </div>
            </div>
          </Panel>
        ) : null
      )}

      {readerMode ? null : (
        <Panel variant="flat" className="mt-4" padding="sm">
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">
                  Chat
                </div>
                <div className="mt-2 text-[15px] font-semibold text-ink">
                  Send a turn and generate the next reply
                </div>
              </div>
              {chatError ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleRetryChat}
                  disabled={isGenerating || isGeneratingAssist || !lastChatContent}
                >
                  Retry
                </Button>
              ) : null}
            </div>

            <Field label="Your Message">
              <TextAreaInput
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="Write what your character does or says next."
              />
            </Field>

            {chatError ? (
              <div className="rounded-[8px] border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
                {chatError}
              </div>
            ) : null}

            {assistError ? (
              <div className="rounded-[8px] border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
                {assistError}
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button onClick={handleSendChat} disabled={isGenerating}>
                {isGenerating ? "Generating Scene..." : "Send"}
              </Button>
              <Button
                variant="secondary"
                onClick={handleGeneratePlayerAssist}
                disabled={isGenerating || isGeneratingAssist}
              >
                {isGeneratingAssist ? "Generating Response..." : "Generate Response"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setChatInput("")}
                disabled={isGenerating || isGeneratingAssist || !chatInput.trim()}
              >
                Clear
              </Button>
            </div>
          </div>
        </Panel>
      )}

      {readerMode ? null : manualMode || editingMessage ? (
      <Panel variant="flat" className="mt-4" padding="sm">
        <form className="space-y-5" onSubmit={handleSubmitMessage}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-soft">
                {editingMessage ? "Edit Entry" : "Add Entry"}
              </div>
              <div className="mt-2 text-[15px] font-semibold text-ink">
                Manual timeline entry
              </div>
            </div>
            {editingMessage ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditingMessage(null);
                  setComposerState(initialComposerState);
                }}
              >
                Cancel
              </Button>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Role">
              <SelectInput
                value={composerState.role}
                onChange={(event) => {
                  const role = event.target.value as StoryMessageRole;
                  setComposerState((currentState) => ({
                    ...currentState,
                    role,
                    speakerType:
                      role === "user"
                        ? "player"
                        : role === "system"
                          ? "system"
                          : currentState.speakerType === "player" ||
                              currentState.speakerType === "system"
                            ? "canon"
                            : currentState.speakerType,
                    speakerName: role === "assistant" ? currentState.speakerName : "",
                  }));
                }}
              >
                <option value="user">user</option>
                <option value="assistant">assistant</option>
                <option value="system">system</option>
              </SelectInput>
            </Field>

            <Field label="Speaker Type">
              <SelectInput
                value={composerState.speakerType}
                onChange={(event) =>
                  setComposerState((currentState) => ({
                    ...currentState,
                    speakerType: event.target.value as StoryMessageSpeakerType,
                    speakerName: event.target.value === "canon" ? currentState.speakerName : "",
                  }))
                }
                disabled={composerState.role !== "assistant"}
              >
                {composerState.role === "assistant" ? (
                  <>
                    <option value="canon">canon</option>
                    <option value="narrator">narrator</option>
                  </>
                ) : composerState.role === "system" ? (
                  <option value="system">system</option>
                ) : (
                  <option value="player">player</option>
                )}
              </SelectInput>
            </Field>
          </div>

          {composerState.role === "assistant" && composerState.speakerType === "canon" ? (
            <Field label="Speaker Name" hint="Required for canon lines">
              <TextInput
                value={composerState.speakerName}
                onChange={(event) =>
                  setComposerState((currentState) => ({
                    ...currentState,
                    speakerName: event.target.value,
                  }))
                }
                placeholder="Example: Jake Peralta"
              />
            </Field>
          ) : null}

          <Field label="Content">
            <TextAreaInput
              value={composerState.content}
              onChange={(event) =>
                setComposerState((currentState) => ({
                  ...currentState,
                  content: event.target.value,
                }))
              }
              placeholder="Write the next user turn, narrator beat, canon line, or system note."
            />
          </Field>

          {pageError ? (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
              {pageError}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="submit" disabled={isSavingMessage}>
              {isSavingMessage ? "Saving..." : editingMessage ? "Save Entry" : "Add Entry"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => applyComposerPreset("assistant", "narrator")}
            >
              Narrator Preset
            </Button>
          </div>
        </form>
      </Panel>
      ) : null}

      {storyId && metaChatOpen ? (
        <MetaChatOverlay
          open={metaChatOpen}
          storyId={storyId}
          onClose={() => setMetaChatOpen(false)}
        />
      ) : null}
      {activeStory && rpSheetOpen ? (
        <RPCharacterSheetOverlay
          open={rpSheetOpen}
          story={activeStory}
          onClose={() => setRpSheetOpen(false)}
        />
      ) : null}
      {storyId && relationshipsOpen ? (
        <RelationshipsOverlay
          open={relationshipsOpen}
          storyId={storyId}
          playerName={activePlayerCharacter?.name}
          onClose={() => setRelationshipsOpen(false)}
        />
      ) : null}
    </div>
  );
}
