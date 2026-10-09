# HomeRelay

HomeRelay is a local household handoff assistant being built for the Alexa+ track of **Build, Ship, Shape: Amazon Developer Hackathon**. It helps a family see tomorrow's responsibilities, understand blocked tasks, and preview a revised plan when someone's availability changes.

**Status:** working local MVP, validated on October 9, 2026. Conversational drafts, corrections, a handoff form, and an optional Amazon Bedrock adapter are implemented. Live AWS validation, the public repository, submission, and demo video remain open.

## Run locally

Use **Node.js 22 or newer**. From this directory:

```powershell
npm install
npm start
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). Keep the terminal running. The server binds to `127.0.0.1`; this prototype is intended for local use.

The initial demo household contains Alex, Maya, and Sam. Household dates use **Asia/Kolkata**. “Tomorrow” in conversation is relative to the current date. Seed tasks are dated when the data file is first created; saved tasks keep their original dates on later runs.

Household state is saved in `data/household.json`, which is ignored by Git. Restarting the server should retain saved tasks. Keep personal household information out of the public repository and recording.

## Demo flow

For a recording or a fresh run of the sequence below, use `npm run demo` and open **http://127.0.0.1:4174**. Every launch creates a separate fictional household under ignored `data/demo-*`, with dates relative to today, and uses offline mode. Your existing `data/household.json` and preview at 4173 are preserved. Stop the demo with Ctrl+C. To use another available port, set `HOMERELAY_DEMO_PORT` before launching. The normal `npm start` preview retains old dates by design.

1. Ask **“What needs attention tomorrow?”** Review the initial plan: Maya prints the school form at 07:00, Sam packs the school bag at 07:30, and Alex collects groceries at 18:30. Alex also has a library-book return due today at 17:00.
2. Say **“Ask Dad to bring the school form.”** Answer the date/time question with **“tomorrow at 8 am.”** Review the handoff preview; the task has not been saved yet.
3. While that preview is pending, say **“Give it to Mum instead”**, then **“at 8:30 am instead.”** Review the new owner and time, then click **Confirm plan** or type **“confirm”**. Earlier previews can no longer be confirmed.
4. Try to complete the new school-form handoff. It is blocked until Maya's **Print the school form** task is complete. Complete that prerequisite, then complete the handoff.
5. Say **“Dad cannot do his handoffs tomorrow.”** Review the alternative assignments, reasons, and any overload warning. Click **Confirm** to save the changes.
6. Click **New handoff** to prepare any task with an owner, date, time, priority, and optional prerequisite. Preview it, then cancel to keep the existing board.
7. Restart the server and reopen the simulator to check that confirmed changes persist.

The offline router supports a small set of phrases and keeps missing details across turns. Use today, tomorrow, day after tomorrow, or a YYYY-MM-DD date. Times can use am/pm or HH:MM in 24-hour format; ambiguous schedules require clarification. Rebalancing considers task type, travel capability, and current workload when choosing an eligible household member.

## How it works

```text
Browser simulator
  -> Express assistant route
  -> MCP SDK client
  -> /mcp over Streamable HTTP
  -> household tools
  -> local JSON store
```

The project uses `@modelcontextprotocol/sdk` **1.32.1** at runtime. `/mcp` is the real MCP endpoint, and the web simulator calls tools through an SDK client rather than bypassing that endpoint. Integration tests verified actual initialization and SDK-client tool calls with protocol **2025-11-25**.

By default the simulator uses a **deterministic offline language router** and needs no account or API key. It is an Alexa+ concept simulator, with no native Alexa connection.

An optional **Amazon Bedrock Converse** adapter discovers the actual MCP tool schemas, reads the board, and prepares previews. The model cannot confirm, cancel, or complete tasks; explicit user actions control those changes. See [Bedrock setup](docs/BEDROCK.md). Its tool loop is tested with stub responses; live AWS access has not been verified. The app labels configuration separately from a successful connection.

Current scope includes household briefs, task creation, dependency checks, completion, and handoff proposals that can be confirmed or cancelled. Rebalancing previews preserve the existing plan until a user confirms.

## Validate

```powershell
npm test
npm run check
```

All **40 tests pass**, covering actual MCP negotiation/calls, draft follow-ups and corrections, ambiguous input, confirmation, form previews, dependency blocking, reassignment, cancellation, stale previews, restart persistence, origin validation, recovery after failed saves, and the Bedrock tool loop with stub responses. Syntax checks pass. Browser checks verified the form and conversational draft flow, alongside the earlier confirmation, dependency, persistence, and responsive-layout checks.

Board changes are persisted before becoming visible in memory. If a save fails, the old plan remains intact and the action can be retried.

## Prototype boundaries

There is no production authentication, public hosting, native Alexa integration, calendar connection, or notification delivery. A deployable version needs authentication and household access controls before exposing these tools over a network. Confirmed tasks persist on disk; conversation history and previews are temporary and expire or disappear on restart. The optional Bedrock path still needs account/model access and live verification.

See [the submission plan](docs/HACKATHON.md) and [the research friction log](docs/FRICTION_LOG.md) for remaining work and official sources.
