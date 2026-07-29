import { expect, test } from "@playwright/test";
import { mockJira } from "./helpers/mock-jira";

const SENT = "You are completing a real work item for Steve Nahrup.";
const FIRST = "Read the description and the two linked issues before touching anything.";
const SECOND = "RESULT: DONE Wrote the access process document and linked it on the issue.";

/** A finished run carrying prose plus the tool noise that must never be shown. */
function run(state: "running" | "finished") {
  return {
    ok: true,
    data: {
      issueKey: "MT-42",
      agent: "claude",
      agentLabel: "Claude Code",
      state,
      startedAt: "2026-07-29T18:00:00.000Z",
      finishedAt: state === "finished" ? "2026-07-29T18:12:00.000Z" : null,
      verdict: state === "finished" ? "DONE" : null,
      note: state === "finished" ? "Wrote the document." : null,
      output: '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read"}]}}',
      messages: [
        { seq: 0, role: "sent", text: SENT, at: "2026-07-29T18:00:00.000Z" },
        { seq: 1, role: "agent", text: FIRST, at: "2026-07-29T18:02:00.000Z" },
        { seq: 2, role: "agent", text: SECOND, at: "2026-07-29T18:11:00.000Z" },
      ],
      exitCode: state === "finished" ? 0 : null,
      error: null,
    },
  };
}

async function openIssue(page, state: "running" | "finished") {
  await mockJira(page);
  await page.route("http://127.0.0.1:8817/api/agents/run**", async (route) => {
    await route.fulfill({ json: run(state) });
  });
  await page.goto("/");
  await page.getByTestId("nav-work").click();
  await page.getByRole("button", { name: /MT-42 Define governed customer domain/ }).click();
  return page.getByRole("dialog", { name: "Define governed customer domain" });
}

test.describe("Agent run conversation", () => {
  test("shows the messages inline and never the tool calls", async ({ page }) => {
    const dialog = await openIssue(page, "finished");

    const toggle = dialog.getByRole("button", { name: /Conversation/ });
    await expect(toggle).toBeVisible();
    await expect(toggle).toContainText("2 messages"); // the prompt is not counted as one

    // Collapsed by default once the run is over, so a read issue is not a wall of text.
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(dialog.getByText(FIRST)).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(dialog.getByText(FIRST)).toBeVisible();
    await expect(dialog.getByText(SECOND)).toBeVisible();
    await expect(dialog.getByText("Sent to the agent")).toBeVisible();
    await expect(dialog.getByText("Claude Code").first()).toBeVisible();

    // The raw stream holds a tool_use block. It must not reach the conversation view.
    await expect(dialog.getByText("tool_use")).toBeHidden();
  });

  test("opens itself and marks the run live while it is still working", async ({ page }) => {
    const dialog = await openIssue(page, "running");

    const toggle = dialog.getByRole("button", { name: /Conversation/ });
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(toggle).toContainText("Live");
    await expect(dialog.getByText(FIRST)).toBeVisible();
    await expect(dialog.getByText(/still working/)).toBeVisible();
  });
});
