const DAY_SECONDS = 86_400;
const DEFAULT_CACHE_MS = 5 * 60 * 1_000;
const DEFAULT_CONCURRENCY = 5;

const CATEGORY_LABELS = Object.freeze({
  new: "Backlog",
  indeterminate: "In progress",
  done: "Done",
  undefined: "Other",
});

function asTime(value) {
  const parsed = new Date(value || "").getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveSeconds(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function cleanCategory(value) {
  if (value === "new" || value === "indeterminate" || value === "done") return value;
  return "undefined";
}

function statusLookup(statuses) {
  const byName = new Map();
  const order = new Map();
  for (const [index, status] of (statuses || []).entries()) {
    const name = String(status?.name || "").trim();
    if (!name) continue;
    byName.set(name.toLowerCase(), cleanCategory(status.category));
    order.set(name.toLowerCase(), index);
  }
  return { byName, order };
}

function statusCategory(name, lookup, fallback = "undefined") {
  return (
    lookup.get(
      String(name || "")
        .trim()
        .toLowerCase()
    ) || cleanCategory(fallback)
  );
}

function statusChanges(histories) {
  const changes = [];
  for (const history of histories || []) {
    const at = asTime(history?.createdAt);
    if (at === null) continue;
    for (const item of history?.items || []) {
      const field = String(item?.fieldId || item?.field || "")
        .trim()
        .toLowerCase();
      if (field !== "status") continue;
      changes.push({
        at,
        from: String(item?.from || "").trim() || null,
        to: String(item?.to || "").trim() || null,
      });
    }
  }
  return changes.sort((a, b) => a.at - b.at);
}

function addVisit(store, key, label, category, seconds, issueKey, isCurrent) {
  if (!(seconds > 0)) return;
  const current = store.get(key) || {
    label,
    category,
    totalSeconds: 0,
    closedVisits: 0,
    currentVisits: 0,
    issueKeys: new Set(),
    closedDurations: [],
    currentDurations: [],
  };
  current.totalSeconds += seconds;
  current.issueKeys.add(issueKey);
  if (isCurrent) {
    current.currentVisits += 1;
    current.currentDurations.push(seconds);
  } else {
    current.closedVisits += 1;
    current.closedDurations.push(seconds);
  }
  store.set(key, current);
}

function visitRows(store, order = new Map()) {
  return [...store.values()]
    .map((row) => ({
      label: row.label,
      category: row.category,
      averageSeconds: average(row.closedDurations),
      medianSeconds: median(row.closedDurations),
      currentAverageSeconds: average(row.currentDurations),
      totalSeconds: row.totalSeconds,
      visits: row.closedVisits + row.currentVisits,
      closedVisits: row.closedVisits,
      currentVisits: row.currentVisits,
      issueCount: row.issueKeys.size,
    }))
    .sort((a, b) => {
      const aOrder = order.get(a.label.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
      const bOrder = order.get(b.label.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return b.averageSeconds - a.averageSeconds;
    });
}

function mondayUtc(time) {
  const date = new Date(time);
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + offset);
}

function completionWeeks(resolutionTimes, nowTime, weekCount = 8) {
  const currentWeek = mondayUtc(nowTime);
  const weeks = [];
  for (let index = weekCount - 1; index >= 0; index -= 1) {
    const start = currentWeek - index * 7 * DAY_SECONDS * 1_000;
    const end = start + 7 * DAY_SECONDS * 1_000;
    weeks.push({
      weekOf: new Date(start).toISOString().slice(0, 10),
      completed: resolutionTimes.filter((time) => time >= start && time < end).length,
    });
  }
  return weeks;
}

function issueTimeline(issue, histories, lookup, nowTime) {
  const createdAt = asTime(issue.createdAt);
  if (createdAt === null) return null;

  const changes = statusChanges(histories);
  const finalCategory = cleanCategory(issue.status?.category);
  const directResolutionAt = asTime(issue.resolutionAt);
  const resolutionAt =
    finalCategory === "done"
      ? (directResolutionAt ??
        [...changes].reverse().find((change) => statusCategory(change.to, lookup) === "done")?.at ??
        null)
      : null;
  const endAt = resolutionAt ?? nowTime;
  if (endAt < createdAt) return null;

  let cursor = createdAt;
  let currentName = changes[0]?.from || issue.status?.name || "Unknown";
  const intervals = [];

  for (const change of changes) {
    const intervalEnd = Math.min(change.at, endAt);
    if (intervalEnd > cursor) {
      intervals.push({
        name: currentName,
        category: statusCategory(currentName, lookup, issue.status?.category),
        seconds: (intervalEnd - cursor) / 1_000,
        isCurrent: false,
      });
    }
    if (change.to) currentName = change.to;
    cursor = Math.max(cursor, change.at);
    if (cursor >= endAt) break;
  }

  if (cursor < endAt) {
    const finalName = issue.status?.name || currentName || "Unknown";
    intervals.push({
      name: finalName,
      category: statusCategory(finalName, lookup, issue.status?.category),
      seconds: (endAt - cursor) / 1_000,
      isCurrent: resolutionAt === null,
    });
  }

  const backlogExit = changes.find(
    (change) =>
      statusCategory(change.from, lookup, issue.status?.category) === "new" &&
      statusCategory(change.to, lookup, issue.status?.category) !== "new"
  );
  const currentBacklogInterval =
    finalCategory === "new"
      ? [...intervals].reverse().find((interval) => interval.category === "new")
      : null;

  return {
    createdAt,
    resolutionAt,
    resolutionSeconds: resolutionAt === null ? null : (resolutionAt - createdAt) / 1_000,
    backlogSeconds: backlogExit ? (backlogExit.at - createdAt) / 1_000 : null,
    openBacklogSeconds: currentBacklogInterval?.seconds ?? null,
    intervals,
  };
}

export function buildJiraAnalytics({
  initiative,
  historyByIssue = {},
  failedIssueKeys = [],
  now = new Date(),
}) {
  const nowTime = now instanceof Date ? now.getTime() : asTime(now);
  if (!Number.isFinite(nowTime)) throw new TypeError("A valid analytics timestamp is required.");

  const issues = Array.isArray(initiative?.issues) ? initiative.issues : [];
  const statuses = Array.isArray(initiative?.statuses) ? initiative.statuses : [];
  const { byName, order } = statusLookup(statuses);
  const failed = new Set(failedIssueKeys);
  const statusVisits = new Map();
  const stageVisits = new Map();
  const resolutionDurations = [];
  const backlogDurations = [];
  const openBacklogDurations = [];
  const resolutionTimes = [];
  let usableTimelineCount = 0;

  const parentsWithEstimatedChildren = new Set(
    issues
      .filter(
        (issue) => issue.parentKey && positiveSeconds(issue.timeTracking?.originalEstimateSeconds)
      )
      .map((issue) => issue.parentKey)
  );
  const estimatedIssues = issues.filter(
    (issue) =>
      positiveSeconds(issue.timeTracking?.originalEstimateSeconds) &&
      !parentsWithEstimatedChildren.has(issue.key)
  );
  const totalEstimatedSeconds = estimatedIssues.reduce(
    (sum, issue) => sum + positiveSeconds(issue.timeTracking?.originalEstimateSeconds),
    0
  );
  const loggedIssues = issues.filter((issue) =>
    positiveSeconds(issue.timeTracking?.timeSpentSeconds)
  );
  const totalLoggedSeconds = loggedIssues.reduce(
    (sum, issue) => sum + positiveSeconds(issue.timeTracking?.timeSpentSeconds),
    0
  );
  const estimatedIssueKeys = new Set(estimatedIssues.map((issue) => issue.key));
  const loggedOnEstimatedIssuesSeconds = issues.reduce(
    (sum, issue) =>
      sum +
      (estimatedIssueKeys.has(issue.key)
        ? positiveSeconds(issue.timeTracking?.timeSpentSeconds)
        : 0),
    0
  );
  const unestimatedLoggedSeconds = totalLoggedSeconds - loggedOnEstimatedIssuesSeconds;

  const currentStatuses = new Map();

  for (const issue of issues) {
    const name = issue.status?.name || "Unknown";
    const key = name.toLowerCase();
    const current = currentStatuses.get(key) || {
      label: name,
      category: cleanCategory(issue.status?.category),
      count: 0,
      estimatedSeconds: 0,
      loggedSeconds: 0,
    };
    current.count += 1;
    if (estimatedIssueKeys.has(issue.key)) {
      current.estimatedSeconds += positiveSeconds(issue.timeTracking?.originalEstimateSeconds);
    }
    current.loggedSeconds += positiveSeconds(issue.timeTracking?.timeSpentSeconds);
    currentStatuses.set(key, current);

    if (failed.has(issue.key) || !Object.hasOwn(historyByIssue, issue.key)) {
      const createdAt = asTime(issue.createdAt);
      const resolutionAt = issue.status?.category === "done" ? asTime(issue.resolutionAt) : null;
      if (createdAt !== null && resolutionAt !== null && resolutionAt >= createdAt) {
        resolutionDurations.push((resolutionAt - createdAt) / 1_000);
        resolutionTimes.push(resolutionAt);
      }
      continue;
    }
    const timeline = issueTimeline(issue, historyByIssue[issue.key], byName, nowTime);
    if (!timeline) continue;
    usableTimelineCount += 1;

    if (timeline.resolutionSeconds !== null) {
      resolutionDurations.push(timeline.resolutionSeconds);
      resolutionTimes.push(timeline.resolutionAt);
    }
    if (timeline.backlogSeconds !== null && timeline.backlogSeconds >= 0) {
      backlogDurations.push(timeline.backlogSeconds);
    }
    if (timeline.openBacklogSeconds !== null)
      openBacklogDurations.push(timeline.openBacklogSeconds);

    for (const interval of timeline.intervals) {
      addVisit(
        statusVisits,
        interval.name.toLowerCase(),
        interval.name,
        interval.category,
        interval.seconds,
        issue.key,
        interval.isCurrent
      );
      const stageLabel = CATEGORY_LABELS[interval.category] || CATEGORY_LABELS.undefined;
      addVisit(
        stageVisits,
        interval.category,
        stageLabel,
        interval.category,
        interval.seconds,
        issue.key,
        interval.isCurrent
      );
    }
  }

  const currentStatusRows = [...currentStatuses.values()].sort((a, b) => {
    const aOrder = order.get(a.label.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = order.get(b.label.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return b.count - a.count;
  });

  const doneCount = issues.filter((issue) => issue.status?.category === "done").length;
  return {
    generatedAt: new Date(nowTime).toISOString(),
    jiraFetchedAt: initiative?.fetchedAt || null,
    coverage: {
      totalIssues: issues.length,
      sourceTruncated: Boolean(initiative?.truncated),
      historyLoaded: Object.keys(historyByIssue).length,
      historyFailed: failed.size,
      usableTimelines: usableTimelineCount,
      resolutionSamples: resolutionDurations.length,
      backlogSamples: backlogDurations.length,
      openBacklogSamples: openBacklogDurations.length,
      estimatedIssues: estimatedIssues.length,
      loggedIssues: loggedIssues.length,
    },
    totals: {
      openIssues: issues.length - doneCount,
      doneIssues: doneCount,
      loggedSeconds: totalLoggedSeconds,
      estimatedSeconds: totalEstimatedSeconds,
      loggedOnEstimatedIssuesSeconds,
      unestimatedLoggedSeconds,
      estimateUsagePercent:
        totalEstimatedSeconds > 0
          ? (loggedOnEstimatedIssuesSeconds / totalEstimatedSeconds) * 100
          : null,
      averageResolutionSeconds: average(resolutionDurations),
      medianResolutionSeconds: median(resolutionDurations),
      averageBacklogSeconds: average(backlogDurations),
      medianBacklogSeconds: median(backlogDurations),
      averageOpenBacklogSeconds: average(openBacklogDurations),
    },
    stageDurations: visitRows(stageVisits),
    statusDurations: visitRows(statusVisits, order),
    currentStatuses: currentStatusRows,
    weeklyCompletions: completionWeeks(resolutionTimes, nowTime),
    notes: [
      "Estimate totals avoid counting a parent a second time when estimated child work already represents it.",
      "Status averages use completed visits. Active visit age is reported separately so the average stays stable.",
      "Backlog wait is measured from issue creation to the first move out of a Jira To do category.",
    ],
  };
}

async function collectHistories(issues, readChangelog, concurrency) {
  const historyByIssue = {};
  const failedIssueKeys = [];
  let cursor = 0;
  const workerCount = Math.min(Math.max(1, concurrency), Math.max(1, issues.length));

  async function worker() {
    while (cursor < issues.length) {
      const index = cursor;
      cursor += 1;
      const issue = issues[index];
      try {
        historyByIssue[issue.key] = await readChangelog(issue.key);
      } catch {
        failedIssueKeys.push(issue.key);
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return { historyByIssue, failedIssueKeys };
}

export function createJiraAnalyticsReader({
  readInitiative,
  readChangelog,
  now = () => new Date(),
  cacheMs = DEFAULT_CACHE_MS,
  concurrency = DEFAULT_CONCURRENCY,
}) {
  let cache = null;

  return async function readAnalytics({ refresh = false } = {}) {
    const observedNow = now();
    const observedTime = observedNow instanceof Date ? observedNow.getTime() : asTime(observedNow);
    if (
      !refresh &&
      cache &&
      Number.isFinite(observedTime) &&
      observedTime - cache.savedAt < cacheMs
    ) {
      return { ...cache.value, cache: { state: "cached", savedAt: cache.savedAtIso } };
    }

    const initiative = await readInitiative();
    const issues = Array.isArray(initiative?.issues) ? initiative.issues : [];
    const histories = await collectHistories(issues, readChangelog, concurrency);
    const value = buildJiraAnalytics({ initiative, ...histories, now: observedNow });
    cache = {
      value,
      savedAt: observedTime,
      savedAtIso: new Date(observedTime).toISOString(),
    };
    return { ...value, cache: { state: "fresh", savedAt: cache.savedAtIso } };
  };
}
