import { expect, test } from "@playwright/test";
import {
  resolveDestination,
  serializeDestinations,
  WORKBENCH_DESTINATIONS,
  WORKBENCH_VIEW_KEYS,
} from "../src/features/workbench-agent/destinations";
import { getPendingReviewCards } from "../src/features/workbench-agent/reviewQueue";
import { getSectionTargetCandidates } from "../src/features/workbench-agent/sectionTargeting";
import { classifyControl, isStaleActionKey } from "../src/features/workbench-agent/semanticActions";
import {
  normalizeConfirmPayload,
  normalizeStatusPayload,
} from "../src/features/workbench-agent/stream";
import type { ViewKey } from "../src/lib/search";

const expectedViews: ViewKey[] = [
  "today",
  "work",
  "library",
  "data-work",
  "connections",
  "readiness",
  "meetings",
  "daily-prep",
  "meeting-wrap-up",
  "workshops",
  "timeline",
  "packets",
  "insights",
  "actions",
  "questions",
  "risks",
  "decisions",
  "sources",
];

test.describe("workbench agent registry", () => {
  test("covers every current Workbench view", () => {
    expect(WORKBENCH_VIEW_KEYS.sort()).toEqual([...expectedViews].sort());
    for (const view of expectedViews) {
      expect(WORKBENCH_DESTINATIONS[view].sections.length).toBeGreaterThan(0);
    }
  });

  test("resolves registered destinations and rejects unknown locations", () => {
    expect(resolveDestination({ view: "meetings", section: "meeting-calendar" })?.label).toContain(
      "Meeting calendar"
    );
    expect(resolveDestination({ view: "today", section: "missing" })).toBeNull();
    expect(resolveDestination({ view: "not-real" as ViewKey })).toBeNull();
  });

  test("serializes only page and section labels for the service", () => {
    const serialized = serializeDestinations();
    expect(serialized).toHaveLength(expectedViews.length);
    expect(serialized.find((item) => item.view === "work")?.sections[0]).toEqual(
      expect.objectContaining({ key: expect.any(String), label: expect.any(String) })
    );
  });

  test("classifies page controls by safety", () => {
    expect(classifyControl({ tagName: "button", label: "Open linked packet" })).toEqual({
      kind: "disclose",
      safety: "immediate",
    });
    expect(classifyControl({ tagName: "input", label: "Search" })).toEqual({
      kind: "fill",
      safety: "notice",
    });
    expect(classifyControl({ tagName: "button", label: "Send update" })).toEqual({
      kind: "send",
      safety: "confirm",
    });
    expect(classifyControl({ tagName: "button", label: "Delete package" })).toEqual({
      kind: "delete",
      safety: "confirm",
    });
    expect(classifyControl({ tagName: "button", label: "Run helper" })).toEqual({
      kind: "apply",
      safety: "confirm",
    });
    expect(classifyControl({ tagName: "button", role: "tab", label: "List" })).toEqual({
      kind: "disclose",
      safety: "immediate",
    });
    expect(classifyControl({ tagName: "input", type: "checkbox", label: "Done" })).toEqual({
      kind: "disclose",
      safety: "immediate",
    });
    expect(classifyControl({ tagName: "input", type: "radio", label: "Choice" })).toEqual({
      kind: "disclose",
      safety: "immediate",
    });
  });

  test("flags stale action keys", () => {
    const actions = [
      {
        key: "fresh",
        view: "today" as ViewKey,
        role: "button",
        label: "Open",
        kind: "disclose" as const,
        safety: "immediate" as const,
        disabled: false,
      },
    ];
    expect(isStaleActionKey(actions, "fresh")).toBe(false);
    expect(isStaleActionKey(actions, "old")).toBe(true);
  });

  test("extracts confirmed page-action commands from new and compatibility payloads", () => {
    expect(
      normalizeConfirmPayload({
        ok: true,
        data: {
          command: {
            name: "workbench.page-action",
            args: { actionKey: "opaque-current" },
          },
        },
      }).data.command
    ).toEqual({
      name: "workbench.page-action",
      mode: undefined,
      args: { actionKey: "opaque-current", value: undefined },
    });

    expect(
      normalizeConfirmPayload({
        ok: true,
        data: {
          receipt: {
            id: "r1",
            title: "Ready",
            detail: "Run it",
            data: {
              mode: "ui-command",
              command: { args: { actionKey: "opaque-compat" } },
            },
          },
        },
      }).data.command
    ).toEqual({
      name: undefined,
      mode: undefined,
      args: { actionKey: "opaque-compat", value: undefined },
    });
  });

  test("normalizes connector status without raw service fields", () => {
    const snapshot = normalizeStatusPayload({
      ok: true,
      data: {
        checkedAt: "2026-08-06T12:00:00.000Z",
        connectors: {
          jira: { state: "connected", detail: "Live issue reads ready", secret: "hidden" },
          m365: { state: "degraded", message: "Mail read limited" },
          devspace: { state: "nope", debug: { raw: true } },
          sql: { state: "available", detail: "Five sources" },
          powerbi: { state: "pending", detail: "Connection check pending" },
        },
      },
    });

    expect(snapshot.connectors.find((item) => item.id === "jira")).toEqual({
      id: "jira",
      label: "Jira",
      status: "ready",
      detail: "Live issue reads ready",
      checkedAt: "2026-08-06T12:00:00.000Z",
    });
    expect(snapshot.connectors.find((item) => item.id === "microsoft365")).toEqual(
      expect.objectContaining({ status: "limited", detail: "Mail read limited" })
    );
    expect(snapshot.connectors.find((item) => item.id === "workbench")).toEqual(
      expect.objectContaining({
        status: "unavailable",
        detail: "Status was not reported by the service.",
      })
    );
    expect(snapshot.connectors.find((item) => item.id === "sql")).toEqual(
      expect.objectContaining({ status: "ready", detail: "Five sources" })
    );
    expect(snapshot.connectors.find((item) => item.id === "powerbi")).toEqual(
      expect.objectContaining({ status: "checking" })
    );
    expect(JSON.stringify(snapshot)).not.toContain("hidden");
    expect(JSON.stringify(snapshot)).not.toContain("debug");
  });

  test("review queue dedupes cards and removes attempted reviews", () => {
    const messages = [
      {
        id: "m1",
        role: "agent" as const,
        content: "First",
        createdAt: 1,
        reviewCards: [
          {
            id: "r1",
            title: "Review action",
            summary: "Check this",
            risk: "medium" as const,
          },
          {
            id: "r2",
            title: "Review save",
            summary: "Check this too",
            risk: "low" as const,
          },
        ],
      },
      {
        id: "m2",
        role: "agent" as const,
        content: "Second",
        createdAt: 2,
        reviewCards: [
          {
            id: "r1",
            title: "Duplicate review",
            summary: "Should not appear twice",
            risk: "medium" as const,
          },
        ],
      },
    ];

    expect(getPendingReviewCards(messages, new Set()).map((review) => review.id)).toEqual([
      "r1",
      "r2",
    ]);
    expect(getPendingReviewCards(messages, new Set(["r1"])).map((review) => review.id)).toEqual([
      "r2",
    ]);
  });

  test("builds section target candidates for semantic markers", () => {
    expect(getSectionTargetCandidates("review-queue", "Review queue")).toEqual([
      "Review queue",
      "review-queue",
      "review queue",
      "review_queue",
    ]);
    expect(getSectionTargetCandidates("packet-list", "Packet list")).toContain("packet-list");
    expect(getSectionTargetCandidates("meeting-calendar", "Meeting calendar")).toContain(
      "Meeting calendar"
    );
    expect(
      getSectionTargetCandidates("brain-explorer-route", "Trace the context behind a decision.")
    ).toContain("Trace the context behind a decision");
  });
});
