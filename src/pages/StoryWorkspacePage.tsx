import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { Field, SelectInput, TextAreaInput, TextInput } from "../components/forms/Fields";
import {
  DownloadIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "../components/icons";
import { StoryMessageBubble } from "../components/story/StoryMessageBubble";
import { Button, buttonClasses } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { useStoryEngine } from "../app/providers/StoryEngineProvider";
import { downloadFile } from "../lib/download";
import { serializeStoryExport } from "../lib/storyExport";
import type {
  ExportFormat,
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

function createExportFilename(title: string, format: ExportFormat) {
  const sanitizedTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const extension = format === "json" ? "json" : format === "markdown" ? "md" : "txt";
  return `${sanitizedTitle || "story-engine-story"}.${extension}`;
}

export function StoryWorkspacePage() {
  const { storyId } = useParams();
  const navigate = useNavigate();
  const {
    createMessage,
    deleteMessage,
    deleteStory,
    exportStory,
    getMessagesForStory,
    getPlayerCharacterById,
    getStoryById,
    getUniverseById,
    updateMessage,
    updateStory,
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
  const [storyFields, setStoryFields] = useState({
    title: story?.title ?? "",
    openingPrompt: story?.openingPrompt ?? "",
    currentSummary: story?.currentSummary ?? "",
  });
  const [composerState, setComposerState] = useState(initialComposerState);
  const [editingMessage, setEditingMessage] = useState<StoryMessage | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [isSavingStory, setIsSavingStory] = useState(false);
  const [isSavingMessage, setIsSavingMessage] = useState(false);

  useEffect(() => {
    if (!story) {
      return;
    }

    setStoryFields({
      title: story.title,
      openingPrompt: story.openingPrompt,
      currentSummary: story.currentSummary,
    });
  }, [story]);

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

  async function handleSaveStoryDetails(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!storyFields.title.trim()) {
      setPageError("Story title is required.");
      return;
    }

    if (!storyFields.openingPrompt.trim()) {
      setPageError("Opening prompt is required.");
      return;
    }

    setIsSavingStory(true);
    setPageError(null);

    try {
      await updateStory(activeStory.id, storyFields);
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Unable to save story details.",
      );
    } finally {
      setIsSavingStory(false);
    }
  }

  async function handleDeleteStory() {
    const confirmed = window.confirm(
      "Delete this story and every stored message in its timeline?",
    );

    if (!confirmed) {
      return;
    }

    await deleteStory(activeStory.id);
    navigate("/stories");
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

  async function handleExport(format: ExportFormat) {
    const bundle = await exportStory(activeStory.id);

    if (!bundle) {
      setPageError("Unable to assemble export data for this story.");
      return;
    }

    const { content, mimeType } = serializeStoryExport(bundle, format);
    downloadFile(
      createExportFilename(activeStory.title, format),
      content,
      mimeType,
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Story Workspace"
        title={activeStory.title}
        description="This screen holds story metadata, the full timeline of messages, and export actions for local story ownership."
      />

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Panel>
            <form className="space-y-5" onSubmit={handleSaveStoryDetails}>
              <Field label="Story Title">
                <TextInput
                  value={storyFields.title}
                  onChange={(event) =>
                    setStoryFields((currentState) => ({
                      ...currentState,
                      title: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Universe">
                <TextInput value={activeUniverse.name} readOnly />
              </Field>
              <Field label="Player Character">
                <TextInput value={activePlayerCharacter.name} readOnly />
              </Field>
              <Field label="Opening Prompt">
                <TextAreaInput
                  value={storyFields.openingPrompt}
                  onChange={(event) =>
                    setStoryFields((currentState) => ({
                      ...currentState,
                      openingPrompt: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Current Summary">
                <TextAreaInput
                  value={storyFields.currentSummary}
                  onChange={(event) =>
                    setStoryFields((currentState) => ({
                      ...currentState,
                      currentSummary: event.target.value,
                    }))
                  }
                  placeholder="Optional summary for the current state of the story."
                />
              </Field>
              <Button type="submit" className="w-full" disabled={isSavingStory}>
                {isSavingStory ? "Saving..." : "Save Story Details"}
              </Button>
            </form>
          </Panel>

          <Panel>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
              Export Story
            </div>
            <div className="mt-4 space-y-3">
              <Button
                variant="secondary"
                className="w-full justify-start rounded-2xl"
                onClick={() => handleExport("json")}
              >
                <DownloadIcon className="h-4 w-4" />
                Export JSON
              </Button>
              <Button
                variant="secondary"
                className="w-full justify-start rounded-2xl"
                onClick={() => handleExport("markdown")}
              >
                <DownloadIcon className="h-4 w-4" />
                Export Markdown
              </Button>
              <Button
                variant="secondary"
                className="w-full justify-start rounded-2xl"
                onClick={() => handleExport("txt")}
              >
                <DownloadIcon className="h-4 w-4" />
                Export TXT
              </Button>
            </div>
          </Panel>

          <Panel>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
              Story Controls
            </div>
            <div className="mt-4 flex flex-col gap-3">
              <Link
                to="/stories"
                className={buttonClasses({ variant: "ghost", size: "sm" })}
              >
                Back to Stories
              </Link>
              <Button variant="ghost" size="sm" onClick={handleDeleteStory}>
                <TrashIcon className="h-4 w-4" />
                Delete Story
              </Button>
            </div>
          </Panel>
        </div>

        <div className="flex min-h-[70vh] flex-col gap-4">
          <Panel>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
              Opening Context
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-ink-soft">
              {activeStory.openingPrompt}
            </p>
          </Panel>

          <Panel className="flex-1">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                  Conversation Timeline
                </div>
                <div className="mt-2 text-lg font-semibold text-ink">
                  {messages.length} stored entries
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => applyComposerPreset("user")}
                >
                  <PlusIcon className="h-4 w-4" />
                  User Turn
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => applyComposerPreset("assistant", "canon")}
                >
                  <PencilIcon className="h-4 w-4" />
                  Canon Line
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => applyComposerPreset("assistant", "narrator")}
                >
                  <PencilIcon className="h-4 w-4" />
                  Narrator Beat
                </Button>
              </div>
            </div>

            {messages.length ? (
              <div className="mt-6 space-y-4">
                {messages.map((message) => (
                  <StoryMessageBubble
                    key={message.id}
                    message={message}
                    playerCharacterName={activePlayerCharacter.name}
                    onEdit={populateComposerFromMessage}
                    onDelete={handleDeleteMessage}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-6">
                <EmptyState
                  title="No timeline entries yet"
                  description="Add user turns, canon character lines, narrator beats, or system notes to test the story workspace before AI integration arrives."
                />
              </div>
            )}
          </Panel>

          <Panel className="sticky bottom-4">
            <form className="space-y-5" onSubmit={handleSubmitMessage}>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
                    {editingMessage ? "Edit Timeline Entry" : "Add Timeline Entry"}
                  </div>
                  <div className="mt-2 text-lg font-semibold text-ink">
                    Manual mixed timeline mode
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
                    Cancel Edit
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
                        speakerName:
                          event.target.value === "canon" ? currentState.speakerName : "",
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

              {composerState.role === "assistant" &&
              composerState.speakerType === "canon" ? (
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
                  {isSavingMessage
                    ? "Saving..."
                    : editingMessage
                      ? "Save Entry"
                      : "Add Entry"}
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
        </div>
      </div>
    </div>
  );
}
