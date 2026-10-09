# Optional Amazon Bedrock setup

HomeRelay runs offline by default. The optional Bedrock adapter uses the AWS SDK's `Converse` API with client-side tool use. It discovers schemas from HomeRelay's real MCP endpoint, executes reads and previews through that endpoint, and returns proposals for review. The adapter is implemented and covered by eight stub-based tests. **No live AWS request has been made or verified.**

## Configure locally

1. Set up an AWS account, a region, and access to a model or inference profile that supports **Converse and tool use**. Check the [model-access guide](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html) and [Converse documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html). Some providers require additional access steps. Model availability depends on the selected account and region.
2. Configure your normal local AWS SDK credentials, such as a named profile and an active SSO session. HomeRelay uses the [default credential provider chain](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html). Keep credentials out of source files, chat, and recordings.
3. Copy `.env.example` to `.env`, which is ignored by Git. Set these values to your actual configuration:

   ```dotenv
   ASSISTANT_PROVIDER=bedrock
   AWS_REGION=your-aws-region
   BEDROCK_MODEL_ID=your-compatible-model-or-inference-profile-id
   AWS_PROFILE=your-local-profile
   BEDROCK_MAX_TURNS=6
   PORT=4173
   ```

   Omit `AWS_PROFILE` if your normal credential setup does not use a named profile. The placeholders above are not valid service values. Restart `npm start` after changing the file.
4. Open the app. **Bedrock configured** means configuration is present; it does not prove credentials, permissions, or model access work. The first chat request checks those through an actual provider call.

Bedrock requests are billed to the selected AWS account. No promotional credits are assumed. Each chat request is bounded to at most six provider turns, four tool calls per turn, and 800 output tokens per response. Calls time out after 20 seconds individually, with SDK retries disabled. These limits reduce runaway loops; they are not a total spending cap. Shorter limits can be set with `BEDROCK_MAX_TURNS` (1–6).

## Validate live access

Use the fictional household and record the model/inference-profile ID, region, and date alongside the actual result:

- Ask **“What needs attention tomorrow?”** Verify the answer against the board and expand **Tool activity** to check the MCP calls.
- Say **“Ask Dad to buy milk.”** Supply the missing date/time, review the preview, and change the time or owner. Confirm only after the current proposal matches the request.
- Prepare another preview and cancel. Check that the board stays unchanged.
- Test an unavailable household member and dependency blocking. Compare the proposal with the visible tasks.
- Check how a missing permission or unavailable model is reported using a deliberately invalid local configuration. Restore the valid configuration afterward. A provider failure must not save a task; any prepared proposal must remain reviewable.

The model can access only `get_household_board`, `get_household_brief`, `preview_handoff`, and `preview_rebalance`. Confirm, cancel, and complete operations are handled outside the model. Confirmation/cancellation phrases pass through the deterministic user-intent handler. Bedrock receives the household board, conversation text, pending proposal, and tool results; use fictional data for development and recording.

The structured **New handoff** form also works in Bedrock mode without invoking the model. Its previews still use MCP and require confirmation to save.

## Return to offline mode

Set `ASSISTANT_PROVIDER=offline` and restart. The app then uses its local language router without provider calls. `npm test` also uses offline or stubbed clients and requires no AWS account.

Implementation references: [client-side tool-use flow](https://docs.aws.amazon.com/bedrock/latest/userguide/tool-use-client-side.html), [Converse API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html), and [tool-result format](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_ToolResultBlock.html).
