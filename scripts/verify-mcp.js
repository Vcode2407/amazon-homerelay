import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startServer } from '../src/server.js';
import { addDays } from '../src/store.js';

// This probe owns a temporary fictional board. It never reads .env or a saved household.
const temporaryRoot = resolve(tmpdir());
const directory = await mkdtemp(join(temporaryRoot, 'homerelay-mcp-probe-'));
const dataFile = join(directory, 'household.json');
let running;
let client;
const evidence = { provider: 'offline', fictionalData: true, steps: [] };

try {
  running = await startServer({ port: 0, dataFile, configuration: { provider: 'offline' } });
  client = new Client({ name: 'homerelay-judge-probe', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${running.url}/mcp`));
  await client.connect(transport, { timeout: 10000 });
  assert.equal(transport.protocolVersion, '2025-11-25');
  evidence.protocolVersion = transport.protocolVersion;
  const discovery = await client.listTools({}, { timeout: 10000 });
  evidence.tools = discovery.tools.map(tool => tool.name).sort();
  assert.deepEqual(evidence.tools, ['cancel_proposal', 'complete_handoff', 'confirm_proposal', 'get_household_board', 'get_household_brief', 'preview_handoff', 'preview_rebalance']);

  async function call(name, args = {}, expectedError = false) {
    const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 10000 });
    const payload = result.structuredContent ?? JSON.parse(result.content.find(item => item.type === 'text').text);
    assert.equal(Boolean(result.isError), expectedError, JSON.stringify(payload));
    evidence.steps.push({ tool: name, arguments: args, outcome: expectedError ? payload.error : 'passed' });
    return payload;
  }

  const original = await call('get_household_board');
  const tomorrow = addDays(original.today, 1);
  const input = { title: 'Bring the school form', assigneeId: 'alex', dueDate: tomorrow, dueTime: '08:00', priority: 'normal', dependsOn: ['seed-print-form'] };
  const cancelled = await call('preview_handoff', input);
  assert.deepEqual((await call('get_household_board')).tasks, original.tasks);
  await call('cancel_proposal', { proposalId: cancelled.id });
  assert.deepEqual((await call('get_household_board')).tasks, original.tasks);

  // Explicit scripted confirmation is only for this disposable diagnostic household.
  const reviewed = await call('preview_handoff', input);
  const confirmed = await call('confirm_proposal', { proposalId: reviewed.id });
  assert.equal(confirmed.board.tasks.length, original.tasks.length + 1);
  const created = confirmed.saved[0];
  const blocked = await call('complete_handoff', { taskId: created.id }, true);
  assert.match(blocked.error, /prerequisite/i);
  await call('complete_handoff', { taskId: 'seed-print-form' });
  await call('complete_handoff', { taskId: created.id });
  const final = await call('get_household_board');
  assert.equal(final.tasks.find(task => task.id === created.id).status, 'done');
  await client.close();
  client = undefined;
  await running.close();
  running = undefined;
  running = await startServer({ port: 0, dataFile, configuration: { provider: 'offline' } });
  const reopened = await fetch(`${running.url}/api/board`, { signal: AbortSignal.timeout(10000) });
  assert.equal(reopened.status, 200);
  assert.deepEqual((await reopened.json()).tasks, final.tasks);
  evidence.restartPersistence = 'passed';
  evidence.result = 'passed';
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await client?.close();
  await running?.close();
  if (dirname(resolve(directory)) !== temporaryRoot || !basename(directory).startsWith('homerelay-mcp-probe-')) throw new Error('Refusing to remove an unexpected temporary directory.');
  await rm(directory, { recursive: true, force: true });
}
