# Recorded local demonstration

A **2 minute 44 second English demo** was recorded on October 10, 2026 using the actual local application, an isolated browser, and fresh fictional Alex/Maya/Sam data. It uses the bounded offline router and real MCP calls. It does not contain a stubbed model response or claim a native Alexa/AWS connection.

**Public YouTube/Vimeo URL: pending upload.** The local MP4 is prepared; its presence does not satisfy the publication requirement. Add the publicly viewable link here and in the Devpost form after uploading.

The recording shows:

| Time | Actual behavior |
| --- | --- |
| 0:00–0:12 | Local simulator and offline-provider status; fictional household introduction. |
| 0:12–0:26 | Tomorrow's brief and the existing school-form, bag, and grocery tasks. |
| 0:26–0:49 | A missing schedule is clarified, then a handoff is previewed while the board stays unchanged. |
| 0:49–1:10 | Owner correction to Mum and time correction to 08:30 replace the pending preview. |
| 1:10–1:32 | Explicit confirmation saves the handoff; its completion remains blocked by printing. |
| 1:32–1:52 | Completing the prerequisite permits completion of the dependent handoff. |
| 1:52–2:22 | Dad's grocery handoff is replanned with a travel/workload reason, confirmed, and actual MCP tool activity is expanded. |
| 2:22–2:44 | Reload retains saved changes; completed tasks are shown; MCP verification and implementation limits are explained. |

## Recording evidence

The completed browser take lasted 164.013 seconds and captured 73 real `/mcp` requests. Recorded request methods include `initialize`, `notifications/initialized`, and `tools/call`; calls cover all seven household tools. The initial board had four tasks and the final saved board had five, including the two completed school-form steps. The browser/API evidence verifies that no task was added during preview and that reload retained confirmed tasks.

The separate `npm run verify:mcp` command additionally performs schema discovery, asserts the actual negotiated protocol 2025-11-25, exercises prerequisite refusal, and restarts the server to verify persistence. This independent probe is distinct from the browser reload shown in the footage.

Narration is synthesized locally with the installed Microsoft Zira Desktop English voice. Captions are burned below the unchanged application viewport. There is no music, external account screen, personal household data, face footage, or third-party stock footage. The application screen and source assets are original project material under the repository's MIT license. The recording was automated through real UI controls; no board result or tool response was fabricated for the video.

## Rehearse or reproduce

Follow [JUDGING.md](JUDGING.md), run `npm run demo`, and open localhost:4174. Use the exact prompts and correction sequence documented there. Each launch creates its own fictional household and dates the tasks relative to the current day. Keep the visible offline-provider label in frame.

If recording another take, verify the initial four-task board, preview-without-save behavior, the disabled dependent completion button, actual tool results, and persisted final state. Narrate any unexpected result as it occurred. Keep the final exported file strictly below three minutes and retain the original English captions/transcript.

Remaining steps: upload the final MP4 publicly to YouTube or Vimeo, verify logged-out playback, add the video URL to the submission, and retain source/video access through November 20. No AWS mini-challenge or live-model evidence is included.
