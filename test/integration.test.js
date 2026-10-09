import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startServer } from '../src/server.js';

const clock = () => new Date('2026-10-09T12:00:00Z');
const handoffRequest = 'Ask Dad to bring the school form tomorrow at 8 am';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'homerelay-test-'));
  const dataFile = join(directory, 'household.json');
  let server;
  t.after(async () => {
    try {
      if (server) await server.close();
    } finally {
      const resolvedDirectory = resolve(directory);
      assert.equal(dirname(resolvedDirectory), resolve(tmpdir()), 'Only remove this test directory inside the system temporary directory');
      assert.ok(basename(resolvedDirectory).startsWith('homerelay-test-'), 'Refuse to remove an unexpected temporary directory');
      await rm(resolvedDirectory, { recursive: true, force: true });
    }
  });
  async function reopen() {
    if (server) {
      await server.close();
      server = undefined;
    }
    server = await startServer({ port: 0, dataFile, clock });
  }
  await reopen();
  return {
    get url() { return server.url; },
    reopen,
    async request(path, body, extraHeaders = {}) {
      const response = await fetch(`${server.url}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extraHeaders },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(5000),
      });
      const text = await response.text();
      return { status: response.status, body: text ? JSON.parse(text) : null };
    },
  };
}

async function board(f) {
  const response = await f.request('/api/board');
  assert.equal(response.status, 200);
  return response.body;
}

async function chat(f, message, conversationId) {
  const response = await f.request('/api/chat', { message, ...(conversationId ? { conversationId } : {}) });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(typeof response.body.conversationId, 'string');
  assert.equal(typeof response.body.reply, 'string');
  assert.ok(Array.isArray(response.body.trace));
  return response.body;
}

function proposalId(result) {
  assert.ok(result.proposal, 'The assistant must return a reviewable proposal');
  assert.equal(typeof result.proposal.id, 'string');
  return result.proposal.id;
}

async function confirm(f, result) {
  const response = await f.request('/api/confirm', {
    conversationId: result.conversationId,
    proposalId: proposalId(result),
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body;
}

function addedTask(before, after) {
  const oldIds = new Set(before.tasks.map(task => task.id));
  const added = after.tasks.filter(task => !oldIds.has(task.id));
  assert.equal(added.length, 1, 'Confirmation must create exactly one handoff');
  return added[0];
}

function toolPayload(result) {
  if (result.structuredContent) return result.structuredContent;
  const content = result.content.find(item => item.type === 'text');
  assert.ok(content, 'The MCP tool must return a readable result');
  return JSON.parse(content.text);
}

test('MCP negotiates the required protocol and an SDK client calls the household tool', { timeout: 20000 }, async t => {
  const f = await fixture(t);
  const health = await f.request('/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.ok, true);
  assert.equal(health.body.protocol, '2025-11-25');
  assert.equal(health.body.mode, 'offline');

  const initialize = await fetch(`${f.url}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'integration-probe', version: '1.0.0' } },
    }),
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(initialize.status, 200);
  const raw = await initialize.text();
  const initialization = initialize.headers.get('content-type')?.includes('text/event-stream')
    ? JSON.parse(raw.split('\n').find(line => line.startsWith('data: ')).slice(6))
    : JSON.parse(raw);
  assert.equal(initialization.result.protocolVersion, '2025-11-25', 'Assert actual negotiation, not only health metadata');
  const sessionId = initialize.headers.get('mcp-session-id');
  if (sessionId) {
    const response = await fetch(`${f.url}/mcp`, {
      method: 'DELETE',
      headers: { 'mcp-session-id': sessionId, 'mcp-protocol-version': '2025-11-25', Accept: 'application/json, text/event-stream' },
      signal: AbortSignal.timeout(5000),
    });
    await response.body?.cancel();
  }

  const client = new Client({ name: 'homerelay-integration-test', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${f.url}/mcp`));
  try {
    await client.connect(transport);
    assert.equal(transport.protocolVersion, '2025-11-25');
    const tools = await client.listTools();
    for (const name of ['get_household_board', 'get_household_brief', 'preview_handoff', 'preview_rebalance']) {
      assert.ok(tools.tools.some(tool => tool.name === name), `Missing MCP tool ${name}`);
    }
    const result = await client.callTool({ name: 'get_household_board', arguments: {} });
    assert.notEqual(result.isError, true);
    const household = toolPayload(result);
    assert.equal(household.tasks.length, 4);
    assert.deepEqual(household.members.map(member => member.id).sort(), ['alex', 'maya', 'sam']);
  } finally {
    await client.close();
  }
});

test('tomorrow brief executes both read tools and preserves the household plan', { timeout: 15000 }, async t => {
  const f = await fixture(t);
  const before = await board(f);
  assert.equal(before.today, '2026-10-09');
  assert.equal(before.timeZone, 'Asia/Kolkata');
  const result = await chat(f, 'What needs attention tomorrow?');
  assert.deepEqual(result.trace.map(entry => entry.tool), ['get_household_board', 'get_household_brief']);
  for (const entry of result.trace) {
    assert.ok(entry.arguments && typeof entry.arguments === 'object');
    assert.ok(entry.result);
  }
  const brief = result.trace.find(entry => entry.tool === 'get_household_brief');
  assert.equal(brief.arguments.dueDate, '2026-10-10');
  assert.equal(brief.result.openCount, 3);
  assert.ok(brief.result.tasks.every(task => task.dueDate === '2026-10-10'));
  assert.ok(result.reply.length > 0);
  assert.deepEqual((await board(f)).tasks, before.tasks);
});

test('handoffs require confirmation and cannot complete before their prerequisite', { timeout: 15000 }, async t => {
  const f = await fixture(t);
  const before = await board(f);
  const preview = await chat(f, handoffRequest);
  assert.ok(preview.trace.some(entry => entry.tool === 'preview_handoff'));
  proposalId(preview);
  assert.deepEqual((await board(f)).tasks, before.tasks, 'A preview must not save a task');

  const confirmed = await confirm(f, preview);
  const handoff = addedTask(before, confirmed.board);
  assert.equal(handoff.assigneeId, 'alex');
  assert.match(handoff.title, /bring the school form/i);
  assert.equal(handoff.dueDate, '2026-10-10');
  assert.equal(handoff.dueTime, '08:00');
  assert.ok(handoff.dependsOn.includes('seed-print-form'), 'Bringing the school form depends on printing it');
  const blocked = await f.request('/api/complete', { taskId: handoff.id });
  assert.equal(blocked.status, 400);
  assert.equal((await board(f)).tasks.find(task => task.id === handoff.id).status, 'open');
  assert.equal((await f.request('/api/complete', { taskId: 'seed-print-form' })).status, 200);
  const completed = await f.request('/api/complete', { taskId: handoff.id });
  assert.equal(completed.status, 200, JSON.stringify(completed.body));
  assert.equal(completed.body.board.tasks.find(task => task.id === handoff.id).status, 'done');
});

test('an owner correction replaces the pending proposal before confirmation', { timeout: 15000 }, async t => {
  const f = await fixture(t);
  const before = await board(f);
  const original = await chat(f, handoffRequest);
  const revised = await chat(f, 'Give it to Mum instead', original.conversationId);
  assert.equal(revised.conversationId, original.conversationId);
  assert.notEqual(proposalId(revised), proposalId(original));
  assert.ok(revised.trace.some(entry => entry.tool === 'preview_handoff'));
  assert.deepEqual((await board(f)).tasks, before.tasks);
  const oldConfirmation = await f.request('/api/confirm', { conversationId: original.conversationId, proposalId: proposalId(original) });
  assert.equal(oldConfirmation.status, 400, 'An owner correction invalidates the old preview');
  const confirmed = await confirm(f, revised);
  assert.equal(addedTask(before, confirmed.board).assigneeId, 'maya');
});

test('rebalance changes all of Dad\'s tomorrow handoffs only after confirmation', { timeout: 15000 }, async t => {
  const f = await fixture(t);
  const seeded = await board(f);
  const added = await confirm(f, await chat(f, handoffRequest));
  const handoff = addedTask(seeded, added.board);
  const before = await board(f);
  const preview = await chat(f, 'Dad cannot do his handoffs tomorrow');
  assert.ok(preview.trace.some(entry => entry.tool === 'preview_rebalance'));
  assert.deepEqual((await board(f)).tasks, before.tasks);
  const result = await confirm(f, preview);
  for (const id of ['seed-groceries', handoff.id]) {
    assert.notEqual(result.board.tasks.find(task => task.id === id).assigneeId, 'alex');
  }
  for (const id of ['seed-library', 'seed-print-form', 'seed-pack-bag']) {
    assert.deepEqual(result.board.tasks.find(task => task.id === id), before.tasks.find(task => task.id === id));
  }
});

test('cancellation preserves tasks and concurrent changes invalidate a proposal', { timeout: 15000 }, async t => {
  const f = await fixture(t);
  const before = await board(f);
  const cancelled = await chat(f, handoffRequest);
  const cancelBody = { conversationId: cancelled.conversationId, proposalId: proposalId(cancelled) };
  assert.equal((await f.request('/api/cancel', cancelBody)).status, 200);
  assert.equal((await f.request('/api/cancel', cancelBody)).status, 400);
  assert.deepEqual((await board(f)).tasks, before.tasks);
  await f.reopen();
  assert.deepEqual((await board(f)).tasks, before.tasks, 'Cancelled previews must not persist');

  const stale = await chat(f, handoffRequest);
  assert.equal((await f.request('/api/complete', { taskId: 'seed-library' })).status, 200);
  const result = await f.request('/api/confirm', { conversationId: stale.conversationId, proposalId: proposalId(stale) });
  assert.equal(result.status, 409);
  const after = await board(f);
  assert.equal(after.tasks.length, before.tasks.length);
  assert.equal(after.tasks.find(task => task.id === 'seed-library').status, 'done');
});

test('confirmed handoffs and completions survive a server restart', { timeout: 15000 }, async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/complete', { taskId: 'seed-print-form' })).status, 200);
  const before = await board(f);
  const confirmation = await confirm(f, await chat(f, handoffRequest));
  const handoff = addedTask(before, confirmation.board);
  assert.equal((await f.request('/api/complete', { taskId: handoff.id })).status, 200);
  const saved = await board(f);
  await f.reopen();
  const restored = await board(f);
  assert.deepEqual(restored.tasks, saved.tasks);
  assert.deepEqual(restored.members, saved.members);
  assert.equal(restored.tasks.find(task => task.id === handoff.id).status, 'done');
});

test('untrusted web origins cannot invoke assistant or MCP mutations', { timeout: 15000 }, async t => {
  const f = await fixture(t);
  const before = await board(f);
  const denied = await f.request('/api/chat', { message: handoffRequest }, { Origin: 'https://evil.example' });
  assert.equal(denied.status, 403);
  const mcpDenied = await f.request('/mcp', {
    jsonrpc: '2.0', id: 2, method: 'initialize',
    params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'untrusted-origin', version: '1.0.0' } },
  }, { Origin: 'https://evil.example', Accept: 'application/json, text/event-stream' });
  assert.equal(mcpDenied.status, 403);
  assert.deepEqual((await board(f)).tasks, before.tasks);
});
