// Foreman Briefing e2e: spec checks 4 through 7 from
// docs/brainstorm/2026-08-17-foreman-briefing-spec.md, run against a fixture
// briefing so no gateway (and nothing external) is involved. Run with:
//   npx playwright test --config playwright.foreman.config.ts
import { expect, type Page, test } from "@playwright/test";

const FIXTURE_RUN = {
  runId: "2026-08-18",
  date: "2026-08-18",
  generatedAt: "2026-08-18T12:00:00Z",
  sources: {
    jira: { status: "ok", observedAt: "2026-08-18T12:00:00Z", detail: null },
    reconciliation: {
      status: "partial",
      observedAt: "2026-08-15T09:00:00Z",
      detail: "Last good run is 3 days old",
    },
  },
  counts: { upFirst: 3, waiting: 2, open: 7 },
  closeOut: { answered: 1, unanswered: 1, verbs: { approve: 1 } },
  changes: [{ key: "MT-9", summary: "Review returned with comments", status: "In Review" }],
  items: [
    {
      id: "MT-1",
      kind: "start-work",
      hash: "a1",
      summary: "Overdue architecture recommendation",
      dueDate: "2026-08-17",
      priority: "Priority 2",
      sourceRefs: ["MT-1"],
    },
    {
      id: "MT-2",
      kind: "estimate",
      hash: "b2",
      summary: "Ownership list needs a ballpark",
      dueDate: "2026-08-19",
      priority: "Priority 3",
      sourceRefs: ["MT-2"],
    },
    {
      id: "MT-3",
      kind: "start-work",
      hash: "c3",
      summary: "Third thing without a date",
      dueDate: null,
      priority: null,
      sourceRefs: ["MT-3"],
    },
  ],
  parked: [{ id: "MT-8", returnAt: "2026-08-19", wakeOnActivity: true }],
  suppressed: [{ id: "MT-7", reason: "answered-unchanged" }],
  exclusions: [],
  receipts: [],
};

type Counters = { answers: number; otherPosts: number };

async function openBriefing(page: Page, counters: Counters) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = request.url();
    if (url.includes("/api/foreman/briefing") && request.method() === "GET") {
      await route.fulfill({ json: { ok: true, data: FIXTURE_RUN } });
      return;
    }
    if (url.includes("/api/foreman/answer") && request.method() === "POST") {
      counters.answers += 1;
      const body = request.postDataJSON() as {
        itemId: string;
        verb: string;
        ballpark?: string;
      };
      const run = structuredClone(FIXTURE_RUN) as typeof FIXTURE_RUN & {
        items: Array<(typeof FIXTURE_RUN)["items"][number] & { answer?: object }>;
        receipts: Array<object>;
      };
      const item = run.items.find((entry) => entry.id === body.itemId);
      if (item) {
        item.answer = {
          verb: body.verb,
          at: "2026-08-18T13:00:00Z",
          ...(body.ballpark ? { ballpark: body.ballpark } : {}),
        };
      }
      run.receipts = [
        { at: "2026-08-18T13:00:00Z", itemId: body.itemId, verb: body.verb, routedTo: "local-run" },
      ];
      await route.fulfill({ json: { ok: true, data: run } });
      return;
    }
    if (request.method() === "POST") {
      counters.otherPosts += 1;
    }
    await route.fulfill({ json: { ok: true, data: null } });
  });
  await page.goto("/briefing?briefing=1");
  await expect(page.getByTestId("fb-arrival")).toBeVisible();
}

function dispatchWheel(page: Page) {
  return page.evaluate(() => {
    window.dispatchEvent(new WheelEvent("wheel", { deltaY: 240, bubbles: true }));
  });
}

test("check 4: arrival renders the fixture snapshot counts, not invented ones", async ({
  page,
}) => {
  const counters: Counters = { answers: 0, otherPosts: 0 };
  await openBriefing(page, counters);
  const counts = page.getByTestId("fb-counts");
  await expect(counts).toContainText("3 need you.");
  await expect(counts).toContainText("2 waiting on you.");
  await expect(counts).toContainText("7 open in MT.");
});

test("check 5: wheel and arrows fire zero mutations; verbs fire exactly one each", async ({
  page,
}) => {
  const counters: Counters = { answers: 0, otherPosts: 0 };
  await openBriefing(page, counters);

  // Navigate the whole journey with wheel and arrows only.
  await page.getByTestId("fb-begin").click();
  await expect(page.getByTestId("fb-orientation")).toBeVisible();
  await dispatchWheel(page);
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("fb-changes")).toBeVisible();
  await dispatchWheel(page);
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("fb-item")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("fb-day-plan")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("fb-clear")).toBeVisible();
  expect(counters.answers).toBe(0);
  expect(counters.otherPosts).toBe(0);

  // A verb is a real mutation: exactly one request per press.
  await page.keyboard.press("Escape");
  await page.getByTestId("fb-begin-item-1").click();
  await expect(page.getByTestId("fb-item")).toContainText("Overdue architecture recommendation");
  await page.getByTestId("fb-verb-approve").click();
  await expect(page.getByTestId("fb-item")).toContainText("Ownership list needs a ballpark");
  expect(counters.answers).toBe(1);
  await page.getByTestId("fb-ballpark-30m").click();
  await expect(page.getByTestId("fb-item")).toContainText("Third thing without a date");
  expect(counters.answers).toBe(2);
  expect(counters.otherPosts).toBe(0);
});

test("check 6: Esc reaches the quick brief, and a reload resumes the same item", async ({
  page,
}) => {
  const counters: Counters = { answers: 0, otherPosts: 0 };
  await openBriefing(page, counters);
  await page.getByTestId("fb-begin").click();
  await page.getByTestId("fb-continue").click();
  await page.getByTestId("fb-continue").click();
  await expect(page.getByTestId("fb-item")).toContainText("Overdue architecture recommendation");
  await page.getByTestId("fb-skip").click();
  await expect(page.getByTestId("fb-item")).toContainText("Ownership list needs a ballpark");

  await page.reload();
  await expect(page.getByTestId("fb-item")).toContainText("Ownership list needs a ballpark");

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("fb-quick-brief")).toBeVisible();
  await page.getByTestId("fb-resume").click();
  await expect(page.getByTestId("fb-item")).toContainText("Ownership list needs a ballpark");
});

test("check 7: the quick brief is one interaction away from every stage", async ({ page }) => {
  const counters: Counters = { answers: 0, otherPosts: 0 };
  await openBriefing(page, counters);

  const stages = [
    "fb-arrival",
    "fb-orientation",
    "fb-changes",
    "fb-item",
    "fb-day-plan",
    "fb-clear",
  ];
  for (const stage of stages) {
    await expect(page.getByTestId(stage)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("fb-quick-brief")).toBeVisible();
    await page.getByTestId("fb-resume").click();
    await expect(page.getByTestId(stage)).toBeVisible();
    if (stage === "fb-item") {
      // Walk through all three items to the next chapter.
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
    } else if (stage !== "fb-clear") {
      await page.keyboard.press("ArrowRight");
    }
  }
  expect(counters.answers).toBe(0);
});
