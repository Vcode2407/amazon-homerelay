import { ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { OfflineAssistant, confirmationIntent } from './assistant.js';
import { DomainError } from './store.js';

const MODEL_TOOLS = new Set(['get_household_board', 'get_household_brief', 'preview_handoff', 'preview_rebalance']);
const MAX_TOOL_CALLS = 4;
const MAX_MESSAGES = 24;
const MAX_TRANSCRIPT_CHARS = 24000;
const MAX_TOOL_RESULT_CHARS = 6000;

// Converse client-side tool use: https://docs.aws.amazon.com/bedrock/latest/userguide/tool-use-client-side.html
function boundedJson(value, limit = MAX_TOOL_RESULT_CHARS) {
  const serialized = JSON.stringify(value);
  if (serialized.length <= limit) return value;
  return { truncated: true, excerpt: serialized.slice(0, limit - 200), note: 'Only part of this result fits. Do not invent omitted facts.' };
}

function isUserRequest(message) {
  return message.role === 'user' && message.content.some(block => typeof block.text === 'string');
}

function boundedHistory(messages) {
  const history = structuredClone(messages);
  while (history.length > MAX_MESSAGES || JSON.stringify(history).length > MAX_TRANSCRIPT_CHARS) {
    // Remove complete earlier exchanges, preserving assistant toolUse/user toolResult pairs.
    const nextRequest = history.findIndex((message, index) => index > 0 && isUserRequest(message));
    if (nextRequest < 0) throw new DomainError('This request produced too much tool context. Try a narrower household question.', 503);
    history.splice(0, nextRequest);
  }
  return history;
}

function systemPrompt(board, pending) {
  return [
    'You are HomeRelay, a household handoff assistant. Use only current household facts and MCP tool results.',
    'Today and timezone come from the board below; tomorrow means the next calendar date in that timezone. Use member IDs and aliases from the board.',
    'Read plans with the read tools. New handoffs and reassignment must use preview tools. Ask for clarification when an owner, date or time is unclear.',
    'For bringing a school form, include its printing task as a prerequisite when one exists, and schedule the handoff after it.',
    'Only prepare previews. Confirmation, cancellation and completion are handled by explicit user controls outside this model. Never call or invent those tools.',
    'A preview is not saved. Never claim a task was saved, a notification was sent, or that you contacted anyone. This app only maintains a local household board.',
    'When a tool reports an error, explain it or ask for correction. Do not claim success. Replacing a preview prepares a new preview for user review.',
    `Current board: ${JSON.stringify(boundedJson(board))}`,
    `Current pending preview: ${JSON.stringify(pending ? boundedJson(pending, 3000) : null)}`,
  ].join('\n');
}

function providerFailure(error) {
  const detail = error?.name === 'ThrottlingException'
    ? 'Bedrock is rate limited. Wait briefly and retry.'
    : error?.name === 'TimeoutError' || error?.name === 'AbortError'
      ? 'Bedrock did not respond within 20 seconds. Retry the request.'
      : 'Bedrock could not respond. Check the configured AWS region, model access and credentials, then retry.';
  return new DomainError(`${detail} No household changes were saved; any pending preview is still available for review.`, 502);
}

export class BedrockAssistant extends OfflineAssistant {
  constructor({ client, modelId, maxTurns = 6 } = {}) {
    super();
    if (!client || typeof client.send !== 'function') throw new Error('BedrockAssistant requires a Bedrock runtime client.');
    if (typeof modelId !== 'string' || !modelId.trim()) throw new Error('BedrockAssistant requires an explicit modelId.');
    if (!Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > 6) throw new Error('Bedrock maxTurns must be between 1 and 6.');
    this.client = client;
    this.modelId = modelId.trim();
    this.maxTurns = maxTurns;
  }

  async decide(client, context, operation, proposalId) {
    try {
      return await super.decide(client, context, operation, proposalId);
    } finally {
      context.providerMessages = [];
    }
  }

  async chat(clientMcp, message, conversationId) {
    if (confirmationIntent(message)) return super.chat(clientMcp, message, conversationId);
    const context = this.conversation(conversationId);
    let currentBoard;
    let currentTrace = [];
    try {
      return await this.run(clientMcp, context, async ({ call, board, trace }) => {
        currentBoard = board;
        currentTrace = trace;
        let discovery;
        try { discovery = await clientMcp.listTools(); }
        catch { throw new DomainError('Household tool discovery failed. Retry after checking the local MCP server.', 502); }
        const tools = discovery.tools.filter(tool => MODEL_TOOLS.has(tool.name)).map(tool => ({
          toolSpec: { name: tool.name, description: tool.description || tool.name, inputSchema: { json: tool.inputSchema } },
        }));
        if (tools.length !== MODEL_TOOLS.size) throw new DomainError('The required household tools are unavailable. Retry after checking the local MCP server.', 502);
        const exposed = new Set(tools.map(tool => tool.toolSpec.name));
        let messages = boundedHistory([
          ...(context.providerMessages || []),
          { role: 'user', content: [{ text: message }] },
        ]);
        const usedIds = new Set(messages.flatMap(item => item.content.filter(block => block.toolUse).map(block => block.toolUse.toolUseId)));
        let rejectedTool = false;

        for (let turn = 0; turn < this.maxTurns; turn++) {
          messages = boundedHistory(messages);
          let response;
          try {
            response = await this.client.send(new ConverseCommand({
              modelId: this.modelId,
              system: [{ text: systemPrompt(board, context.pending) }],
              messages: structuredClone(messages),
              inferenceConfig: { maxTokens: 800 },
              toolConfig: { tools },
            }), { abortSignal: AbortSignal.timeout(20000) });
          } catch (error) { throw providerFailure(error); }

          const output = response.output?.message;
          if (output?.role !== 'assistant' || !Array.isArray(output.content)) throw new DomainError('Bedrock returned an invalid response. Retry the request.', 502);
          const content = output.content.filter(block => typeof block.text === 'string' || block.toolUse);
          const requests = content.filter(block => block.toolUse).map(block => block.toolUse);
          if (requests.length > MAX_TOOL_CALLS) throw new DomainError('Bedrock requested too many tools at once. Retry with a narrower question.', 503);
          if (requests.length && response.stopReason !== 'tool_use') throw new DomainError('Bedrock returned an inconsistent tool request. Retry the request.', 502);
          for (const tool of requests) {
            if (typeof tool.toolUseId !== 'string' || !/^[a-zA-Z0-9_.:-]{1,64}$/.test(tool.toolUseId) || usedIds.has(tool.toolUseId)) {
              throw new DomainError('Bedrock returned an invalid tool request ID. Retry the request.', 502);
            }
            usedIds.add(tool.toolUseId);
          }
          messages.push({ role: 'assistant', content: structuredClone(content) });

          if (!requests.length) {
            if (['max_tokens', 'guardrail_intervened', 'content_filtered'].includes(response.stopReason)) {
              throw new DomainError('Bedrock could not complete this response. Retry with a shorter request.', 503);
            }
            let reply = content.filter(block => typeof block.text === 'string').map(block => block.text).join('\n').trim();
            if (!reply) throw new DomainError('Bedrock returned no response text. Retry the request.', 502);
            if (rejectedTool) reply = 'Saving, cancelling and completing handoffs require your explicit user controls. No household changes were saved.';
            if (context.pending) reply += '\n\nReview the pending preview and confirm to save. Nothing has changed yet.';
            context.providerMessages = boundedHistory(messages);
            return { reply };
          }

          const results = [];
          for (const tool of requests) {
            let result;
            let status = 'success';
            if (!exposed.has(tool.name)) {
              rejectedTool = true;
              status = 'error';
              result = { error: 'This tool is not permitted. Only household reads and previews are available; confirmation, cancellation and completion require explicit user controls.', status: 403 };
            } else if (!tool.input || typeof tool.input !== 'object' || Array.isArray(tool.input)) {
              status = 'error';
              result = { error: 'Tool arguments must be a JSON object matching its input schema.', status: 400 };
            } else {
              try {
                result = tool.name.startsWith('preview_')
                  ? await this.replacePreview(call, context, tool.name, tool.input)
                  : await call(tool.name, tool.input);
              } catch (error) {
                status = 'error';
                result = { error: error instanceof DomainError ? error.message : 'The household tool could not respond. Retry the request.', status: error.status || 502 };
              }
            }
            results.push({ toolResult: { toolUseId: tool.toolUseId, status, content: [{ json: boundedJson(result) }] } });
          }
          messages.push({ role: 'user', content: results });
        }
        throw new DomainError('Bedrock reached its tool-turn limit. Retry with a narrower question; any pending preview is still available for review.', 503);
      });
    } catch (error) {
      const failure = error instanceof DomainError ? error : new DomainError('The assistant could not finish this request. Retry after checking the local MCP server.', 502);
      Object.assign(failure, { conversationId: context.id, trace: currentTrace, ...(currentBoard ? { board: currentBoard } : {}), ...(context.pending ? { proposal: structuredClone(context.pending) } : {}) });
      throw failure;
    }
  }
}
