# HomeRelay hackathon plan

Working project: a household assistant that keeps responsibilities and dependencies visible, then proposes a reviewed handoff when availability changes. Primary target: **Alexa+**. Status: validated local MVP with conversational drafts and an optional Bedrock adapter; live AWS validation and submission preparation remain open.

## Deadline and official requirements

Submission closes **October 23, 2026 at 12:00 pm PDT**, which is **October 24, 2026 at 00:30 IST**. Aim to submit by October 23 evening IST. Dates and requirements below were checked on October 9 against the [official rules](https://amazonappdev2026.devpost.com/rules).

- [x] Build and validate a working self-hosted MCP server over Streamable HTTP, negotiating version 2025-11-25.
- [x] Verify actual runtime use of MCP in the source and browser prototype.
- [ ] Show the MCP workflow in the final recorded demonstration.
- [ ] Publish all runnable source, assets, and setup instructions in a GitHub repository with an open-source license.
- [ ] Write an English project description explaining the problem and functioning features.
- [ ] Upload an English demo **under three minutes**, publicly viewable on YouTube or Vimeo.
- [ ] Provide feedback for every tool, API, and SDK: purpose, strengths, problems, onboarding, and whether we would use it again.
- [ ] Identify the primary track and any supported mini-challenge claims.
- [ ] Keep the project available to judges through November 20.

The [FAQ](https://amazonappdev2026.devpost.com/details/faqs) confirms that Alexa+'s partner-only SDK, toolkit, CLI, and web simulator are unavailable to entrants. A self-hosted MCP server and our own web front end are the intended route. No physical Alexa device is needed.

The registration email mentions $150 AWS credits. The [resources page](https://amazonappdev2026.devpost.com/resources) now says codes ran out on **October 7** and requests are closed. This prototype works offline; the optional Bedrock adapter requires separately configured AWS access. No live AWS request has been made.

## October 9–23 work plan

| Dates (IST) | Outcome |
| --- | --- |
| Oct 9 | Completed: local MVP, real MCP, persistence, dependency checks, conversational drafts/corrections, handoff form, and stub-tested Bedrock adapter. |
| Oct 10–11 | Configure an AWS account and compatible model if using Bedrock; verify live tool use, correction, provider failures, and billing. |
| Oct 12–13 | Improve daily briefs and check keyboard navigation, responsive layouts, and the final demo scenario. |
| Oct 14–15 | Try the demo with another person and fix the points where they get stuck. Select the validated provider mode for recording. |
| Oct 16–17 | Stabilize the command vocabulary and seed scenario. Record firsthand tool feedback with reproduction evidence. |
| Oct 18–19 | Review source and assets, license the public repository, and verify setup from a clean checkout. |
| Oct 20–21 | Draft the description, screenshots, and a 2:30–2:45 English demo; record the working application. |
| Oct 22 | Verify repository/video access and complete every Devpost field. |
| Oct 23 | Recheck published rules and links, run the final demo, and submit with a time buffer. |

The Bedrock adapter is implemented but live use remains unverified. [Setup and validation steps](BEDROCK.md) describe the remaining work. Keep the offline mode available for reproducible local testing.

## Suggested recording

| Time | Scene |
| --- | --- |
| 0:00–0:20 | A parent becomes unavailable; introduce the household handoff problem. |
| 0:20–0:55 | Show tomorrow's brief and a task waiting on its prerequisite. |
| 0:55–1:45 | Preview a revised handoff, confirm it, and show the updated assignments. |
| 1:45–2:15 | Finish the prerequisite, then its dependent task. Show persistence or the saved plan. |
| 2:15–2:40 | Explain the real MCP connection and accurately label the provider mode used in the recording. State the next product step. |

Use fictional household data. The recording should show the real UI and actual tool results. Keep enough time for a concise explanation of what has been built.

Run `npm run demo` for a separate fresh fictional household at port 4174 before recording the offline sequence. It preserves the saved household and dates the new tasks relative to the recording day. For a live Bedrock recording, use the normal configured server and prepare an explicitly reviewed fictional board; the fresh-demo command always uses offline mode.

## Optional mini-challenges

No mini-challenge is currently claimed. AWS requires documented qualifying use. Open Source requires an **additional contribution** alongside the primary project, with contribution/repository URLs, username, and an explanation. Licensing HomeRelay alone does not establish this entry. See the [mini-challenge rules](https://amazonappdev2026.devpost.com/rules).

## Validation evidence (October 9)

- Test results: all 40 tests passed, including real MCP/HTTP workflows, storage-failure regressions, conversational language cases, form routes, and eight Bedrock stub tests.
- Syntax checks: `npm run check` passed.
- Negotiated MCP protocol and tool-call evidence: initialize response and SDK client both verified 2025-11-25; SDK discovery and household tool calls passed.
- Browser demo: form previews and missing-detail follow-ups verified. Earlier checks also verified owner correction, confirmation, blocked tasks, reassignment, desktop composer at 1266×712, and mobile layout at 390×844.
- Persistence: automated restart tests passed; confirmed changes also remained after browser reload. Fresh seed household restored after browser QA; verified sample state retained locally in ignored `artifacts/`.
- Public repository URL: pending.
- Live Bedrock model/region and validation evidence: pending; stub tests establish application behavior only.
- Public demo video URL: pending.
- Final submission URL: pending.

Technical references: [MCP Streamable HTTP specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), [official TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk), and [MCP Apps/Agent Skills resources](https://apps.extensions.modelcontextprotocol.io/api/).
