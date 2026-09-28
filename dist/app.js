import {
  generateOperationsPlan,
  parseWorkspace,
  planToMarkdown,
  serializeWorkspace,
  slugify,
} from "./operations.js";
import { registerOperationsTools } from "./webmcp.js";

const STORAGE_KEY = "orbit-ops-current-v1";
const HISTORY_KEY = "orbit-ops-history-v1";
const CHECK_KEY = "orbit-ops-checks-v1";

const form = document.querySelector("#ops-form");
const emptyState = document.querySelector("#empty-state");
const planView = document.querySelector("#plan-view");
const planKicker = document.querySelector("#plan-kicker");
const planTitle = document.querySelector("#plan-title");
const planStatus = document.querySelector("#plan-status");
const artifactContent = document.querySelector("#artifact-content");
const artifactNav = document.querySelector("#artifact-nav");
const formError = document.querySelector("#form-error");
const historyList = document.querySelector("#history-list");
const toast = document.querySelector("#toast");
const exportButton = document.querySelector("#export-menu-button");
const exportMenu = document.querySelector("#export-menu");
const importInput = document.querySelector("#import-file");

let currentPlan = null;
let currentView = "brief";
let toastTimer;

const SAMPLES = {
  backlog: {
    process: "Direct-to-customer order fulfillment",
    mode: "stabilize",
    owner: "Fulfillment operations lead",
    situation: "A growing order backlog causes 18% of orders to leave the warehouse late. Work is released in large batches, priority overrides are common, and handoffs between picking, packing, and carrier staging have no shared acceptance rule.",
    outcome: "Reduce orders shipped late from 18% to below 5% while keeping pick errors under 1%",
    volume: "1,800 orders per weekday, 2,700 on Mondays; current backlog is 3,400 orders; average touch time is 11 minutes.",
    evidence: "Six weeks of warehouse data show median cycle time of 31 hours and a 42-hour Monday peak. Half of late orders waited more than 16 hours before picking started.",
    constraints: "No added warehouse space this quarter; carrier cutoff is fixed; up to four temporary operators are available.",
    targetDate: "Stable before the November peak period",
  },
  incident: {
    process: "Customer support case routing",
    mode: "incident",
    owner: "Support incident commander",
    situation: "A routing rule change sends high-severity enterprise cases to the general queue. Response times are climbing, ownership is unclear across regions, and several customers have missed their contracted response window.",
    outcome: "Restore correct routing and clear every breached high-severity case within six hours",
    volume: "620 cases entered since the change; 74 are high severity and 21 have breached SLA.",
    evidence: "Logs show the routing change at 09:12 UTC. Manual review confirms the wrong queue on 68 of 74 high-severity cases.",
    constraints: "The routing engine cannot be redeployed during the current freeze; a reversible manual rule is available.",
    targetDate: "Containment in 30 minutes; recovery today",
  },
  audit: {
    process: "Vendor access review",
    mode: "audit",
    owner: "Security operations manager",
    situation: "Quarterly vendor access reviews depend on spreadsheets and email approvals. Evidence is incomplete for 22% of active vendors, overdue access is not consistently removed, and reviewers interpret policy differently.",
    outcome: "Reach 100% retrievable access evidence and close high-risk exceptions within five business days",
    volume: "186 active vendor accounts across 14 systems; 41 require enhanced review.",
    evidence: "The internal audit sample found 9 of 40 accounts without complete approval or removal evidence and 3 accounts active after contract end.",
    constraints: "Existing identity and ticketing systems must remain; audit evidence must be retained for seven years.",
    targetDate: "Evidence complete before the October 25 audit",
  },
};

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function card(label, text, options = {}) {
  const node = element("section", `card${options.accent ? " card-accent" : ""}`);
  node.append(element("span", "card-label", label));
  if (options.title) node.append(element("h3", "", options.title));
  if (text) node.append(element("p", "", text));
  return node;
}

function list(items, className = "plain-list") {
  const node = element("ul", className);
  for (const item of items) node.append(element("li", "", item));
  return node;
}

function sectionWithList(label, items, options = {}) {
  const node = card(label, "", options);
  node.append(list(items, options.decision ? "plain-list decision-list" : "plain-list"));
  return node;
}

function loadJSON(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function storeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3000);
}

function formContext() {
  const data = new FormData(form);
  return Object.fromEntries([...data.entries()].map(([key, value]) => [key, String(value)]));
}

function fillForm(context) {
  for (const [key, value] of Object.entries(context || {})) {
    const control = form.elements.namedItem(key);
    if (control) control.value = value;
  }
  if (context?.owner || context?.volume || context?.evidence || context?.constraints || context?.targetDate) {
    document.querySelector(".context-details").open = true;
  }
}

function persistPlan(plan) {
  storeJSON(STORAGE_KEY, plan);
  const history = loadJSON(HISTORY_KEY, []).filter((item) => item?.id && item.id !== plan.id);
  history.unshift(plan);
  storeJSON(HISTORY_KEY, history.slice(0, 8));
  renderHistory();
}

function renderHistory() {
  const history = loadJSON(HISTORY_KEY, []).filter((item) => item?.id && item?.context);
  historyList.replaceChildren();
  if (!history.length) {
    historyList.append(element("p", "history-empty", "Your operating plans will appear here."));
    return;
  }
  for (const plan of history) {
    const button = element("button", "history-item");
    button.type = "button";
    button.dataset.planId = plan.id;
    button.append(element("b", "", plan.context.process || "Operations plan"));
    const date = new Date(plan.createdAt);
    button.append(element("small", "", `${plan.update?.status || "Plan"} · ${Number.isNaN(date.valueOf()) ? "Saved" : date.toLocaleDateString()}`));
    historyList.append(button);
  }
}

function setCurrentPlan(plan, { persist = true, view = "brief" } = {}) {
  currentPlan = plan;
  currentView = view;
  if (persist) persistPlan(plan);
  fillForm(plan.context);
  emptyState.hidden = true;
  planView.hidden = false;
  for (const button of artifactNav.querySelectorAll("button")) button.disabled = false;
  renderCurrentView();
}

function titleForView(view) {
  return {
    sop: "Standard work that survives the real world",
    actions: "Work sequenced by operational leverage",
    capacity: "Coverage for base, constrained, and surge demand",
    controls: "Risks made observable and owned",
    runbook: "What the team does when pressure rises",
    update: "A decision-ready leadership readout",
  }[view];
}

function renderCurrentView() {
  if (!currentPlan) return;
  const labels = {
    brief: "Operating brief",
    sop: "Standard operating procedure",
    actions: "Prioritized action queue",
    capacity: "Capacity model",
    controls: "Risk & controls",
    runbook: "Execution runbook",
    update: "Leadership update",
  };
  artifactContent.replaceChildren();
  planKicker.textContent = labels[currentView];
  planTitle.textContent = currentView === "brief" ? currentPlan.context.process : titleForView(currentView);
  planStatus.textContent = currentPlan.update.status;
  planStatus.dataset.status = currentPlan.update.status;
  for (const button of artifactNav.querySelectorAll("button")) button.classList.toggle("active", button.dataset.view === currentView);
  ({ brief: renderBrief, sop: renderSop, actions: renderActions, capacity: renderCapacity, controls: renderControls, runbook: renderRunbook, update: renderUpdate }[currentView])(currentPlan);
}

function renderBrief(plan) {
  artifactContent.append(card("Operating strategy", plan.brief.strategy, { accent: true }));
  const grid = element("div", "card-grid");
  grid.append(
    card("Situation", plan.brief.situation),
    card("Required outcome", plan.brief.outcome),
    card("Accountability", plan.brief.owner),
    card("Demand", plan.brief.demand),
    card("Evidence", plan.brief.evidence),
    card("Target timing", plan.brief.targetDate),
  );
  artifactContent.append(grid, sectionWithList("Decisions to close", plan.questions, { decision: true }));
}

function renderSop(plan) {
  const meta = element("div", "sop-meta");
  meta.append(card("Entry criteria", plan.sop.entry), card("Exit criteria", plan.sop.exit));
  artifactContent.append(card("Purpose", plan.sop.purpose, { accent: true }), meta);
  const steps = element("section", "card");
  steps.append(element("span", "card-label", plan.sop.title));
  for (const step of plan.sop.steps) {
    const row = element("article", "sop-step");
    row.append(element("div", "step-number", String(step.step).padStart(2, "0")));
    const body = element("div");
    body.append(element("h3", "", step.name), element("p", "", step.action));
    const metaRow = element("div", "step-meta");
    metaRow.append(element("span", "", step.role), element("span", "", step.sla), element("span", "", `OUT: ${step.output}`));
    body.append(metaRow, element("div", "control-note", `Control: ${step.control}`));
    row.append(body);
    steps.append(row);
  }
  artifactContent.append(steps, sectionWithList("Exception paths", plan.sop.exceptions));
}

function renderActions(plan) {
  const checks = loadJSON(CHECK_KEY, {});
  const wrapper = element("div", "table-wrap");
  const table = element("table");
  const head = element("thead");
  const headerRow = element("tr");
  for (const heading of ["Action", "Score", "Severity", "Frequency", "Confidence", "Effort"]) headerRow.append(element("th", "", heading));
  head.append(headerRow);
  const body = element("tbody");
  for (const item of plan.actions) {
    const checkId = `${plan.id}:${item.id}`;
    const row = element("tr", checks[checkId] ? "done" : "");
    const work = element("td");
    const cell = element("div", "work-cell");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(checks[checkId]);
    checkbox.dataset.checkId = checkId;
    checkbox.setAttribute("aria-label", `Mark ${item.title} complete`);
    const text = element("div");
    text.append(element("span", "work-title", item.title), element("span", "work-desc", `${item.description} Owner: ${item.owner}. Depends on: ${item.dependency}.`));
    cell.append(checkbox, text);
    work.append(cell);
    row.append(work, scoreCell(item.score), numberCell(item.severity), numberCell(item.frequency), numberCell(`${Math.round(item.confidence * 100)}%`), numberCell(item.effort));
    body.append(row);
  }
  table.append(head, body);
  wrapper.append(table);
  artifactContent.append(wrapper, element("p", "legend", "Priority = severity × frequency × confidence ÷ effort. Treat the ranking as a decision aid and update it when evidence changes."));
}

function scoreCell(value) {
  const cell = element("td");
  cell.append(element("span", "score", String(value)));
  return cell;
}
function numberCell(value) { return element("td", "number", String(value)); }

function renderCapacity(plan) {
  artifactContent.append(card("Demand profile", plan.capacity.demand, { accent: true }));
  const grid = element("div", "card-grid triple-grid");
  for (const scenario of plan.capacity.scenarios) {
    const node = card("Operating state", scenario.posture, { title: scenario.name });
    node.classList.add("scenario");
    node.prepend(element("b", "", scenario.load));
    node.append(element("p", "control-note", `Trigger: ${scenario.trigger}`));
    grid.append(node);
  }
  artifactContent.append(grid, element("div", "formula", plan.capacity.formula));
  const lower = element("div", "card-grid");
  lower.append(card("First bottleneck to validate", plan.capacity.bottleneck), sectionWithList("Planning assumptions", plan.capacity.assumptions));
  artifactContent.append(lower);
}

function renderControls(plan) {
  const wrapper = element("div", "table-wrap");
  const table = element("table");
  const head = element("thead");
  const row = element("tr");
  for (const heading of ["Risk", "Type", "Control", "Owner", "Cadence", "Evidence"]) row.append(element("th", "", heading));
  head.append(row);
  const body = element("tbody");
  for (const control of plan.controls) {
    const tr = element("tr");
    for (const value of [control.risk, control.type, control.control, control.owner, control.cadence, control.evidence]) tr.append(element("td", "", value));
    body.append(tr);
  }
  table.append(head, body);
  wrapper.append(table);
  artifactContent.append(wrapper);
  const decisions = element("div", "card-grid");
  for (const item of plan.decisions) decisions.append(card(item.status, item.rationale, { title: item.decision }));
  artifactContent.append(decisions);
}

function renderRunbook(plan) {
  const checks = loadJSON(CHECK_KEY, {});
  for (const group of plan.runbook) {
    const node = element("section", "runbook-group");
    node.append(element("h3", "", group.group));
    group.items.forEach((item, index) => {
      const checkId = `${plan.id}:runbook:${group.group}:${index}`;
      const row = element("label", "check-row");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = Boolean(checks[checkId]);
      checkbox.dataset.checkId = checkId;
      row.append(checkbox, element("span", "", item));
      node.append(row);
    });
    artifactContent.append(node);
  }
}

function renderUpdate(plan) {
  const health = element("div", "health-grid");
  for (const [label, value] of Object.entries(plan.update.health)) {
    const node = element("div", "health");
    node.dataset.health = value;
    node.append(element("i"), element("span", "card-label", label), element("b", "", value));
    health.append(node);
  }
  artifactContent.append(health, card(plan.update.status, plan.update.summary, { title: plan.update.headline, accent: true }));
  const grid = element("div", "update-copy");
  grid.append(sectionWithList("Progress", plan.update.progress), sectionWithList("Next", plan.update.next), sectionWithList("Leadership asks", plan.update.asks));
  const copyButton = element("button", "copy-button", "Copy leadership update");
  copyButton.type = "button";
  copyButton.dataset.copyUpdate = "true";
  grid.append(copyButton);
  artifactContent.append(grid);
}

function leadershipText(plan) {
  return `${plan.update.status}: ${plan.update.headline}\n\n${plan.update.summary}\n\nProgress\n${plan.update.progress.map((item) => `• ${item}`).join("\n")}\n\nNext\n${plan.update.next.map((item) => `• ${item}`).join("\n")}\n\nAsks\n${plan.update.asks.map((item) => `• ${item}`).join("\n")}`;
}

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function runWorkflow(context) {
  const plan = generateOperationsPlan(context);
  formError.hidden = true;
  setCurrentPlan(plan);
  document.querySelector("#output").scrollIntoView({ behavior: "smooth", block: "start" });
  return plan;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    runWorkflow(formContext());
    showToast("Operating system ready");
  } catch (error) {
    formError.textContent = error.message;
    formError.hidden = false;
  }
});

document.querySelector(".sample-row").addEventListener("click", (event) => {
  const sample = SAMPLES[event.target.closest("button")?.dataset.sample];
  if (!sample) return;
  fillForm(sample);
  showToast("Example loaded — review or run it");
});

artifactNav.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-view]");
  if (!button || button.disabled || !currentPlan) return;
  currentView = button.dataset.view;
  renderCurrentView();
  document.querySelector("#output").scrollIntoView({ behavior: "smooth", block: "start" });
});

artifactContent.addEventListener("change", (event) => {
  const checkbox = event.target.closest("input[data-check-id]");
  if (!checkbox) return;
  const checks = loadJSON(CHECK_KEY, {});
  checks[checkbox.dataset.checkId] = checkbox.checked;
  storeJSON(CHECK_KEY, checks);
  checkbox.closest("tr")?.classList.toggle("done", checkbox.checked);
});

artifactContent.addEventListener("click", async (event) => {
  if (!event.target.closest("[data-copy-update]") || !currentPlan) return;
  try {
    await navigator.clipboard.writeText(leadershipText(currentPlan));
    showToast("Leadership update copied");
  } catch {
    showToast("Clipboard access is unavailable");
  }
});

historyList.addEventListener("click", (event) => {
  const id = event.target.closest("button[data-plan-id]")?.dataset.planId;
  const plan = loadJSON(HISTORY_KEY, []).find((item) => item.id === id);
  if (plan) setCurrentPlan(plan, { persist: false });
});

document.querySelector("#clear-history").addEventListener("click", () => {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
  showToast("Recent runs cleared");
});

exportButton.addEventListener("click", () => {
  exportMenu.hidden = !exportMenu.hidden;
  exportButton.setAttribute("aria-expanded", String(!exportMenu.hidden));
});

exportMenu.addEventListener("click", (event) => {
  const type = event.target.closest("button")?.dataset.export;
  if (!type) return;
  exportMenu.hidden = true;
  exportButton.setAttribute("aria-expanded", "false");
  if (!currentPlan) return showToast("Build or import a plan first");
  const base = slugify(currentPlan.context.process);
  if (type === "markdown") download(`${base}-operations-plan.md`, planToMarkdown(currentPlan), "text/markdown");
  if (type === "workspace") download(`${base}-orbit-ops.json`, serializeWorkspace(currentPlan), "application/json");
  showToast("Export prepared");
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".top-actions")) {
    exportMenu.hidden = true;
    exportButton.setAttribute("aria-expanded", "false");
  }
});

importInput.addEventListener("change", async () => {
  const [file] = importInput.files;
  if (!file) return;
  try {
    setCurrentPlan(parseWorkspace(await file.text()));
    showToast("Workspace imported");
  } catch (error) {
    showToast(error.message);
  } finally {
    importInput.value = "";
  }
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    form.requestSubmit();
  }
});

function updateClock() {
  document.querySelector("#clock").textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
updateClock();
setInterval(updateClock, 30_000);
renderHistory();

const savedPlan = loadJSON(STORAGE_KEY, null);
if (savedPlan?.id && savedPlan?.context && savedPlan?.schemaVersion === 1) setCurrentPlan(savedPlan, { persist: false });

registerOperationsTools({
  modelContext: navigator.modelContext,
  runWorkflow: async (context) => runWorkflow(context),
  readPlan: async () => currentPlan,
  toMarkdown: async (plan) => planToMarkdown(plan),
});
