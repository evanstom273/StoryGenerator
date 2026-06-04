import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { Field, SelectInput, TextAreaInput, TextInput } from "../components/forms/Fields";
import { PencilIcon } from "../components/icons";
import { StoryMessageBubble } from "../components/story/StoryMessageBubble";
import { StoryTranscriptView } from "../components/story/StoryTranscriptView";
import { Button, buttonClasses } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";
import { useUiPrefs } from "../app/ui/UiPrefsContext";
import { STORY_NAVIGATION_EVENT, type StoryNavigationDetail } from "../lib/events/storyNavigation";
import type {
  StoryMessage,
  StoryMessageRole,
  StoryMessageSpeakerType,
} from "../types/models";

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
    rightSidebarCollapsed,
    setRightSidebarCollapsed,
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
    getPlayerCharacterById,
    getStoryById,
    getUniverseById,
    generatePlayerAssistMessage,
    sendChatMessage,
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastChatContent, setLastChatContent] = useState<string | null>(null);
  const [isGeneratingAssist, setIsGeneratingAssist] = useState(false);
  const [assistError, setAssistError] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

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
    if (!readerMode) {
      return;
    }

    setManualMode(false);
    setEditingMessage(null);
  }, [readerMode]);

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
      setChatError(
        error instanceof Error ? error.message : "Unable to generate a response.",
      );
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
      setChatError(
        error instanceof Error ? error.message : "Unable to generate a response.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleGeneratePlayerAssist() {
    setIsGeneratingAssist(true);
    setAssistError(null);

    try {
      const suggestion = await generatePlayerAssistMessage(activeStory.id);
      setChatInput(suggestion);
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
    <div className="flex min-h-[72vh] flex-col">
      <div className="border-b border-white/8 pb-5">
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
          {activeUniverse.name} · {activePlayerCharacter.name}
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink">
          {activeStory.title}
        </h1>
        {readerMode ? null : (
          <div className="mt-3 text-sm leading-7 text-ink-muted">
            {activeStory.currentSummary || activeStory.openingPrompt}
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          {messages.length} entries
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setStorySettingsOpen(true)}
          >
            Settings
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setRightSidebarCollapsed(!rightSidebarCollapsed)}
          >
            {rightSidebarCollapsed ? "Show Sidebar" : "Hide Sidebar"}
          </Button>
          <Button
            size="sm"
            variant={showChrome ? "secondary" : "ghost"}
            onClick={() => setShowChrome(!showChrome)}
          >
            {showChrome ? "Hide Details" : "Details"}
          </Button>
          <Button
            size="sm"
            variant={readerMode ? "secondary" : "ghost"}
            onClick={() => setReaderMode(!readerMode)}
          >
            {readerMode ? "Exit Reader" : "Reader Mode"}
          </Button>
          {readerMode ? null : (
            <Button
              variant={manualMode ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setManualMode((current) => !current)}
              disabled={isGenerating}
            >
              <PencilIcon className="h-4 w-4" />
              {manualMode ? "Hide Manual" : "Manual Entry"}
            </Button>
          )}
        </div>
      </div>

        <div className="mt-4 min-h-0 flex-1 overflow-auto pr-1">
        {messages.length ? (
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

      {readerMode ? null : (
        <Panel className="mt-4" padding="sm">
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                  Chat
                </div>
                <div className="mt-2 text-lg font-semibold text-ink">
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
              <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
                {chatError}
              </div>
            ) : null}

            {assistError ? (
              <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
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
      <Panel className="mt-4" padding="sm">
        <form className="space-y-5" onSubmit={handleSubmitMessage}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                {editingMessage ? "Edit Entry" : "Add Entry"}
              </div>
              <div className="mt-2 text-lg font-semibold text-ink">
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
    </div>
  );
}
