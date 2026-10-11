# Record HomeRelay with your own voice

The existing [2:44 walkthrough](media/HomeRelay-demo-en.mp4) contains real application footage with a locally synthesized Microsoft Zira voice. It is a draft for review and rehearsal, not a recording of your voice. Keep that original file; export your own version under a new name.

The [Amazon rules, section 4](https://amazonappdev2026.devpost.com/rules) request a functioning-project demonstration under three minutes, a publicly visible YouTube/Vimeo link, and English materials or an English translation. I found no requirement in the checked [rules](https://amazonappdev2026.devpost.com/rules), [FAQ](https://amazonappdev2026.devpost.com/details/faqs), or [resources](https://amazonappdev2026.devpost.com/resources) to show your face or use your own voice. Those pages also do not expressly address synthesized narration. Checked October 11, 2026; recheck before submitting.

## Replace the draft narration

If you have Microsoft Clipchamp, its [voiceover instructions](https://support.microsoft.com/en-us/clipchamp/how-to-add-voiceovers-to-videos) and [mute instructions](https://support.microsoft.com/en-us/clipchamp/how-to-mute-separate-and-delete-audio-from-video) describe this workflow:

1. Create a video project, import `HomeRelay-demo-en.mp4`, and place it at the start of the timeline.
2. Select that video and click its speaker symbol to mute the computer voice. Keep the picture and its captions.
3. Choose **Record & create > Audio**, allow microphone access, and select your microphone. Record a ten-second test and listen to it.
4. Record the script below in short sections. Save each take and place its audio at the matching start time. Alternatively, import a recording made on your phone. Wear headphones if watching the reference while recording.
5. Review the complete timeline. Speak naturally; pauses between sections are fine. Check that narration matches the visible action and existing captions.
6. Export an MP4, for example `HomeRelay-demo-own-voice.mp4`, at 1080p. Open the exported file and listen from start to finish. Keep its duration below 3:00, including any introduction or ending.

The base footage is 2:44, leaving 16 seconds before the limit. Avoid adding a long introduction. You can record only your voice; camera footage is optional based on the checked requirements.

## Timed script for the existing footage

These words match the draft's captions. Rehearse once while watching the muted video. If a section takes longer than its window, redo it with a comfortable, slightly quicker pace; do not cut off a sentence. This is narration over existing footage, not a claim that you personally performed the recorded clicks.

| Time | Say |
| --- | --- |
| 0:00–0:12 | HomeRelay keeps family handoffs clear. This recording uses fresh fictional data, a local Alexa plus concept simulator, and no connected AI provider. |
| 0:12–0:26 | First, look ahead to tomorrow. Maya prints the school form, Sam packs the bag, and Alex collects groceries. Household schedules use India Standard Time. |
| 0:26–0:38 | I ask Dad to bring the school form. The bounded offline router asks for the missing schedule instead of saving an incomplete task. |
| 0:38–0:49 | Tomorrow at eight creates a reviewable preview. The family board still has four tasks. Bringing the form depends on printing it first. |
| 0:49–0:59 | I correct the owner to Mum. HomeRelay replaces the earlier preview, so an old plan cannot be confirmed accidentally. |
| 0:59–1:10 | Then I change the time to eight thirty. The latest owner and schedule are visible, together with the prerequisite warning. |
| 1:10–1:20 | Only this explicit confirmation saves the handoff. A suggestion and a persisted change are separate states. |
| 1:20–1:32 | The new handoff is blocked. Its completion button stays disabled while the school form is unfinished. The backend enforces the same rule. |
| 1:32–1:42 | Completing Print the school form clears the prerequisite. The board now permits the next step. |
| 1:42–1:52 | I complete the handoff. Both actual tool results update the board after the changes are saved. |
| 1:52–2:08 | Now Dad is unavailable tomorrow. The revised plan moves his remaining grocery task to an eligible household member. Its reason uses travel capability and existing workload. |
| 2:08–2:22 | I review and confirm. Tool activity exposes the actual MCP arguments and results. The browser backend uses an SDK client over the real Streamable HTTP endpoint. |
| 2:22–2:34 | Reloading retains the confirmed tasks. A separate judge command also checks restart persistence and negotiates MCP protocol version twenty twenty five, eleven, twenty five. |
| 2:34–2:44 | The licensed source includes setup, forty passing tests, and CI. No native Alexa connection, notifications, or live AWS model use is claimed. |

## Record a fresh live walkthrough instead

Follow [JUDGING.md](JUDGING.md) to run `npm run demo` and open the fresh fictional household at `http://127.0.0.1:4174`. Rehearse its exact prompt sequence before recording. Keep the visible offline-provider status in frame. A screen recorder can capture the app and your microphone together; Microsoft's [screen recording guide](https://support.microsoft.com/en-us/clipchamp/how-to-make-a-screen-recording) explains Clipchamp's screen-only option.

Aim for 2:40–2:50: introduce the problem briefly, show the missing-time question and preview, correct Mum/time, confirm, show the prerequisite block and completion, replan Dad's task, expand real tool activity, and reload. Describe the results that actually occur. Leave setup and test runs out of the timed screen take; their reproducible commands remain in the repository.

## Finish the video requirement

Upload the reviewed final MP4 to YouTube or Vimeo with public visibility. Open the resulting link while signed out and verify playback, sound, readable app text, and a duration below three minutes. Put that playable URL in the Devpost video field. A GitHub MP4 link alone does not fulfill the host requirement. Preserve source and video access through the end of judging, November 20, 2026, as required by the [official rules](https://amazonappdev2026.devpost.com/rules).
