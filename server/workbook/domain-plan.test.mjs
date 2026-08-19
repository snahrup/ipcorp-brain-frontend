import assert from "node:assert/strict";
import test from "node:test";
import {
  addWorkingDays,
  check,
  DEFAULTS,
  HOLIDAYS,
  planDomain,
  planProgram,
  TEMPLATE_TASKS,
} from "./domain-plan.mjs";

const DOMAINS = ["Customer", "Sales", "Product", "Finance"];

function program(options = {}) {
  return planProgram({ domains: DOMAINS, firstStart: "2026-08-10", options });
}

function dayOf(value) {
  return new Date(`${value}T00:00:00Z`).getUTCDay();
}

test("no task starts or ends on a weekend", () => {
  for (const domain of program().domains) {
    for (const task of domain.tasks) {
      for (const when of [task.startDate, task.dueDate]) {
        const day = dayOf(when);
        assert.ok(day !== 0 && day !== 6, `${domain.domain} has a task on ${when}, a weekend`);
      }
    }
  }
});

test("no task starts or ends on a company holiday", () => {
  // Without this the plan books work on Christmas Day, which is what it did before
  // holidays were modelled at all.
  for (const domain of program().domains) {
    for (const task of domain.tasks) {
      for (const when of [task.startDate, task.dueDate]) {
        assert.ok(!HOLIDAYS.has(when), `${domain.domain} has a task on ${when}, a holiday`);
      }
    }
  }
});

test("addWorkingDays steps over a holiday rather than through it", () => {
  // 2026-12-23 is a Wednesday; the 24th and 25th are holidays and the 26th/27th a
  // weekend, so one working day later is Monday the 28th.
  assert.equal(addWorkingDays("2026-12-23", 1).toISOString().slice(0, 10), "2026-12-28");
});

test("the booked estimate is the focused estimate times the multiplier", () => {
  const plan = planDomain({ domain: "Customer", waveNumber: 1, startDate: "2026-08-10" });
  for (const task of plan.tasks) {
    assert.equal(task.effortHours, Math.round(task.baseHours * DEFAULTS.multiplier * 2) / 2);
  }
});

test("changing the multiplier scales every estimate and nothing else", () => {
  const at3 = planDomain({
    domain: "Customer",
    waveNumber: 1,
    startDate: "2026-08-10",
    options: { multiplier: 3 },
  });
  const at35 = planDomain({ domain: "Customer", waveNumber: 1, startDate: "2026-08-10" });
  assert.ok(at3.effortHours < at35.effortHours);
  assert.equal(at3.baseHours, at35.baseHours);
  assert.equal(at3.tasks.length, at35.tasks.length);
});

test("later domains carry less effort than the first, because the template is proven", () => {
  const [customer, sales, product, finance] = program().domains;
  assert.ok(sales.effortHours < customer.effortHours);
  assert.ok(product.effortHours < sales.effortHours);
  assert.equal(finance.effortHours, product.effortHours);
  assert.equal(customer.learningCurve, 1);
});

test("domains run one at a time and never overlap", () => {
  const domains = program().domains;
  for (let index = 1; index < domains.length; index += 1) {
    assert.ok(
      domains[index].startDate > domains[index - 1].dueDate,
      `${domains[index].domain} starts ${domains[index].startDate} before ${
        domains[index - 1].domain
      } ends ${domains[index - 1].dueDate}`
    );
  }
});

test("tasks within a domain run in order and never overlap", () => {
  for (const domain of program().domains) {
    for (let index = 1; index < domain.tasks.length; index += 1) {
      assert.ok(
        domain.tasks[index].startDate > domain.tasks[index - 1].dueDate,
        `${domain.domain} task ${index} starts before the previous one ends`
      );
      assert.ok(domain.tasks[index].dueDate >= domain.tasks[index].startDate);
    }
  }
});

test("the domain and wave names are substituted, so no later domain says Customer", () => {
  const [, sales, product] = program().domains;
  const salesText = sales.tasks.map((task) => task.summary).join(" | ");
  assert.ok(salesText.includes("Present the Sales recommendation"));
  assert.ok(!salesText.includes("Customer"), "Sales must not carry Customer's wording");
  assert.ok(salesText.includes("Assess how Wave 2 went"));
  assert.ok(salesText.includes("into Wave 3 planning"));
  assert.ok(product.tasks.some((task) => task.summary.includes("Assess how Wave 3 went")));
});

test("every template task reaches every domain", () => {
  const plan = program();
  assert.equal(plan.taskCount, TEMPLATE_TASKS.length * DOMAINS.length);
  for (const domain of plan.domains) assert.equal(domain.tasks.length, TEMPLATE_TASKS.length);
});

test("the assumptions reproduce the Customer window already on the board", () => {
  const result = check();
  assert.equal(result.agrees, true, `drift was ${result.driftWeeks} weeks`);
  assert.ok(Math.abs(result.driftWeeks) <= 2);
});

test("check disagrees when the weekly capacity is wrong, rather than always passing", () => {
  // A guard against the calibration being decorative: at 15 hours a week the template
  // cannot fit the board's window, and check has to say so.
  const result = check({ hoursPerWeek: 15 });
  assert.equal(result.agrees, false);
  assert.ok(result.driftWeeks > 2);
});

test("the plan survives JSON, since it travels to the browser", () => {
  const revived = JSON.parse(JSON.stringify(program()));
  assert.equal(revived.domains.length, 4);
  assert.equal(revived.assumptions.multiplier, 3.5);
  assert.ok(revived.domains[0].tasks[0].summary.length > 0);
});
