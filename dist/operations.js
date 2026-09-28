const MODES = new Set(["stabilize", "standardize", "scale", "incident", "audit"]);

const SIGNALS = {
  delay: ["delay", "late", "wait", "waiting", "backlog", "cycle time", "slow", "sla"],
  quality: ["quality", "defect", "error", "rework", "incorrect", "mistake", "accuracy"],
  capacity: ["capacity", "volume", "demand", "queue", "overload", "staff", "throughput"],
  handoff: ["handoff", "owner", "ownership", "approval", "escalation", "team", "vendor"],
  reliability: ["reliable", "reliability", "outage", "incident", "failure", "downtime", "unstable"],
  cost: ["cost", "spend", "budget", "waste", "margin", "expensive"],
  compliance: ["compliance", "audit", "policy", "control", "privacy", "security", "regulatory"],
};

export function cleanText(value, maxLength = 4000) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, maxLength);
}

export function slugify(value) {
  const slug = cleanText(value, 120)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "operations-plan";
}

export function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function normalizeContext(input = {}) {
  const context = {
    process: cleanText(input.process, 140) || "Operations process",
    mode: MODES.has(input.mode) ? input.mode : "stabilize",
    owner: cleanText(input.owner, 240),
    situation: cleanText(input.situation, 3000),
    outcome: cleanText(input.outcome, 1000),
    volume: cleanText(input.volume, 1000),
    evidence: cleanText(input.evidence, 2000),
    constraints: cleanText(input.constraints, 1600),
    targetDate: cleanText(input.targetDate, 140),
  };
  if (context.situation.length < 12) throw new Error("Describe the operating problem in at least 12 characters.");
  if (context.outcome.length < 5) throw new Error("Add the operating outcome you need.");
  return context;
}

export function extractSignals(input) {
  const context = typeof input === "string" ? { situation: input } : input || {};
  const text = [context.situation, context.outcome, context.volume, context.evidence, context.constraints]
    .map((value) => cleanText(value).toLowerCase())
    .join(" ");
  const themes = Object.entries(SIGNALS)
    .map(([theme, terms]) => ({ theme, matches: terms.filter((term) => text.includes(term)).length }))
    .filter((item) => item.matches > 0)
    .sort((a, b) => b.matches - a.matches || a.theme.localeCompare(b.theme))
    .map((item) => item.theme);
  const metrics = [...new Set(text.match(/(?:\$\s?)?\d+(?:\.\d+)?\s?(?:%|percent|orders?|tickets?|requests?|cases?|units?|hours?|days?|weeks?|months?|minutes?|k|m)?/gi) || [])]
    .map((metric) => metric.trim())
    .filter(Boolean)
    .slice(0, 10);
  const hasEvidence = cleanText(context.evidence).length >= 15;
  const hasVolume = cleanText(context.volume).length >= 3;
  const unknowns = [!cleanText(context.owner), !hasVolume, !hasEvidence, !cleanText(context.constraints), !cleanText(context.targetDate)].filter(Boolean).length;
  return { themes: themes.length ? themes.slice(0, 4) : ["handoff"], metrics, hasEvidence, hasVolume, unknowns };
}

export function calculatePriority({ severity, frequency, confidence, effort }) {
  const values = [severity, frequency, confidence, effort].map(Number);
  if (values.some((value) => !Number.isFinite(value)) || values[0] < 0 || values[0] > 5 || values[1] < 0 || values[1] > 5 || values[2] < 0 || values[2] > 1 || values[3] <= 0) {
    throw new Error("Priority inputs must be valid: severity/frequency 0–5, confidence 0–1, effort > 0.");
  }
  return Math.round(((values[0] * values[1] * values[2]) / values[3]) * 10) / 10;
}

function sentence(value) {
  const text = cleanText(value).replace(/\s+/g, " ");
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function firstClause(value, fallback) {
  return cleanText(value).split(/[.!?\n]/)[0].trim() || fallback;
}

function outcomeAction(value) {
  const text = firstClause(value, "improve the operating outcome").toLowerCase();
  return /^(increase|reduce|decrease|improve|raise|lower|cut|reach|restore|maintain|eliminate)\b/.test(text) ? text : `improve ${text}`;
}

function actionTemplates(context, signals) {
  const primary = signals.themes[0];
  const owner = context.owner || "the accountable operations owner";
  const confidence = signals.hasEvidence ? 0.88 : 0.64;
  const actions = [
    {
      title: "Set the baseline and operating owner",
      description: `Confirm demand, queue age, completion rate, defects, and cost for ${context.process}; name one accountable owner.`,
      severity: 5, frequency: 5, confidence: signals.hasEvidence ? 0.95 : 0.75, effort: 1,
      owner, dependency: "None",
      done: ["Metric definitions and data window are frozen", "Owner and daily review cadence are published"],
    },
    {
      title: "Map the work and every handoff",
      description: "Trace one representative unit from intake to closure, including queues, decisions, rework loops, systems, and escalation paths.",
      severity: 5, frequency: 5, confidence: 0.9, effort: 1.5,
      owner, dependency: "Baseline",
      done: ["Current-state map includes wait time and touch time", "Every handoff has a sender, receiver, and acceptance rule"],
    },
    {
      title: `Remove the primary ${primary} bottleneck`,
      description: `Run the smallest reversible change that addresses ${firstClause(context.situation, "the operating constraint").toLowerCase()}.`,
      severity: 5, frequency: 4, confidence: Math.max(0.55, confidence - 0.06), effort: 2,
      owner, dependency: "Process map",
      done: ["Change is tested with a defined cohort or shift", "Throughput and guardrails are compared with baseline"],
    },
    {
      title: "Publish the minimum viable SOP",
      description: "Convert the verified flow into a short, role-specific procedure with entry criteria, controls, exceptions, and escalation rules.",
      severity: 4, frequency: 4, confidence, effort: 2,
      owner, dependency: "Verified flow",
      done: ["A new operator can complete the flow without tribal knowledge", "Exceptions and escalation thresholds are explicit"],
    },
    {
      title: "Add quality and exception controls",
      description: "Place preventive checks before irreversible steps and detective checks where failure is easiest to observe.",
      severity: 4, frequency: 4, confidence: 0.82, effort: 2.5,
      owner, dependency: "SOP draft",
      done: ["Control owner and evidence are named", "False positives and bypass rules are reviewed"],
    },
    {
      title: "Pilot with operators and measure adherence",
      description: "Run the SOP with a representative team, observe actual use, capture exceptions, and revise before broad rollout.",
      severity: 4, frequency: 3, confidence: 0.84, effort: 2,
      owner, dependency: "Controls ready",
      done: ["Pilot covers normal and exception paths", "Adherence, cycle time, and defect deltas are reviewed"],
    },
    {
      title: "Build the capacity and coverage model",
      description: "Translate demand, handling time, shrinkage, and service targets into base and surge staffing coverage.",
      severity: 3, frequency: 4, confidence: signals.hasVolume ? 0.85 : 0.58, effort: 2,
      owner, dependency: "Volume baseline",
      done: ["Base, constrained, and surge scenarios exist", "Coverage gaps have owners and triggers"],
    },
    {
      title: "Run the control review and close the loop",
      description: "Audit results, document residual risk, retire temporary workarounds, and assign the next improvement cycle.",
      severity: 2, frequency: 2, confidence: 0.9, effort: 3,
      owner, dependency: "Pilot results",
      done: ["Results and residual risks are signed off", "Temporary controls are removed or made permanent"],
    },
  ];
  if (context.mode === "incident") {
    actions.push({
      title: "Contain active impact and establish command",
      description: "Stop further harm, define incident roles, set the update interval, preserve evidence, and publish the next checkpoint.",
      severity: 5, frequency: 5, confidence: 0.98, effort: 0.5,
      owner, dependency: "None",
      done: ["Impact is bounded and command roles are active", "Stakeholders know the next update time"],
    });
  }
  return actions;
}

function buildActions(context, signals) {
  return actionTemplates(context, signals)
    .map((item, index) => ({
      id: `action-${index + 1}-${stableHash(item.title)}`,
      ...item,
      score: calculatePriority(item),
      status: "not-started",
    }))
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

function buildQuestions(context, signals) {
  const questions = [];
  if (!context.owner) questions.push("Who has one-person accountability for the end-to-end outcome—not just an individual step?");
  if (!signals.hasVolume) questions.push("What is normal demand by hour, day, and week, and how volatile is it?");
  if (!signals.hasEvidence) questions.push("Which baseline data confirms the failure rate, delay, cost, or customer impact?");
  if (!context.constraints) questions.push("Which policy, system, staffing, vendor, or budget constraints cannot change in this cycle?");
  if (!context.targetDate) questions.push("When must the process be stable, and what event makes that date real?");
  questions.push("What threshold requires escalation, rollback, or incident command?");
  questions.push("Which exception is common enough to design into the standard flow?");
  return questions.slice(0, 7);
}

function buildSop(context) {
  const owner = context.owner || "Operations owner";
  return [
    { step: 1, name: "Receive", role: "Intake owner", input: "New request or demand signal", action: "Capture required fields, timestamp, source, priority, and promised service level.", output: "Complete work record", control: "Reject incomplete intake with a named reason", sla: "At receipt" },
    { step: 2, name: "Validate", role: "Queue lead", input: "Complete work record", action: "Verify eligibility, duplicates, risk flags, and the correct service path.", output: "Accepted, rerouted, or rejected item", control: "High-risk flags require second review", sla: "Within one review interval" },
    { step: 3, name: "Prioritize", role: owner, input: "Validated queue", action: "Sequence work by impact, urgency, dependency, and service commitment—not arrival time alone.", output: "Ordered queue and owner", control: "Overrides require reason and expiry", sla: "Before assignment" },
    { step: 4, name: "Execute", role: "Assigned operator", input: "Prioritized item", action: "Complete the standard work, recording exceptions and evidence at the point of action.", output: "Completed work with evidence", control: "Irreversible steps require confirmation", sla: "Per service target" },
    { step: 5, name: "Verify", role: "Quality checker", input: "Completed work", action: "Check critical fields, outcome, policy compliance, and downstream readiness.", output: "Approved result or rework", control: "Sample rate rises automatically after a defect trigger", sla: "Before release" },
    { step: 6, name: "Close", role: "Assigned operator", input: "Verified result", action: "Notify the recipient, record final disposition, and close linked tasks and timers.", output: "Closed item and visible outcome", control: "Closure requires evidence and recipient status", sla: "Immediately after verification" },
    { step: 7, name: "Learn", role: owner, input: "Daily exceptions and metrics", action: "Review trend shifts, repeat exceptions, aging, and control failures; assign corrective work.", output: "Decision log and improvement actions", control: "Repeat failures trigger root-cause review", sla: "Daily or per shift" },
  ];
}

function buildControls(context, signals) {
  const controls = [
    { risk: "Work enters the process without enough information.", type: "Preventive", control: "Required intake fields and automated completeness check.", owner: "Intake owner", cadence: "Every item", evidence: "Intake validation record" },
    { risk: "Priority overrides crowd out important work.", type: "Detective", control: "Override reason, approver, expiry, and aging review.", owner: context.owner || "Queue lead", cadence: "Daily", evidence: "Override and aging log" },
    { risk: "Errors reach the customer or downstream team.", type: "Preventive + detective", control: "Critical-step confirmation plus risk-based quality sampling.", owner: "Quality owner", cadence: "Every high-risk item; sampled remainder", evidence: "Quality result and defect code" },
    { risk: "Volume exceeds safe capacity without escalation.", type: "Detective", control: "Queue and forecast thresholds trigger surge coverage or demand shaping.", owner: context.owner || "Operations owner", cadence: "Each review interval", evidence: "Capacity dashboard and trigger log" },
    { risk: "The SOP drifts from actual work.", type: "Detective", control: "Operator observation, exception review, and scheduled SOP attestation.", owner: "Process owner", cadence: "Monthly and after material change", evidence: "Attestation and revision history" },
  ];
  if (signals.themes.includes("compliance")) {
    controls.push({ risk: "A regulated step lacks retrievable evidence.", type: "Preventive", control: "Block closure until required evidence is attached and retention rules pass.", owner: "Compliance owner", cadence: "Every regulated item", evidence: "Immutable evidence reference" });
  }
  return controls;
}

function buildCapacity(context, signals) {
  const demand = context.volume || "Demand volume and arrival pattern are not supplied; establish these before staffing decisions.";
  return {
    demand,
    assumptions: [
      "Use completed units—not logged-in hours—as the throughput denominator.",
      "Separate touch time from queue time and exclude rework from first-pass completion.",
      "Model shrinkage for meetings, training, leave, and incident work.",
      "Protect a surge buffer instead of staffing the base case to 100% utilization.",
    ],
    scenarios: [
      { name: "Constrained", load: "80% of expected capacity", posture: "Freeze lower-value work; protect critical service levels.", trigger: "Backlog age or absence threshold breached" },
      { name: "Base", load: "60–75% planned utilization", posture: "Run standard staffing with protected improvement capacity.", trigger: "Normal demand band" },
      { name: "Surge", load: "Demand exceeds 90% of capacity", posture: "Activate cross-trained coverage, narrow intake, and increase review frequency.", trigger: "Forecast or queue threshold breached" },
    ],
    bottleneck: signals.themes[0] === "capacity" ? "Capacity and arrival-rate mismatch" : `The ${signals.themes[0]} constraint is the first bottleneck to validate.`,
    formula: "Required productive hours = demand × average touch time ÷ first-pass yield. Scheduled hours = productive hours ÷ (1 − shrinkage).",
  };
}

function buildRunbook(context) {
  const incident = context.mode === "incident";
  return [
    { group: "Command", items: ["Name accountable lead and backups", "Define severity and activation threshold", "Set update channel and cadence"] },
    { group: incident ? "Containment" : "Before work", items: incident ? ["Stop further impact", "Preserve evidence and timeline", "Apply reversible workaround"] : ["Check staffing and system readiness", "Review queue, exceptions, and priority overrides", "Confirm coverage and escalation contacts"] },
    { group: "Execution", items: ["Follow critical-step confirmations", "Log exceptions at the point of work", "Escalate threshold breaches immediately"] },
    { group: "Communication", items: ["Publish impact, actions, owner, and next update", "Separate confirmed facts from hypotheses", "Notify affected partners of changed commitments"] },
    { group: "Closeout", items: ["Verify service and backlog recovery", "Remove temporary access and workarounds", "Capture decisions, residual risk, and follow-up owners"] },
  ];
}

export function generateOperationsPlan(input, options = {}) {
  const context = normalizeContext(input);
  const signals = extractSignals(context);
  const createdAt = options.now ? new Date(options.now).toISOString() : new Date().toISOString();
  const owner = context.owner || "Accountable owner not yet named";
  const targetDate = context.targetDate || "No fixed target date; sequence around risk reduction and measured stability.";
  const actions = buildActions(context, signals);
  const status = context.mode === "incident" ? "Incident active" : (!signals.hasEvidence || !signals.hasVolume ? "Needs baseline" : "Plan ready");
  const questions = buildQuestions(context, signals);
  const plan = {
    schemaVersion: 1,
    id: `ops-${stableHash(JSON.stringify(context) + createdAt)}`,
    createdAt,
    context,
    signals,
    brief: {
      situation: sentence(context.situation),
      outcome: sentence(context.outcome),
      owner,
      demand: context.volume || "Demand profile not supplied.",
      evidence: context.evidence || "No operating baseline has been supplied yet.",
      strategy: `Stabilize the flow, make ownership visible, remove the highest-impact constraint, then standardize only what has been proven to work in order to ${outcomeAction(context.outcome)}.`,
      targetDate,
    },
    questions,
    sop: {
      title: `${context.process} — minimum viable SOP`,
      purpose: `Create a safe, observable, and repeatable flow that can ${outcomeAction(context.outcome)} without relying on tribal knowledge.`,
      entry: "A complete, eligible work item with a recorded source, priority, and service commitment.",
      exit: "A verified outcome, visible recipient status, retained evidence, and closed timers.",
      steps: buildSop(context),
      exceptions: ["Missing or conflicting intake data", "High-risk or policy-sensitive request", "Dependency unavailable", "Service-level breach likely", "Quality check fails twice"],
    },
    actions,
    capacity: buildCapacity(context, signals),
    controls: buildControls(context, signals),
    runbook: buildRunbook(context),
    decisions: [
      { decision: `Operate ${context.process} with one end-to-end accountable owner.`, rationale: "Shared contribution is useful; shared accountability hides tradeoffs and delays escalation.", status: "proposed" },
      { decision: "Use flow, quality, service, and cost together to judge improvement.", rationale: "A faster process that creates rework or risk is not an operating improvement.", status: "proposed" },
    ],
    update: {
      headline: `${context.process}: ${context.outcome}`,
      status,
      summary: `The operating issue is ${firstClause(context.situation, "under review").toLowerCase()}. The plan establishes the baseline and owner, maps the flow, removes the primary constraint, then pilots a controlled SOP before scale.`,
      health: {
        flow: signals.themes.includes("delay") || signals.themes.includes("capacity") ? "at risk" : "unverified",
        quality: signals.themes.includes("quality") ? "at risk" : "unverified",
        controls: signals.themes.includes("compliance") ? "at risk" : "unverified",
        ownership: context.owner ? "named" : "open",
      },
      progress: ["Operating problem and target outcome are framed.", `${actions.length} actions are prioritized by severity, frequency, confidence, and effort.`, `${buildControls(context, signals).length} controls and a full execution runbook are defined.`],
      next: actions.slice(0, 3).map((item) => item.title),
      asks: questions.slice(0, 3),
    },
  };
  return plan;
}

function lineList(items) { return items.map((item) => `- ${item}`).join("\n"); }
function tableCell(value) { return cleanText(value).replace(/\|/g, "\\|").replace(/\n/g, " "); }

export function planToMarkdown(plan) {
  if (!plan?.context || !plan?.brief || !Array.isArray(plan.actions)) throw new Error("A valid Orbit Ops plan is required for Markdown export.");
  const steps = plan.sop.steps.map((step) => `| ${step.step} | ${tableCell(step.name)} | ${tableCell(step.role)} | ${tableCell(step.action)} | ${tableCell(step.control)} | ${tableCell(step.sla)} |`).join("\n");
  const actions = plan.actions.map((item) => `| ${tableCell(item.title)} | ${item.score} | ${item.severity} | ${item.frequency} | ${Math.round(item.confidence * 100)}% | ${item.effort} | ${tableCell(item.owner)} |`).join("\n");
  const controls = plan.controls.map((item) => `| ${tableCell(item.risk)} | ${item.type} | ${tableCell(item.control)} | ${tableCell(item.owner)} | ${item.cadence} |`).join("\n");
  const runbook = plan.runbook.map((group) => `### ${group.group}\n${group.items.map((item) => `- [ ] ${item}`).join("\n")}`).join("\n\n");
  return `# ${plan.context.process} operations plan\n\n_Generated by Orbit Ops on ${new Date(plan.createdAt).toLocaleDateString("en-US", { dateStyle: "long", timeZone: "UTC" })}_\n\n## Operating brief\n\n**Situation**\n${plan.brief.situation}\n\n**Outcome**\n${plan.brief.outcome}\n\n**Owner**\n${plan.brief.owner}\n\n**Demand**\n${plan.brief.demand}\n\n**Evidence**\n${plan.brief.evidence}\n\n**Strategy**\n${plan.brief.strategy}\n\n## Open decisions\n\n${lineList(plan.questions)}\n\n## Standard operating procedure\n\n${plan.sop.purpose}\n\n**Entry:** ${plan.sop.entry}\n\n**Exit:** ${plan.sop.exit}\n\n| # | Step | Role | Action | Control | SLA |\n| ---: | --- | --- | --- | --- | --- |\n${steps}\n\n### Exceptions\n${lineList(plan.sop.exceptions)}\n\n## Prioritized action queue\n\n| Action | Score | Severity | Frequency | Confidence | Effort | Owner |\n| --- | ---: | ---: | ---: | ---: | ---: | --- |\n${actions}\n\n## Capacity plan\n\n**Demand:** ${plan.capacity.demand}\n\n**First bottleneck to validate:** ${plan.capacity.bottleneck}\n\n**Sizing formula:** ${plan.capacity.formula}\n\n### Assumptions\n${lineList(plan.capacity.assumptions)}\n\n### Scenarios\n${plan.capacity.scenarios.map((item) => `- **${item.name} (${item.load}):** ${item.posture} Trigger: ${item.trigger}.`).join("\n")}\n\n## Risk and controls\n\n| Risk | Type | Control | Owner | Cadence |\n| --- | --- | --- | --- | --- |\n${controls}\n\n## Operations runbook\n\n${runbook}\n\n## Leadership update\n\n**${plan.update.status}: ${plan.update.headline}**\n\n${plan.update.summary}\n\n### Progress\n${lineList(plan.update.progress)}\n\n### Next\n${lineList(plan.update.next)}\n\n### Asks\n${lineList(plan.update.asks)}\n`;
}

export function serializeWorkspace(plan) {
  if (!plan?.id || !plan?.context) throw new Error("A valid operations plan is required.");
  return JSON.stringify({ app: "orbit-ops", exportedAt: new Date().toISOString(), plan }, null, 2);
}

export function parseWorkspace(raw) {
  if (typeof raw !== "string" || raw.length > 1_000_000) throw new Error("Workspace file is empty or too large.");
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error("Workspace file is not valid JSON."); }
  const plan = data?.app === "orbit-ops" ? data.plan : data;
  if (!plan?.id || plan?.schemaVersion !== 1 || !plan?.context || !plan?.sop || !Array.isArray(plan?.actions)) throw new Error("This is not a supported Orbit Ops workspace.");
  return plan;
}
