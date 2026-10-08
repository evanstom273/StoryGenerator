// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MetaChatProvider } from "../MetaChatProvider";
import { MetaChatPage } from "../../../pages/MetaChatPage";
import {
  setup,
  resetDatabase,
  universe,
  character,
  story,
  otherStory,
  generator,
} from "./fixtures";
import { MarkdownText } from "../../../components/ui/MarkdownText";

vi.mock("../../../app/providers/StoryEngineProvider", () => ({
  useStoryEngine: () => ({
    stories: [story, otherStory],
    universes: [universe],
    playerCharacters: [character],
    refreshLibrary: vi.fn(),
  }),
}));
beforeEach(resetDatabase);
afterEach(cleanup);
async function mount(storyId?: string) {
  const environment = await setup();
  render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: "/metachat",
          state: storyId ? { initialStoryId: storyId } : undefined,
        },
      ]}
    >
      <MetaChatProvider service={environment.service}>
        <MetaChatPage />
      </MetaChatProvider>
    </MemoryRouter>,
  );
  await waitFor(() =>
    expect(screen.queryByText("Loading conversations…")).toBeNull(),
  );
  return environment;
}
describe("MetaChat shell integration", () => {
  it("opens from home as an empty workspace and connects send/history/edit to the service", async () => {
    const { repository } = await mount();
    expect(await repository.list()).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("MetaChat message"), {
      target: { value: "Hello Doctor" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText("Oh, he knows exactly what he's doing 😂");
    expect((await repository.list())[0].messages).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Edit and resend" }));
    fireEvent.change(screen.getByLabelText("MetaChat message"), {
      target: { value: "Actually, Jamie" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Resend edited message" }),
    );
    await waitFor(async () =>
      expect((await repository.list())[0].messages[0].content).toBe(
        "Actually, Jamie",
      ),
    );
    await waitFor(() => expect(screen.queryByText("Thinking…")).toBeNull());
    const saved = (await repository.list())[0];
    expect(saved.messages).toHaveLength(2);
    expect(saved.revisions).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "+ New chat" }));
    expect(screen.queryAllByLabelText("assistant message")).toHaveLength(0);
    expect(await repository.list()).toHaveLength(1);
  });
  it("attaches the viewed story, adds/removes mixed attachments without autofocus", async () => {
    await mount("blue");
    expect(screen.getByTitle("Remove attachment").textContent).toContain(
      "The Blue Box",
    );
    fireEvent.click(screen.getByLabelText("Attach StoryEngine content"));
    expect(document.activeElement).not.toBe(
      screen.getByLabelText("Search attachments"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Jamie character" }));
    await waitFor(() =>
      expect(screen.getAllByTitle("Remove attachment")).toHaveLength(2),
    );
    fireEvent.click(screen.getAllByTitle("Remove attachment")[0]);
    await waitFor(() =>
      expect(screen.getAllByTitle("Remove attachment")).toHaveLength(1),
    );
  });
  it("does not delete a conversation before confirmation", async () => {
    const { repository } = await mount();
    fireEvent.change(screen.getByLabelText("MetaChat message"), {
      target: { value: "Keep this chat" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText("Oh, he knows exactly what he's doing 😂");
    fireEvent.click(
      screen.getByRole("button", { name: "Delete Keep this chat" }),
    );
    expect(await repository.list()).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Cancel", exact: true }),
    );
    expect(await repository.list()).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Delete Keep this chat" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Delete conversation", exact: true }),
    );
    await waitFor(async () => expect(await repository.list()).toHaveLength(0));
  });
  it("requires the UI confirmation control for model-proposed mutations", async () => {
    const { service, resources } = await setup({
      ...generator,
      generate: async () => ({
        reply: "Review below",
        actions: [
          {
            kind: "universe",
            operation: "create",
            summary: "Create Skaro",
            draft: { name: "Skaro" },
          },
        ],
      }),
    });
    render(
      <MemoryRouter>
        <MetaChatProvider service={service}>
          <MetaChatPage />
        </MetaChatProvider>
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.queryByText("Loading conversations…")).toBeNull(),
    );
    fireEvent.change(screen.getByLabelText("MetaChat message"), {
      target: { value: "Create Skaro" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByRole("button", { name: "Confirm changes" });
    expect(await resources.listUniverses()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Confirm changes" }));
    await waitFor(async () =>
      expect(await resources.listUniverses()).toHaveLength(2),
    );
    await screen.findByText("1 of 1 library changes applied.", {
      exact: false,
    });
  });
  it("renders provider markdown without script, event handlers or remote images", () => {
    const { container } = render(
      <MarkdownText
        text={
          '**Doctor** <img src="https://example.test/track" onerror="alert(1)"><script>alert(2)</script>[bad](javascript:alert(3))'
        }
      />,
    );
    expect(container.querySelector("strong")?.textContent).toBe("Doctor");
    expect(
      container.querySelector("img,script,[onerror],[href^='javascript:']"),
    ).toBeNull();
  });
});
