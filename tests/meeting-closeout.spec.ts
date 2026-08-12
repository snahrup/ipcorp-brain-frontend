import { expect, type Page, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const corsHeaders = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

const meeting = {
  id: "today-fabric-review",
  title: "Fabric Delivery Review",
  start: "2026-08-04T14:00:00-04:00",
  end: "2026-08-04T14:30:00-04:00",
  organizer: "Patrick Stiller",
  attendees: ["Steve Nahrup", "Patrick Stiller"],
};

const closeoutPackage = {
  id: "2026-08-04-fabric-delivery-review",
  meeting,
  createdAt: "2026-08-04T18:45:00.000Z",
  source: "Cluely transcript supplied in Workbench",
  summary: "The team aligned on the Fabric delivery steps and follow-up work.",
  contextNotes: "Patrick Stiller asked for the workbook link.",
  commitments: [
    {
      text: "Steve: I will send the Fabric workbook to Patrick tomorrow.",
      evidence: "Steve: I will send the Fabric workbook to Patrick tomorrow.",
      status: "Review",
    },
  ],
  jiraProposals: [
    {
      operation: "Update",
      jiraKey: "MT-42",
      title: "Update MT-42 with the source mapping.",
      status: "Proposal only",
    },
  ],
  supportingMaterial: [
    {
      label: "Fabric delivery workbook",
      reference: "https://example.test/fabric-workbook",
      kind: "Related material",
    },
  ],
  documentRequests: [
    {
      text: "Send the Fabric workbook to Patrick Stiller.",
      status: "Review",
    },
  ],
  reminderCandidates: [
    {
      text: "Follow up tomorrow.",
      timing: "tomorrow",
      status: "Candidate",
    },
  ],
  emailDrafts: [
    {
      to: "Patrick Stiller",
      subject: "Fabric Delivery Review follow-up",
      body: "Patrick,\n\nHere is where the meeting landed.\n\nSteve",
      status: "Draft only",
    },
  ],
  infographic: {
    headline: "Fabric Delivery Review",
    subhead: "Meeting closeout",
    metrics: [
      { label: "Commitments", value: 1 },
      { label: "Jira changes", value: 1 },
      { label: "Document requests", value: 1 },
      { label: "Reminders", value: 1 },
    ],
    themes: ["Fabric", "Delivery", "Workbook"],
    nextMoves: ["Send the Fabric workbook."],
  },
  files: {
    transcript: "core/meetings/transcripts/cluely-export/2026-08-04-fabric-delivery-review.md",
    summary: "core/meetings/summaries/2026-08-04-fabric-delivery-review.md",
    infographic:
      "core/deliverables/meeting-closeouts/2026-08-04-fabric-delivery-review-infographic.html",
  },
  externalActions: {
    emailSent: false,
    jiraChanged: false,
  },
};

const emptyDailyPrep = {
  date: "2026-08-04",
  state: "empty",
  sourceLabel: "Prepared Brain files",
  updatedAt: "2026-08-04T08:00:00.000Z",
  reason: "No packages were generated for this date.",
  summary: { checked: 0, built: 0, skipped: 0, blocked: 0 },
  packages: [],
  skipped: [],
};

async function installCloseoutMock(page: Page, mode: "full" | "empty" | "refresh") {
  await page.addInitScript(
    ({ closeoutPackage, meeting, mode }) => {
      const originalFetch = window.fetch.bind(window);
      let calendarReleased = mode !== "refresh";
      let refreshCalls = 0;
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        });

      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

        if (url.endsWith("/api/meeting-closeout/packages")) {
          return json({ ok: true, data: [] });
        }

        if (url.includes("/api/meeting-closeout/today")) {
          if (mode === "empty") {
            return json({
              ok: true,
              data: {
                meetings: [],
                source: "microsoft_365",
                availability: "empty",
                detail: "Outlook returned no meetings for today.",
              },
            });
          }
          if (mode === "refresh" && calendarReleased) {
            refreshCalls += 1;
            const unavailable = refreshCalls === 1;
            return json({
              ok: true,
              data: {
                meetings: [],
                source: "brain_snapshot",
                availability: unavailable ? "unavailable" : "error",
                detail: unavailable
                  ? "Microsoft 365 is unavailable or not connected."
                  : "The calendar query failed.",
              },
            });
          }
          if (mode === "refresh") {
            await new Promise<void>((resolve) => {
              const release = (event: MessageEvent) => {
                if (event.data !== "release-meeting-calendar") return;
                window.removeEventListener("message", release);
                calendarReleased = true;
                resolve();
              };
              window.addEventListener("message", release);
            });
          }
          return json({
            ok: true,
            data: {
              meetings: [meeting],
              source: "microsoft_365",
              availability: "current",
            },
          });
        }

        if (url.endsWith("/api/meeting-closeout/process")) {
          const payload =
            typeof init?.body === "string"
              ? (JSON.parse(init.body) as { transcript?: string })
              : ({} as { transcript?: string });
          if (mode === "full" && payload.transcript) {
            return json({ ok: true, package: closeoutPackage });
          }
          return json({
            ok: false,
            code: "transcript_unavailable",
            error: "No Teams capture is available.",
          });
        }

        return originalFetch(input, init);
      };
    },
    { closeoutPackage, meeting, mode }
  );
}

test("meeting closeout follows the unavailable Teams capture path through review", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    if (request.url().includes("/api/meeting-closeout/")) requestFailures.push(request.url());
  });

  await installCloseoutMock(page, "full");

  await page.goto("/meetings/wrap-up", { waitUntil: "domcontentloaded" });

  await expect(page).toHaveURL(/\/meetings\/wrap-up$/);
  await expect(page.getByTestId("meeting-wrap-up-page")).toBeVisible();
  await expect(page.getByTestId("meeting-closeout-panel")).toBeVisible();
  await expect(page.locator(".mc-source")).toContainText("Microsoft 365");
  await expect(page.getByTestId("today-meeting-card")).toContainText("Fabric Delivery Review");

  await page.getByTestId("process-meeting-today-fabric-review").click();
  await expect(page.getByTestId("transcript-fallback")).toBeVisible();

  await page
    .getByTestId("cluely-transcript")
    .fill(
      "Steve: I will send the Fabric workbook to Patrick tomorrow. Patrick: Update MT-42 with the source mapping. Steve: Email Patrick with the recap."
    );
  await page.getByTestId("context-notes").fill("Patrick Stiller asked for the workbook link.");
  await page.getByTestId("process-pasted-transcript").click();

  await expect(page.getByTestId("meeting-closeout-review")).toBeVisible();
  await expect(page.getByTestId("meeting-infographic")).toContainText("Fabric Delivery Review");
  await expect(page.getByRole("heading", { name: "My commitments", exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Recommended Jira changes", exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Supporting material", exact: true })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Document requests", exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Reminder candidates", exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Draft email follow-ups", exact: true })
  ).toBeVisible();
  await expect(page.getByText("No email sent")).toBeVisible();
  await expect(page.getByText("No Jira changes")).toBeVisible();
  await expect(page.getByText("Saved meeting wrap-ups")).toBeVisible();
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(requestFailures).toEqual([]);
});

test("a transcript in hand goes in BEFORE Process, with no wasted Teams lookup", async ({
  page,
}) => {
  // Steve arrives holding the Cluely capture. The old sequence forced a
  // Process click, a minutes-long Teams lookup, and a failure before the
  // paste box appeared. Now the paste box opens directly from the meeting
  // card, and the only process call carries the transcript.
  await page.addInitScript(
    ({ closeoutPackage, meeting }) => {
      const originalFetch = window.fetch.bind(window);
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.endsWith("/api/meeting-closeout/packages")) return json({ ok: true, data: [] });
        if (url.includes("/api/meeting-closeout/today")) {
          return json({
            ok: true,
            data: { meetings: [meeting], source: "microsoft_365", availability: "current" },
          });
        }
        if (url.endsWith("/api/meeting-closeout/process")) {
          const payload =
            typeof init?.body === "string"
              ? (JSON.parse(init.body) as { transcript?: string })
              : ({} as { transcript?: string });
          if (!payload.transcript) {
            return json(
              { ok: false, error: "A transcript-less lookup ran; the shortcut regressed." },
              500
            );
          }
          return json({ ok: true, package: closeoutPackage });
        }
        return originalFetch(input, init);
      };
    },
    { closeoutPackage, meeting }
  );

  await page.goto("/meetings/wrap-up", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("today-meeting-card")).toContainText("Fabric Delivery Review");

  await page.getByTestId("add-transcript-today-fabric-review").click();
  await expect(page.getByTestId("transcript-fallback")).toBeVisible();

  await page
    .getByTestId("cluely-transcript")
    .fill("Steve: I will send the Fabric workbook to Patrick tomorrow.");
  await page.getByTestId("process-pasted-transcript").click();

  await expect(page.getByTestId("meeting-closeout-review")).toBeVisible();
  await expect(page.getByText("the shortcut regressed")).toHaveCount(0);
});

test("Meetings subpages are ordered and work as direct routes", async ({ page }) => {
  await installCloseoutMock(page, "empty");
  await page.route(/\/api\/meeting-prep\/daily(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      headers: corsHeaders,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: emptyDailyPrep }),
    });
  });
  await page.goto("/meetings");
  await expect(page.getByTestId("meetings-workspace")).toBeVisible();
  await expect(page.getByTestId("meeting-closeout-panel")).toHaveCount(0);

  const subpages = page.locator(".wb-nav-subitems .wb-nav-subitem");
  await expect(subpages).toHaveCount(3);
  await expect(subpages.nth(0).locator("span")).toHaveText("Meetings Overview");
  await expect(subpages.nth(1).locator("span")).toHaveText("Daily Prep");
  await expect(subpages.nth(2).locator("span")).toHaveText("Meeting Wrap-up");

  await page.goto("/meetings/daily-prep");
  await expect(page).toHaveURL(/\/meetings\/daily-prep$/);
  await expect(page.getByTestId("daily-meeting-prep-page")).toBeVisible();

  await page.goto("/meetings/wrap-up");
  await expect(page).toHaveURL(/\/meetings\/wrap-up$/);
  await expect(page.getByTestId("meeting-wrap-up-page")).toBeVisible();
  await expect(page.getByText("No meetings today.", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/unavailable or not connected/i)).toHaveCount(0);
});

test("calendar refresh warnings preserve a listed meeting and its process action", async ({
  page,
}) => {
  await installCloseoutMock(page, "refresh");

  await page.goto("/meetings/wrap-up", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Loading today's calendar…").first()).toBeVisible();
  await page.evaluate(() => window.postMessage("release-meeting-calendar", "*"));
  await expect(page.getByTestId("today-meeting-card")).toContainText("Fabric Delivery Review");

  await page.getByTestId("refresh-meetings").click();
  await expect(page.locator(".mc-notice")).toContainText(
    "Microsoft 365 is unavailable or not connected"
  );
  await expect(page.getByTestId("today-meeting-card")).toContainText("Fabric Delivery Review");
  await expect(page.getByTestId("process-meeting-today-fabric-review")).toBeEnabled();

  await page.getByTestId("refresh-meetings").click();
  await expect(page.locator(".mc-notice")).toContainText("calendar query failed");
  await expect(page.getByTestId("today-meeting-card")).toContainText("Fabric Delivery Review");
  await expect(page.getByTestId("process-meeting-today-fabric-review")).toBeEnabled();

  await page.getByTestId("process-meeting-today-fabric-review").click();
  await expect(page.getByTestId("transcript-fallback")).toBeVisible();
});
