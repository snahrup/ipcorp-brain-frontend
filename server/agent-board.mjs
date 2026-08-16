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
 *
 * Every card also carries what it points at, so a tap lands on the real thing
 * instead of sending Steve digging through Jira for the issue a line mentions.
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

/**
 * What a card points at. Type is one of:
 *   jira         an issue on the board; href is its browse link
 *   meeting      a calendar event; no page exists for it, so the card opens its own detail
 *   deliverable  a file the gateway can serve; href is that route
 *   receipt      a stored pipeline record: a run, a recommended change, an apply
 *   none         nothing to point at, so the card is never rendered as a link
 *
 * href stays null whenever no link can be built from what is actually known.
 * A guessed link is worse than no link, so nothing here invents one.
 */
const NO_REFERENCE = { type: "none", id: "", label: "", href: null };
const JIRA_KEY = /^[A-Z][A-Z0-9]+-\d+$/;

function reference(type, id, label, href = null) {
  const identifier = String(id ?? "").trim();
  if (!identifier) return null;
  return { type, id: identifier, label: String(label || identifier), href: href || null };
}

function jiraReference(baseUrl, key, label) {
  const issueKey = String(key ?? "")
    .trim()
    .toUpperCase();
  if (!JIRA_KEY.test(issueKey)) return null;
  const base = String(baseUrl || "").replace(/\/+$/, "");
  // No base URL means the credential store is unreadable right now. The key is
  // still true, so the card keeps it and opens its detail instead of a link.
  return reference("jira", issueKey, label || issueKey, base ? `${base}/browse/${issueKey}` : null);
}

// Evidence lines are facts already in hand. Blanks are dropped rather than
// padded, so an empty list means the card genuinely knows nothing more.
function facts(...entries) {
  return entries.map((value) => String(value ?? "").trim()).filter(Boolean);
}

function card(entry) {
  const merged = { meta: [], detail: "", why: "", evidence: [], ...entry };
  const pointer = merged.reference;
  merged.reference =
    pointer?.type && pointer.type !== "none" ? { href: null, ...pointer } : { ...NO_REFERENCE };
  merged.evidence = facts(...(merged.evidence || []));
  return merged;
}

export function buildAgentBoard(inputs) {
  const now = inputs.now instanceof Date ? inputs.now : new Date(inputs.now);
  const today = localDayOf(now.toISOString());
  const jiraBaseUrl = String(inputs.jiraBaseUrl || "").replace(/\/+$/, "");

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
          why: "The source failed to read, so the board says so instead of showing an empty lane that looks healthy.",
          evidence: facts(`Source: ${label}`, input?.error),
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
  const brainCompletionsOk = sourceStatus(
    "brain-completions",
    "Verified meeting infographics",
    inputs.brainCompletions
  );

  const packages = packagesOk ? inputs.packages.items || [] : [];
  const brainCompletions = brainCompletionsOk ? inputs.brainCompletions.items || [] : [];
  const packagesByMeetingIdentity = new Map(
    packages
      .filter((item) => item.meeting?.id)
      .map((item) => [
        `${String(item.meeting.id)}|${localDayOf(item.meeting?.start || item.createdAt)}`,
        item,
      ])
  );
  const packagesByTitleAndDay = new Map(
    packages.map((item) => [
      `${normalizeTitle(item.meeting?.title)}|${localDayOf(item.meeting?.start || item.createdAt)}`,
      item,
    ])
  );
  const packageIdsDeliveredToday = new Set(
    packages.filter((item) => localDayOf(item.createdAt) === today).map((item) => item.id)
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
          why: "The read is still in flight, so today's meetings are not all here yet.",
          at: now.toISOString(),
          age: "",
          tone: "ok",
        })
      );
    }
    for (const meeting of inputs.calendar.meetings || []) {
      if (isCalendarMarker(meeting.title)) continue;
      const meetingDay = localDayOf(meeting.start || meeting.end);
      const stored =
        packagesByMeetingIdentity.get(`${String(meeting.id)}|${meetingDay}`) ||
        packagesByTitleAndDay.get(`${normalizeTitle(meeting.title)}|${meetingDay}`);
      if (stored) continue; // it shows in Delivered via the package itself
      const ended = Date.parse(meeting.end || "") < now.getTime();
      // A calendar event has no page to open, so the reference carries the
      // event identity and the card opens its own detail.
      const meetingReference = reference("meeting", meeting.id, meeting.title);
      const meetingFacts = facts(
        `Calendar id: ${meeting.id}`,
        meeting.start && `Starts: ${meeting.start}`,
        meeting.end && `Ends: ${meeting.end}`,
        meeting.organizer && `Organizer: ${meeting.organizer}`
      );
      if (!ended) {
        watching.push(
          card({
            id: `meeting-${meeting.id}`,
            kind: "meeting",
            title: meeting.title,
            detail: "On today's calendar. Processing starts once a capture exists.",
            why: "It is on today's calendar and has not ended yet.",
            evidence: meetingFacts,
            reference: meetingReference,
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
            why: "It ended and no capture is stored, so nothing can be processed until one arrives.",
            evidence: meetingFacts,
            reference: meetingReference,
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
    const verified = item.infographic?.verified;
    // There is no local placeholder. Only a Codex or NotebookLM artifact with
    // source IDs, an artifact ID, a verified hash, and a readable PNG is linked.
    const packageReference =
      verified?.id && verified?.file
        ? reference(
            "deliverable",
            item.id,
            "Open the meeting infographic",
            `/api/meetings/infographic?id=${encodeURIComponent(verified.id)}&file=${encodeURIComponent(verified.file)}`
          )
        : reference("deliverable", item.id, item.meeting?.title || item.id);
    if (createdDay === today) {
      const warningCount = Number(verified?.warningCount || 0);
      const infographic = verified?.file
        ? warningCount
          ? `infographic verified with ${warningCount} review note${warningCount === 1 ? "" : "s"}`
          : "infographic verified"
        : "final infographic still pending";
      delivered.push(
        card({
          id: `package-${item.id}`,
          kind: "meeting-package",
          title: item.meeting?.title || item.id,
          detail: `Package stored, ${infographic}.`,
          why: "The package was stored today with its files written.",
          evidence: facts(
            `Package: ${item.id}`,
            item.files?.summary && `Summary: ${item.files.summary}`,
            item.files?.transcript && `Transcript: ${item.files.transcript}`,
            verified?.path && `Infographic: ${verified.path}`,
            verified?.artifactId && `Artifact: ${verified.artifactId}`,
            verified?.sourceIds?.length && `Sources: ${verified.sourceIds.length}`
          ),
          reference: packageReference,
          at: item.createdAt,
          age: ageLabel(now, item.createdAt),
          tone: verified?.file && warningCount === 0 ? "ok" : "amber",
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
            why: "You promised it in this meeting and the agent cannot verify delivery, so it stays visible for three days.",
            evidence: facts(
              `From: ${item.meeting?.title || item.id}`,
              `Package: ${item.id}`,
              commitment.due && `Due: ${commitment.due}`,
              commitment.status && `Status: ${commitment.status}`
            ),
            // A promise has no page of its own. It points back at the meeting
            // it was made in.
            reference: reference("meeting", item.id, item.meeting?.title || item.id),
            at: item.createdAt,
            age: ageLabel(now, item.createdAt),
            tone,
            meta: [item.meeting?.title || item.id],
          })
        );
      }
    }
  }

  // --- Verified scheduled meeting work that did not originate in Workbench.
  // This is what makes a completed background pass visible on Today instead of
  // leaving Steve to infer it from a Brain commit.
  for (const completion of brainCompletions) {
    if (
      packageIdsDeliveredToday.has(completion.id) ||
      localDayOf(completion.generatedAt) !== today
    ) {
      continue;
    }
    const warningCount = Number(completion.warningCount || 0);
    delivered.push(
      card({
        id: `brain-infographic-${completion.id}`,
        kind: "meeting-infographic",
        title: completion.title || completion.id,
        detail: warningCount
          ? `Infographic generated with ${warningCount} recorded review note${warningCount === 1 ? "" : "s"}.`
          : "Infographic generated and verified.",
        why: "The scheduled Brain pass finished this meeting artifact today and recorded its proof.",
        evidence: facts(
          `Artifact: ${completion.artifactId}`,
          `Sources: ${(completion.sourceIds || []).length}`,
          completion.path && `Infographic: ${completion.path}`,
          completion.sha256 && `SHA-256: ${completion.sha256}`
        ),
        reference: reference(
          "deliverable",
          completion.id,
          "Open the meeting infographic",
          `/api/meetings/infographic?id=${encodeURIComponent(completion.id)}&file=${encodeURIComponent(completion.file)}`
        ),
        at: completion.generatedAt,
        age: ageLabel(now, completion.generatedAt),
        tone: warningCount ? "amber" : "ok",
        meta: [`${(completion.sourceIds || []).length} sources`],
      })
    );
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
            why: "The run is executing right now. It turns amber after ten quiet minutes and red after thirty.",
            evidence: facts(
              `Run: ${run.id}`,
              run.startedAt && `Started: ${run.startedAt}`,
              run.lastActivityAt && `Last progress: ${run.lastActivityAt}`,
              `Phase: ${phase}${progress}`
            ),
            reference: reference("receipt", run.id, "Activity reconciliation run"),
            at: run.lastActivityAt || run.startedAt,
            age: ageLabel(now, run.lastActivityAt || run.startedAt),
            tone: toneByAge(now, run.lastActivityAt || run.startedAt, 10 * 60_000, 30 * 60_000),
          })
        );
      } else if (localDayOf(run.finishedAt) === today) {
        const counts = run.counts || {};
        const meetingFacts = (run.meetings || []).map(
          (meeting) =>
            `${meeting.title || meeting.id}: ${String(meeting.status || "unknown").replace(/_/g, " ")}`
        );
        delivered.push(
          card({
            id: `activity-${run.id}`,
            kind: "activity-run",
            title: `Reconciliation ${String(run.status || "").replace(/_/g, " ")}`,
            detail: `${(counts.new ?? 0) + (counts.changed ?? 0)} new or changed items, ${counts.meetingsProcessed ?? 0} meeting package${counts.meetingsProcessed === 1 ? "" : "s"} processed, ${counts.jiraProposals ?? 0} recommended Jira changes, ${counts.emailDrafts ?? 0} drafts, ${counts.failures ?? 0} failures.`,
            why: "The run finished today, so its output is on the board with the rest of today's work.",
            evidence: facts(
              `Run: ${run.id}`,
              run.startedAt && `Started: ${run.startedAt}`,
              run.finishedAt && `Finished: ${run.finishedAt}`,
              `Status: ${String(run.status || "unknown").replace(/_/g, " ")}`,
              ...meetingFacts
            ),
            reference: reference("receipt", run.id, "Activity reconciliation run"),
            at: run.finishedAt,
            age: ageLabel(now, run.finishedAt),
            tone:
              run.status === "failed"
                ? "red"
                : run.status === "partial_success" || (counts.failures ?? 0) > 0
                  ? "amber"
                  : "ok",
          })
        );
      }
    }

    if (latest?.finishedAt) {
      for (const proposal of latest.jiraProposals || []) {
        if (applied.has(proposal.id)) continue;
        waiting.push(
          card({
            id: `proposal-${proposal.id}`,
            kind: "recommended-change",
            title: proposal.title || "Recommended Jira change",
            detail: `Pending review: ${proposal.actionLabel || "change"}.`,
            why: "The agent recommends this Jira change and nothing is written until you approve it.",
            evidence: facts(
              `Recommended change: ${proposal.id}`,
              proposal.issueKey && `Issue: ${proposal.issueKey}`,
              `Run: ${latest.id}`,
              proposal.actionLabel && `Action: ${proposal.actionLabel}`,
              proposal.reason && `Reason: ${proposal.reason}`
            ),
            // A change against an existing issue opens that issue. A new issue
            // has no key yet, so the card opens its own detail.
            reference:
              jiraReference(jiraBaseUrl, proposal.issueKey) ||
              reference("receipt", proposal.id, "Recommended Jira change"),
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
            why: failed
              ? "Outlook refused the draft, so it is here rather than in your mailbox."
              : "The draft exists in the run and has not reached Outlook yet.",
            evidence: facts(
              `Draft: ${draft.id}`,
              draft.to && `To: ${draft.to}`,
              draft.subject && `Subject: ${draft.subject}`,
              `Run: ${latest.id}`,
              draft.outlook?.status && `Outlook: ${draft.outlook.status}`,
              draft.outlook?.detail
            ),
            reference: reference("receipt", draft.id, "Email draft"),
            at: latest.finishedAt,
            age: ageLabel(now, latest.finishedAt),
            tone: failed ? "red" : toneByAge(now, latest.finishedAt, 4 * HOUR, 24 * HOUR),
          })
        );
      }
    }

    for (const receipt of Object.values(receipts)) {
      // The store writes completedAt; finishedAt was the name this file read
      // for, which kept every applied-change card off the board.
      const receiptAt = receipt?.completedAt || receipt?.finishedAt;
      if (receipt?.status === "complete" && localDayOf(receiptAt) === today) {
        const appliedKeys = [
          ...new Set(
            (receipt.results || [])
              .map((result) => String(result?.receipt?.issueKey || "").toUpperCase())
              .filter((key) => JIRA_KEY.test(key))
          ),
        ];
        delivered.push(
          card({
            id: `receipt-${receipt.id}`,
            kind: "jira-apply",
            title: `Applied ${(receipt.proposalIds || []).length} Jira change${(receipt.proposalIds || []).length === 1 ? "" : "s"}`,
            detail: "Approved changes written to the board with readback checks.",
            why: "You approved these changes and the apply finished today with a readback on each one.",
            evidence: facts(
              `Receipt: ${receipt.id}`,
              receipt.runId && `Run: ${receipt.runId}`,
              appliedKeys.length ? `Issues: ${appliedKeys.join(", ")}` : "",
              receiptAt && `Completed: ${receiptAt}`
            ),
            // One issue opens that issue. Several have no single target, so
            // the card opens its own detail with every key listed.
            reference:
              (appliedKeys.length === 1 ? jiraReference(jiraBaseUrl, appliedKeys[0]) : null) ||
              reference("receipt", receipt.id, "Jira apply receipt"),
            at: receiptAt,
            age: ageLabel(now, receiptAt),
            tone: "ok",
            meta: appliedKeys,
          })
        );
      }
    }
  }

  // --- Dispatched ticket agents.
  if (agentRunsOk) {
    for (const run of inputs.agentRuns.items || []) {
      // The whole run exists to change one issue, so the issue is the target.
      const agentReference =
        jiraReference(jiraBaseUrl, run.issueKey) ||
        reference("receipt", run.issueKey, "Ticket agent run");
      if (run.state === "running") {
        working.push(
          card({
            id: `agent-${run.issueKey}`,
            kind: "ticket-agent",
            title: `${run.agentLabel || run.agent || "Agent"} working ${run.issueKey}`,
            detail: "Headless run against the live issue.",
            why: "A headless run is working this issue right now.",
            evidence: facts(
              run.issueKey && `Issue: ${run.issueKey}`,
              `Agent: ${run.agentLabel || run.agent || "unnamed"}`,
              run.startedAt && `Started: ${run.startedAt}`,
              run.lastAction && `Last action: ${run.lastAction}`
            ),
            reference: agentReference,
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
            why: "The run finished today and wrote its outcome back to the issue.",
            evidence: facts(
              run.issueKey && `Issue: ${run.issueKey}`,
              `Agent: ${run.agentLabel || run.agent || "unnamed"}`,
              run.finishedAt && `Finished: ${run.finishedAt}`,
              run.verdict && `Verdict: ${run.verdict}`,
              run.note
            ),
            reference: agentReference,
            at: run.finishedAt,
            age: ageLabel(now, run.finishedAt),
            tone: String(run.verdict || "").toUpperCase() === "BLOCKED" ? "amber" : "ok",
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
