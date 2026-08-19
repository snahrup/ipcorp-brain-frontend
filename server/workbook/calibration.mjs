/**
 * Learn what the template's steps actually cost, so later domains are planned on
 * measured work instead of judgment.
 *
 * Every template task runs once per domain, which is what makes this possible: when the
 * Customer domain finishes "Identify source systems feeding the domain", that is direct
 * evidence for the same step in Sales, Product and Finance. It is the same work against
 * different data, so its actual cost transfers in a way a global multiplier never could.
 *
 * The hard part is not the arithmetic, it is knowing when the evidence is worthless.
 * A worklog filed to match its estimate carries no information, and a loop that learns
 * from those does not get more accurate, it gets more confident about the original
 * guess. That failure is silent and compounds, so this module refuses to produce
 * corrections it cannot justify and says why. A missing correction is a good outcome;
 * an invented one is not.
 */

/** Below this many usable samples there is nothing to learn, only noise to amplify. */
const MINIMUM_SAMPLES = 4;

/**
 * Above this share of samples landing exactly on their estimate, the worklogs are being
 * written to match rather than measured, and the whole set is refused.
 *
 * Set from real data: across the 63 MT issues carrying both an estimate and logged time,
 * the median ratio was exactly 1.00 and only 10% ran over. Independent measurement does
 * not look like that.
 */
const MAX_EXACT_MATCH_SHARE = 0.5;

/** A ratio this far from 1 is treated as a data problem rather than a slow week. */
const IMPLAUSIBLE_RATIO = 10;

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Pair each finished issue with the template task it came from.
 *
 * Matching is on the task text, since that is what survives being copied into a domain.
 * An issue that cannot be traced back to a template step is left out rather than
 * guessed at.
 */
export function collectSamples({ templateTasks, issues, matchSummary }) {
  const byText = new Map();
  for (const template of templateTasks) byText.set(matchSummary(template.task), template);

  const samples = [];
  const rejected = [];

  for (const issue of issues) {
    const template = byText.get(matchSummary(issue.summary ?? ""));
    if (!template) continue;

    const estimate = (issue.timeTracking?.originalEstimateSeconds ?? 0) / 3600;
    const spent = (issue.timeTracking?.timeSpentSeconds ?? 0) / 3600;
    const finished = issue.status?.category === "done";

    if (!finished) {
      rejected.push({ key: issue.key, reason: "not finished" });
      continue;
    }
    if (estimate <= 0 || spent <= 0) {
      rejected.push({ key: issue.key, reason: "no estimate or no logged time" });
      continue;
    }
    const ratio = spent / estimate;
    if (ratio > IMPLAUSIBLE_RATIO || ratio < 1 / IMPLAUSIBLE_RATIO) {
      rejected.push({ key: issue.key, reason: `ratio of ${ratio.toFixed(1)}x is not believable` });
      continue;
    }

    samples.push({ key: issue.key, task: template.task, estimate, spent, ratio });
  }

  return { samples, rejected };
}

/**
 * Decide whether a set of samples is worth learning from.
 *
 * Kept separate from the learning itself so the verdict can be shown to a person. The
 * point is not to block the loop, it is to make sure nobody reads a correction as
 * measured when it was really just the estimate echoing back.
 */
export function assessSignal(samples) {
  if (samples.length < MINIMUM_SAMPLES) {
    return {
      trustworthy: false,
      reason: `Only ${samples.length} finished ${
        samples.length === 1 ? "task has" : "tasks have"
      } both an estimate and logged time. At least ${MINIMUM_SAMPLES} are needed before the numbers mean anything.`,
      exactMatchShare: null,
    };
  }

  const exact = samples.filter((sample) => Math.abs(sample.ratio - 1) < 0.02).length;
  const exactMatchShare = exact / samples.length;

  if (exactMatchShare > MAX_EXACT_MATCH_SHARE) {
    return {
      trustworthy: false,
      reason: `${exact} of ${samples.length} tasks logged time within 2% of their estimate. Worklogs written to match an estimate carry no information about what the work actually cost, so nothing is learned from this set.`,
      exactMatchShare,
    };
  }

  return {
    trustworthy: true,
    reason: `${samples.length} finished tasks with independent-looking worklogs.`,
    exactMatchShare,
  };
}

/**
 * Per-task correction factors, derived from what the earlier domains actually cost.
 *
 * Returns corrections only when the evidence supports them. When it does not, the
 * result carries the reason and an empty correction set, and the caller keeps planning
 * on the original figures. That is the intended outcome, not a failure.
 *
 * The median is used rather than the mean because one task that sat open over a holiday
 * should not drag the whole template.
 */
export function learnFromActuals({ templateTasks, issues, matchSummary }) {
  const { samples, rejected } = collectSamples({ templateTasks, issues, matchSummary });
  const signal = assessSignal(samples);

  if (!signal.trustworthy) {
    return {
      signal,
      corrections: {},
      overallRatio: null,
      samples,
      rejected,
      applied: false,
    };
  }

  const byTask = new Map();
  for (const sample of samples) {
    if (!byTask.has(sample.task)) byTask.set(sample.task, []);
    byTask.get(sample.task).push(sample.ratio);
  }

  const corrections = {};
  for (const [task, ratios] of byTask) {
    corrections[task] = {
      ratio: Math.round(median(ratios) * 100) / 100,
      samples: ratios.length,
    };
  }

  return {
    signal,
    corrections,
    // Used for template steps that have not run anywhere yet, so a domain is never
    // planned half on measured numbers and half on the original guesses.
    overallRatio: Math.round(median(samples.map((sample) => sample.ratio)) * 100) / 100,
    samples,
    rejected,
    applied: true,
  };
}

/**
 * Apply what was learned to the template's base hours.
 *
 * A task with its own measured correction uses it. A task that has never run anywhere
 * uses the overall ratio, and is marked so the plan can show which figures are measured
 * and which are still judgment. Nothing is adjusted at all when the evidence was refused.
 */
export function applyCorrections({ templateTasks, learning }) {
  if (!learning.applied) {
    return templateTasks.map((template) => ({ ...template, basis: "estimated", ratio: 1 }));
  }

  return templateTasks.map((template) => {
    const correction = learning.corrections[template.task];
    const ratio = correction?.ratio ?? learning.overallRatio ?? 1;
    return {
      ...template,
      hours: Math.round(template.hours * ratio * 2) / 2,
      originalHours: template.hours,
      ratio,
      samples: correction?.samples ?? 0,
      basis: correction ? "measured" : "measured across the template",
    };
  });
}
