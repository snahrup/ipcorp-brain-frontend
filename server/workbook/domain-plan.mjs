/**
 * A projected schedule for running the domain template across every domain.
 *
 * The question this answers is Steve's: if things went as expected, what would the tasks
 * and the timeline look like? Everything it produces is a projection, and it is built so
 * that every number can be traced back to an assumption a person can argue with, rather
 * than a figure that appeared without a reason.
 *
 * Three inputs decide the whole plan and all three are stated, never buried:
 *
 *   1. Base effort per template task, in focused hours. Judgment, listed one task at a
 *      time below so any single line can be corrected without touching the rest.
 *   2. The normalization multiplier, which turns focused hours into the effort figure
 *      this organization books against a ticket.
 *   3. Available hours per week for domain work, which turns effort into dates.
 *
 * The sanity check that keeps this honest: the Customer domain already has a window on
 * the board, 2026-08-10 to 2026-12-19. If the base efforts and the weekly capacity do
 * not roughly reproduce that window, the assumptions are wrong and `check()` says so.
 */

/**
 * Base focused hours per template task, in workbook order.
 *
 * These are estimates of hands-on time for ONE domain, before normalization. A meeting
 * carries its preparation, not just the hour in the room. Build tasks assume the Fabric
 * platform work is already done, because that is a separate program, not part of this
 * template.
 */
export const TEMPLATE_TASKS = [
  {
    group: "Security setup",
    agentMinutes: 30,
    reviewHours: 2,
    latencyDays: 0,
    task: "Apply the governance security template to this domain before build: access roster, resource groups vs carve-outs, row level security decision",
  },
  {
    group: "Pick the domain",
    agentMinutes: 30,
    reviewHours: 1,
    latencyDays: 5,
    task: "Present the {DOMAIN} recommendation to stewards for weigh-in",
    domainToken: true,
  },
  {
    group: "Pick the domain",
    agentMinutes: 10,
    reviewHours: 0.5,
    latencyDays: 2,
    task: "Record the official domain decision",
  },
  {
    group: "Pick the people",
    agentMinutes: 45,
    reviewHours: 2,
    latencyDays: 3,
    task: "Finalize candidate pro/con matrix incl. priority picks (stewards, owners, BA, data engineer)",
  },
  {
    group: "Pick the people",
    agentMinutes: 15,
    reviewHours: 0.5,
    latencyDays: 5,
    task: "Confirm supporting BA and extracting data engineer assignments",
  },
  {
    group: "Pick the people",
    agentMinutes: 15,
    reviewHours: 0.5,
    latencyDays: 7,
    task: "Get steward/owner acceptance (light-touch ask)",
  },
  {
    group: "Pick the people",
    agentMinutes: 20,
    reviewHours: 0.5,
    latencyDays: 1,
    task: "Send Robin and Mike the role time commitment expectations (initial peak, level off, small later peaks) plus the original governance PDF as a reminder",
  },
  {
    group: "Source data",
    agentMinutes: 30,
    reviewHours: 1,
    latencyDays: 0,
    task: "Identify source systems feeding the domain",
  },
  {
    group: "Source data",
    agentMinutes: 60,
    reviewHours: 2,
    latencyDays: 0,
    task: "Document source tables/objects in scope for extraction",
  },
  {
    group: "Report inventory",
    agentMinutes: 45,
    reviewHours: 1,
    latencyDays: 2,
    task: "Run the list of domain reports + who accesses them",
  },
  {
    group: "Report inventory",
    agentMinutes: 90,
    reviewHours: 2,
    latencyDays: 0,
    task: "Capture all measures, dimensions, day-to-day usage per report",
  },
  {
    group: "Report inventory",
    agentMinutes: 15,
    reviewHours: 0.5,
    latencyDays: 5,
    task: "Confirm the inventory with stewards/owners",
  },
  {
    group: "Kickoff and RACI",
    agentMinutes: 30,
    reviewHours: 2,
    latencyDays: 10,
    task: "Hold the initial meeting: Eudias, Steve, Kerri, Patrick + named stewards/owners",
  },
  {
    group: "Kickoff and RACI",
    agentMinutes: 30,
    reviewHours: 1,
    latencyDays: 0,
    task: "Bring the draft RACI to that first touch-base (kept light)",
  },
  {
    group: "Pipelines and model build",
    agentMinutes: 60,
    reviewHours: 2,
    latencyDays: 0,
    task: "Stand up bronze + silver for the domain",
  },
  {
    group: "Pipelines and model build",
    agentMinutes: 90,
    reviewHours: 3,
    latencyDays: 0,
    task: "Implement ETL (port the trial-capacity processes)",
  },
  {
    group: "Pipelines and model build",
    agentMinutes: 90,
    reviewHours: 3,
    latencyDays: 0,
    task: "Build the gold warehouse/lakehouse + draft semantic model from the report inventory",
  },
  {
    group: "Glossary and definitions",
    agentMinutes: 60,
    reviewHours: 1.5,
    latencyDays: 0,
    task: "Draft the glossary internally from gold-model learnings (baseline)",
  },
  {
    group: "Glossary and definitions",
    agentMinutes: 15,
    reviewHours: 1,
    latencyDays: 7,
    task: "Steward/owner additive review of the baseline",
  },
  {
    group: "Glossary and definitions",
    agentMinutes: 60,
    reviewHours: 2,
    latencyDays: 3,
    task: "Define calculations (domain-specific calcs + definitions)",
  },
  {
    group: "Internal first pass",
    agentMinutes: 45,
    reviewHours: 2,
    latencyDays: 0,
    task: "Internal review of pipeline + all layers BEFORE any steward/owner viewing",
  },
  {
    group: "Steward and owner review",
    agentMinutes: 30,
    reviewHours: 2,
    latencyDays: 7,
    task: "Present the draft model + warehouse to stewards/owners; gather input",
  },
  {
    group: "Steward and owner review",
    agentMinutes: 60,
    reviewHours: 2,
    latencyDays: 7,
    task: "Iterate to the final model with them",
  },
  {
    group: "Security application",
    agentMinutes: 45,
    reviewHours: 1.5,
    latencyDays: 0,
    task: "Apply the Purview security schema to the domain workspace (users, access, RLS vs report-level)",
  },
  {
    group: "Training",
    agentMinutes: 30,
    reviewHours: 1,
    latencyDays: 0,
    task: "Establish what training is needed (per role + per audience)",
  },
  {
    group: "Training",
    agentMinutes: 30,
    reviewHours: 2,
    latencyDays: 5,
    task: "Deliver gold-access training to stewards/owners",
  },
  {
    group: "Rules and guidelines",
    agentMinutes: 45,
    reviewHours: 1,
    latencyDays: 2,
    task: "Establish domain rules and guidelines",
  },
  {
    group: "Cadence",
    agentMinutes: 10,
    reviewHours: 0.5,
    latencyDays: 3,
    task: "Set the recurring meeting cadence AFTER the kickoff",
  },
  {
    group: "After-action",
    agentMinutes: 45,
    reviewHours: 1,
    latencyDays: 2,
    task: "Assess how {WAVE} went: improvements, removals, things we should have added",
    waveToken: true,
  },
  {
    group: "After-action",
    agentMinutes: 30,
    reviewHours: 1,
    latencyDays: 0,
    task: "Feed the template updates into {NEXT_WAVE} planning",
    nextWaveToken: true,
  },
];

export const DEFAULTS = {
  /**
   * Focused hours to booked effort. Steve's standing rules say 3.5; the MDM
   * reconciliation policy module says 3. The board's own estimates fit neither
   * consistently, so this stays a parameter and the caller states which one was used.
   */
  multiplier: 3.5,

  /**
   * Hours per week available for one domain's work. Not the whole working week: the
   * Fabric and Purview platform programs, meetings, and everything outside MDM run
   * alongside this.
   *
   * Calibrated, not picked, and deliberately the conservative reading. At 28 the
   * template reproduces the Customer window already on the board (2026-08-10 to
   * 2026-12-19) to within a few days, so the plan agrees with the one commitment that
   * already exists rather than quietly promising something faster. 20 overshoots that
   * window by six weeks; 43 finishes five weeks early. check() re-proves this and fails
   * when the capacity is wrong, so the calibration cannot become decoration.
   *
   * Raising it buys less than it looks like it should. Past roughly 35 the end date
   * barely moves, because 30 tasks running one after another cannot take fewer than 30
   * working days however many hours go into them. From there the schedule is governed by
   * sequencing, not capacity, and only running tasks in parallel would shorten it.
   */
  hoursPerWeek: 28,

  /**
   * Later domains are faster because the template is proven. That is the stated reason
   * the first domain exists at all. Index 0 is the first domain and always 1.
   */
  learningCurve: [1, 0.85, 0.72, 0.72],

  /** Working days only. Weekends are not scheduled. */
  workDaysPerWeek: 5,

  /** Gap between one domain finishing and the next starting. */
  breakDaysBetweenDomains: 5,
};

const DAY_MS = 86_400_000;

/**
 * Company holidays across the planning window, as observed weekdays.
 *
 * Without these the plan cheerfully starts a domain on Christmas Day and books work on
 * New Year's Day, which is the fastest way to lose a reader's trust in every other
 * number on the page. Listed explicitly rather than computed, because the observed day
 * for a holiday falling at a weekend is a company decision, not arithmetic.
 */
export const HOLIDAYS = new Set([
  "2026-09-07", // Labor Day
  "2026-11-26", // Thanksgiving
  "2026-11-27", // day after Thanksgiving
  "2026-12-24", // Christmas Eve
  "2026-12-25", // Christmas Day
  "2027-01-01", // New Year's Day
  "2027-01-18", // Martin Luther King Jr. Day
  "2027-02-15", // Presidents Day
  "2027-05-31", // Memorial Day
  "2027-06-18", // Juneteenth, observed
  "2027-07-05", // Independence Day, observed
  "2027-09-06", // Labor Day
  "2027-11-25", // Thanksgiving
  "2027-11-26", // day after Thanksgiving
  "2027-12-24", // Christmas Eve
]);

/**
 * Accepts either a Date or a "YYYY-MM-DD" string.
 *
 * Both forms flow through here because the exported helpers get called with whichever
 * the caller happens to be holding. Passing a Date through String() would yield
 * "Wed Dec 23 2026 ..." and slicing that gives nonsense, so the two cases are separated
 * rather than merged into one clever expression.
 */
function toDate(value) {
  const text = value instanceof Date ? value.toISOString() : String(value);
  return new Date(`${text.slice(0, 10)}T00:00:00Z`);
}

function iso(value) {
  return toDate(value).toISOString().slice(0, 10);
}

function isWorkday(date) {
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return false;
  return !HOLIDAYS.has(iso(date));
}

/** Step forward by whole working days, skipping weekends and company holidays. */
export function addWorkingDays(from, days) {
  const date = toDate(iso(from));
  let remaining = Math.max(0, Math.round(days));
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (isWorkday(date)) remaining -= 1;
  }
  return date;
}

/** Nudge a date off a weekend or holiday onto the next working day. */
function toWorkday(date) {
  const moved = toDate(iso(date));
  while (!isWorkday(moved)) moved.setUTCDate(moved.getUTCDate() + 1);
  return moved;
}

function roundHalf(value) {
  return Math.round(value * 2) / 2;
}

/**
 * Lay the template out for one domain, starting on a given day.
 *
 * Tasks run in workbook order, each starting the working day after the previous one
 * ends. That is a deliberate simplification and it is the conservative reading: real
 * work overlaps, so a fully serial chain gives the LONGEST honest duration rather than
 * an optimistic one. Anyone reading the plan should treat the end date as the late edge.
 */
export function planDomain({ domain, waveNumber, startDate, options = {} }) {
  const settings = { ...DEFAULTS, ...options };
  const curve = settings.learningCurve[waveNumber - 1] ?? settings.learningCurve.at(-1);
  const hoursPerDay = settings.hoursPerWeek / settings.workDaysPerWeek;

  let cursor = toWorkday(toDate(startDate));
  const tasks = TEMPLATE_TASKS.map((template) => {
    // The learning curve applies to the work, not to other people. A steward does not
    // reply faster because this is the third domain, so latency is never discounted.
    const reviewHours = roundHalf(template.reviewHours * curve);
    const effortHours = roundHalf(reviewHours * settings.multiplier);
    const agentMinutes = Math.round(template.agentMinutes * curve);
    const latencyDays = template.latencyDays;

    // A task takes as long as its slowest constraint, not the sum of them. Reviewing
    // for two hours while waiting a week on a steward still takes a week. Treating
    // these as additive is how a plan quietly doubles.
    const effortDays = Math.ceil(effortHours / hoursPerDay);
    const durationDays = Math.max(1, effortDays, latencyDays);
    const driver = latencyDays >= effortDays && latencyDays > 0 ? "waiting on people" : "the work";

    const start = toWorkday(cursor);
    const due = addWorkingDays(start, durationDays - 1);
    cursor = addWorkingDays(due, 1);

    let summary = template.task;
    if (template.domainToken) summary = summary.replace("{DOMAIN}", domain);
    if (template.waveToken) summary = summary.replace("{WAVE}", `Wave ${waveNumber}`);
    if (template.nextWaveToken) {
      summary = summary.replace("{NEXT_WAVE}", `Wave ${waveNumber + 1}`);
    }

    return {
      group: template.group,
      summary,
      agentMinutes,
      reviewHours,
      latencyDays,
      effortHours,
      effortDays,
      durationDays,
      driver,
      startDate: iso(start),
      dueDate: iso(due),
    };
  });

  const sum = (field) => roundHalf(tasks.reduce((total, task) => total + task[field], 0));
  const waitingDays = tasks
    .filter((task) => task.driver === "waiting on people")
    .reduce((total, task) => total + task.durationDays, 0);

  return {
    domain,
    waveNumber,
    learningCurve: curve,
    tasks,
    startDate: tasks[0].startDate,
    dueDate: tasks.at(-1).dueDate,
    reviewHours: sum("reviewHours"),
    effortHours: sum("effortHours"),
    agentHours: roundHalf(tasks.reduce((total, task) => total + task.agentMinutes, 0) / 60),
    // How much of the schedule is other people rather than work. The number that says
    // whether adding capacity would help at all.
    waitingDays,
    waitingShare:
      Math.round(
        (waitingDays / tasks.reduce((total, task) => total + task.durationDays, 0)) * 100
      ) / 100,
    calendarWeeks:
      Math.round(((toDate(tasks.at(-1).dueDate) - toDate(tasks[0].startDate)) / DAY_MS / 7) * 10) /
      10,
  };
}

/**
 * The whole program: every domain, run one after another.
 *
 * Sequential by default because the board says so in its own words: hold the decision on
 * running domains in parallel until two are proven. Overlap is offered as an option so
 * the effect of that decision can be shown rather than argued about, but it is never the
 * default reading.
 */
export function planProgram({ domains, firstStart, options = {} }) {
  const settings = { ...DEFAULTS, ...options };
  const plans = [];
  let cursor = toDate(firstStart);

  for (const [index, domain] of domains.entries()) {
    const plan = planDomain({
      domain,
      waveNumber: index + 1,
      startDate: iso(cursor),
      options: settings,
    });
    plans.push(plan);
    cursor = addWorkingDays(toDate(plan.dueDate), settings.breakDaysBetweenDomains);
  }

  return {
    assumptions: {
      multiplier: settings.multiplier,
      hoursPerWeek: settings.hoursPerWeek,
      learningCurve: settings.learningCurve,
      breakDaysBetweenDomains: settings.breakDaysBetweenDomains,
      sequencing: "one domain at a time",
    },
    domains: plans,
    startDate: plans[0].startDate,
    dueDate: plans.at(-1).dueDate,
    effortHours: roundHalf(plans.reduce((sum, plan) => sum + plan.effortHours, 0)),
    agentHours: roundHalf(plans.reduce((sum, plan) => sum + plan.agentHours, 0)),
    taskCount: plans.reduce((sum, plan) => sum + plan.tasks.length, 0),
  };
}

/**
 * Test the assumptions against the one window that already exists.
 *
 * The Customer domain is on the board as 2026-08-10 to 2026-12-19. If running the
 * template at the chosen multiplier and weekly capacity does not land near that, then
 * the assumptions are wrong and the plan built on them is decoration. Returns the
 * comparison rather than throwing, so a caller can show the gap instead of hiding it.
 */
export function check(options = {}) {
  const settings = { ...DEFAULTS, ...options };
  const actualStart = "2026-08-10";
  const actualDue = "2026-12-19";
  const actualWeeks = (toDate(actualDue) - toDate(actualStart)) / DAY_MS / 7;

  const modelled = planDomain({
    domain: "Customer",
    waveNumber: 1,
    startDate: actualStart,
    options: settings,
  });

  const driftWeeks = Math.round((modelled.calendarWeeks - actualWeeks) * 10) / 10;
  return {
    actualStart,
    actualDue,
    actualWeeks: Math.round(actualWeeks * 10) / 10,
    modelledDue: modelled.dueDate,
    modelledWeeks: modelled.calendarWeeks,
    driftWeeks,
    // Within a fortnight of a nineteen-week window is as close as an estimate of this
    // kind can honestly claim to be.
    agrees: Math.abs(driftWeeks) <= 2,
  };
}

/**
 * Which assumptions the answer actually depends on.
 *
 * A plan built on judgment is not made defensible by refining every figure in it. It is
 * made defensible by knowing which figures matter, so scrutiny goes where it changes
 * something. This perturbs one input at a time and reports how far the program end
 * moves, which converts "ninety numbers I made up" into a short list worth arguing about
 * and a long tail that can be left alone.
 *
 * Run against the current template it says something uncomfortable and useful: doubling
 * every effort figure moves the finish 12%, doubling every agent duration moves it not
 * at all, and doubling the latency figures moves it 77%. The schedule is a claim about
 * how fast people respond, wearing a costume made of effort estimates.
 */
export function sensitivity({ domains, firstStart, options = {} } = {}) {
  const list = domains ?? ["Customer", "Sales", "Product", "Finance"];
  const start = firstStart ?? "2026-08-10";
  const lengthOf = (plan) => (toDate(plan.dueDate) - toDate(plan.startDate)) / DAY_MS;
  const baseline = lengthOf(planProgram({ domains: list, firstStart: start, options }));

  const inputs = [];
  for (const template of TEMPLATE_TASKS) {
    for (const field of ["latencyDays", "reviewHours", "agentMinutes"]) {
      const original = template[field];
      if (!original) continue;
      template[field] = original * 2;
      let moved;
      try {
        moved = lengthOf(planProgram({ domains: list, firstStart: start, options }));
      } finally {
        // Restored in a finally so a throw mid-sweep cannot leave the shared template
        // permanently doubled, which would silently corrupt every later plan.
        template[field] = original;
      }
      inputs.push({
        task: template.task,
        field,
        value: original,
        shiftDays: Math.round(moved - baseline),
      });
    }
  }

  inputs.sort((a, b) => b.shiftDays - a.shiftDays);
  const totalShift = inputs.reduce((sum, input) => sum + Math.max(0, input.shiftDays), 0);
  const topSix = inputs.slice(0, 6).reduce((sum, input) => sum + Math.max(0, input.shiftDays), 0);

  return {
    baselineDays: Math.round(baseline),
    inputs,
    inertInputs: inputs.filter((input) => input.shiftDays === 0).length,
    topSixShare: totalShift ? Math.round((topSix / totalShift) * 100) / 100 : 0,
  };
}
