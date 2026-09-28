import test from "node:test";
import assert from "node:assert/strict";
import {
  calculatePriority,
  cleanText,
  extractSignals,
  generateOperationsPlan,
  normalizeContext,
  parseWorkspace,
  planToMarkdown,
  serializeWorkspace,
  slugify,
  stableHash,
} from "../dist/operations.js";

const validContext = {
  process: "Order fulfillment",
  mode: "stabilize",
  owner: "Fulfillment lead",
  situation: "A growing order backlog creates late shipments and rushed handoffs between picking and packing.",
  outcome: "Reduce late shipments from 18% to below 5%",
  volume: "1,800 orders per weekday and 2,700 on Mondays",
  evidence: "Six weeks of data show a 31-hour median cycle time and 42-hour Monday peak.",
  constraints: "No added warehouse space this quarter.",
  targetDate: "Stable before November peak",
};

const fixedNow = "2026-09-27T12:00:00.000Z";

test("cleanText trims, normalizes line endings, and removes control characters", () => {
  assert.equal(cleanText("  hello\r\nworld\u0000  "), "hello\nworld");
});

test("cleanText enforces maximum length", () => {
  assert.equal(cleanText("abcdef", 3), "abc");
});

test("cleanText treats null as empty", () => {
  assert.equal(cleanText(null), "");
});

test("slugify creates a portable filename", () => {
  assert.equal(slugify("  Café / Order Ops!  "), "cafe-order-ops");
});

test("slugify falls back when no ASCII characters remain", () => {
  assert.equal(slugify("产品"), "operations-plan");
});

test("stableHash is deterministic and input-sensitive", () => {
  assert.equal(stableHash("alpha"), stableHash("alpha"));
  assert.notEqual(stableHash("alpha"), stableHash("beta"));
});

test("normalizeContext supplies safe defaults", () => {
  const context = normalizeContext({ situation: "A long enough operating problem", outcome: "Improve flow", mode: "invalid" });
  assert.equal(context.process, "Operations process");
  assert.equal(context.mode, "stabilize");
});

test("normalizeContext accepts all supported modes", () => {
  for (const mode of ["stabilize", "standardize", "scale", "incident", "audit"]) {
    assert.equal(normalizeContext({ situation: "A long enough operating problem", outcome: "Improve flow", mode }).mode, mode);
  }
});

test("normalizeContext rejects short situations", () => {
  assert.throws(() => normalizeContext({ situation: "Too short", outcome: "Improve" }), /at least 12/);
});

test("normalizeContext rejects missing outcomes", () => {
  assert.throws(() => normalizeContext({ situation: "This situation is long enough", outcome: "" }), /outcome/);
});

test("extractSignals identifies delay, capacity, and handoff themes", () => {
  const signals = extractSignals({ situation: "A backlog delay creates a slow queue and broken handoff", outcome: "Improve throughput" });
  assert.ok(signals.themes.includes("delay"));
  assert.ok(signals.themes.includes("capacity"));
  assert.ok(signals.themes.includes("handoff"));
});

test("extractSignals identifies quality and compliance themes", () => {
  const signals = extractSignals({ situation: "Audit evidence shows a policy defect and rework", outcome: "Improve compliance" });
  assert.ok(signals.themes.includes("quality"));
  assert.ok(signals.themes.includes("compliance"));
});

test("extractSignals identifies reliability and cost themes", () => {
  const signals = extractSignals({ situation: "An outage creates downtime and expensive waste", outcome: "Restore reliability and lower cost" });
  assert.ok(signals.themes.includes("reliability"));
  assert.ok(signals.themes.includes("cost"));
});

test("extractSignals uses handoff as a neutral fallback", () => {
  assert.deepEqual(extractSignals("An unusual concern without the known terms").themes, ["handoff"]);
});

test("extractSignals captures numeric metrics without duplicates", () => {
  const signals = extractSignals({ situation: "18% of 1800 orders are late", outcome: "Move 18% below 5%" });
  assert.ok(signals.metrics.includes("18%"));
  assert.ok(signals.metrics.includes("5%"));
  assert.equal(signals.metrics.filter((item) => item === "18%").length, 1);
});

test("extractSignals recognizes evidence and volume", () => {
  const signals = extractSignals({ evidence: "Six weeks of confirmed warehouse scan records", volume: "1800 orders" });
  assert.equal(signals.hasEvidence, true);
  assert.equal(signals.hasVolume, true);
});

test("extractSignals counts missing operating context", () => {
  assert.equal(extractSignals({ situation: "A process problem" }).unknowns, 5);
});

test("calculatePriority applies the operations formula", () => {
  assert.equal(calculatePriority({ severity: 5, frequency: 4, confidence: 0.8, effort: 2 }), 8);
});

test("calculatePriority rounds to one decimal", () => {
  assert.equal(calculatePriority({ severity: 4, frequency: 3, confidence: 0.75, effort: 4 }), 2.3);
});

test("calculatePriority accepts zero severity", () => {
  assert.equal(calculatePriority({ severity: 0, frequency: 5, confidence: 1, effort: 1 }), 0);
});

test("calculatePriority rejects confidence above one", () => {
  assert.throws(() => calculatePriority({ severity: 1, frequency: 1, confidence: 2, effort: 1 }), /Priority inputs/);
});

test("calculatePriority rejects zero effort", () => {
  assert.throws(() => calculatePriority({ severity: 1, frequency: 1, confidence: 0.8, effort: 0 }), /Priority inputs/);
});

test("calculatePriority rejects severity above five", () => {
  assert.throws(() => calculatePriority({ severity: 6, frequency: 1, confidence: 0.8, effort: 1 }), /Priority inputs/);
});

test("generateOperationsPlan creates every artifact", () => {
  const plan = generateOperationsPlan(validContext, { now: fixedNow });
  assert.equal(plan.createdAt, fixedNow);
  assert.ok(plan.brief.strategy);
  assert.equal(plan.sop.steps.length, 7);
  assert.ok(plan.actions.length >= 8);
  assert.equal(plan.capacity.scenarios.length, 3);
  assert.ok(plan.controls.length >= 5);
  assert.equal(plan.runbook.length, 5);
  assert.ok(plan.update.summary);
});

test("generateOperationsPlan is deterministic with fixed time", () => {
  assert.deepEqual(generateOperationsPlan(validContext, { now: fixedNow }), generateOperationsPlan(validContext, { now: fixedNow }));
});

test("actions are sorted by descending priority score", () => {
  const scores = generateOperationsPlan(validContext, { now: fixedNow }).actions.map((item) => item.score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
});

test("baseline is first in non-incident mode", () => {
  const plan = generateOperationsPlan(validContext, { now: fixedNow });
  assert.equal(plan.actions[0].title, "Set the baseline and operating owner");
});

test("incident mode puts containment first", () => {
  const plan = generateOperationsPlan({ ...validContext, mode: "incident" }, { now: fixedNow });
  assert.equal(plan.actions[0].title, "Contain active impact and establish command");
  assert.equal(plan.update.status, "Incident active");
  assert.ok(plan.runbook.some((group) => group.group === "Containment"));
});

test("action IDs are unique", () => {
  const ids = generateOperationsPlan(validContext, { now: fixedNow }).actions.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("complete context produces plan-ready status", () => {
  assert.equal(generateOperationsPlan(validContext, { now: fixedNow }).update.status, "Plan ready");
});

test("missing baseline data produces needs-baseline status", () => {
  const plan = generateOperationsPlan({ ...validContext, evidence: "", volume: "" }, { now: fixedNow });
  assert.equal(plan.update.status, "Needs baseline");
  assert.ok(plan.questions.some((question) => /baseline data/i.test(question)));
  assert.ok(plan.questions.some((question) => /normal demand/i.test(question)));
});

test("missing owner is visible in brief and questions", () => {
  const plan = generateOperationsPlan({ ...validContext, owner: "" }, { now: fixedNow });
  assert.match(plan.brief.owner, /not yet named/);
  assert.ok(plan.questions.some((question) => /accountability/i.test(question)));
});

test("action-oriented outcomes remain grammatical", () => {
  const plan = generateOperationsPlan(validContext, { now: fixedNow });
  assert.doesNotMatch(plan.brief.strategy, /improve reduce/i);
  assert.match(plan.brief.strategy, /in order to reduce late shipments/i);
});

test("SOP includes explicit roles, controls, and service expectations", () => {
  const plan = generateOperationsPlan(validContext, { now: fixedNow });
  for (const step of plan.sop.steps) {
    assert.ok(step.role);
    assert.ok(step.control);
    assert.ok(step.sla);
  }
});

test("capacity plan exposes staffing formula and surge posture", () => {
  const capacity = generateOperationsPlan(validContext, { now: fixedNow }).capacity;
  assert.match(capacity.formula, /Required productive hours/);
  assert.match(capacity.scenarios.find((item) => item.name === "Surge").posture, /coverage/);
});

test("compliance signals add an evidence control", () => {
  const plan = generateOperationsPlan({ ...validContext, situation: "An audit found compliance policy gaps and missing evidence in access reviews." }, { now: fixedNow });
  assert.ok(plan.controls.some((control) => /regulated step/.test(control.risk)));
});

test("leadership update includes top three next actions", () => {
  const plan = generateOperationsPlan(validContext, { now: fixedNow });
  assert.deepEqual(plan.update.next, plan.actions.slice(0, 3).map((item) => item.title));
});

test("health reflects detected delay and named ownership", () => {
  const health = generateOperationsPlan(validContext, { now: fixedNow }).update.health;
  assert.equal(health.flow, "at risk");
  assert.equal(health.ownership, "named");
});

test("planToMarkdown exports every major artifact", () => {
  const markdown = planToMarkdown(generateOperationsPlan(validContext, { now: fixedNow }));
  for (const heading of ["## Operating brief", "## Standard operating procedure", "## Prioritized action queue", "## Capacity plan", "## Risk and controls", "## Operations runbook", "## Leadership update"]) {
    assert.ok(markdown.includes(heading));
  }
});

test("planToMarkdown includes checklists and scoring table", () => {
  const markdown = planToMarkdown(generateOperationsPlan(validContext, { now: fixedNow }));
  assert.match(markdown, /- \[ \] Name accountable lead and backups/);
  assert.match(markdown, /\| Action \| Score \| Severity \|/);
});

test("planToMarkdown escapes pipes in table cells", () => {
  const plan = generateOperationsPlan(validContext, { now: fixedNow });
  plan.controls[0].risk = "Trust | reliability failure";
  assert.match(planToMarkdown(plan), /Trust \\| reliability/);
});

test("planToMarkdown rejects incomplete plans", () => {
  assert.throws(() => planToMarkdown({}), /valid Orbit Ops plan/);
});

test("serializeWorkspace and parseWorkspace round trip", () => {
  const plan = generateOperationsPlan(validContext, { now: fixedNow });
  assert.deepEqual(parseWorkspace(serializeWorkspace(plan)), plan);
});

test("parseWorkspace accepts a raw supported plan", () => {
  const plan = generateOperationsPlan(validContext, { now: fixedNow });
  assert.deepEqual(parseWorkspace(JSON.stringify(plan)), plan);
});

test("parseWorkspace rejects malformed JSON", () => {
  assert.throws(() => parseWorkspace("{nope"), /not valid JSON/);
});

test("parseWorkspace rejects unsupported objects", () => {
  assert.throws(() => parseWorkspace(JSON.stringify({ app: "elsewhere" })), /not a supported/);
});

test("parseWorkspace rejects oversized imports", () => {
  assert.throws(() => parseWorkspace("x".repeat(1_000_001)), /too large/);
});
