function requiredString(input, key, minimum = 1) {
  const value = typeof input?.[key] === "string" ? input[key].trim() : "";
  if (value.length < minimum) throw new Error(`${key} is required.`);
  return value;
}

export function registerOperationsTools({ modelContext, runWorkflow, readPlan, toMarkdown, signal }) {
  if (!modelContext?.registerTool) return { supported: false, count: 0 };
  if (![runWorkflow, readPlan, toMarkdown].every((value) => typeof value === "function")) {
    throw new Error("WebMCP registration requires workflow callbacks.");
  }

  const registrations = [
    {
      name: "run_operations_workflow",
      title: "Run operations workflow",
      description: "Turn an operating problem into a brief, SOP, prioritized action queue, capacity plan, controls, runbook, and leadership update.",
      inputSchema: {
        type: "object",
        properties: {
          process: { type: "string", description: "Process or operation name" },
          mode: { type: "string", enum: ["stabilize", "standardize", "scale", "incident", "audit"] },
          owner: { type: "string" },
          situation: { type: "string", minLength: 12 },
          outcome: { type: "string", minLength: 5 },
          volume: { type: "string" },
          evidence: { type: "string" },
          constraints: { type: "string" },
          targetDate: { type: "string" },
        },
        required: ["process", "situation", "outcome"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      async execute(input) {
        const context = {
          process: requiredString(input, "process"),
          situation: requiredString(input, "situation", 12),
          outcome: requiredString(input, "outcome", 5),
          mode: input?.mode || "stabilize",
          owner: input?.owner || "",
          volume: input?.volume || "",
          evidence: input?.evidence || "",
          constraints: input?.constraints || "",
          targetDate: input?.targetDate || "",
        };
        const plan = await runWorkflow(context);
        return {
          planId: plan.id,
          process: plan.context.process,
          status: plan.update.status,
          prioritizedActions: plan.actions.length,
          controls: plan.controls.length,
          openDecisions: plan.questions.length,
        };
      },
    },
    {
      name: "read_current_operations_plan",
      title: "Read current operations plan",
      description: "Read a concise summary of the operating plan currently shown in Orbit Ops.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async execute() {
        const plan = await readPlan();
        if (!plan) return { available: false };
        return {
          available: true,
          planId: plan.id,
          process: plan.context.process,
          objective: plan.brief.outcome,
          status: plan.update.status,
          topPriorities: plan.actions.slice(0, 3).map((item) => ({ title: item.title, score: item.score })),
          openDecisions: plan.questions,
        };
      },
    },
    {
      name: "export_current_operations_plan",
      title: "Export current operations plan",
      description: "Return the complete current Orbit Ops plan as Markdown without changing it.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async execute() {
        const plan = await readPlan();
        if (!plan) throw new Error("No operations plan is available yet.");
        return { planId: plan.id, markdown: await toMarkdown(plan) };
      },
    },
  ];

  for (const tool of registrations) {
    void Promise.resolve(modelContext.registerTool(tool, signal ? { signal } : undefined)).catch(() => {});
  }
  return { supported: true, count: registrations.length, names: registrations.map((tool) => tool.name) };
}
