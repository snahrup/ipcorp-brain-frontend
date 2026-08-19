/**
 * Turn the MDM Program Project Task Breakdown workbook into a structure, then line that
 * structure up against the live MT issues.
 *
 * This module answers one question for a reader who did not build either side: does the
 * board actually contain what the workbook says, and can I check it myself? Every claim
 * it produces carries the evidence that supports it, and anything it cannot prove is
 * reported as unproven rather than smoothed over.
 *
 * Nothing here reaches the network or the filesystem, so the whole join is covered by
 * plain node tests in breakdown.test.mjs.
 */

/** The workbook marks a program tab by opening with "Program:" or "Program(s):". */
const PROGRAM_BANNER = /^Program(?:me)?(?:\(s\)|s)?:\s*(.+)$/i;

/** "F1. CAPACITY & ENVIRONMENT" -> "F1". The prefix is what the Jira summaries carry. */
const PROJECT_CODE = /^([A-Za-z]+\d+)\s*\./;

/** "F1.1 Select the Fabric capacity" -> code "F1.1", title "Select the Fabric capacity". */
const SUMMARY_CODE = /^([A-Za-z]+\d+\.\d+)\s+(.*)$/;

const HEADER_ALIASES = {
  project: ["project"],
  number: ["#", "no", "no."],
  task: ["task"],
  done: ["done"],
  owner: ["owner", "owner (draft)"],
  notes: ["notes"],
};

function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function cell(row, index) {
  if (index === -1) return "";
  return String(row?.[index] ?? "").trim();
}

/**
 * Map each known column to its position by reading the header row, rather than assuming
 * a fixed order. The Wave 1 tab carries an extra "Done" column the pre-wave tabs do not,
 * so any fixed-index reading is wrong on at least one tab.
 */
function readHeader(row) {
  const columns = { project: -1, number: -1, task: -1, done: -1, owner: -1, notes: -1 };
  row.forEach((value, index) => {
    const header = normalizeHeader(value);
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      if (columns[key] === -1 && aliases.includes(header)) columns[key] = index;
    }
  });
  return columns;
}

function findHeaderRow(rows) {
  for (let index = 0; index < rows.length; index += 1) {
    const first = normalizeHeader(rows[index]?.[0]);
    if (first === "project" || first === "field") {
      return { index, kind: first === "project" ? "tasks" : "positions" };
    }
  }
  return null;
}

/**
 * Every program tab in the workbook, with its projects and tasks.
 *
 * A tab counts as a program when its banner says so. Whether it holds a task list is a
 * separate question answered by its header row: "Wave 2 and Beyond" is a real program
 * that currently records positions ("Wave 2 domain: Sales next") rather than tasks, and
 * flattening those into task rows would invent work nobody planned.
 */
export function parseBreakdown(workbook) {
  const programs = [];

  for (const sheetName of workbook.sheetNames) {
    const rows = workbook.sheets.get(sheetName) ?? [];
    const banner = rows
      .slice(0, 4)
      .map((row) => cell(row, 0))
      .find((value) => PROGRAM_BANNER.test(value));
    if (!banner) continue;

    const name = PROGRAM_BANNER.exec(banner)?.[1]?.trim() ?? sheetName;
    const header = findHeaderRow(rows);
    const description = rows
      .slice(0, header ? header.index : 4)
      .map((row) => cell(row, 0))
      .find((value) => value && value !== banner && !PROGRAM_BANNER.test(value));

    if (!header) {
      programs.push({
        sheet: sheetName,
        name,
        description: description ?? "",
        kind: "unreadable",
        projects: [],
        positions: [],
      });
      continue;
    }

    const columns = readHeader(rows[header.index]);

    if (header.kind === "positions") {
      const positions = [];
      for (const row of rows.slice(header.index + 1)) {
        const field = cell(row, 0);
        if (!field) continue;
        positions.push({ field, value: cell(row, 1), notes: cell(row, 2) });
      }
      programs.push({
        sheet: sheetName,
        name,
        description: description ?? "",
        kind: "positions",
        projects: [],
        positions,
      });
      continue;
    }

    const projects = [];
    let current = null;
    for (const row of rows.slice(header.index + 1)) {
      const label = cell(row, columns.project);
      const task = cell(row, columns.task);
      // The project column is filled only on the first row of its group, so a blank
      // means "still inside the previous group", not "no group".
      if (label) {
        current = {
          code: PROJECT_CODE.exec(label)?.[1] ?? null,
          label,
          tasks: [],
        };
        projects.push(current);
      }
      if (!task) continue;
      if (!current) {
        current = { code: null, label: "", tasks: [] };
        projects.push(current);
      }
      const number = cell(row, columns.number);
      current.tasks.push({
        code: current.code && number ? `${current.code}.${number}` : null,
        number,
        task,
        owner: cell(row, columns.owner),
        notes: cell(row, columns.notes),
        // Blank across the whole workbook today. Kept because it is the author's own
        // column, but Jira status is what the view reports as state.
        doneMark: cell(row, columns.done),
      });
    }

    programs.push({
      sheet: sheetName,
      name,
      description: description ?? "",
      kind: "tasks",
      projects: projects.filter((project) => project.tasks.length > 0 || project.code),
      positions: [],
    });
  }

  return { programs };
}

/**
 * The words that changed between two strings, as removed/added lists.
 *
 * A similarity percentage tells a reader a number they have to trust. The changed words
 * let them see the difference and decide for themselves, which is the entire job of this
 * view. Built on a plain longest-common-subsequence over whitespace-split words.
 */
export function wordDifference(left, right) {
  const a = String(left ?? "")
    .split(/\s+/)
    .filter(Boolean);
  const b = String(right ?? "")
    .split(/\s+/)
    .filter(Boolean);

  const lengths = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lengths[i][j] =
        a[i] === b[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }

  const removed = [];
  const added = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      removed.push(a[i]);
      i += 1;
    } else {
      added.push(b[j]);
      j += 1;
    }
  }
  while (i < a.length) removed.push(a[i++]);
  while (j < b.length) added.push(b[j++]);

  return { removed, added, identical: removed.length === 0 && added.length === 0 };
}

function emptyRollup() {
  return {
    total: 0,
    done: 0,
    inProgress: 0,
    notStarted: 0,
    estimateSeconds: 0,
    spentSeconds: 0,
    estimatedCount: 0,
    earliestStart: null,
    latestDue: null,
    datesRecorded: 0,
    dueOnly: 0,
    undated: 0,
    // Every due date seen, so a caller can tell a real schedule from a set of issues
    // that were all stamped with their program's end date. A group whose tasks share a
    // single due date has no sequencing recorded, and a chart must not imply otherwise.
    dueDates: new Set(),
  };
}

function earlier(left, right) {
  if (!left) return right;
  if (!right) return left;
  return left < right ? left : right;
}

function later(left, right) {
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
}

/**
 * Fold one issue into a running total.
 *
 * Remaining effort is never taken from Jira's own remaining field, which drifts whenever
 * a worklog is filed with adjustEstimate=leave. It is derived from estimate minus spent
 * at the point of display, matching what the issue cards already do.
 */
function addToRollup(rollup, issue) {
  rollup.total += 1;
  const category = issue.status?.category;
  if (category === "done") rollup.done += 1;
  else if (category === "indeterminate") rollup.inProgress += 1;
  else rollup.notStarted += 1;

  const estimate = issue.timeTracking?.originalEstimateSeconds ?? 0;
  const spent = issue.timeTracking?.timeSpentSeconds ?? 0;
  rollup.estimateSeconds += estimate;
  rollup.spentSeconds += spent;
  if (estimate) rollup.estimatedCount += 1;

  const start = issue.startDate ?? null;
  const due = issue.dueDate ?? null;
  if (start && due) rollup.datesRecorded += 1;
  else if (due || start) rollup.dueOnly += 1;
  else rollup.undated += 1;
  if (due) rollup.dueDates.add(due);

  rollup.earliestStart = earlier(rollup.earliestStart, start ?? due);
  rollup.latestDue = later(rollup.latestDue, due ?? start);
  return rollup;
}

function mergeRollup(target, source) {
  target.total += source.total;
  target.done += source.done;
  target.inProgress += source.inProgress;
  target.notStarted += source.notStarted;
  target.estimateSeconds += source.estimateSeconds;
  target.spentSeconds += source.spentSeconds;
  target.estimatedCount += source.estimatedCount;
  target.datesRecorded += source.datesRecorded;
  target.dueOnly += source.dueOnly;
  target.undated += source.undated;
  for (const due of source.dueDates) target.dueDates.add(due);
  target.earliestStart = earlier(target.earliestStart, source.earliestStart);
  target.latestDue = later(target.latestDue, source.latestDue);
  return target;
}

/**
 * Swap the due-date set for a count, so the result survives JSON.
 *
 * `sequenced` is the honest reading of whether a group has a schedule: two or more
 * distinct due dates across more than one issue. One shared date across ten tasks is a
 * stamp, not a plan.
 */
function finalizeRollup(rollup) {
  const distinctDueDates = rollup.dueDates.size;
  const { dueDates, ...rest } = rollup;
  return { ...rest, distinctDueDates, sequenced: rollup.total > 1 && distinctDueDates > 1 };
}

/** Comparison key for matching a workbook row to an issue title on text alone. */
function textKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Index the MT issues that carry a workbook code in their summary. */
function indexIssuesByCode(issues) {
  const byCode = new Map();
  const duplicates = [];
  for (const issue of issues) {
    const match = SUMMARY_CODE.exec(issue.summary ?? "");
    if (!match) continue;
    const code = match[1].toUpperCase();
    const entry = { issue, title: match[2].trim() };
    if (byCode.has(code)) duplicates.push({ code, keys: [byCode.get(code).issue.key, issue.key] });
    else byCode.set(code, entry);
  }
  return { byCode, duplicates };
}

/**
 * Line the workbook up against the live board.
 *
 * Every workbook task lands in exactly one state, and every WBS-coded issue that the
 * workbook does not account for is reported too, so the count works in both directions
 * and neither side can hide a gap.
 */
export function crosswalkBreakdown(breakdown, issues) {
  const { byCode, duplicates } = indexIssuesByCode(issues);
  const claimed = new Set();

  // Pass one: match on the WBS code, which is the join the two sides were built to
  // share. Rollups wait until every task has been resolved, so a task rescued by the
  // text pass below still counts toward its group's totals.
  const resolved = breakdown.programs.map((program) => ({
    ...program,
    projects: program.projects.map((project) => ({
      ...project,
      tasks: project.tasks.map((task) => {
        const code = task.code?.toUpperCase() ?? null;
        const found = code ? byCode.get(code) : undefined;
        if (!found) {
          return {
            ...task,
            state: code ? "missing-from-jira" : "uncoded",
            issue: null,
            difference: null,
          };
        }
        claimed.add(code);
        const difference = wordDifference(task.task, found.title);
        return {
          ...task,
          state: difference.identical ? "identical" : "reworded",
          issue: found.issue,
          matchedBy: "code",
          difference,
        };
      }),
    })),
  }));

  // Pass two: a workbook row can lose its group label to a formatting slip, which
  // strips its code and strands the matching issue on the other side. When the task
  // text is identical, that is the same task with a broken label in the workbook, and
  // reporting it as two separate gaps would be actively misleading.
  const unclaimedByText = new Map();
  for (const [code, entry] of byCode) {
    if (claimed.has(code)) continue;
    const key = textKey(entry.title);
    if (!unclaimedByText.has(key)) unclaimedByText.set(key, { code, ...entry });
  }

  const repairs = [];
  for (const program of resolved) {
    for (const project of program.projects) {
      project.tasks = project.tasks.map((task) => {
        if (task.state !== "uncoded") return task;
        const found = unclaimedByText.get(textKey(task.task));
        if (!found) return task;
        claimed.add(found.code);
        unclaimedByText.delete(textKey(task.task));
        repairs.push({ code: found.code, key: found.issue.key, task: task.task });
        return {
          ...task,
          code: found.code,
          state: "identical",
          issue: found.issue,
          matchedBy: "text",
          difference: wordDifference(task.task, found.title),
        };
      });
    }
  }

  // Pass three: totals, built only from tasks that actually resolved to an issue.
  const programs = resolved.map((program) => {
    const programRollup = emptyRollup();
    const projects = program.projects.map((project) => {
      const projectRollup = emptyRollup();
      for (const task of project.tasks) if (task.issue) addToRollup(projectRollup, task.issue);
      mergeRollup(programRollup, projectRollup);
      return { ...project, rollup: finalizeRollup(projectRollup) };
    });
    return { ...program, projects, rollup: finalizeRollup(programRollup) };
  });

  const unaccounted = [...byCode]
    .filter(([code]) => !claimed.has(code))
    .map(([code, entry]) => ({ code, issue: entry.issue, title: entry.title }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const allTasks = programs.flatMap((program) =>
    program.projects.flatMap((project) => project.tasks)
  );
  const countOf = (state) => allTasks.filter((task) => task.state === state).length;
  const coverage = {
    workbookTasks: allTasks.length,
    coded: allTasks.filter((task) => task.code).length,
    identical: countOf("identical"),
    reworded: countOf("reworded"),
    missingFromJira: countOf("missing-from-jira"),
    uncoded: countOf("uncoded"),
    unaccountedInJira: unaccounted.length,
    matchedByText: repairs.length,
    groupingRepairs: repairs,
    duplicateCodes: duplicates,
  };
  coverage.matched = coverage.identical + coverage.reworded;

  return { programs, unaccounted, coverage };
}
