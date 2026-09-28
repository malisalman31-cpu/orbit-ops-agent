# Orbit Ops

Orbit Ops is a browser-based operations control agent. Give it an operating problem and required outcome; it produces an operating brief, minimum viable SOP, prioritized action queue, capacity scenarios, risk controls, execution runbook, and leadership update.

It runs entirely in the browser, requires no API key, and stores work locally. The same workflow is exposed through three WebMCP tools for capable browsers and agents.

## What it does

- Frames the operating situation, target state, owner, demand, evidence, constraints, and timing.
- Detects delay, quality, capacity, handoff, reliability, cost, and compliance signals.
- Builds a seven-stage SOP with roles, inputs, outputs, controls, and service expectations.
- Scores actions with `severity × frequency × confidence ÷ effort`.
- Provides constrained, base, and surge capacity postures plus a staffing formula.
- Defines preventive and detective controls with owners, cadence, and evidence.
- Creates normal-operations or active-incident runbooks.
- Produces a concise leadership update and keeps recent plans in local browser storage.
- Imports and exports full JSON workspaces and Markdown plans.

## Run locally

Node.js 20 or later is required.

```bash
npm start
```

Open `http://127.0.0.1:4174`.

## Quality checks

```bash
npm run check
npm run test:coverage
```

The test suite covers validation, signal extraction, prioritization, plan topology, incident and audit behavior, Markdown and workspace exports, and the WebMCP contract.

## Privacy and limitations

Orbit Ops has no server-side data collection. Plans stay in the browser unless a user exports or shares them. It provides structured operating judgment, not live integrations, staffing commitments, legal advice, or a substitute for incident, compliance, safety, or security owners. Validate generated plans against real data and applicable policies before execution.

## License

MIT
