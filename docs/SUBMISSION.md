# HomeRelay — Devpost submission draft

English draft prepared October 10, 2026. These are reviewable submission materials, not a published or submitted entry. The working build is local; native Alexa and live AWS use have not been verified.

## Project name and tagline

**HomeRelay**

**Keep tomorrow's family handoffs clear, connected, and under your control.**

Primary track: **Alexa+**. Proposed technology path: a working self-hosted MCP server and a clearly labelled local simulator. No mini-challenge is currently claimed.

## Inspiration and problem

A household responsibility often depends on somebody else's work. Bringing a school form is only useful after the form has been printed. When one person becomes unavailable, changing an owner can create another conflict or hide a prerequisite.

HomeRelay explores an assistant that keeps those relationships visible. It turns a household request into a reviewable plan, lets the person correct missing details, and preserves the existing board until they confirm. The demo uses fictional household data; no user interviews or measured household outcomes are claimed.

## What it does

The working local application shows a board for Alex, Maya, and Sam, using dates in Asia/Kolkata. A person can ask what needs attention tomorrow, prepare a handoff, provide a missing date or time, correct the owner or schedule, and confirm or cancel the resulting proposal. A structured New handoff form also accepts tasks with an owner, date, time, priority, and optional prerequisite.

Dependent tasks cannot be completed until their prerequisites are done. When a person becomes unavailable, HomeRelay previews new assignments with reasons and workload warnings. Confirmed changes and completed tasks survive a server restart; previews and conversations are temporary.

The default conversation mode is a bounded deterministic router. It supports the documented requests and clarification patterns; it does not claim general AI understanding. The browser explicitly identifies itself as a local Alexa+ simulator with no connected AI provider in offline mode.

## How it was built

The browser UI calls a Node.js/Express backend. The assistant creates an MCP SDK client and calls the real `/mcp` Streamable HTTP endpoint, which exposes household reads, previews, confirmation, cancellation, and completion tools. The project imports and uses `@modelcontextprotocol/sdk` 1.32.1 at runtime. Integration tests verified initialization, schema discovery, and actual tool calls negotiating MCP protocol 2025-11-25.

Zod validates tool and request inputs. The store checks dates, dependencies, proposal revisions, and explicit confirmation before changing the household. It saves the next board to local JSON before exposing it in memory, so a failed write leaves the previous plan available for retry.

An optional Amazon Bedrock Converse adapter is implemented. It discovers MCP schemas, performs bounded tool-use turns, and can read or prepare previews. Model access to confirmation, cancellation, and completion is blocked; explicit user controls handle those operations. The Bedrock path has been tested with provider stubs, not a live AWS model or account.

Built with: JavaScript, Node.js 22+, Express 5.3.0, MCP TypeScript SDK 1.32.1, Zod 4.6.5, HTML/CSS, local JSON storage, and the optional AWS Bedrock Runtime SDK 3.1148.0.

## Development challenges

The main language challenge was retaining missing details without accidentally approving a task. The tests distinguish a question such as “should I confirm?” from an explicit confirmation, preserve quantities while parsing time, and replace an earlier preview after an owner or schedule correction. An ambiguous correction makes the old preview unusable until its replacement is reviewed.

Another challenge was keeping board state consistent across failures. Storage regression tests simulate a failed save during handoff creation, reassignment, and completion. They check that both memory and the previously saved file remain unchanged, then verify that a retry succeeds.

The provider adapter required matching tool-use IDs with tool results, bounding tool batches and conversation history, and retaining a reviewable preview after a provider failure. These behaviors are verified with controlled Bedrock responses; latency, service quality, account onboarding, and live costs remain unknown.

## Accomplishments and learning

The prototype connects a visible planning flow to actual MCP calls, including confirmation, dependency blocking, cancellation, stale-preview handling, and restart persistence. The most recent recorded local validation in the README reports 40 passing tests, including eight Bedrock stub tests, plus syntax and browser workflow checks.

The design demonstrates why a suggestion, a preview, and a saved household change need distinct states. A friendly reply cannot substitute for a successfully persisted tool result.

## Product feedback draft

These observations come from source, local tests, and the recorded friction log. Final feedback should be updated after any additional live use.

| Tool/API/SDK | Purpose and observed experience | Improvements or limits | Would use again? |
| --- | --- | --- | --- |
| MCP TypeScript SDK 1.32.1 | Hosted the Streamable HTTP endpoint and called household tools through an SDK client. Real initialization and calls succeeded; discovered schemas support interchangeable assistant clients. | No SDK setup or runtime failure was reproduced in the recorded checks. Clear schema/result examples remain useful when building a custom UI. | Yes, for typed assistant operations with visible results. |
| Node.js 22+ and Express 5.3.0 | Served the local UI, assistant routes, and MCP endpoint. HTTP integration tests exercise the runnable backend. | The application currently binds to localhost; production access control has not been implemented or tested. | Yes, for this small local backend. |
| Zod 4.6.5 | Validated structured inputs and helped return recoverable errors for invalid dates, times, and prerequisites. | A valid schema does not resolve ambiguous language; the conversation still needs clarification. | Yes, alongside domain checks. |
| AWS Bedrock Runtime SDK 3.1148.0 | Installation/import and Converse request/tool-result construction are implemented and stub-tested. | Live AWS onboarding, model access, latency, quality, and charges have not been tested. No service success or service failure is claimed. | A final service recommendation is pending a live run. |
| Browser HTML/CSS/JavaScript | Provided the board, conversation, review controls, and handoff form. Recorded browser checks cover the functional flow and responsive layouts. | General voice interaction and native Alexa rendering are not implemented. | Yes, for a reviewable simulator. |

The research friction log separately records the published partner-access limits for Alexa+ developer tools and the October 7 AWS-credit exhaustion notice. Those are documentation findings, not failed installations or firsthand cloud incidents. See [FRICTION_LOG.md](FRICTION_LOG.md).

## Limits and next steps

There is no native Alexa connection, notification delivery, calendar integration, production authentication, or public hosting. The simulator never claims to contact a household member. The offline recognizer is intentionally bounded. Live Bedrock verification and the final public source/video package are pending.

Next steps are to validate the optional provider with an authorized account, retain the reproducible offline route, test the workflow with another person, and add household access controls before considering a network deployment. AWS Builder eligibility will be assessed only after documented qualifying use. An Open Source mini-challenge would require a separate additional contribution; licensing HomeRelay alone is not that contribution.

## Demo outline — 2 minutes 40 seconds

Use `npm run demo` and `http://127.0.0.1:4174` for a fresh fictional offline household. Label the recording's actual provider mode.

| Time | Actual action to record |
| --- | --- |
| 0:00–0:20 | Introduce a school-form handoff and the dependency problem. Show the local simulator status. |
| 0:20–0:45 | Ask “What needs attention tomorrow?” and show the household board. |
| 0:45–1:20 | Ask Dad to bring the school form, supply “tomorrow at 8 am,” correct the owner to Mum and time to 8:30, then review and confirm. |
| 1:20–1:45 | Show the dependent handoff blocked, complete Print the school form, then complete the handoff. |
| 1:45–2:15 | Preview Dad's remaining tomorrow handoffs moving to eligible owners; show reasons and confirm or cancel. |
| 2:15–2:40 | Expand actual tool activity, explain the MCP path and local persistence, and state the remaining integration limits. |

Do not substitute a simulated Bedrock response for a live provider recording. A live recording, if chosen later, needs an actually verified configured server rather than the always-offline fresh-demo command.

## Fields and links to complete before submitting

| Devpost material | Current value/status |
| --- | --- |
| Project title | HomeRelay |
| Tagline and English description | Draft text above; review before pasting. |
| Primary track | Alexa+ |
| Mini-challenges | None claimed. |
| GitHub repository URL | Pending publication of licensed, runnable source and assets. |
| Setup/testing instructions | README and `npm run demo`; verify from a clean checkout before publication. |
| Public English YouTube/Vimeo video under three minutes | Pending recording and upload. |
| Product feedback | Draft above; complete firsthand live feedback only for tools actually used. |
| Optional friction-log attachment | Existing log; review for accuracy and remove private data. |
| Live AWS model/region and evidence | Pending; do not present stub tests as AWS validation. |
| Entrant/team details and eligibility | User verification pending. |
| Judge access through November 20 | Arrange and verify repository/video access. |
| Final Devpost URL/status | Pending; no submission made by this draft. |

Deadline: **October 23, 2026, 12:00 pm PDT / October 24, 2026, 00:30 IST**. The selected MCP path, video, feedback, and judge-access requirements are described in the [official rules](https://amazonappdev2026.devpost.com/rules); entrant-access guidance is in the [FAQ](https://amazonappdev2026.devpost.com/details/faqs). Recheck the final form and rules before submitting.
