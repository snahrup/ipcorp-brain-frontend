import { createHash, randomUUID } from "node:crypto";
import { classifyEvidence, normalizeEvidence, normalizeSourceState } from "./evidence.mjs";
import { buildJiraReview, proposalConfirmation } from "./jira-proposals.mjs";

export const ACTIVITY_SOURCES = Object.freeze([
  { id: "outlook_received", label: "Outlook received" },
  { id: "outlook_replied", label: "Outlook replied" },
  { id: "outlook_sent", label: "Outlook sent" },
  { id: "teams_channel_messages", label: "Teams channels" },
  { id: "teams_group_messages", label: "Teams group chats" },
  { id: "teams_direct_messages", label: "Teams direct messages" },
  { id: "teams_meeting_transcripts", label: "Ready meeting transcripts" },
  { id: "brain_updates", label: "Brain updates" },
]);

const ACTIVE_STATES = new Set(["running", "stopping"]);
const RESUMABLE_STATES = new Set(["interrupted", "canceled"]);
const SOURCE_SUCCESS = new Set(["current", "empty"]);
const RUN_PHASES = Object.freeze([
  { id: "preparing", label: "Preparing the scan window" },
  { id: "reading_sources", label: "Reading source activity" },
  { id: "classifying_evidence", label: "Classifying new and changed evidence" },
  { id: "processing_meetings", label: "Checking completed meetings" },
  { id: "generating_visuals", label: "Completing meeting packages and visuals" },
  { id: "matching_jira", label: "Matching evidence to Jira work" },
  { id: "preparing_proposals", label: "Preparing reviewable proposals" },
  { id: "mdm_check", label: "Checking Jira against the Brain" },
  { id: "finalizing", label: "Saving the recap" },
]);

function clone(value) {
  return structuredClone(value);
}

function sha(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function asIso(clock) {
  const value = typeof clock === "function" ? clock() : new Date();
  const parsed = value instanceof Date ? value : new Date(value);
  return parsed.toISOString();
}

function subtractMinutes(iso, minutes) {
  return new Date(new Date(iso).getTime() - minutes * 60_000).toISOString();
}

function subtractDays(iso, days) {
  return new Date(new Date(iso).getTime() - days * 86_400_000).toISOString();
}

function confirmedThroughFor(sourceResult, window, complete) {
  const candidate = sourceResult.confirmedThrough || (complete ? window?.to : null);
  if (!candidate || !window?.from || !window?.to) return null;
  const value = new Date(candidate).getTime();
  const lower = new Date(window.from).getTime();
  const upper = new Date(window.to).getTime();
  if (![value, lower, upper].every(Number.isFinite) || value < lower) return null;
  return new Date(Math.min(value, upper)).toISOString();
}

function evidenceInsideWindow(record, window) {
  if (!window?.from || !window?.to) return true;
  const upper = new Date(window.to).getTime();
  const lower = new Date(window.from).getTime();
  const lateLower = new Date(window.lateSweepFrom || window.from).getTime();
  const eventAt = record.eventAt ? new Date(record.eventAt).getTime() : null;
  const updatedAt = record.updatedAt ? new Date(record.updatedAt).getTime() : null;
  if (eventAt !== null && eventAt > upper) return false;
  if (updatedAt !== null && updatedAt > upper) return false;
  if (eventAt === null && updatedAt === null) return true;
  if (updatedAt !== null && updatedAt >= lower) return true;
  return eventAt !== null && eventAt >= lateLower;
}

function errorDetail(error) {
  return error instanceof Error ? error.message : String(error || "Unknown error");
}

function activityError(code, message, status = 400, details) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  if (details !== undefined) error.details = details;
  return error;
}

function findRun(state, runId) {
  return state.runs.find((run) => run.id === runId) || null;
}

function trimRuns(runs) {
  return runs.slice(-30);
}

function addEvent(run, type, detail, at) {
  run.events = [
    ...(run.events || []),
    { id: randomUUID(), at, type, detail: String(detail || "").slice(0, 500) },
  ].slice(-300);
  run.lastActivityAt = at;
  run.activity = String(detail || "").slice(0, 240);
}

function sourceWindows(state, startedAt) {
  const baselineFrom = "2026-01-01T00:00:00.000Z";
  return Object.fromEntries(
    ACTIVITY_SOURCES.map((source) => {
      const position = state.sourcePositions[source.id]?.completedThrough || null;
      return [
        source.id,
        {
          from: position ? subtractMinutes(position, 15) : baselineFrom,
          to: startedAt,
          lateSweepFrom: position ? subtractDays(startedAt, 7) : baselineFrom,
          overlapMinutes: position ? 15 : 0,
          previousPosition: position,
        },
      ];
    })
  );
}

function initialSources() {
  return Object.fromEntries(
    ACTIVITY_SOURCES.map((source) => [
      source.id,
      {
        id: source.id,
        label: source.label,
        state: "loading",
        itemCount: 0,
        changedCount: 0,
        unchangedCount: 0,
        detail: "Waiting to read this source.",
        startedAt: null,
        finishedAt: null,
        confirmedThrough: null,
      },
    ])
  );
}

function newRun(state, startedAt) {
  const baseline = !ACTIVITY_SOURCES.some(
    (source) => state.sourcePositions[source.id]?.completedThrough
  );
  return {
    id: `activity-${startedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`,
    status: "running",
    baseline,
    startedAt,
    finishedAt: null,
    lastActivityAt: startedAt,
    resumedAt: null,
    resumeCount: 0,
    cancelRequested: false,
    resumable: true,
    phase: { ...RUN_PHASES[0], index: 1, total: RUN_PHASES.length, startedAt },
    activity: RUN_PHASES[0].label,
    windows: sourceWindows(state, startedAt),
    sources: initialSources(),
    counts: {
      observed: 0,
      new: 0,
      changed: 0,
      unchanged: 0,
      jiraProposals: 0,
      emailDrafts: 0,
      meetingsProcessed: 0,
      meetingsPending: 0,
      failures: 0,
    },
    evidence: [],
    associations: [],
    jiraProposals: [],
    emailDrafts: [],
    meetings: [],
    skipped: [],
    actualChanges: [],
    recap: null,
    reviewError: null,
    mdmCheck: null,
    events: [],
  };
}

function refreshCounts(run) {
  const sources = Object.values(run.sources || {});
  run.counts.observed = sources.reduce((sum, item) => sum + (item.itemCount || 0), 0);
  run.counts.new = sources.reduce((sum, item) => sum + (item.newCount || 0), 0);
  run.counts.changed = sources.reduce((sum, item) => sum + (item.updatedCount || 0), 0);
  run.counts.unchanged = sources.reduce((sum, item) => sum + (item.unchangedCount || 0), 0);
  run.counts.meetingsProcessed = (run.meetings || []).filter((item) =>
    ["completed", "repaired"].includes(item.status)
  ).length;
  run.counts.meetingsPending = (run.meetings || []).filter(
    (item) => item.status === "pending_transcript"
  ).length;
  run.counts.failures =
    sources.filter((item) =>
      ["partial", "unavailable", "not_authorized", "timed_out", "malformed", "failed"].includes(
        item.state
      )
    ).length +
    (run.meetings || []).filter((item) => ["partial", "failed"].includes(item.status)).length +
    (run.reviewError ? 1 : 0);
}

function phaseFor(id, startedAt) {
  const index = RUN_PHASES.findIndex((phase) => phase.id === id);
  const phase = RUN_PHASES[index >= 0 ? index : 0];
  return { ...phase, index: Math.max(0, index) + 1, total: RUN_PHASES.length, startedAt };
}

function emailDraftsFromEvidence(evidence) {
  return evidence
    .filter((item) => item.suggestedEmail?.body)
    .map((item) => ({
      id: `email-${sha(`${item.stableId}|${item.suggestedEmail.subject}`).slice(0, 24)}`,
      destination: "email_draft",
      sourceId: item.sourceId,
      evidenceIds: [item.stableId],
      to: item.suggestedEmail.to,
      subject: item.suggestedEmail.subject,
      body: item.suggestedEmail.body,
      status: "draft_only",
    }));
}

function recapFor(run) {
  const entries = [];
  for (const source of Object.values(run.sources || {})) {
    if (
      !["partial", "unavailable", "not_authorized", "timed_out", "malformed", "failed"].includes(
        source.state
      )
    ) {
      continue;
    }
    entries.push({
      id: `source-${source.id}-${source.state}`,
      sourceId: source.id,
      destination: "source_status",
      kind: "failure",
      title: `${source.label}: ${String(source.state).replace(/_/g, " ")}`,
      detail: source.detail || "This source did not complete its requested period.",
      receipt: null,
      links: [],
    });
  }
  for (const meeting of run.meetings || []) {
    if (meeting.status !== "completed" && meeting.status !== "repaired") continue;
    entries.push({
      id: meeting.id,
      sourceId: "teams_meeting_transcripts",
      destination: "brain",
      kind: "meeting",
      title: meeting.title,
      detail:
        meeting.status === "repaired"
          ? "Missing meeting pieces repaired."
          : "Meeting package saved.",
      receipt: meeting.receipt || null,
      links: meeting.links || [],
    });
  }
  for (const proposal of run.jiraProposals || []) {
    entries.push({
      id: proposal.id,
      sourceId: proposal.sourceId,
      destination: "jira",
      kind: "proposal",
      title: proposal.title,
      detail: proposal.actionLabel,
      receipt: null,
      links: proposal.issueKey ? [{ label: proposal.issueKey, href: proposal.link || null }] : [],
    });
  }
  for (const draft of run.emailDrafts || []) {
    entries.push({
      id: draft.id,
      sourceId: draft.sourceId,
      destination: "email_draft",
      kind: "proposal",
      title: draft.subject,
      detail: draft.to ? `Draft for ${draft.to}` : "Draft recipient needs review.",
      receipt: null,
      links: [],
    });
  }
  for (const change of run.actualChanges || []) {
    entries.push({
      id: change.id,
      sourceId: change.sourceId || "reviewed_proposal",
      destination: "jira",
      kind: "applied",
      title: change.title,
      detail: change.detail || "Approved Jira proposal applied.",
      receipt: change.receipt || null,
      links: change.links || [],
    });
  }
  if (run.mdmCheck) {
    entries.push({
      id: "mdm-check",
      sourceId: "mdm_check",
      destination: "jira",
      kind: run.mdmCheck.status === "failed" ? "failure" : "proposal",
      title:
        run.mdmCheck.status === "failed"
          ? "MDM check did not complete"
          : `MDM check ready: ${run.mdmCheck.proposalCount ?? 0} correction${run.mdmCheck.proposalCount === 1 ? "" : "s"} proposed`,
      detail:
        run.mdmCheck.status === "failed"
          ? run.mdmCheck.detail || "The Jira-vs-Brain check failed."
          : "Review and apply the corrections from the Reconcile MDM view.",
      receipt: run.mdmCheck.previewId || null,
      links: [],
    });
  }
  const EXTRA_SOURCE_LABELS = {
    stale_sweep: "Stale Jira work",
    mdm_check: "MDM check (Jira vs. Brain)",
  };
  const grouped = [];
  for (const entry of entries) {
    const source = ACTIVITY_SOURCES.find((item) => item.id === entry.sourceId);
    const sourceLabel =
      source?.label || EXTRA_SOURCE_LABELS[entry.sourceId] || "Reviewed proposals";
    let group = grouped.find((item) => item.sourceId === entry.sourceId);
    if (!group) {
      group = { sourceId: entry.sourceId, sourceLabel, destinations: [] };
      grouped.push(group);
    }
    let destination = group.destinations.find((item) => item.id === entry.destination);
    if (!destination) {
      const labels = {
        jira: "Jira",
        brain: "Brain and Workbench",
        email_draft: "Email drafts",
        source_status: "Source limitations",
      };
      destination = {
        id: entry.destination,
        label: labels[entry.destination] || entry.destination,
        items: [],
      };
      group.destinations.push(destination);
    }
    destination.items.push(entry);
  }
  return {
    generatedAt: run.finishedAt || run.lastActivityAt,
    changedItemCount: entries.filter((item) => item.kind !== "proposal").length,
    proposalCount: entries.filter((item) => item.kind === "proposal").length,
    groups: grouped,
  };
}

export function createActivityReconciliationService(options) {
  if (!options?.store) throw new TypeError("An activity state store is required.");
  if (typeof options.collectSources !== "function") {
    throw new TypeError("A source collection function is required.");
  }
  const store = options.store;
  const clock = options.clock || (() => new Date());
  const prepareJira =
    options.prepareJira ||
    (async ({ run, evidence, issues = [] }) =>
      buildJiraReview(evidence, issues, { now: run?.startedAt }));
  const runMdmCheck = typeof options.runMdmCheck === "function" ? options.runMdmCheck : null;
  const loadJiraIssues = options.loadJiraIssues || (async () => []);
  const processMeeting =
    options.processMeeting || (async () => ({ ok: false, code: "unavailable" }));
  const inspectMeeting = options.inspectMeeting || null;
  const applyJiraProposal = options.applyJiraProposal || null;
  const running = new Map();
  const applies = new Map();

  const ready = store.update((state) => {
    const at = asIso(clock);
    for (const run of state.runs) {
      if (!ACTIVE_STATES.has(run.status)) continue;
      run.status = "interrupted";
      run.resumable = true;
      run.cancelRequested = false;
      addEvent(run, "interrupted", "The saved run stopped before it finished and can resume.", at);
    }
    return { state };
  });

  async function updateRun(runId, mutator) {
    return store.update((state) => {
      const run = findRun(state, runId);
      if (!run) throw activityError("run_not_found", "The activity run was not found.", 404);
      const value = mutator(run, state);
      state.runs = trimRuns(state.runs);
      return { state, value: value === undefined ? clone(run) : value };
    });
  }

  async function getRun(runId) {
    await ready;
    const state = await store.read();
    const id = runId || state.activeRunId || state.runs.at(-1)?.id;
    return id ? clone(findRun(state, id)) : null;
  }

  async function setPhase(runId, id, activity) {
    const at = asIso(clock);
    return updateRun(runId, (run) => {
      run.phase = phaseFor(id, at);
      if (id === "reading_sources") {
        for (const source of Object.values(run.sources || {})) {
          if (!source.startedAt) source.startedAt = at;
        }
      }
      addEvent(run, "phase", activity || run.phase.label, at);
    });
  }

  async function cancellationRequested(runId) {
    const run = await getRun(runId);
    return Boolean(run?.cancelRequested);
  }

  async function finishCanceled(runId) {
    const at = asIso(clock);
    return updateRun(runId, (run) => {
      run.status = "canceled";
      run.finishedAt = at;
      run.resumable = true;
      run.cancelRequested = false;
      run.recap = recapFor(run);
      addEvent(run, "canceled", "Stopped after the current safe unit. The run can resume.", at);
    });
  }

  async function saveSourceResult(runId, sourceResult, runtimeById) {
    const at = asIso(clock);
    return store.update((state) => {
      const run = findRun(state, runId);
      if (!run) throw activityError("run_not_found", "The activity run was not found.", 404);
      const definition = ACTIVITY_SOURCES.find((item) => item.id === sourceResult.id);
      if (!definition) return { state, value: [] };
      const rawItems = Array.isArray(sourceResult.items) ? sourceResult.items : [];
      const truncated = rawItems.length > 1_000;
      const sourceState = truncated
        ? "partial"
        : normalizeSourceState(sourceResult.state, rawItems.length);
      const priorRunEvidence = new Map((run.evidence || []).map((item) => [item.stableId, item]));
      const runEvidence = [];
      let newCount = 0;
      let changedCount = 0;
      let unchangedCount = 0;
      let outsideWindowCount = 0;

      for (const raw of rawItems.slice(0, 1_000)) {
        const normalized = normalizeEvidence(sourceResult.id, raw, at);
        if (!evidenceInsideWindow(normalized.record, run.windows[sourceResult.id])) {
          outsideWindowCount += 1;
          continue;
        }
        const priorInRun = priorRunEvidence.get(normalized.record.stableId);
        const previous = state.evidence[normalized.record.stableId];
        const classification =
          priorInRun?.classification || classifyEvidence(previous, normalized.record);
        const record = {
          ...normalized.record,
          firstObservedAt: previous?.firstObservedAt || normalized.record.firstObservedAt,
          classification,
        };
        state.evidence[record.stableId] = {
          stableId: record.stableId,
          sourceId: record.sourceId,
          contentHash: record.contentHash,
          firstObservedAt: record.firstObservedAt,
          lastObservedAt: at,
          lastChangedRunId:
            classification === "new" || classification === "changed"
              ? runId
              : previous?.lastChangedRunId || null,
        };
        runtimeById.set(record.stableId, { ...normalized.runtime, classification });
        if (classification === "new") newCount += 1;
        else if (classification === "changed") changedCount += 1;
        else unchangedCount += 1;
        const meetingCheck =
          sourceResult.id === "teams_meeting_transcripts" &&
          record.transcriptReady &&
          classification === "unchanged";
        if (classification !== "unchanged" || priorInRun || meetingCheck) {
          runEvidence.push({ ...record, meetingCheck });
        }
      }

      const byId = new Map((run.evidence || []).map((item) => [item.stableId, item]));
      for (const item of runEvidence) byId.set(item.stableId, item);
      run.evidence = [...byId.values()].slice(-2_000);
      const confirmedThrough = confirmedThroughFor(
        truncated ? { ...sourceResult, confirmedThrough: null } : sourceResult,
        run.windows[sourceResult.id],
        SOURCE_SUCCESS.has(sourceState) && !truncated
      );
      run.sources[sourceResult.id] = {
        ...run.sources[sourceResult.id],
        state: sourceState,
        itemCount: rawItems.length,
        newCount,
        updatedCount: changedCount,
        changedCount: newCount + changedCount,
        unchangedCount,
        detail: `${String(sourceResult.detail || "").slice(0, 380)}${
          outsideWindowCount
            ? `${sourceResult.detail ? " " : ""}${outsideWindowCount} item${outsideWindowCount === 1 ? "" : "s"} outside this run's fixed period were deferred.`
            : ""
        }${
          truncated
            ? `${sourceResult.detail || outsideWindowCount ? " " : ""}Only the first 1,000 items were retained, so this source did not advance.`
            : ""
        }`.slice(0, 500),
        startedAt: run.sources[sourceResult.id]?.startedAt || run.phase.startedAt,
        finishedAt: at,
        confirmedThrough:
          SOURCE_SUCCESS.has(sourceState) ||
          (sourceState === "partial" && sourceResult.confirmedThrough)
            ? confirmedThrough
            : null,
      };
      if (SOURCE_SUCCESS.has(sourceState) && confirmedThrough) {
        state.sourcePositions[sourceResult.id] = { completedThrough: confirmedThrough, runId };
      } else if (sourceState === "partial" && confirmedThrough) {
        state.sourcePositions[sourceResult.id] = {
          completedThrough: confirmedThrough,
          runId,
          partial: true,
        };
      }
      refreshCounts(run);
      addEvent(
        run,
        "source",
        `${definition.label}: ${sourceState}, ${rawItems.length} observed, ${newCount + changedCount} new or changed.`,
        at
      );
      return { state, value: runEvidence };
    });
  }

  async function collect(runId) {
    const run = await getRun(runId);
    const runtimeById = new Map();
    let payload;
    try {
      payload = await options.collectSources({
        run: clone(run),
        windows: clone(run.windows),
        isCancellationRequested: () => cancellationRequested(runId),
        onActivity: (detail) =>
          updateRun(runId, (current) => addEvent(current, "activity", detail, asIso(clock))),
      });
    } catch (error) {
      payload = {
        sources: ACTIVITY_SOURCES.map((source) => ({
          id: source.id,
          state: error?.code === "m365_timeout" ? "timed_out" : "failed",
          items: [],
          detail: errorDetail(error),
        })),
      };
    }

    await setPhase(
      runId,
      "classifying_evidence",
      "Classifying source items and suppressing repeats."
    );

    const results = new Map(
      (Array.isArray(payload?.sources) ? payload.sources : []).map((item) => [item.id, item])
    );
    for (const source of ACTIVITY_SOURCES) {
      const result = results.get(source.id) || {
        id: source.id,
        state: "malformed",
        items: [],
        detail: "The source reader did not return a result for this stream.",
      };
      await saveSourceResult(runId, result, runtimeById);
    }
    return runtimeById;
  }

  async function prepareReview(runId, meetingReview = {}) {
    const run = await getRun(runId);
    const savedEvidence = (run.evidence || []).filter(
      (item) => item.classification === "new" || item.classification === "changed"
    );
    const extraEvidence = Array.isArray(meetingReview.evidence) ? meetingReview.evidence : [];
    const reviewedMeetingIds = new Set(
      Array.isArray(meetingReview.reviewedMeetingIds) ? meetingReview.reviewedMeetingIds : []
    );
    const jiraEvidence = [
      ...savedEvidence.filter((item) => !reviewedMeetingIds.has(item.stableId)),
      ...extraEvidence.filter((item) => item.actionable),
    ];
    const draftEvidence = [...savedEvidence, ...extraEvidence];
    const drafts = emailDraftsFromEvidence([
      ...new Map(draftEvidence.map((item) => [item.stableId, item])).values(),
    ]);
    await setPhase(runId, "preparing_proposals", "Preparing Jira and email proposals for review.");
    try {
      const issues = await loadJiraIssues({ run: clone(run), evidence: clone(jiraEvidence) });
      const review = await prepareJira({ run: clone(run), evidence: clone(jiraEvidence), issues });
      const at = asIso(clock);
      await updateRun(runId, (current) => {
        current.associations = Array.isArray(review?.associations) ? review.associations : [];
        current.jiraProposals = Array.isArray(review?.proposals) ? review.proposals : [];
        current.emailDrafts = drafts;
        current.reviewError = null;
        current.skipped = [
          ...(current.skipped || []),
          ...(Array.isArray(review?.skipped) ? review.skipped : []),
        ].slice(-2_000);
        current.counts.jiraProposals = current.jiraProposals.length;
        current.counts.emailDrafts = drafts.length;
        refreshCounts(current);
        addEvent(
          current,
          "review",
          `${current.jiraProposals.length} Jira proposals and ${drafts.length} email drafts are ready for review.`,
          at
        );
      });
    } catch (error) {
      const at = asIso(clock);
      await updateRun(runId, (current) => {
        current.reviewError = errorDetail(error);
        current.emailDrafts = drafts;
        current.counts.emailDrafts = drafts.length;
        refreshCounts(current);
        addEvent(
          current,
          "review_failed",
          `Jira review preparation failed: ${errorDetail(error)}`,
          at
        );
      });
    }
  }

  async function processMeetings(runId, runtimeById) {
    const run = await getRun(runId);
    const reviewEvidence = [];
    const reviewedMeetingIds = [];
    const meetingEvidence = (run.evidence || []).filter(
      (item) =>
        item.sourceId === "teams_meeting_transcripts" &&
        (item.classification === "new" || item.classification === "changed" || item.meetingCheck)
    );
    for (const evidence of meetingEvidence) {
      if (await cancellationRequested(runId)) {
        return { completed: false, evidence: reviewEvidence, reviewedMeetingIds };
      }
      const latest = await getRun(runId);
      if (
        (latest.meetings || []).some(
          (item) => item.evidenceId === evidence.stableId && item.status === "completed"
        )
      ) {
        continue;
      }
      const runtime = runtimeById.get(evidence.stableId) || evidence;
      const savedState = (await store.read()).meetingStates[evidence.stableId] || null;
      let repairNeeded = ["partial", "failed"].includes(savedState?.status);
      if (evidence.meetingCheck && savedState?.status === "complete") {
        if (!inspectMeeting) continue;
        try {
          const inspection = await inspectMeeting({ run: clone(latest), evidence: clone(runtime) });
          if (inspection?.complete) continue;
          repairNeeded = true;
        } catch {
          repairNeeded = true;
        }
      }
      if (!evidence.transcriptReady || !runtime.transcript) {
        const at = asIso(clock);
        await updateRun(runId, (current, state) => {
          const existing = (current.meetings || []).filter(
            (item) => item.evidenceId !== evidence.stableId
          );
          current.meetings = [
            ...existing,
            {
              id: evidence.meeting?.id || evidence.stableId,
              evidenceId: evidence.stableId,
              title: evidence.meeting?.title || evidence.title,
              status: "pending_transcript",
              detail: "The meeting is complete, but its Teams transcript is not ready.",
            },
          ];
          state.meetingStates[evidence.stableId] = {
            status: "pending_transcript",
            contentHash: evidence.contentHash,
            lastAttemptAt: at,
            runId,
          };
          refreshCounts(current);
          addEvent(current, "meeting_pending", `${evidence.title}: transcript not ready.`, at);
        });
        continue;
      }
      try {
        await setPhase(
          runId,
          "generating_visuals",
          `Completing ${evidence.meeting?.title || evidence.title} and its saved visual.`
        );
        const result = await processMeeting({ run: clone(latest), evidence: clone(runtime) });
        const at = asIso(clock);
        if (result?.ok && result?.reviewComplete) reviewedMeetingIds.push(evidence.stableId);
        for (const item of Array.isArray(result?.reviewItems) ? result.reviewItems : []) {
          const normalized = normalizeEvidence("teams_meeting_transcripts", item, at).record;
          reviewEvidence.push({
            ...normalized,
            classification: "new",
            parentEvidenceId: evidence.stableId,
          });
        }
        await updateRun(runId, (current, state) => {
          const existing = (current.meetings || []).filter(
            (item) => item.evidenceId !== evidence.stableId
          );
          const status =
            result?.repaired || (result?.ok && repairNeeded)
              ? "repaired"
              : result?.ok
                ? "completed"
                : "partial";
          current.meetings = [
            ...existing,
            {
              id: result?.id || evidence.meeting?.id || evidence.stableId,
              evidenceId: evidence.stableId,
              title: evidence.meeting?.title || evidence.title,
              status,
              detail:
                result?.detail ||
                (result?.ok ? "Meeting package saved." : "Meeting processing is incomplete."),
              receipt: result?.receipt || null,
              links: Array.isArray(result?.links) ? result.links : [],
            },
          ];
          state.meetingStates[evidence.stableId] = {
            status: result?.ok ? "complete" : "partial",
            contentHash: evidence.contentHash,
            lastAttemptAt: at,
            runId,
            packageId: result?.id || null,
          };
          refreshCounts(current);
          addEvent(
            current,
            result?.ok ? "meeting_completed" : "meeting_partial",
            `${evidence.title}: ${status}.`,
            at
          );
        });
      } catch (error) {
        const at = asIso(clock);
        await updateRun(runId, (current, state) => {
          const existing = (current.meetings || []).filter(
            (item) => item.evidenceId !== evidence.stableId
          );
          current.meetings = [
            ...existing,
            {
              id: evidence.meeting?.id || evidence.stableId,
              evidenceId: evidence.stableId,
              title: evidence.meeting?.title || evidence.title,
              status: "failed",
              detail: errorDetail(error),
            },
          ];
          state.meetingStates[evidence.stableId] = {
            status: "failed",
            contentHash: evidence.contentHash,
            lastAttemptAt: at,
            runId,
          };
          refreshCounts(current);
          addEvent(current, "meeting_failed", `${evidence.title}: ${errorDetail(error)}`, at);
        });
      }
    }
    return { completed: true, evidence: reviewEvidence, reviewedMeetingIds };
  }

  async function execute(runId) {
    try {
      await setPhase(
        runId,
        "reading_sources",
        "Reading Outlook, Teams, meeting, and Brain activity."
      );
      const runtimeById = await collect(runId);
      if (await cancellationRequested(runId)) return finishCanceled(runId);

      await setPhase(
        runId,
        "processing_meetings",
        "Checking ready meeting transcripts and saved packages."
      );
      const meetingReview = await processMeetings(runId, runtimeById);
      if (await cancellationRequested(runId)) return finishCanceled(runId);

      await setPhase(runId, "matching_jira", "Checking evidence against current MT work items.");
      await prepareReview(runId, meetingReview);
      if (await cancellationRequested(runId)) return finishCanceled(runId);

      // The MDM Jira-vs-Brain check chains automatically so one run covers
      // both workflows. Its result is reported, never a reason to fail the
      // activity run itself, and it stays read-only: applying its corrections
      // still happens through the Reconcile MDM review.
      let mdmCheck = null;
      if (runMdmCheck) {
        await setPhase(runId, "mdm_check", "Running the MDM Jira-vs-Brain check.");
        try {
          const result = await runMdmCheck({ run: clone(await getRun(runId)) });
          mdmCheck = {
            status: "completed",
            generatedAt: asIso(clock),
            previewId: result?.previewId || null,
            proposalCount: Number.isFinite(result?.proposalCount) ? result.proposalCount : 0,
            detail: result?.detail || null,
          };
        } catch (error) {
          mdmCheck = { status: "failed", generatedAt: asIso(clock), detail: errorDetail(error) };
        }
      }

      await setPhase(runId, "finalizing", "Saving the changes-only recap and run history.");
      const at = asIso(clock);
      return updateRun(runId, (run, state) => {
        run.mdmCheck = mdmCheck;
        run.status = run.counts.failures > 0 ? "partial_success" : "completed";
        run.finishedAt = at;
        run.resumable = false;
        run.recap = recapFor(run);
        state.activeRunId = null;
        addEvent(
          run,
          "completed",
          run.status === "completed"
            ? "Activity reconciliation completed."
            : "Activity reconciliation completed with source or meeting failures.",
          at
        );
      });
    } catch (error) {
      const at = asIso(clock);
      return updateRun(runId, (run) => {
        run.status = "interrupted";
        run.resumable = true;
        run.cancelRequested = false;
        addEvent(run, "interrupted", `The run stopped: ${errorDetail(error)}`, at);
      });
    }
  }

  function launch(runId) {
    if (running.has(runId)) return running.get(runId);
    const work = execute(runId).finally(() => running.delete(runId));
    running.set(runId, work);
    return work;
  }

  async function start(startOptions = {}) {
    await ready;
    const at = asIso(clock);
    const result = await store.update((state) => {
      const active = state.activeRunId ? findRun(state, state.activeRunId) : null;
      if (active && ACTIVE_STATES.has(active.status)) {
        return { state, value: { run: clone(active), attached: true, resumed: false } };
      }
      if (active && RESUMABLE_STATES.has(active.status) && startOptions.fresh !== true) {
        active.status = "running";
        active.cancelRequested = false;
        active.finishedAt = null;
        active.resumedAt = at;
        active.resumeCount = (active.resumeCount || 0) + 1;
        addEvent(active, "resumed", "Resuming from the last saved checkpoint.", at);
        return { state, value: { run: clone(active), attached: false, resumed: true } };
      }
      const run = newRun(state, at);
      addEvent(
        run,
        "started",
        run.baseline
          ? "Baseline run started for activity since January 1, 2026."
          : "Incremental activity run started.",
        at
      );
      state.runs.push(run);
      state.runs = trimRuns(state.runs);
      state.activeRunId = run.id;
      return { state, value: { run: clone(run), attached: false, resumed: false } };
    });
    if (!result.attached) launch(result.run.id);
    return result;
  }

  async function stop(runId) {
    await ready;
    const at = asIso(clock);
    return updateRun(runId, (run) => {
      if (!ACTIVE_STATES.has(run.status)) {
        throw activityError("run_not_active", "Only a running activity scan can be stopped.", 409);
      }
      run.cancelRequested = true;
      run.status = "stopping";
      addEvent(run, "stop_requested", "Stopping after the current safe unit.", at);
    });
  }

  async function resume(runId) {
    await ready;
    const at = asIso(clock);
    const run = await updateRun(runId, (current, state) => {
      if (!RESUMABLE_STATES.has(current.status)) {
        if (ACTIVE_STATES.has(current.status)) return clone(current);
        throw activityError("run_not_resumable", "This activity run cannot be resumed.", 409);
      }
      const other = state.activeRunId ? findRun(state, state.activeRunId) : null;
      if (other && other.id !== current.id && ACTIVE_STATES.has(other.status)) {
        throw activityError("run_already_active", "Another activity run is already running.", 409);
      }
      state.activeRunId = current.id;
      current.status = "running";
      current.cancelRequested = false;
      current.finishedAt = null;
      current.resumedAt = at;
      current.resumeCount = (current.resumeCount || 0) + 1;
      addEvent(current, "resumed", "Resuming from the last saved checkpoint.", at);
    });
    launch(run.id);
    return run;
  }

  async function runHistory() {
    await ready;
    const state = await store.read();
    return clone(state.runs).reverse();
  }

  async function applySelected(runId, proposalIds, confirmation) {
    if (!applyJiraProposal) {
      throw activityError("jira_apply_unavailable", "Jira apply is unavailable.", 503);
    }
    const selectedIds = [...new Set((proposalIds || []).map(String))].sort();
    const run = await getRun(runId);
    if (!run) throw activityError("run_not_found", "The activity run was not found.", 404);
    if (!["completed", "partial_success"].includes(run.status)) {
      throw activityError(
        "run_not_reviewable",
        "Jira proposals can be applied only after the activity run finishes.",
        409
      );
    }
    const proposals = selectedIds
      .map((id) => run.jiraProposals.find((proposal) => proposal.id === id))
      .filter(Boolean);
    if (!proposals.length || proposals.length !== selectedIds.length) {
      throw activityError(
        "invalid_proposal_selection",
        "Select only proposals from this saved run."
      );
    }
    const expected = proposalConfirmation(proposals);
    if (confirmation !== expected) {
      throw activityError(
        "approval_required",
        `Type ${expected} to approve these Jira changes.`,
        409,
        {
          expectedConfirmation: expected,
        }
      );
    }
    const key = sha(`${runId}|${selectedIds.join("|")}`);
    const active = applies.get(runId);
    if (active) {
      if (active.key === key) return active.promise;
      throw activityError(
        "jira_apply_active",
        "Another approved Jira batch is already applying.",
        409
      );
    }

    const promise = (async () => {
      const claim = await store.update((state) => {
        const existing = state.applyReceipts[key];
        if (existing?.status === "complete") return { state, value: { existing } };
        if (existing) {
          return {
            state,
            value: {
              blocked: activityError(
                "jira_apply_recovery_required",
                "This approved batch stopped before a final receipt was saved. Review Jira before retrying.",
                409,
                existing
              ),
            },
          };
        }
        state.applyReceipts[key] = {
          id: key,
          runId,
          proposalIds: selectedIds,
          status: "applying",
          startedAt: asIso(clock),
          completedAt: null,
          results: [],
        };
        return { state, value: { claimed: true } };
      });
      if (claim.existing) return clone(claim.existing);
      if (claim.blocked) throw claim.blocked;

      for (const proposal of proposals) {
        try {
          const result = await applyJiraProposal({ run: clone(run), proposal: clone(proposal) });
          await store.update((state) => {
            const receipt = state.applyReceipts[key];
            receipt.results.push({
              proposalId: proposal.id,
              sourceId: proposal.sourceId,
              title: proposal.title,
              status: "applied",
              appliedAt: asIso(clock),
              receipt: result?.receipt || result || null,
              links: Array.isArray(result?.links) ? result.links : [],
            });
            return { state };
          });
        } catch (error) {
          await store.update((state) => {
            const receipt = state.applyReceipts[key];
            receipt.status = "recovery_required";
            receipt.error = errorDetail(error);
            receipt.failedProposalId = proposal.id;
            return { state };
          });
          throw activityError(
            "jira_apply_recovery_required",
            "Jira apply stopped before every readback completed. No automatic replay will occur.",
            409
          );
        }
      }

      return store.update((state) => {
        const receipt = state.applyReceipts[key];
        receipt.status = "complete";
        receipt.completedAt = asIso(clock);
        const current = findRun(state, runId);
        current.actualChanges = [
          ...(current.actualChanges || []),
          ...receipt.results.map((result) => ({
            id: `${key}:${result.proposalId}`,
            sourceId: result.sourceId,
            title: result.title,
            detail: "Approved Jira proposal applied and read back.",
            receipt: result.receipt,
            links: result.links,
          })),
        ];
        current.recap = recapFor(current);
        addEvent(
          current,
          "jira_applied",
          `${receipt.results.length} approved Jira proposals applied with receipts.`,
          receipt.completedAt
        );
        return { state, value: clone(receipt) };
      });
    })().finally(() => applies.delete(runId));
    applies.set(runId, { key, promise });
    return promise;
  }

  return {
    ready,
    start,
    stop,
    resume,
    getRun,
    runHistory,
    applySelected,
    waitForRun(runId) {
      return running.get(runId) || Promise.resolve(getRun(runId));
    },
    expectedConfirmation(proposalIds, run) {
      const proposals = (run?.jiraProposals || []).filter((item) => proposalIds.includes(item.id));
      return proposalConfirmation(proposals);
    },
  };
}
