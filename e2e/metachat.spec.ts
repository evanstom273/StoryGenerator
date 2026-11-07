import { test, expect, type Page } from "@playwright/test";

async function seed(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    // Vite's development modules let this test exercise the production repositories.
    const fixturePath = "/src/features/metachat/__tests__/fixtures.ts";
    const versionPath = "/src/app/versioning/version.ts";
    const fixtures = await import(/* @vite-ignore */ fixturePath);
    const version = await import(/* @vite-ignore */ versionPath);
    await fixtures.resetDatabase();
    const repository = await fixtures.seed();
    await repository.saveAISettings({
      id: "ai-settings",
      activeProviderType: "gemini",
      apiKeys: { gemini: "test-key" },
      defaultModels: { gemini: "director-only-model" },
      metachatModels: { gemini: "gemini-2.5-flash" },
      createdAt: fixtures.now,
      updatedAt: fixtures.now,
    });
    localStorage.setItem("story-engine:welcome:dismissed", "1");
    localStorage.setItem(
      "story-engine:changelog:last-viewed",
      version.APP_VERSION,
    );
  });
  await page.reload();
  await page.waitForTimeout(1600);
}
async function history(page: Page) {
  const button = page.getByRole("button", {
    name: "Conversation history",
    exact: true,
  });
  if (await button.isVisible()) await button.click();
}
async function contained(page: Page) {
  const dimensions = await page.evaluate(() => ({
    width: window.innerWidth,
    docWidth: document.documentElement.scrollWidth,
    height: window.innerHeight,
    docHeight: document.documentElement.scrollHeight,
    footer: document.querySelector("footer")?.getBoundingClientRect().bottom,
  }));
  expect(dimensions.docWidth).toBeLessThanOrEqual(dimensions.width);
  expect(dimensions.docHeight).toBeLessThanOrEqual(dimensions.height + 1);
  expect(dimensions.footer).toBeLessThanOrEqual(dimensions.height + 1);
}

test("real shell persists, edits and reviews library changes while remaining contained", async ({
  page,
}, testInfo) => {
  const requests: { url: string; body: string }[] = [];
  await page.route("**/generativelanguage.googleapis.com/**", async (route) => {
    const body = route.request().postData() ?? "";
    requests.push({ url: route.request().url(), body });
    const actions = body.includes("Create a library universe called Skaro")
      ? [
          {
            kind: "universe",
            operation: "create",
            summary: "Create Skaro",
            draft: {
              name: "Skaro",
              description: "The Dalek homeworld",
              mode: "custom",
            },
          },
        ]
      : [];
    const reply = actions.length
      ? "Review Skaro before adding it."
      : "Oh, the Doctor knows exactly what he's doing 😂\n\n" +
        "An extraordinarily long word: " +
        "Gallifrey".repeat(100);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify({ reply, actions }) }],
              role: "model",
            },
            finishReason: "STOP",
          },
        ],
      }),
    });
  });
  await seed(page);
  await page
    .getByRole("button", { name: "Open MetaChat", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "MetaChat", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  await contained(page);
  await page
    .getByLabel("MetaChat message", { exact: true })
    .fill("So... The Doctor, eh? 🤣");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByLabel("assistant message", { exact: true }),
  ).toContainText("the Doctor knows");
  expect(requests[0].url).toContain("gemini-2.5-flash");
  expect(requests[0].body).not.toContain("director-only-model");
  expect(requests[0].body).not.toContain("pockets the broken compass");
  await contained(page);
  await page.getByLabel("Attach StoryEngine content").click();
  await expect(page.getByLabel("Search attachments")).not.toBeFocused();
  await page.getByRole("button", { name: "The Blue Box story" }).click();
  await expect(page.getByTitle("Remove attachment")).toContainText(
    "The Blue Box",
  );
  await page
    .getByRole("button", { name: "Edit and resend", exact: true })
    .click();
  await page
    .getByLabel("MetaChat message", { exact: true })
    .fill("Why did Jamie react like that?");
  await page
    .getByRole("button", { name: "Resend edited message", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Send message", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("assistant message", { exact: true }),
  ).toHaveCount(1);
  expect(requests[1].body).toContain("trust damaged");
  await page.reload();
  await page.waitForTimeout(1600);
  await history(page);
  await page
    .getByRole("button", { name: "So... The Doctor, eh? 🤣", exact: true })
    .last()
    .click();
  await expect(page.getByLabel("user message", { exact: true })).toContainText(
    "Why did Jamie react",
  );
  await page
    .getByLabel("MetaChat message", { exact: true })
    .fill("Create a library universe called Skaro");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Confirm changes", exact: true }),
  ).toBeVisible();
  const names = () =>
    page.evaluate(async () => {
      const path = "/src/lib/repository.ts";
      const { storyEngineRepository } = await import(/* @vite-ignore */ path);
      return (await storyEngineRepository.listUniverses()).map(
        (item: { name: string }) => item.name,
      );
    });
  expect(await names()).not.toContain("Skaro");
  await page
    .getByRole("button", { name: "Confirm changes", exact: true })
    .click();
  await expect(
    page.getByLabel("system message", { exact: true }),
  ).toContainText("1 of 1 library changes applied");
  expect(await names()).toContain("Skaro");
  await contained(page);
  await page.screenshot({ path: testInfo.outputPath("metachat.png") });
  await page
    .getByRole("button", { name: "Return to previous page", exact: true })
    .click();
  await expect(page).toHaveURL("http://127.0.0.1:5173/");
  await page
    .getByRole("button", { name: "Open MetaChat", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "MetaChat", exact: true }),
  ).toBeVisible();
  await contained(page);
});

test("opening from a story attaches it and the robot returns to the same story", async ({
  page,
}) => {
  await seed(page);
  await page.goto("/stories/blue");
  await page.waitForTimeout(1600);
  const widthBefore = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  await page
    .getByRole("button", { name: "Open MetaChat", exact: true })
    .click();
  await expect(page.getByTitle("Remove attachment")).toContainText(
    "The Blue Box",
  );
  await expect(page.getByRole("article")).toHaveCount(0);
  await contained(page);
  await page
    .getByRole("button", { name: "Return to previous page", exact: true })
    .click();
  await expect(page).toHaveURL(/\/stories\/blue$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    widthBefore,
  );
});
