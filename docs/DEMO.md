# Published local demonstration

A **2 minute 44 second silent demo with English captions** was recorded on October 10, 2026 using the actual local application, an isolated browser, and fresh fictional Alex/Maya/Sam data. It uses the bounded offline router and real MCP calls. The audio track has been removed; the actual screen footage and burned captions are unchanged. It does not contain a stubbed model response or claim a native Alexa/AWS connection.

The current demo is silent. If you later choose to add your own voice or record the app yourself, follow the optional [recording guide and timed script](RECORDING_GUIDE.md). Review any replacement before uploading it.

**Public YouTube URL:** [HomeRelay — 2:44 demonstration](https://www.youtube.com/watch?v=8Zr2xYNAXPE), published October 11, 2026 with an English subtitle track. The uploaded source MP4 is unchanged. Add this URL to the Devpost video field; no entry has been submitted.

Watch the [published YouTube demonstration](https://www.youtube.com/watch?v=8Zr2xYNAXPE), or review/download the actual [silent, English-captioned 2:44 MP4](media/HomeRelay-demo-en.mp4). The YouTube link supplies the required video host.

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

The [silent-video verification](media/silent-video-verification.json) records zero audio streams, the current file hash, a complete decode, and an unchanged encoded video stream.

The completed browser take lasted 164.013 seconds and captured 73 real `/mcp` requests. Recorded request methods include `initialize`, `notifications/initialized`, and `tools/call`; calls cover all seven household tools. The initial board had four tasks and the final saved board had five, including the two completed school-form steps. The browser/API evidence verifies that no task was added during preview and that reload retained confirmed tasks.

The separate `npm run verify:mcp` command additionally performs schema discovery, asserts the actual negotiated protocol 2025-11-25, exercises prerequisite refusal, and restarts the server to verify persistence. This independent probe is distinct from the browser reload shown in the footage.

The current MP4 contains no audio track. English captions remain burned below the unchanged application viewport. There is no external account screen, personal household data, face footage, or third-party stock footage. The application screen and source assets are original project material under the repository's MIT license. The recording was automated through real UI controls; no board result or tool response was fabricated for the video.

## Rehearse or reproduce

Follow [JUDGING.md](JUDGING.md), run `npm run demo`, and open localhost:4174. Use the exact prompts and correction sequence documented there. Each launch creates its own fictional household and dates the tasks relative to the current day. Keep the visible offline-provider label in frame.

If recording another take, verify the initial four-task board, preview-without-save behavior, the disabled dependent completion button, actual tool results, and persisted final state. Describe any unexpected result accurately in the captions. Keep the final exported file strictly below three minutes and retain clear English captions.

Remaining steps: verify logged-out playback, add the published video URL to the submission, complete entrant details and declarations, review firsthand tool feedback, and retain source/video access through November 20. No Devpost entry has been submitted. No AWS mini-challenge or live-model evidence is included.
