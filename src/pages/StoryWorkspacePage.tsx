import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { Field, SelectInput, TextAreaInput, TextInput } from "../components/forms/Fields";
import { StoryArchiveView } from "../components/story/StoryArchiveView";
import { StoryMessageBubble } from "../components/story/StoryMessageBubble";
import { StoryTranscriptView } from "../components/story/StoryTranscriptView";
import { StoryAudioPlayerBar } from "../components/story/StoryAudioPlayerBar";
import { StoryIndexingProgressBar } from "../components/story/StoryIndexingProgressBar";
import { useGeminiTtsPlayback } from "../app/providers/GeminiTtsPlaybackProvider";
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
import { useTheme } from "../app/theming/ThemeContext";
import { type AccentThemeKey, isAccentThemeKey } from "../app/theming/themes";
import { appendAdditiveText } from "../lib/ai/additiveJoin";
import { createAIProvider } from "../lib/ai/providerFactory";
import { getProviderDefaultModel } from "../lib/ai/models";
import { selectDiceStat } from "../lib/ai/diceStatSelector";
import { DiceRollModal, type DiceRollResult } from "../components/story/DiceRollModal";
import { DEFAULT_DICE_MODIFIERS } from "../lib/rpStats";
import { formatTimeCompact } from "../lib/rpTime";
import { parseSlashTimeCommand } from "../lib/storyText/directorIntent";
import {
  countGeneratedChapters,
  getLatestChapterStartMessage,
  scrollToChapterHeader,
} from "../lib/storyText/chapterNavigation";
import { safeParseStoryStateData } from "../lib/storyStateV2";
import { isGenerationFailureError, type GenerationFailure } from "../lib/ai/errors";
import { STORY_NAVIGATION_EVENT, type StoryNavigationDetail } from "../lib/events/storyNavigation";
import type {
  RpTimeState,
  StoryMessage,
  StoryMessageRole,
  StoryMessageSpeakerType,
} from "../types/models";


const GENERATION_AUDIT_URL = "http://127.0.0.1:7777/event";
const GENERATION_AUDIT_SESSION = "generation-pipeline-audit";
const STORY_END_RE = /^the end[.!?]*$/i;

function isStoryEndingText(value: string) {
  const normalized = value
    .trim()
    .replace(/^\*+|\*+$/g, "")
    .replace(/^["']+|["']+$/g, "")
    .trim();
  return STORY_END_RE.test(normalized);
}

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
  const navigate = useNavigate();
  const {
    readerMode,
    setReaderMode,
    showChrome,
    setShowChrome,
    textSize,
    setStorySettingsOpen,
  } = useUiPrefs();
  const { status: ttsPlaybackStatus, activeId: ttsActiveId } = useGeminiTtsPlayback();
  const audioPlayerVisible =
    Boolean(ttsActiveId) &&
    (ttsPlaybackStatus === "loading" ||
      ttsPlaybackStatus === "ready" ||
      ttsPlaybackStatus === "playing" ||
      ttsPlaybackStatus === "error");
  const {
    aiSettings,
    chapters: engineChapters,
    createMessage,
    deleteMessage,
    fetchStoryState,
    getChildStories,
    getMessagesForStory,
    getParentStory,
    getPlayerCharacterById,
    getStoryById,
    getUniverseById,
    editAssistantMessage,
    generatePlayerAssistMessage,
    regenerateLastAssistantMessage,
    sendChatMessage,
    setMessageDirectorIntent,
    updateMessage,
    updateRpStats,
  } = useStoryEngine();
  const { setStoryThemeOverride } = useTheme();
  const story = storyId ? getStoryById(storyId) : undefined;
  const universe = story ? getUniverseById(story.universeId) : undefined;
  const playerCharacter = story
    ? getPlayerCharacterById(story.playerCharacterId)
    : undefined;
  const parentStory = story ? getParentStory(story.id) : undefined;
  const childStories = useMemo(
    () =>
      story
        ? [...getChildStories(story.id)].sort(
            (left, right) =>
              new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
          )
        : [],
    [getChildStories, story],
  );
  const isReadOnly = story?.readOnlyReason === "sequel_prequel";
  const messages = useMemo(
    () => (story ? getMessagesForStory(story.id) : []),
    [getMessagesForStory, story],
  );
  const storyChapters = useMemo(
    () =>
      story
        ? [...engineChapters]
            .filter((chapter) => chapter.storyId === story.id)
            .sort((left, right) => left.endsAtIndex - right.endsAtIndex)
        : [],
    [engineChapters, story],
  );
  const [composerState, setComposerState] = useState(initialComposerState);
  const [editingMessage, setEditingMessage] = useState<StoryMessage | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [isSavingMessage, setIsSavingMessage] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [generationFailure, setGenerationFailure] = useState<GenerationFailure | null>(null);
  const [generationFailureOpen, setGenerationFailureOpen] = useState(false);
  const [showSequelPrompt, setShowSequelPrompt] = useState(false);
  const [dismissedSequelPromptMessageId, setDismissedSequelPromptMessageId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingDraft, setStreamingDraft] = useState<string | null>(null);
  const streamingAbortRef = useRef<AbortController | null>(null);
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
  const [rpSheetOpen, setRpSheetOpen] = useState(false);
  const [relationshipsOpen, setRelationshipsOpen] = useState(false);

  interface VariantCandidate {
    id: string;
    content: string;
    createdAt: string;
  }
  interface VariantSession {
    messageId: string;
    candidates: VariantCandidate[];
    selectedIndex: number;
  }
  const [variantSession, setVariantSession] = useState<VariantSession | null>(null);
  const [isSwitchingVariant, setIsSwitchingVariant] = useState(false);

  const [rpToasts, setRpToasts] = useState<Array<{ id: string; summary: string }>>([]);
  const [rpStatsRefreshKey, setRpStatsRefreshKey] = useState(0);
  const [relationshipsRefreshKey, setRelationshipsRefreshKey] = useState(0);
  const [taskbarGold, setTaskbarGold] = useState<number | null>(null);
  const [taskbarTime, setTaskbarTime] = useState<RpTimeState | null>(null);
  const [showZeroHpModal, setShowZeroHpModal] = useState(false);
  const [zeroHpConsequenceChoice, setZeroHpConsequenceChoice] = useState<string>("");
  const [zeroHpCustom, setZeroHpCustom] = useState("");
  const [pendingZeroHpConsequence, setPendingZeroHpConsequence] = useState<string | null>(null);
  const [diceRollPending, setDiceRollPending] = useState<{ stat: string; modifier: number; resolvedMessage: string } | null>(null);
  const [diceStatLoading, setDiceStatLoading] = useState(false);
  const pendingDiceEventRef = useRef<{ ts: number; summary: string } | null>(null);
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);
  const chatComposerRef = useRef<HTMLDivElement | null>(null);
  const chatInputPinnedRef = useRef(false);
  const jumpChapterScrollRef = useRef(false);
  const scrollSyncRef = useRef({
    initialized: false,
    messageCount: 0,
    streamingDraft: null as string | null,
  });

  // Initial gold load only — live updates come from appliedRpChanges in sendChatMessage
  useEffect(() => {
    if (!storyId || !story?.rpMode) { setTaskbarGold(null); return; }
    fetchStoryState(storyId).then((state) => {
      if (!state) return;
      const parsed = safeParseStoryStateData(state.stateJson);
      const g = parsed?.rpStats?.gold;
      if (typeof g === "number") setTaskbarGold(g);
    });
  }, [storyId, story?.rpMode]);

  // Load/refresh in-story time from state — updates whenever rpStatsRefreshKey changes
  useEffect(() => {
    if (!storyId || !story?.rpMode) { setTaskbarTime(null); return; }
    fetchStoryState(storyId).then((state) => {
      if (!state) return;
      const parsed = safeParseStoryStateData(state.stateJson);
      setTaskbarTime(parsed?.rpStats?.timeState ?? null);
    });
  }, [storyId, story?.rpMode, rpStatsRefreshKey]);

  useEffect(() => {
    setEditingMessage(null);
    setComposerState(initialComposerState);
    setChatInput("");
    setChatError(null);
    setIsGenerating(false);
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
    setRpToasts([]);
    setShowZeroHpModal(false);
    setZeroHpConsequenceChoice("");
    setZeroHpCustom("");
    setPendingZeroHpConsequence(null);
    setVariantSession(null);
    setShowSequelPrompt(false);
    setDismissedSequelPromptMessageId(null);
  }, [storyId]);

  useEffect(() => {
    if (!story?.accentThemeKey || !isAccentThemeKey(story.accentThemeKey)) {
      setStoryThemeOverride(null);
      return;
    }

    setStoryThemeOverride({
      themeKey: story.accentThemeKey as AccentThemeKey,
      customAccent: story.accentThemeCustom,
    });

    return () => {
      setStoryThemeOverride(null);
    };
  }, [setStoryThemeOverride, story?.accentThemeCustom, story?.accentThemeKey]);

  useEffect(() => {
    const lastMessage = messages.at(-1);
    if (
      !lastMessage ||
      lastMessage.role !== "user" ||
      !isStoryEndingText(lastMessage.content) ||
      lastMessage.id === dismissedSequelPromptMessageId
    ) {
      return;
    }

    setShowSequelPrompt(true);
  }, [dismissedSequelPromptMessageId, messages]);


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

      if (!chatInputPinnedRef.current) {
        requestAnimationFrame(() => {
          const element = document.getElementById(`story-message-${target.id}`);
          element?.scrollIntoView({ block: "center", behavior: "smooth" });
        });
      }

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

  useEffect(() => {
    if (archiveMode || readerMode || !story) {
      return;
    }

    const previous = scrollSyncRef.current;
    const messageCount = messages.length;
    const draft = streamingDraft;
    const messagesChanged = messageCount !== previous.messageCount;
    const draftChanged = draft !== previous.streamingDraft;

    if (!previous.initialized) {
      scrollSyncRef.current = {
        initialized: true,
        messageCount,
        streamingDraft: draft,
      };
      return;
    }

    if (!messagesChanged && !draftChanged) {
      return;
    }

    scrollSyncRef.current = {
      initialized: true,
      messageCount,
      streamingDraft: draft,
    };

    if (jumpChapterScrollRef.current) {
      return;
    }

    if (chatInputPinnedRef.current) {
      requestAnimationFrame(() => ensureChatComposerVisible());
      return;
    }

    requestAnimationFrame(() => {
      const transcript = transcriptScrollRef.current;
      if (!transcript) {
        return;
      }
      transcript.scrollTo({ top: transcript.scrollHeight, behavior: "smooth" });
    });
  }, [archiveMode, messages, readerMode, story, streamingDraft]);

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
  const showLatestChapterJumpButton =
    !readerMode &&
    !archiveMode &&
    countGeneratedChapters(messages, storyChapters) > 1;

  function ensureChatComposerVisible(behavior: ScrollBehavior = "smooth") {
    const composer = chatComposerRef.current;
    if (!composer) {
      return;
    }

    const rect = composer.getBoundingClientRect();
    const visibleBottom = window.innerHeight - 56;
    if (rect.bottom > visibleBottom || rect.top < 0) {
      composer.scrollIntoView({ block: "end", behavior });
    }
  }

  function handleChatInputFocus() {
    chatInputPinnedRef.current = true;
    requestAnimationFrame(() => ensureChatComposerVisible());
  }

  function handleChatInputBlur() {
    window.setTimeout(() => {
      const composer = chatComposerRef.current;
      const active = document.activeElement;
      if (composer && active && composer.contains(active)) {
        return;
      }
      chatInputPinnedRef.current = false;
    }, 150);
  }

  function handleJumpToLatestChapter() {
    const targetMessage = getLatestChapterStartMessage(messages, storyChapters);
    if (!targetMessage) {
      return;
    }

    setHighlightedMessageId(targetMessage.id);
    jumpChapterScrollRef.current = true;

    window.setTimeout(() => {
      scrollToChapterHeader(targetMessage.id, transcriptScrollRef.current, "smooth", {
        allowMessageFallback: showChrome,
      });
      window.setTimeout(() => {
        jumpChapterScrollRef.current = false;
      }, 1500);
    }, 50);

    window.setTimeout(() => {
      setHighlightedMessageId((current) => (current === targetMessage.id ? null : current));
    }, 1500);
  }

  const ROLL_TAG_RE = /\[roll(?:\s+(str|dex|con|int|wis|cha))?\]/i;

  async function handleSendChat() {
    if (isReadOnly) {
      setChatError("This story is locked as a prequel. Create or open a sequel to continue canon.");
      return;
    }

    if (!chatInput.trim()) {
      setChatError("Message content is required.");
      return;
    }

    // Intercept [roll] / [roll stat] tags when dice rolls are enabled
    const rpConfig = activeStory?.rpConfig;
    if (activeStory?.rpMode && rpConfig?.diceRollsEnabled) {
      const rollMatch = ROLL_TAG_RE.exec(chatInput);
      if (rollMatch) {
        const specifiedStat = rollMatch[1]?.toLowerCase() as "str" | "dex" | "con" | "int" | "wis" | "cha" | undefined;
        const modifiers = rpConfig.diceModifiers ?? DEFAULT_DICE_MODIFIERS;

        if (specifiedStat) {
          const modifier = modifiers[specifiedStat];
          setDiceRollPending({ stat: specifiedStat, modifier, resolvedMessage: chatInput });
          return;
        }

        // No stat specified — ask AI to pick one
        if (!aiSettings) {
          setChatError("Configure an AI provider in Settings before using dice rolls.");
          return;
        }
        const providerType = aiSettings.activeProviderType;
        const apiKey = aiSettings.apiKeys?.[providerType]?.trim() ?? "";
        const model = aiSettings.defaultModels?.[providerType]?.trim() || getProviderDefaultModel(providerType);
        const provider = createAIProvider(providerType);

        setDiceStatLoading(true);
        try {
          const resolvedStat = await selectDiceStat(chatInput, provider, apiKey, model);
          const modifier = modifiers[resolvedStat];
          setDiceRollPending({ stat: resolvedStat, modifier, resolvedMessage: chatInput });
        } catch {
          setChatError("Failed to select a stat for the dice roll. Try specifying one: [roll str]");
        } finally {
          setDiceStatLoading(false);
        }
        return;
      }
    }

    // Parse /time slash command and strip it from the message
    const slashTime = parseSlashTimeCommand(chatInput);
    const content = slashTime ? slashTime.strippedText || "." : chatInput;
    const directorIntentOverride = slashTime?.intent;
    const isStoryEndingMarker = isStoryEndingText(content);

    setIsGenerating(true);
    setStreamingDraft("");
    setChatError(null);
    setLastChatContent(content);
    setChatInput("");

    const abortController = new AbortController();
    streamingAbortRef.current = abortController;

    try {
      const consequence = pendingZeroHpConsequence;
      if (consequence) setPendingZeroHpConsequence(null);
      const result = await sendChatMessage(
        activeStory.id,
        content,
        {
          ...(consequence ? { zeroHpConsequence: consequence } : {}),
          ...(directorIntentOverride ? { directorIntentOverride } : {}),
          ...(isStoryEndingMarker ? { skipAssistantResponse: true } : {}),
          signal: abortController.signal,
          onChunk: (chunk) => setStreamingDraft((prev) => (prev ?? "") + chunk),
          onChunkReset: () => setStreamingDraft(""),
        },
      );
      // User sent a new message — lock the selected candidate, discard the rest
      setVariantSession(null);
      if (result.appliedRpChanges?.length) {
        const hpZero = result.appliedRpChanges.some((c) => c.field === "hp" && c.to === 0);
        if (hpZero) {
          setZeroHpConsequenceChoice("Unconscious / collapsed");
          setZeroHpCustom("");
          setShowZeroHpModal(true);
        }
      }
      if (result.rpEventSummary) {
        const id = `${Date.now()}-${Math.random()}`;
        setRpToasts((prev) => [{ id, summary: result.rpEventSummary! }, ...prev]);
        setTimeout(() => setRpToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
      }
      if (activeStory.rpMode) {
        const allGoldChanges = result.appliedRpChanges?.filter((c) => c.field === "gold");
        const lastGoldChange = allGoldChanges?.at(-1);
        if (lastGoldChange !== undefined) setTaskbarGold(lastGoldChange.to);
        setRpStatsRefreshKey((k) => k + 1);
        if (result.appliedRelationshipDeltas?.length) setRelationshipsRefreshKey((k) => k + 1);
      }
      if (isStoryEndingMarker) {
        setShowSequelPrompt(true);
      }
    } catch (error) {
      const capturedDraft = streamingDraft && streamingDraft.trim() ? streamingDraft : undefined;
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
        const failure = capturedDraft ? { ...error.failure, rawDraft: capturedDraft } : error.failure;
        const isCancelledWithNoDraft = failure.kind === "cancelled" && !failure.rawDraft;
        if (!isCancelledWithNoDraft) {
          setGenerationFailure(failure);
          setGenerationFailureOpen(true);
        }
        setChatError(error.failure.summaryMessage);
      } else {
        setChatError(
          error instanceof Error ? error.message : "Unable to generate a response.",
        );
      }
      setChatInput(content);
    } finally {
      setIsGenerating(false);
      setStreamingDraft(null);
      streamingAbortRef.current = null;
    }
  }

  function handleCancelGeneration() {
    streamingAbortRef.current?.abort();
  }

  function handleDiceConfirm(result: DiceRollResult) {
    if (!diceRollPending) return;
    const statLabel = result.stat.toUpperCase();
    const modLabel = result.modifier > 0 ? `+${result.modifier}` : result.modifier < 0 ? `${result.modifier}` : "±0";
    const resultTag = `[${statLabel} ${modLabel} | 2d6: ${result.dice[0]}+${result.dice[1]} | Total: ${result.total} — ${result.outcome}]`;
    const substituted = diceRollPending.resolvedMessage.replace(ROLL_TAG_RE, resultTag);

    // Toast
    const toastId = `dice-${Date.now()}-${Math.random()}`;
    setRpToasts((prev) => [{ id: toastId, summary: `🎲 ${resultTag}` }, ...prev]);
    setTimeout(() => setRpToasts((prev) => prev.filter((t) => t.id !== toastId)), 6000);

    // Store event log entry to be written after sendChatMessage completes
    const actionText = diceRollPending.resolvedMessage.replace(ROLL_TAG_RE, "").trim();
    const truncated = actionText.length > 120 ? actionText.slice(0, 117) + "…" : actionText;
    pendingDiceEventRef.current = {
      ts: Date.now(),
      summary: truncated ? `${resultTag}\n"${truncated}"` : resultTag,
    };

    setDiceRollPending(null);
    setChatInput(substituted);
    setTimeout(() => {
      void sendChatMessageWithContent(substituted);
    }, 0);
  }

  function handleDiceCancel() {
    if (diceRollPending) {
      setChatInput(diceRollPending.resolvedMessage);
    }
    setDiceRollPending(null);
  }

  async function sendChatMessageWithContent(content: string) {
    if (isReadOnly) {
      setChatError("This story is locked as a prequel. Create or open a sequel to continue canon.");
      return;
    }

    setIsGenerating(true);
    setChatError(null);
    setLastChatContent(content);
    setChatInput("");

    try {
      const consequence = pendingZeroHpConsequence;
      if (consequence) setPendingZeroHpConsequence(null);
      const result = await sendChatMessage(activeStory.id, content, consequence ? { zeroHpConsequence: consequence } : undefined);
      if (result.appliedRpChanges?.length) {
        const hpZero = result.appliedRpChanges.some((c) => c.field === "hp" && c.to === 0);
        if (hpZero) {
          setZeroHpConsequenceChoice("Unconscious / collapsed");
          setZeroHpCustom("");
          setShowZeroHpModal(true);
        }
      }
      if (result.rpEventSummary) {
        const id = `${Date.now()}-${Math.random()}`;
        setRpToasts((prev) => [{ id, summary: result.rpEventSummary! }, ...prev]);
        setTimeout(() => setRpToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
      }
      if (activeStory.rpMode) {
        const allGoldChanges = result.appliedRpChanges?.filter((c) => c.field === "gold");
        const lastGoldChange = allGoldChanges?.at(-1);
        if (lastGoldChange !== undefined) setTaskbarGold(lastGoldChange.to);
        setRpStatsRefreshKey((k) => k + 1);
        if (result.appliedRelationshipDeltas?.length) setRelationshipsRefreshKey((k) => k + 1);
      }

      // Write dice roll to eventLog after extractor has already saved rpStats
      const diceEntry = pendingDiceEventRef.current;
      if (diceEntry && storyId) {
        pendingDiceEventRef.current = null;
        const stateSnapshot = await fetchStoryState(storyId);
        const parsedRpStats = stateSnapshot?.stateJson
          ? safeParseStoryStateData(stateSnapshot.stateJson)?.rpStats
          : null;
        if (parsedRpStats) {
          await updateRpStats(storyId, {
            ...parsedRpStats,
            eventLog: [diceEntry, ...(parsedRpStats.eventLog ?? [])],
          });
          setRpStatsRefreshKey((k) => k + 1);
        }
      }
    } catch (error) {
      pendingDiceEventRef.current = null;
      reportWorkspaceUiAudit({
        msg: "Story workspace displayed generation error (dice)",
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
        setChatError(error instanceof Error ? error.message : "Unable to generate a response.");
      }
      setChatInput(content);
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleRetryChat() {
    if (isReadOnly) {
      setChatError("This story is locked as a prequel. Create or open a sequel to continue canon.");
      return;
    }

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
    if (isReadOnly) {
      setChatError("This story is locked as a prequel. Create or open a sequel to continue canon.");
      return;
    }

    if (!latestAssistantMessage || !messages.length || messages[messages.length - 1]?.id !== latestAssistantMessage.id) {
      return;
    }

    // Snapshot current content and message ID before anything starts
    const snapshotContent = latestAssistantMessage.content;
    const snapshotMessageId = latestAssistantMessage.id;

    // Seed the variant session immediately so the streaming label shows "Generating candidate…"
    setVariantSession((prev) => {
      if (!prev || prev.messageId !== snapshotMessageId) {
        return {
          messageId: snapshotMessageId,
          candidates: [{ id: `c-0-${snapshotMessageId}`, content: snapshotContent, createdAt: new Date().toISOString() }],
          selectedIndex: 0,
        };
      }
      return prev;
    });

    setIsGenerating(true);
    setStreamingDraft("");
    setChatError(null);

    try {
      const newMessage = await regenerateLastAssistantMessage(activeStory.id, {
        onChunk: (chunk) => setStreamingDraft((prev) => (prev ?? "") + chunk),
        onChunkReset: () => setStreamingDraft(""),
      });

      // Add the freshly generated candidate and select it
      setVariantSession((prev) => {
        const base = prev && prev.messageId === snapshotMessageId ? prev : {
          messageId: snapshotMessageId,
          candidates: [{ id: `c-0-${snapshotMessageId}`, content: snapshotContent, createdAt: new Date().toISOString() }],
          selectedIndex: 0,
        };
        const newCandidate: VariantCandidate = {
          id: `c-${base.candidates.length}-${Date.now()}`,
          content: newMessage.content,
          createdAt: new Date().toISOString(),
        };
        return {
          ...base,
          candidates: [...base.candidates, newCandidate],
          selectedIndex: base.candidates.length,
        };
      });
    } catch (error) {
      // On failure: revert variant session to just the pre-existing candidates (remove seeded empty slot)
      setVariantSession((prev) => {
        if (!prev || prev.messageId !== snapshotMessageId) return prev;
        // If we only seeded one candidate (the original), tear down the session entirely
        if (prev.candidates.length <= 1) return null;
        return prev;
      });
      if (isGenerationFailureError(error)) {
        const capturedDraft = streamingDraft && streamingDraft.trim() ? streamingDraft : undefined;
        const failure = capturedDraft ? { ...error.failure, rawDraft: capturedDraft } : error.failure;
        const isCancelledWithNoDraft = failure.kind === "cancelled" && !failure.rawDraft;
        if (!isCancelledWithNoDraft) {
          setGenerationFailure(failure);
          setGenerationFailureOpen(true);
        }
        setChatError(error.failure.summaryMessage);
      } else {
        setChatError(
          error instanceof Error ? error.message : "Unable to regenerate the last reply.",
        );
      }
    } finally {
      setIsGenerating(false);
      setStreamingDraft(null);
    }
  }

  async function handleSelectVariant(index: number) {
    if (isReadOnly) {
      setChatError("This story is locked as a prequel. Create or open a sequel to continue canon.");
      return;
    }
    if (!variantSession || !latestAssistantMessage || isSwitchingVariant) return;
    const candidate = variantSession.candidates[index];
    if (!candidate || index === variantSession.selectedIndex) return;

    // Optimistically update UI selection index
    setVariantSession((prev) => prev ? { ...prev, selectedIndex: index } : null);

    // Write selected candidate to DB so transcript-is-truth invariant holds
    setIsSwitchingVariant(true);
    try {
      await editAssistantMessage(latestAssistantMessage.id, candidate.content);
    } catch {
      // Revert on failure
      setVariantSession((prev) => prev ? { ...prev, selectedIndex: variantSession.selectedIndex } : null);
    } finally {
      setIsSwitchingVariant(false);
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
    if (isReadOnly) {
      setChatError("This story is locked as a prequel. Create or open a sequel to continue canon.");
      return;
    }
    if (!latestDirectorIntentMessage) {
      return;
    }

    if (!latestAssistantMessage || messages[messages.length - 1]?.id !== latestAssistantMessage.id) {
      return;
    }

    setChatError(null);
    setVariantSession(null);
    try {
      await setMessageDirectorIntent(latestDirectorIntentMessage.id, null);
      await regenerateLastAssistantMessage(activeStory.id);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Unable to undo director intent.");
    }
  }

  function handleOpenAssistantEdit() {
    if (isReadOnly) {
      setChatError("This story is locked as a prequel. Create or open a sequel to continue canon.");
      return;
    }
    if (!latestAssistantMessage || !messages.length || messages[messages.length - 1]?.id !== latestAssistantMessage.id) {
      return;
    }

    setAssistantEditMessage(latestAssistantMessage);
    setAssistantEditContent(latestAssistantMessage.content);
    setAssistantEditError(null);
  }

  async function handleSaveAssistantEdit() {
    if (isReadOnly) {
      setAssistantEditError("This story is locked as a prequel. Create or open a sequel to continue canon.");
      return;
    }

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
      setVariantSession(null);
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
    if (isReadOnly) {
      setAssistError("This story is locked as a prequel. Create or open a sequel to continue canon.");
      return;
    }

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
    if (isReadOnly) {
      setPageError("This story is locked as a prequel. Create or open a sequel to continue canon.");
      return;
    }

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

    if (isReadOnly) {
      setPageError("This story is locked as a prequel. Create or open a sequel to continue canon.");
      return;
    }

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
              ? composerState.speakerType
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
              ? composerState.speakerType
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
    if (isReadOnly) {
      setPageError("This story is locked as a prequel. Create or open a sequel to continue canon.");
      return;
    }

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

      {showSequelPrompt && activeStory ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-[18px] border border-divider bg-app px-5 py-5 shadow-hero">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-soft">
              Story Complete
            </div>
            <div className="mt-2 text-xl font-semibold text-ink">Create a sequel?</div>
            <div className="mt-2 text-sm leading-6 text-ink-muted">
              <span className="font-medium text-ink-soft">The End</span> has been saved as a final chapter break for{" "}
              <span className="font-medium text-ink-soft">{activeStory.title}</span>. Do you want to start a sequel now?
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowSequelPrompt(false);
                  const lastMessage = messages.at(-1);
                  setDismissedSequelPromptMessageId(lastMessage?.id ?? null);
                }}
              >
                Not Yet
              </Button>
              <Button
                onClick={() => {
                  setShowSequelPrompt(false);
                  navigate(`/stories/new?sequelTo=${activeStory.id}`);
                }}
              >
                Create Sequel
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showZeroHpModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-[14px] border border-divider bg-panel p-5 shadow-xl">
            <h2 className="mb-1 text-base font-semibold text-ink">Character Incapacitated</h2>
            <p className="mb-4 text-sm text-ink-muted">HP has reached 0. Choose what happens next — this will guide the story's next beat.</p>
            <div className="mb-4 space-y-2">
              {["Unconscious / collapsed", "Captured", "Rescued or helped by someone nearby", "Receiving medical treatment", "Arrested"].map((opt) => (
                <label key={opt} className="flex cursor-pointer items-center gap-3 rounded-[8px] border border-divider px-3 py-2 hover:bg-panel-muted/50">
                  <input
                    type="radio"
                    name="zeroHpConsequence"
                    value={opt}
                    checked={zeroHpConsequenceChoice === opt}
                    onChange={() => { setZeroHpConsequenceChoice(opt); setZeroHpCustom(""); }}
                    className="accent-accent"
                  />
                  <span className="text-sm text-ink">{opt}</span>
                </label>
              ))}
              <label className="flex cursor-pointer items-center gap-3 rounded-[8px] border border-divider px-3 py-2 hover:bg-panel-muted/50">
                <input
                  type="radio"
                  name="zeroHpConsequence"
                  value="custom"
                  checked={zeroHpConsequenceChoice === "custom"}
                  onChange={() => setZeroHpConsequenceChoice("custom")}
                  className="accent-accent"
                />
                <span className="text-sm text-ink">Custom…</span>
              </label>
              {zeroHpConsequenceChoice === "custom" && (
                <input
                  autoFocus
                  className="mt-1 w-full rounded-[8px] border border-divider bg-panel-muted/50 px-3 py-2 text-sm text-ink outline-none transition focus:border-accent/[0.4]"
                  placeholder="Describe what happens…"
                  value={zeroHpCustom}
                  onChange={(e) => setZeroHpCustom(e.target.value)}
                />
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="sm"
                className="flex-1"
                onClick={() => {
                  const consequence = zeroHpConsequenceChoice === "custom" ? zeroHpCustom.trim() : zeroHpConsequenceChoice;
                  if (!consequence) return;
                  setPendingZeroHpConsequence(`The player character is incapacitated (HP reached 0). Consequence: ${consequence}`);
                  setShowZeroHpModal(false);
                }}
                disabled={!zeroHpConsequenceChoice || (zeroHpConsequenceChoice === "custom" && !zeroHpCustom.trim())}
              >
                Set consequence
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setShowZeroHpModal(false)}>
                Skip
              </Button>
            </div>
          </div>
        </div>
      )}
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
                  defaultHeightPx={240}
                  minHeightPx={200}
                  maxHeightPx={520}
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
        {parentStory || childStories.length ? (
          <div className="mt-3 rounded-[10px] border border-divider/[0.35] bg-panel-muted/40 px-3 py-3 text-sm text-ink-muted">
            {parentStory ? (
              <div>
                {activeStory.lineageType === "branch" ? "Branched from: " : "Prequel: "}
                <Link to={`/stories/${parentStory.id}`} className="font-semibold text-ink-soft hover:text-accent">
                  {parentStory.title}
                </Link>
              </div>
            ) : null}
            {childStories.length ? (
              <div className={parentStory ? "mt-2" : ""}>
                Follow-ups:{" "}
                {childStories.map((childStory, index) => (
                  <span key={childStory.id}>
                    {index > 0 ? " · " : ""}
                    <Link to={`/stories/${childStory.id}`} className="font-semibold text-ink-soft hover:text-accent">
                      {childStory.title}
                    </Link>
                    <span className="text-[11px] text-ink-muted">
                      {childStory.lineageType === "branch" ? " (branch)" : " (sequel)"}
                    </span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {isReadOnly ? (
          <div className="mt-3 rounded-[10px] border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
            This story is a locked prequel. It remains canon and read-only. Start a new season with{" "}
            <Link to={`/stories/new?sequelTo=${activeStory.id}`} className="font-semibold underline underline-offset-2">
              Create Sequel
            </Link>
            .
          </div>
        ) : null}
        {!readerMode && activeStory.currentSummary ? (
          <p className="mt-1.5 line-clamp-2 text-[13px] leading-6 text-ink-muted">
            {activeStory.currentSummary}
          </p>
        ) : null}
      </div>

      <div className="fixed bottom-10 left-0 right-0 z-50 flex flex-col lg:left-[266px]">
        <StoryIndexingProgressBar storyId={storyId} />
        <StoryAudioPlayerBar className="relative border-t-0 shadow-none" />
      </div>
      <div
        className={[
          "fixed bottom-0 right-0 z-30 flex items-center justify-between border-t border-divider/[0.3] bg-app will-change-transform px-4 py-2",
          readerMode ? "left-0" : "left-0 lg:left-[266px]",
        ].join(" ")}
      >
        <div className="flex min-w-0 overflow-hidden items-center gap-3">
          <span className="shrink-0 text-[11px] text-white/30">
            {messages.length} {messages.length === 1 ? "entry" : "entries"}
          </span>
          {activeStory?.rpMode && activeStory.rpConfig && taskbarGold !== null && (
            <span className="shrink-0 text-[11px] text-white/40">
              💰 {activeStory.rpConfig.currencyDecimals ? taskbarGold.toFixed(2) : Math.floor(taskbarGold)}
            </span>
          )}
          {activeStory?.rpMode && activeStory.rpConfig && taskbarTime && (
            <span className="shrink-0 text-[11px] text-white/30">
              {formatTimeCompact(taskbarTime)}
            </span>
          )}
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
              disabled={isReadOnly}
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
              disabled={isGenerating || isReadOnly}
              icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>}
            />
          )}
        </div>
      </div>

      <div ref={transcriptScrollRef} className="mt-4 min-h-0 flex-1 overflow-auto pr-1">
        {archiveMode ? (
          <StoryArchiveView
            storyId={activeStory.id}
            playerName={activePlayerCharacter?.name}
            relationshipsRefreshKey={relationshipsRefreshKey}
          />
        ) : messages.length ? (
          showChrome && !readerMode ? (
            <div className="space-y-1">
              {(() => {
                const nodes: React.ReactNode[] = [];

                for (const message of messages) {
                  if (streamingDraft !== null && message.role === "assistant" && message.id === latestAssistantMessage?.id) {
                    continue;
                  }

                  nodes.push(
                    <StoryMessageBubble
                      key={message.id}
                      message={message}
                      messages={messages}
                      playerCharacterName={activePlayerCharacter.name}
                      onEdit={populateComposerFromMessage}
                      onQuickEdit={isReadOnly ? undefined : handleOpenAssistantEdit}
                      onRegenerate={isReadOnly ? undefined : handleRegenerateLastAssistant}
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
              storyTitle={activeStory.title}
              chapters={storyChapters}
              highlightedMessageId={highlightedMessageId}
              rpConfig={activeStory.rpMode && activeStory.rpConfig ? activeStory.rpConfig : undefined}
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

      {streamingDraft !== null ? (
        <div className="mt-2 rounded-[10px] border border-divider/[0.35] bg-app-elevated px-3 py-3 opacity-80">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
            <span className="animate-pulse text-accent">●</span>
            {variantSession ? "Generating candidate…" : "Generating…"}
          </div>
          {streamingDraft ? (
            <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-soft">
              {streamingDraft}
            </div>
          ) : null}
        </div>
      ) : null}

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
                  disabled={isGenerating || isGeneratingAssist || isReadOnly}
                >
                  Undo
                </Button>
              </div>
            ) : null}
            {variantSession && variantSession.messageId === latestAssistantMessage.id && variantSession.candidates.length > 1 ? (
              <div className="mb-3 flex flex-col gap-3 rounded-[9px] border border-divider/[0.4] bg-panel-muted/50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-ink-muted">
                  Response{" "}
                  <span className="font-semibold text-ink-soft">
                    {variantSession.selectedIndex + 1} of {variantSession.candidates.length}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleSelectVariant(variantSession.selectedIndex - 1)}
                  disabled={isGenerating || isSwitchingVariant || isReadOnly || variantSession.selectedIndex === 0}
                  >
                    ← Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleSelectVariant(variantSession.selectedIndex + 1)}
                  disabled={isGenerating || isSwitchingVariant || isReadOnly || variantSession.selectedIndex === variantSession.candidates.length - 1}
                  >
                    Next →
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-ink-muted">Last AI message</div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  variant="secondary"
                  onClick={handleOpenAssistantEdit}
                  disabled={isGenerating || isGeneratingAssist || isReadOnly}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleRegenerateLastAssistant}
                  disabled={isGenerating || isGeneratingAssist || isReadOnly}
                >
                  Regenerate
                </Button>
              </div>
            </div>
          </Panel>
        ) : null
      )}

      {readerMode ? null : (
        <div ref={chatComposerRef}>
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
                  disabled={isGenerating || isGeneratingAssist || !lastChatContent || isReadOnly}
                >
                  Retry
                </Button>
              ) : null}
            </div>

            <Field label="Your Message">
              <TextAreaInput
                defaultHeightPx={220}
                minHeightPx={180}
                maxHeightPx={420}
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onFocus={handleChatInputFocus}
                onBlur={handleChatInputBlur}
                disabled={isReadOnly}
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
              <Button onClick={handleSendChat} disabled={isGenerating || diceStatLoading || isReadOnly}>
                {diceStatLoading ? "Selecting stat…" : isGenerating ? "Generating Scene..." : "Send"}
              </Button>
              {isGenerating ? (
                <Button variant="secondary" onClick={handleCancelGeneration}>
                  Cancel
                </Button>
              ) : null}
              <Button
                variant="secondary"
                onClick={handleGeneratePlayerAssist}
                disabled={isGenerating || isGeneratingAssist || isReadOnly}
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
        </div>
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
                        ? currentState.speakerType === "author"
                          ? "author"
                          : currentState.speakerType === "continue"
                            ? "continue"
                          : currentState.speakerType === "director"
                            ? "director"
                            : "player"
                        : role === "system"
                          ? "system"
                          : currentState.speakerType === "player" ||
                            currentState.speakerType === "author" ||
                              currentState.speakerType === "continue" ||
                              currentState.speakerType === "director" ||
                              currentState.speakerType === "system"
                            ? "canon"
                            : currentState.speakerType,
                    speakerName: role === "assistant" ? currentState.speakerName : "",
                  }));
                }}
                disabled={isReadOnly}
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
                disabled={composerState.role !== "assistant" || isReadOnly}
              >
                {composerState.role === "assistant" ? (
                  <>
                    <option value="canon">canon</option>
                    <option value="narrator">narrator</option>
                  </>
                ) : composerState.role === "system" ? (
                  <option value="system">system</option>
                ) : (
                  <>
                    <option value="player">player</option>
                    <option value="continue">continue</option>
                    <option value="director">director</option>
                    <option value="author">author</option>
                  </>
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
                disabled={isReadOnly}
                placeholder="Example: Jake Peralta"
              />
            </Field>
          ) : null}

          <Field label="Content">
            <TextAreaInput
              defaultHeightPx={260}
              minHeightPx={220}
              maxHeightPx={560}
              value={composerState.content}
              onChange={(event) =>
                setComposerState((currentState) => ({
                  ...currentState,
                  content: event.target.value,
                }))
              }
              disabled={isReadOnly}
              placeholder="Write the next user turn, narrator beat, canon line, or system note."
            />
          </Field>

          {pageError ? (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
              {pageError}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="submit" disabled={isSavingMessage || isReadOnly}>
              {isSavingMessage ? "Saving..." : editingMessage ? "Save Entry" : "Add Entry"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => applyComposerPreset("assistant", "narrator")}
              disabled={isReadOnly}
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
          refreshKey={rpStatsRefreshKey}
          onGoldChange={(g) => setTaskbarGold(g)}
          universeLore={activeUniverse?.description ?? undefined}
        />
      ) : null}

      {diceRollPending && (
        <DiceRollModal
          stat={diceRollPending.stat}
          modifier={diceRollPending.modifier}
          actionText={diceRollPending.resolvedMessage}
          onConfirm={handleDiceConfirm}
          onCancel={handleDiceCancel}
        />
      )}

      {storyId && relationshipsOpen ? (
        <RelationshipsOverlay
          open={relationshipsOpen}
          storyId={storyId}
          playerName={activePlayerCharacter?.name}
          universeImportedCharacters={activeStory?.universePackSnapshot?.universe?.importedCharacters}
          onClose={() => setRelationshipsOpen(false)}
          refreshKey={relationshipsRefreshKey}
          onRelationshipsChange={() => setRelationshipsRefreshKey((key) => key + 1)}
        />
      ) : null}

      {showLatestChapterJumpButton ? (
        <button
          type="button"
          onClick={handleJumpToLatestChapter}
          className={cn(
            "fixed left-4 z-40 rounded-full border border-accent/30 bg-app-elevated/95 px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft shadow-hero backdrop-blur-sm transition hover:border-accent hover:bg-accent/15 hover:text-ink lg:left-[282px]",
            audioPlayerVisible ? "bottom-40" : "bottom-12",
          )}
        >
          Jump to Latest Chapter
        </button>
      ) : null}

      {/* RP event toasts */}
      {rpToasts.length > 0 && (
        <div className="fixed bottom-20 right-4 z-50 flex flex-col-reverse gap-2 pointer-events-none">
          {rpToasts.map((toast) => (
            <div
              key={toast.id}
              className="pointer-events-auto flex items-start gap-2 rounded-[10px] border border-divider bg-panel px-3 py-2.5 shadow-lg max-w-xs"
            >
              <span className="mt-0.5 shrink-0 text-sm">🎲</span>
              <span className="text-xs text-ink-soft leading-relaxed flex-1">{toast.summary}</span>
              <button
                className="shrink-0 ml-1 text-ink-muted hover:text-ink transition"
                onClick={() => setRpToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
