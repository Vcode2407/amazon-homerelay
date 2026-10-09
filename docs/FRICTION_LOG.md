# HomeRelay friction log

Started **October 9, 2026 (IST)**. These first entries are research observations about published onboarding information. They are **not firsthand failures of the Alexa+ tools or MCP SDK**. Development feedback will be added only after reproducing an issue or observing the actual experience.

## R01 — Gated Alexa+ developer tools

- **Task:** identify a usable Alexa+ development route for the hackathon.
- **Steps:** reviewed the hackathon resources, FAQ, and runtime requirements.
- **Planning expectation:** determine which official tools entrants can access.
- **Published result:** the [FAQ](https://amazonappdev2026.devpost.com/details/faqs) says the Category SDK, MCP Toolkit, CLI, and Web Simulator are partner-only previews, with no application route for entrants. It explains that some setup pages omit that limitation.
- **Severity:** important for planning; no failed installation was attempted.
- **Workaround:** build a self-hosted MCP server and a clearly labelled local web simulator.
- **Suggestion:** put the partner-access requirement and the accepted hackathon alternative at the start of every relevant setup guide.

## R02 — Registration credit offer is out of date

- **Task:** decide whether promotional AWS credits can fund a prototype.
- **Steps:** compared the supplied registration email with current hackathon resources.
- **Planning expectation:** the email advertises a $150 credit request.
- **Published result:** an October 7 update on the [resources page](https://amazonappdev2026.devpost.com/resources) says credit codes are exhausted and further requests are closed.
- **Severity:** important for budget planning; no request or AWS charge was attempted.
- **Workaround:** start with the offline local MVP; assess any paid integration separately.
- **Suggestion:** update registration emails and the linked request page when the allocation is exhausted.

## Firsthand entry template

Copy this template after observing an actual development issue:

```text
ID / date:
Tool and version:
Task attempted:
Reproduction steps:
Expected result:
Actual result:
Evidence (redacted error, screenshot, or test):
Severity (critical / important / nice-to-have):
Workaround:
Actionable suggestion:
Recheck result:
```

Keep facts separate from interpretations. Do not include credentials or household information in public evidence. Product feedback should also record what worked well, the real onboarding experience, and whether we would use each tool again.

## D01 — MCP SDK development experience

- **Tool/version:** `@modelcontextprotocol/sdk` 1.32.1, October 9.
- **Use:** host household tools over Streamable HTTP and call them through an SDK client from the simulator.
- **Observed strengths:** tool discovery exposes schemas suitable for the optional Bedrock adapter. Real initialization and tool calls negotiated protocol 2025-11-25 in integration tests. Structured results carry proposal and board data to the UI.
- **Evidence:** `test/integration.test.js`, `src/mcp.js`, and browser-visible tool traces. No SDK installation or runtime failure was reproduced in these checks.
- **Would use again:** yes for exposing typed household operations behind interchangeable assistant clients.

## D02 — Bedrock adapter development status

- **Tool/version:** `@aws-sdk/client-bedrock-runtime` 3.1148.0, October 9.
- **Use:** implement Converse tool-use turns around discovered MCP reads and previews.
- **Observed experience:** package installation and import succeeded; eight stub-based tests verify request construction, tool-result IDs, bounds, explicit confirmation, and error recovery.
- **Limit:** account onboarding, credentials, model compatibility, latency, quality, and charges have not been tested live. No firsthand service failure or successful AWS inference is claimed.
- **Next evidence needed:** follow `docs/BEDROCK.md`, then record actual model/region, tool behavior, and onboarding findings before final product feedback or an AWS mini-challenge claim.
