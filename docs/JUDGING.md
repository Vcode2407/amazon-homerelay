# Judge setup and evidence

HomeRelay is a locally runnable Alexa+ track entry using a real self-hosted MCP server and its own web simulator. The public source is [Vcode2407/amazon-homerelay](https://github.com/Vcode2407/amazon-homerelay), licensed MIT. Development started October 9, 2026 (IST); the original license and dated research log are retained.

The main-track demonstration uses the deterministic offline router. It needs no Amazon account, Alexa hardware, AI subscription, AWS credentials, or payment. Native Alexa integration and live Bedrock use are not claimed. No mini-challenge is selected.

The [official FAQ](https://amazonappdev2026.devpost.com/details/faqs) explicitly accepts a locally runnable public repository plus demo video and an actual MCP web frontend. Public hosting is not required. The [rules](https://amazonappdev2026.devpost.com/rules) require the functioning project, GitHub source, English materials, a public YouTube/Vimeo video under three minutes, product feedback, and free judge access. Requirements rechecked October 10, 2026.

## Clean checkout

Install Node.js 22 or newer and Git, then run these same commands in PowerShell or a Linux/macOS shell:

```text
git clone https://github.com/Vcode2407/amazon-homerelay.git
cd amazon-homerelay
npm ci
npm run check
npm test
npm run verify:mcp
npm run demo
```

Open **http://127.0.0.1:4174** in a desktop browser. Keep the terminal running. The fresh-demo command always creates separate fictional data, selects offline mode explicitly, and seeds dates relative to the current day in Asia/Kolkata. It does not load a provider configuration or alter an existing household. Ctrl+C stops the server.

If 4174 is already occupied, choose another free port before launching:

```powershell
$env:HOMERELAY_DEMO_PORT = '4194'
npm run demo
```

On Linux/macOS the equivalent is `HOMERELAY_DEMO_PORT=4194 npm run demo`. Open the matching localhost port. `npm start` uses the retained household at 4173; saved dates remain unchanged by design, so use the fresh-demo command for the submission scenario.

## Reproduce the browser workflow

1. Confirm the visible status says **Offline demo · no AI provider connected**. Ask **What needs attention tomorrow?** The initial board has four tasks, including three tomorrow handoffs.
2. Ask **Ask Dad to bring the school form**. Answer the missing schedule with **tomorrow at 8 am**. This produces a preview; the board still contains four tasks.
3. Say **Give it to Mum instead**, then **at 8:30 am instead**. Review the latest owner/time and prerequisite warning. Confirm the latest plan. The board now has five tasks.
4. Filter Tomorrow. The new handoff's completion button is disabled until **Print the school form** is done. Complete that prerequisite, then complete the handoff.
5. Ask **Dad cannot do his handoffs tomorrow**. Review the grocery reassignment, its travel/workload reason, and any warnings. Confirm or cancel deliberately.
6. Expand **Tool activity** beneath a reply. It shows the actual tool names, arguments, and structured results returned from `/mcp`. Reload the page: saved board changes remain.
7. Use **New handoff** for an arbitrary title, schedule, owner, priority, and optional prerequisite. Preview and cancel it to verify that review alone does not save a task.

The recorded scenario uses only the fictional Alex/Maya/Sam household. The app does not message household members, reserve anything, or call a calendar.

## Independent MCP probe

`npm run verify:mcp` starts its own server on an automatically selected loopback port and uses a separate temporary fictional household. It connects an actual SDK client to `/mcp`, asserts the negotiated protocol **2025-11-25**, discovers all seven tools, and checks:

- preview and cancellation preserve the existing board;
- explicit scripted confirmation creates one diagnostic handoff;
- completion returns a real tool error while a prerequisite is open;
- completing the prerequisite allows completion of the handoff;
- a server restart retains the saved board.

It prints structured evidence, exits nonzero on any failed assertion, and closes its server and removes only its own temporary directory. This scripted confirmation affects disposable diagnostic data, not the browser's saved household. It never reads `.env` or calls Bedrock.

Runtime code paths: `src/server.js` creates the SDK client, `src/mcp.js` implements Streamable HTTP household tools, and `src/store.js` persists confirmed changes. GET `/mcp` returns 405 intentionally because this is a stateless POST transport; it is not a connection failure.

## Validation and CI

Local clean dependency installation, all **40 tests**, syntax checks, and the independent MCP probe passed on October 10, 2026 with Node.js 22.23.1. The suite includes eight injected Bedrock tests; those verify application behavior rather than real AWS access. Real MCP/HTTP tests, storage-failure recovery, preview invalidation, and restart tests require no sponsor credential.

`.github/workflows/ci.yml` performs `npm ci`, syntax checks, the same test suite, and the independent probe on an Ubuntu runner with Node 22. Actions are pinned by commit with read-only repository permissions; no secrets or live inference are required. Published [GitHub Actions runs](https://github.com/Vcode2407/amazon-homerelay/actions) include successful hosted checks. Match the run's source commit to the revision being reviewed; local checks alone are not evidence that GitHub Actions ran.

## Access and remaining submission fields

The [2:44 demonstration is published publicly on YouTube](https://www.youtube.com/watch?v=8Zr2xYNAXPE) with English burned captions and an English subtitle track. It shows the actual offline MCP workflow; the uploaded source MP4 remains silent and unchanged. Keep the public source, licensed assets, and video accessible through November 20, 2026. The local project has no login or paywall. Network access is needed to download the locked npm dependencies; the running offline demo requires no external service.

English prose and product feedback are in [SUBMISSION.md](SUBMISSION.md); optional research observations and firsthand SDK notes are in [FRICTION_LOG.md](FRICTION_LOG.md). Logged-out video playback verification, entrant/team details and declarations, firsthand feedback review, track selection, and Devpost submission still need completion. Use the published YouTube URL in the final video field. Bedrock verification is an optional future step and is not a gate for this selected local MCP path.

Deadline: October 23, 2026, 12:00 pm PDT / October 24, 00:30 IST. Check the live submission form before sending the entry.
