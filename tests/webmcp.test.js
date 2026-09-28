import test from "node:test";
import assert from "node:assert/strict";
import { generateOperationsPlan, planToMarkdown } from "../dist/operations.js";
import { registerOperationsTools } from "../dist/webmcp.js";

const context = {
  process: "Case routing",
  mode: "stabilize",
  owner: "Support operations",
  situation: "Enterprise cases wait too long because routing and ownership are unclear.",
  outcome: "Reduce high-severity response time below one hour",
};

function harness(current = null) {
  const tools = new Map();
  return {
    tools,
    modelContext: { registerTool(tool, options) { tools.set(tool.name, { ...tool, options }); } },
    callbacks: {
      runWorkflow(input) {
        current = generateOperationsPlan(input, { now: "2026-09-27T12:00:00.000Z" });
        return current;
      },
      readPlan() { return current; },
      toMarkdown: planToMarkdown,
    },
  };
}

test("returns unsupported when modelContext is absent", () => {
  assert.deepEqual(registerOperationsTools({}), { supported: false, count: 0 });
});

test("requires workflow callbacks", () => {
  assert.throws(() => registerOperationsTools({ modelContext: { registerTool() {} } }), /requires workflow callbacks/);
});

test("registers three stable tools", () => {
  const kit = harness();
  const result = registerOperationsTools({ modelContext: kit.modelContext, ...kit.callbacks });
  assert.equal(result.count, 3);
  assert.deepEqual(result.names, ["run_operations_workflow", "read_current_operations_plan", "export_current_operations_plan"]);
  assert.equal(kit.tools.size, 3);
});

test("marks mutating and read-only tools correctly", () => {
  const kit = harness();
  registerOperationsTools({ modelContext: kit.modelContext, ...kit.callbacks });
  assert.equal(kit.tools.get("run_operations_workflow").annotations.readOnlyHint, false);
  assert.equal(kit.tools.get("read_current_operations_plan").annotations.readOnlyHint, true);
  assert.equal(kit.tools.get("export_current_operations_plan").annotations.readOnlyHint, true);
});

test("passes an AbortSignal into registrations", () => {
  const kit = harness();
  const controller = new AbortController();
  registerOperationsTools({ modelContext: kit.modelContext, ...kit.callbacks, signal: controller.signal });
  assert.equal(kit.tools.get("run_operations_workflow").options.signal, controller.signal);
});

test("run tool executes workflow and returns a concise result", async () => {
  const kit = harness();
  registerOperationsTools({ modelContext: kit.modelContext, ...kit.callbacks });
  const result = await kit.tools.get("run_operations_workflow").execute(context);
  assert.match(result.planId, /^ops-/);
  assert.ok(result.prioritizedActions >= 8);
  assert.ok(result.controls >= 5);
  assert.ok(result.openDecisions >= 2);
});

test("run tool rejects missing process without mutating state", async () => {
  const kit = harness();
  registerOperationsTools({ modelContext: kit.modelContext, ...kit.callbacks });
  await assert.rejects(() => kit.tools.get("run_operations_workflow").execute({ ...context, process: "" }), /process is required/);
  assert.equal(await kit.callbacks.readPlan(), null);
});

test("run tool rejects a short situation without mutating state", async () => {
  const kit = harness();
  registerOperationsTools({ modelContext: kit.modelContext, ...kit.callbacks });
  await assert.rejects(() => kit.tools.get("run_operations_workflow").execute({ ...context, situation: "Too short" }), /situation is required/);
  assert.equal(await kit.callbacks.readPlan(), null);
});

test("read tool reports the empty state", async () => {
  const kit = harness();
  registerOperationsTools({ modelContext: kit.modelContext, ...kit.callbacks });
  assert.deepEqual(await kit.tools.get("read_current_operations_plan").execute({}), { available: false });
});

test("read tool returns current priorities after a run", async () => {
  const kit = harness();
  registerOperationsTools({ modelContext: kit.modelContext, ...kit.callbacks });
  await kit.tools.get("run_operations_workflow").execute(context);
  const result = await kit.tools.get("read_current_operations_plan").execute({});
  assert.equal(result.available, true);
  assert.equal(result.topPriorities.length, 3);
  assert.match(result.objective, /Reduce high-severity/);
});

test("export tool fails clearly when no plan exists", async () => {
  const kit = harness();
  registerOperationsTools({ modelContext: kit.modelContext, ...kit.callbacks });
  await assert.rejects(() => kit.tools.get("export_current_operations_plan").execute({}), /No operations plan/);
});

test("export tool returns Markdown for the current plan", async () => {
  const plan = generateOperationsPlan(context, { now: "2026-09-27T12:00:00.000Z" });
  const kit = harness(plan);
  registerOperationsTools({ modelContext: kit.modelContext, ...kit.callbacks });
  const result = await kit.tools.get("export_current_operations_plan").execute({});
  assert.equal(result.planId, plan.id);
  assert.match(result.markdown, /^# Case routing operations plan/);
});
