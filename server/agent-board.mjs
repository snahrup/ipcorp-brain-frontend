/**
 * The Agent Board: a kanban the agent alone maintains, derived on every read
 * from the state its own pipelines already write. Nothing here is editable by
 * hand and nothing is stored for the board itself, so the board can never
 * disagree with reality: it IS the pipeline state, grouped into lanes.
 *
 * Its purpose is trust at a glance, so the rules are staleness rules. Work the
 * agent should have handled and has not goes amber then red on its own clock,
 * and a source that cannot be read is declared as a red card rather than
 * rendering an empty lane that looks healthy.
 */

const HOUR = 3_600_000;

function minutesBetween(now, iso) {
  const at = Date.parse(iso || "");
  if (!Number.isFinite(at)) return null;
  return Math.max(0, Math.round((now.getTime() - at) / 60_000));
}

function ageLabel(now, iso) {
  const minutes = minutesBetween(now, iso);
  if (minutes === null) return "";
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function localDayOf(iso) {
  const at = Date.parse(iso || "");
  if (!Number.isFinite(at)) return null;
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toneByAge(now, iso, amberAfterMs, redAfterMs) {
  const at = Date.parse(iso || "");
  if (!Number.isFinite(at)) return "ok";
  const age = now.getTime() - at;
  if (age >= redAfterMs) return "red";
  if (age >= amberAfterMs) return "amber";
  return "ok";
}

// Calendar markers carry no conversation and are never the agent's work.
function isCalendarMarker(title) {
  const value = String(title || "").trim();
  return /^reminder\b/i.test(value) || /-\s*WFH$/i.test(value) || /\bWFH\b/i.test(value);
}

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function card(entry) {
  return { meta: [], detail: "", ...entry };
}

export function buildAgentBoard(inputs) {
  const now = inputs.now instanceof Date ? inputs.now : new Date(inputs.now);
  const today = localDayOf(now.toISOString());

  const sources = [];
  const watching = [];
  const working = [];
  const waiting = [];
  const delivered = [];

  const sourceStatus = (id, label, input) => {
    const ok = Boolean(input?.ok);
    sources.push({
      id,
      label,
      ok,
      detail: ok ? "" : String(input?.error || `The ${label} state could not be read.`),
    });
    if (!ok) {
      watching.push(
        card({
          id: `source-${id}`,
          kind: "source-error",
          title: `${label} is unreadable`,
          detail: String(
            input?.error || "The source could not be read. Nothing is shown in its place."
          ),
          at: now.toISOString(),
          age: "",
          tone: "red",
        })
      );
    }
    return ok;
  };

  const calendarOk = sourceStatus("calendar", "Calendar", inputs.calendar);
  const packagesOk = sourceStatus("packages", "Meeting packages", inputs.packages);
  const activityOk = sourceStatus("activity", "Reconciliation state", inputs.activityState);
  const agentRunsOk = sourceStatus("agent-runs", "Ticket agents", inputs.agentRuns);

  const packages = packagesOk ? inputs.packages.items || [] : [];
  const packagesByTitle = new Map(
    packages.map((item) => [normalizeTitle(item.meeting?.title), item])
  );

  // --- Meetings: watching until they end, waiting when ended with no package.
  if (calendarOk) {
    if (inputs.calendar.availability === "loading") {
      watching.push(
        card({
          id: "calendar-loading",
          kind: "calendar",
          title: "Outlook calendar read is running",
          detail: "Today's list fills in when it lands.",
          at: now.toISOString(),
          age: "",
          tone: "ok",
        })
      );
    }
    for (const meeting of inputs.calendar.meetings || []) {
      if (isCalendarMarker(meeting.title)) continue;
      const stored = packagesByTitle.get(normalizeTitle(meeting.title));
      if (stored) continue; // it shows in Delivered via the package itself
      const ended = Date.parse(meeting.end || "") < now.getTime();
      if (!ended) {
        watching.push(
          card({
            id: `meeting-${meeting.id}`,
            kind: "meeting",
            title: meeting.title,
            detail: "On today's calendar. Processing starts once a capture exists.",
            at: meeting.start,
            age: "",
            tone: "ok",
          })
        );
      } else {
        waiting.push(
          card({
            id: `meeting-${meeting.id}`,
            kind: "meeting-capture",
            title: meeting.title,
            detail: "Ended with no capture stored. Paste the Cluely transcript to process it.",
            at: meeting.end,
            age: ageLabel(now, meeting.end),
            tone: toneByAge(now, meeting.end, 1 * HOUR, 3 * HOUR),
          })
        );
      }
    }
  }

  // --- Stored packages: delivered today, and their promises wait until old.
  for (const item of packages) {
    const createdDay = localDayOf(item.createdAt);
    if (createdDay === today) {
      const infographic = item.infographic?.saved?.file ? "infographic rendered" : "no infographic";
      delivered.push(
        card({
          id: `package-${item.id}`,
          kind: "meeting-package",
          title: item.meeting?.title || item.id,
          detail: `Package stored, ${infographic}.`,
          at: item.createdAt,
          age: ageLabel(now, item.createdAt),
          tone: "ok",
          meta: [`${(item.commitments || []).length} commitments`],
        })
      );
    }

    // Promises extracted from the meeting stay visible until they are old
    // news; the agent cannot verify delivery yet, so honesty is age, not a
    // checkmark. Three days is the visibility window.
    const ageMs = now.getTime() - (Date.parse(item.createdAt || "") || now.getTime());
    if (ageMs <= 3 * 24 * HOUR) {
      for (const [index, commitment] of (item.commitments || []).entries()) {
        const packageDay = localDayOf(item.createdAt);
        const tone = packageDay === today ? "ok" : ageMs <= 2 * 24 * HOUR ? "amber" : "red";
        waiting.push(
          card({
            id: `commitment-${item.id}-${index}`,
            kind: "commitment",
            title: commitment.text,
            detail: commitment.due ? `Due: ${commitment.due}` : "No stated date.",
            at: item.createdAt,
            age: ageLabel(now, item.createdAt),
            tone,
            meta: [item.meeting?.title || item.id],
          })
        );
      }
    }
  }

  // --- Reconciliation runs.
  if (activityOk) {
    const state = inputs.activityState.state || {};
    const runs = Array.isArray(state.runs) ? state.runs : [];
    const latest = runs[runs.length - 1] || null;
    const receipts = state.applyReceipts || {};
    const applied = new Set();
    for (const receipt of Object.values(receipts)) {
      if (receipt?.status === "complete") {
        for (const id of receipt.proposalIds || []) applied.add(id);
      }
    }

    for (const run of runs) {
      const isRunning = run.status === "running" || (!run.finishedAt && run.startedAt);
      if (isRunning) {
        const phase = run.phase?.label || "running";
        const progress =
          run.phase?.index && run.phase?.total
            ? ` (step ${run.phase.index}/${run.phase.total})`
            : "";
        working.push(
          card({
            id: `activity-${run.id}`,
            kind: "activity-run",
            title: "Activity reconciliation",
            detail: `${phase}${progress}`,
            at: run.lastActivityAt || run.startedAt,
            age: ageLabel(now, run.lastActivityAt || run.startedAt),
            tone: toneByAge(now, run.lastActivityAt || run.startedAt, 10 * 60_000, 30 * 60_000),
          })
        );
      } else if (localDayOf(run.finishedAt) === today) {
        const counts = run.counts || {};
        delivered.push(
          card({
            id: `activity-${run.id}`,
            kind: "activity-run",
            title: `Reconciliation ${String(run.status || "").replace(/_/g, " ")}`,
            detail: `${counts.changed ?? 0} changed items, ${counts.jiraProposals ?? 0} proposals, ${counts.emailDrafts ?? 0} drafts.`,
            at: run.finishedAt,
            age: ageLabel(now, run.finishedAt),
            tone: run.status === "failed" ? "red" : "ok",
          })
        );
      }
    }

    if (latest && latest.finishedAt) {
      for (const proposal of latest.jiraProposals || []) {
        if (applied.has(proposal.id)) continue;
        waiting.push(
          card({
            id: `proposal-${proposal.id}`,
            kind: "jira-proposal",
            title: proposal.title || "Jira proposal",
            detail: `Pending review: ${proposal.actionLabel || "change"}.`,
            at: latest.finishedAt,
            age: ageLabel(now, latest.finishedAt),
            // Reviewing a proposal takes minutes. Four quiet hours is a nudge;
            // a full day of sitting means the pipeline's output is being ignored.
            tone: toneByAge(now, latest.finishedAt, 4 * HOUR, 24 * HOUR),
            meta: proposal.issueKey ? [proposal.issueKey] : [],
          })
        );
      }
      for (const draft of latest.emailDrafts || []) {
        const outlookStatus = draft.outlook?.status || "";
        const deliveredToOutlook = outlookStatus === "created" || outlookStatus === "delivered";
        if (deliveredToOutlook) continue;
        const failed = outlookStatus === "failed";
        waiting.push(
          card({
            id: `draft-${draft.id}`,
            kind: "email-draft",
            title: `Draft to ${draft.to || "recipient"}: ${draft.subject || ""}`,
            detail: failed
              ? `Delivery to Outlook failed: ${draft.outlook?.detail || "no detail"}`
              : "Sitting outside Outlook. Deliver or discard it.",
            at: latest.finishedAt,
            age: ageLabel(now, latest.finishedAt),
            tone: failed ? "red" : toneByAge(now, latest.finishedAt, 4 * HOUR, 24 * HOUR),
          })
        );
      }
    }

    for (const receipt of Object.values(receipts)) {
      if (receipt?.status === "complete" && localDayOf(receipt.finishedAt) === today) {
        delivered.push(
          card({
            id: `receipt-${receipt.id}`,
            kind: "jira-apply",
            title: `Applied ${(receipt.proposalIds || []).length} Jira change${(receipt.proposalIds || []).length === 1 ? "" : "s"}`,
            detail: "Approved proposals written to the board with readback checks.",
            at: receipt.finishedAt,
            age: ageLabel(now, receipt.finishedAt),
            tone: "ok",
          })
        );
      }
    }
  }

  // --- Dispatched ticket agents.
  if (agentRunsOk) {
    for (const run of inputs.agentRuns.items || []) {
      if (run.state === "running") {
        working.push(
          card({
            id: `agent-${run.issueKey}`,
            kind: "ticket-agent",
            title: `${run.agentLabel || run.agent || "Agent"} working ${run.issueKey}`,
            detail: "Headless run against the live issue.",
            at: run.startedAt,
            age: ageLabel(now, run.startedAt),
            tone: toneByAge(now, run.startedAt, 20 * 60_000, 45 * 60_000),
          })
        );
      } else if (localDayOf(run.finishedAt) === today) {
        delivered.push(
          card({
            id: `agent-${run.issueKey}-${run.finishedAt}`,
            kind: "ticket-agent",
            title: `${run.issueKey}: ${run.verdict || run.state}`,
            detail: run.note || "Outcome written back to the issue.",
            at: run.finishedAt,
            age: ageLabel(now, run.finishedAt),
            tone: run.verdict === "blocked" ? "amber" : "ok",
          })
        );
      }
    }
  }

  const byRecency = (a, b) => (Date.parse(b.at || "") || 0) - (Date.parse(a.at || "") || 0);
  const toneRank = { red: 0, amber: 1, ok: 2 };
  const byUrgency = (a, b) => (toneRank[a.tone] ?? 3) - (toneRank[b.tone] ?? 3) || byRecency(a, b);

  return {
    generatedAt: now.toISOString(),
    date: today,
    sources,
    lanes: [
      {
        id: "watching",
        label: "Watching",
        helper: "Signals on the agent's radar",
        cards: watching.sort(byRecency),
      },
      {
        id: "working",
        label: "Working now",
        helper: "Runs executing this minute",
        cards: working.sort(byUrgency),
      },
      {
        id: "waiting",
        label: "Waiting on Steve",
        helper: "Approvals, pastes, promises",
        cards: waiting.sort(byUrgency),
      },
      {
        id: "delivered",
        label: "Delivered today",
        helper: "Finished with evidence",
        cards: delivered.sort(byRecency),
      },
    ],
  };
}
