import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { BedrockAssistant } from '../src/bedrock.js';
import { DomainError, HouseholdStore } from '../src/store.js';

const clock = () => new Date('2026-10-09T12:00:00Z');
const handoff = { title: 'Bring the school form', assigneeId: 'alex', dueDate: '2026-10-10', dueTime: '08:00', dependsOn: ['seed-print-form'] };
const toolNames = ['get_household_board', 'get_household_brief', 'preview_handoff', 'preview_rebalance', 'confirm_proposal', 'cancel_proposal', 'complete_handoff'];

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'homerelay-bedrock-test-'));
  t.after(async () => {
    const resolvedDirectory = resolve(directory);
    assert.equal(dirname(resolvedDirectory), resolve(tmpdir()));
    assert.ok(basename(resolvedDirectory).startsWith('homerelay-bedrock-test-'));
    await rm(resolvedDirectory, { recursive: true, force: true });
  });
  const store = new HouseholdStore(join(directory, 'household.json'), clock);
  const calls = [];
  const discovered = toolNames.map(name => ({ name, description: `Discovered ${name}`, inputSchema: { type: 'object', properties: { dueDate: { type: 'string' } }, additionalProperties: true } }));
  let discoveries = 0;
  const mcp = {
    async listTools() { discoveries++; return { tools: discovered }; },
    async callTool({ name, arguments: args }) {
      calls.push({ name, arguments: structuredClone(args) });
      try {
        const actions = {
          get_household_board: () => store.board(),
          get_household_brief: () => store.brief(args.dueDate),
          preview_handoff: () => store.previewHandoff(args),
          preview_rebalance: () => store.previewRebalance(args),
          confirm_proposal: () => store.confirm(args.proposalId),
          cancel_proposal: () => store.cancel(args.proposalId),
          complete_handoff: () => store.complete(args.taskId),
        };
        const result = actions[name]();
        return { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (error) {
        return { isError: true, structuredContent: { error: error.message, status: error.status || 400 } };
      }
    },
  };
  return { store, mcp, calls, discovered, get discoveries() { return discoveries; } };
}

function toolResponse(...requests) {
  return { stopReason: 'tool_use', output: { message: { role: 'assistant', content: requests.map(toolUse => ({ toolUse })) } } };
}

function textResponse(text) {
  return { stopReason: 'end_turn', output: { message: { role: 'assistant', content: [{ text }] } } };
}

function runtime(responses) {
  const inputs = [];
  const options = [];
  return {
    inputs, options,
    async send(command, sendOptions) {
      assert.ok(command instanceof ConverseCommand);
      inputs.push(structuredClone(command.input));
      options.push(sendOptions);
      const response = typeof responses === 'function' ? responses(inputs.length) : responses.shift();
      assert.ok(response, 'Unexpected additional provider call');
      if (response instanceof Error) throw response;
      return structuredClone(response);
    },
  };
}

test('Bedrock discovers MCP schemas and executes a multi-turn read with matching tool results', { timeout: 5000 }, async t => {
  const f = await fixture(t);
  const client = runtime([
    toolResponse({ toolUseId: 'brief-1', name: 'get_household_brief', input: { dueDate: '2026-10-10' } }),
    textResponse('There are three handoffs tomorrow.'),
  ]);
  const assistant = new BedrockAssistant({ client, modelId: 'test.model' });
  const before = f.store.board();
  const result = await assistant.chat(f.mcp, 'What should we prepare for tomorrow?');
  assert.equal(f.discoveries, 1);
  assert.equal(client.inputs.length, 2);
  assert.deepEqual(client.inputs[0].toolConfig.tools.map(tool => tool.toolSpec.name), toolNames.slice(0, 4));
  assert.deepEqual(client.inputs[0].toolConfig.tools[0].toolSpec.inputSchema.json, f.discovered[0].inputSchema);
  assert.equal(client.inputs[0].modelId, 'test.model');
  assert.ok(client.inputs[0].inferenceConfig.maxTokens <= 1000);
  assert.ok(client.options[0].abortSignal instanceof AbortSignal);
  assert.match(client.inputs[0].system[0].text, /Asia\/Kolkata/);
  const returnedTool = client.inputs[1].messages.at(-1).content[0].toolResult;
  assert.equal(returnedTool.toolUseId, 'brief-1');
  assert.equal(returnedTool.status, 'success');
  assert.equal(returnedTool.content[0].json.openCount, 3);
  assert.deepEqual(result.trace.map(entry => entry.tool), ['get_household_board', 'get_household_brief']);
  assert.match(result.reply, /three handoffs/);
  assert.deepEqual(f.store.board(), before);
});

test('Bedrock preview correction replaces the pending proposal and explicit confirmation bypasses the model', { timeout: 5000 }, async t => {
  const f = await fixture(t);
  const client = runtime([
    toolResponse({ toolUseId: 'preview-1', name: 'preview_handoff', input: handoff }), textResponse('Okay.'),
    toolResponse({ toolUseId: 'preview-2', name: 'preview_handoff', input: { ...handoff, assigneeId: 'maya' } }), textResponse('Updated.'),
  ]);
  const assistant = new BedrockAssistant({ client, modelId: 'test.model' });
  const before = f.store.board();
  const original = await assistant.chat(f.mcp, 'Ask Dad to bring the school form tomorrow at 8 am');
  assert.ok(original.proposal);
  assert.match(original.reply, /confirm to save/);
  assert.deepEqual(f.store.board(), before);
  const revised = await assistant.chat(f.mcp, 'Make Mum responsible instead', original.conversationId);
  assert.notEqual(revised.proposal.id, original.proposal.id);
  assert.equal(revised.proposal.items[0].assigneeId, 'maya');
  assert.ok(revised.trace.some(entry => entry.tool === 'cancel_proposal' && entry.arguments.proposalId === original.proposal.id));
  assert.throws(() => f.store.getProposal(original.proposal.id), /already used or cancelled/);
  const confirmed = await assistant.chat(f.mcp, 'confirm', revised.conversationId);
  assert.equal(client.inputs.length, 4, 'Explicit confirmation must never invoke the model');
  assert.equal(confirmed.board.tasks.length, before.tasks.length + 1);
  assert.equal(confirmed.board.tasks.at(-1).assigneeId, 'maya');
  assert.ok(confirmed.trace.some(entry => entry.tool === 'confirm_proposal'));
  assert.equal(confirmed.proposal, undefined);
  assert.deepEqual(assistant.conversations.get(revised.conversationId).providerMessages, []);
});

test('provider failure surfaces a retryable error with the pending preview and sanitized details', { timeout: 5000 }, async t => {
  const f = await fixture(t);
  const failure = new Error('Sensitive provider diagnostic must not be exposed');
  failure.name = 'AccessDeniedException';
  const client = runtime([toolResponse({ toolUseId: 'preview-before-failure', name: 'preview_handoff', input: handoff }), failure]);
  const assistant = new BedrockAssistant({ client, modelId: 'test.model' });
  const before = f.store.board();
  let captured;
  await assert.rejects(assistant.chat(f.mcp, 'Prepare the school form handoff'), error => {
    captured = error;
    assert.ok(error instanceof DomainError);
    assert.equal(error.status, 502);
    assert.match(error.message, /retry/i);
    assert.doesNotMatch(error.message, /Sensitive provider diagnostic/);
    assert.equal(typeof error.conversationId, 'string');
    assert.ok(error.proposal);
    assert.deepEqual(error.board, before);
    assert.ok(error.trace.some(entry => entry.tool === 'preview_handoff'));
    return true;
  });
  assert.deepEqual(f.store.board(), before);
  const confirmed = await assistant.chat(f.mcp, 'confirm', captured.conversationId);
  assert.equal(client.inputs.length, 2);
  assert.equal(confirmed.board.tasks.length, before.tasks.length + 1);
});

test('MCP domain errors are returned to Bedrock as structured tool errors without saving', { timeout: 5000 }, async t => {
  const f = await fixture(t);
  const client = runtime([
    toolResponse({ toolUseId: 'invalid-date', name: 'preview_handoff', input: { ...handoff, dueDate: '2026-02-31' } }),
    textResponse('Please provide a real calendar date.'),
  ]);
  const assistant = new BedrockAssistant({ client, modelId: 'test.model' });
  const before = f.store.board();
  const result = await assistant.chat(f.mcp, 'Prepare this handoff');
  const returnedTool = client.inputs[1].messages.at(-1).content[0].toolResult;
  assert.equal(returnedTool.status, 'error');
  assert.equal(returnedTool.content[0].json.status, 400);
  assert.match(returnedTool.content[0].json.error, /real calendar date/);
  assert.equal(result.proposal, undefined);
  assert.ok(result.trace.some(entry => entry.tool === 'preview_handoff' && entry.result.error));
  assert.deepEqual(f.store.board(), before);
});

test('model requests cannot confirm, cancel or complete tasks and user cancellation stays deterministic', { timeout: 5000 }, async t => {
  const f = await fixture(t);
  const client = runtime([
    toolResponse(
      { toolUseId: 'forbidden-confirm', name: 'confirm_proposal', input: { proposalId: 'ignored' } },
      { toolUseId: 'forbidden-cancel', name: 'cancel_proposal', input: { proposalId: 'ignored' } },
      { toolUseId: 'forbidden-complete', name: 'complete_handoff', input: { taskId: 'seed-print-form' } },
    ),
    textResponse('Saved all changes.'),
  ]);
  const assistant = new BedrockAssistant({ client, modelId: 'test.model' });
  const context = assistant.conversation();
  context.pending = f.store.previewHandoff(handoff);
  const before = f.store.board();
  const result = await assistant.chat(f.mcp, 'Make these changes', context.id);
  assert.deepEqual(f.calls.map(call => call.name), ['get_household_board']);
  assert.deepEqual(f.store.board(), before);
  assert.equal(result.proposal.id, context.pending.id);
  assert.doesNotMatch(result.reply, /Saved all changes/);
  assert.match(result.reply, /explicit user controls/);
  const errors = client.inputs[1].messages.at(-1).content;
  assert.equal(errors.length, 3);
  assert.ok(errors.every(block => block.toolResult.status === 'error' && block.toolResult.content[0].json.status === 403));
  const cancelled = await assistant.chat(f.mcp, 'cancel', context.id);
  assert.equal(client.inputs.length, 2);
  assert.equal(cancelled.proposal, undefined);
  assert.ok(cancelled.trace.some(entry => entry.tool === 'cancel_proposal'));
  assert.deepEqual(f.store.board(), before);
});

test('Bedrock loops stop at the configured turn bound without persisting changes', { timeout: 5000 }, async t => {
  const f = await fixture(t);
  const client = runtime(turn => toolResponse({ toolUseId: `repeat-${turn}`, name: 'get_household_board', input: {} }));
  const assistant = new BedrockAssistant({ client, modelId: 'test.model', maxTurns: 2 });
  const before = f.store.board();
  await assert.rejects(assistant.chat(f.mcp, 'Keep checking the board'), error => error instanceof DomainError && error.status === 503);
  assert.equal(client.inputs.length, 2);
  assert.equal(f.calls.length, 3, 'Only the initial board read and two model-requested reads are permitted');
  assert.deepEqual(f.store.board(), before);
});

test('oversized tool batches are rejected before invoking model-requested MCP tools', { timeout: 5000 }, async t => {
  const f = await fixture(t);
  const client = runtime([toolResponse(...Array.from({ length: 5 }, (_, index) => ({ toolUseId: `too-many-${index}`, name: 'get_household_board', input: {} })))]);
  const assistant = new BedrockAssistant({ client, modelId: 'test.model' });
  await assert.rejects(assistant.chat(f.mcp, 'Check everything at once'), error => error instanceof DomainError && error.status === 503);
  assert.equal(client.inputs.length, 1);
  assert.deepEqual(f.calls.map(call => call.name), ['get_household_board']);
});

test('provider history stays bounded while preserving complete exchanges', { timeout: 5000 }, async t => {
  const f = await fixture(t);
  const client = runtime(() => textResponse('A'.repeat(1500)));
  const assistant = new BedrockAssistant({ client, modelId: 'test.model' });
  let conversationId;
  for (let index = 0; index < 18; index++) {
    const result = await assistant.chat(f.mcp, `Question ${index}`, conversationId);
    conversationId = result.conversationId;
  }
  for (const input of client.inputs) {
    assert.ok(input.messages.length <= 24);
    assert.ok(JSON.stringify(input.messages).length <= 24000);
    assert.equal(input.messages[0].role, 'user');
  }
  const history = assistant.conversations.get(conversationId).providerMessages;
  assert.ok(history.length <= 24);
  assert.ok(JSON.stringify(history).length <= 24000);
  assert.equal(history.at(-1).role, 'assistant');
});
