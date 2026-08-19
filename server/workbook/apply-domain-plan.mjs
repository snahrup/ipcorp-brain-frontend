/**
 * Write the projected domain plan onto the Jira board.
 *
 * This creates real issues on a board other people read, so it is built to be run twice
 * safely. Every issue is matched against what already exists by summary before anything
 * is created, which means a run that dies halfway through can simply be run again: the
 * work already done is skipped, not duplicated. There is no cleanup path for 90
 * accidental subtasks, so the duplicate check is the safety, not an optimization.
 *
 * Nothing here writes unless `commit` is true. The default is a dry run that returns
 * exactly what it would do, so the plan can be read before it becomes 94 tickets.
 */

const SUBTASK_BATCH_ABORT = 3;

/**
 * The increments this company logs against a ticket.
 *
 * The /jira rule is: take the baseline, multiply by the 3.5x normalization, then round
 * to the nearest 30min, 1h, 2h, 4h or 1d. Its own worked example is a 30 minute baseline
 * becoming 1h 45m and being logged as 2h. Rounding to the nearest half hour instead
 * produces figures like 3.5h and 5.5h, which are not values this board carries, and 55
 * of the first 91 issues created here were written that way.
 */
export const EFFORT_LADDER = [0.5, 1, 2, 4, 8];

/** Nearest rung. Ties go to the smaller value rather than inflating the plan. */
export function toEffortLadder(hours) {
  const value = Number(hours);
  if (!Number.isFinite(value) || value <= 0) return null;
  let best = EFFORT_LADDER[0];
  let bestGap = Math.abs(value - best);
  for (const rung of EFFORT_LADDER) {
    const gap = Math.abs(value - rung);
    if (gap < bestGap) {
      best = rung;
      bestGap = gap;
    }
  }
  return best;
}

/** Jira wants "12h" or "90m"; hours come out of the planner as halves. */
export function hoursToJiraEstimate(hours) {
  const minutes = Math.round(Number(hours) * 60);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/**
 * Compare summaries the way a person would: ignoring case, spacing, and the workbook
 * code some of them carry.
 *
 * The code matters. Issues loaded from the workbook are titled "M1.1 Present the
 * Customer recommendation..." while the planner produces the bare task text, so a
 * straight comparison finds nothing in common and every existing task looks missing.
 * That is not a cosmetic difference: without this the first run against the real board
 * proposed 124 issues and would have duplicated the entire Customer domain on top of
 * the 29 subtasks already there.
 */
export function summaryKey(value) {
  return String(value ?? "")
    .replace(/^[A-Za-z]+\d+\.\d+\s+/, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * What the plan would add to the board, given what is already on it.
 *
 * Separated from the writing so it can be read, tested, and shown to a person without a
 * network call. `existingIssues` is the live board; anything whose summary already
 * matches is reported as present rather than queued for creation.
 */
export function diffPlanAgainstBoard({ plan, existingIssues, epicKey, domainParents = {} }) {
  const domains = plan.domains.map((domain) => {
    // Matches the wording already on the board for the first domain, which reads
    // "Wave 1 domain MVP for Customer: the template every later domain inherits".
    const parentTitle = `Wave ${domain.waveNumber} domain MVP for ${domain.domain}: run off the Wave 1 template`;
    const existingParentKey = domainParents[domain.domain] ?? null;
    const existingParent = existingParentKey
      ? existingIssues.find((issue) => issue.key === existingParentKey)
      : existingIssues.find((issue) => summaryKey(issue.summary) === summaryKey(parentTitle));

    // A task counts as present only when it sits under THIS domain. Twenty-seven of the
    // thirty template tasks are word-for-word identical between domains ("Identify
    // source systems feeding the domain" is the same sentence for Sales as for
    // Customer), so matching across the whole board makes every later domain look nearly
    // complete. The first dry run against real data said Sales needed 4 tasks, not 30.
    const siblings = existingParent
      ? existingIssues.filter((issue) => issue.parentKey === existingParent.key)
      : [];
    const bySummary = new Map(siblings.map((issue) => [summaryKey(issue.summary), issue]));

    const tasks = domain.tasks.map((task) => {
      const found = bySummary.get(summaryKey(task.summary));
      return {
        ...task,
        existingKey: found?.key ?? null,
        action: found ? "already on the board" : "create",
      };
    });

    return {
      domain: domain.domain,
      waveNumber: domain.waveNumber,
      parentTitle,
      parentKey: existingParent?.key ?? null,
      parentAction: existingParent ? "already on the board" : "create",
      epicKey,
      startDate: domain.startDate,
      dueDate: domain.dueDate,
      effortHours: domain.effortHours,
      tasks,
    };
  });

  const toCreate = domains.reduce(
    (sum, domain) =>
      sum +
      (domain.parentAction === "create" ? 1 : 0) +
      domain.tasks.filter((task) => task.action === "create").length,
    0
  );
  const alreadyPresent = domains.reduce(
    (sum, domain) =>
      sum +
      (domain.parentAction === "create" ? 0 : 1) +
      domain.tasks.filter((task) => task.action !== "create").length,
    0
  );

  return { domains, toCreate, alreadyPresent };
}

/**
 * Create one issue, then set the fields that a create call will not reliably take.
 *
 * Dates and the estimate go on in a second call on purpose. A create carrying the full
 * field object is the pattern that fails against this Jira, and losing the whole issue
 * to a rejected date is worse than a second request. If the follow-up fails the issue
 * still exists and is reported with the reason, rather than being silently half-formed.
 */
async function createIssue({ request, fields, dates, estimateHours }) {
  const created = await request("/rest/api/3/issue", {
    method: "POST",
    body: JSON.stringify({ fields }),
  });

  const followUp = {};
  if (dates?.startDate) followUp.customfield_11915 = dates.startDate;
  if (dates?.dueDate) followUp.duedate = dates.dueDate;
  const estimate = hoursToJiraEstimate(estimateHours);
  if (estimate) {
    followUp.timetracking = { originalEstimate: estimate, remainingEstimate: estimate };
  }

  let warning = null;
  if (Object.keys(followUp).length) {
    try {
      await request(`/rest/api/3/issue/${created.key}`, {
        method: "PUT",
        body: JSON.stringify({ fields: followUp }),
      });
    } catch (error) {
      warning = `${created.key} was created but its dates and estimate did not apply: ${error.message}`;
    }
  }

  return { key: created.key, warning };
}

/**
 * Apply the plan.
 *
 * Set `commit` to true to write. Anything else returns the diff untouched.
 *
 * A run stops after three consecutive creation failures rather than pushing on through
 * ninety of them. If Jira is rejecting the shape of these issues, the third rejection is
 * as informative as the ninetieth and far cheaper to clean up after.
 */
export async function applyDomainPlan({
  plan,
  existingIssues,
  epicKey,
  request,
  taskTypeId,
  subtaskTypeId,
  domainParents = {},
  commit = false,
  withDates = true,
}) {
  const diff = diffPlanAgainstBoard({ plan, existingIssues, epicKey, domainParents });
  if (!commit) return { ...diff, committed: false, created: [], skipped: [], errors: [] };

  const created = [];
  const skipped = [];
  const errors = [];
  const warnings = [];
  let consecutiveFailures = 0;

  for (const domain of diff.domains) {
    let parentKey = domain.parentKey;

    if (!parentKey) {
      try {
        const result = await createIssue({
          request,
          fields: {
            project: { key: "MT" },
            parent: { key: epicKey },
            issuetype: { id: taskTypeId },
            summary: domain.parentTitle,
            labels: ["mdm", "backlog-from-workbook", `wave-${domain.waveNumber}`],
          },
          dates: withDates ? { startDate: domain.startDate, dueDate: domain.dueDate } : null,
        });
        parentKey = result.key;
        created.push({ key: result.key, summary: domain.parentTitle, kind: "domain" });
        if (result.warning) warnings.push(result.warning);
        consecutiveFailures = 0;
      } catch (error) {
        errors.push(`${domain.domain} domain ticket: ${error.message}`);
        consecutiveFailures += 1;
        if (consecutiveFailures >= SUBTASK_BATCH_ABORT) break;
        // No parent means its tasks have nowhere to go, so move to the next domain.
        continue;
      }
    } else {
      skipped.push({ key: parentKey, summary: domain.parentTitle, kind: "domain" });
    }

    for (const task of domain.tasks) {
      if (task.existingKey) {
        skipped.push({ key: task.existingKey, summary: task.summary, kind: "task" });
        continue;
      }
      try {
        const result = await createIssue({
          request,
          fields: {
            project: { key: "MT" },
            parent: { key: parentKey },
            issuetype: { id: subtaskTypeId },
            summary: task.summary,
            labels: ["mdm", "backlog-from-workbook", `wave-${domain.waveNumber}`],
          },
          dates: withDates ? { startDate: task.startDate, dueDate: task.dueDate } : null,
          // Rounded to the company ladder, not left on the planner's half hours.
          estimateHours: toEffortLadder(task.effortHours),
        });
        created.push({
          key: result.key,
          summary: task.summary,
          kind: "task",
          parent: parentKey,
        });
        if (result.warning) warnings.push(result.warning);
        consecutiveFailures = 0;
      } catch (error) {
        errors.push(`${task.summary.slice(0, 50)}: ${error.message}`);
        consecutiveFailures += 1;
        if (consecutiveFailures >= SUBTASK_BATCH_ABORT) break;
      }
    }

    if (consecutiveFailures >= SUBTASK_BATCH_ABORT) break;
  }

  return {
    ...diff,
    committed: true,
    created,
    skipped,
    errors,
    warnings,
    stoppedEarly: consecutiveFailures >= SUBTASK_BATCH_ABORT,
  };
}
