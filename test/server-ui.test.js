import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { startServer } from '../src/server.js';
import { readConfiguration, providerStatus } from '../src/config.js';

async function fixture(t) {
  const root = resolve(tmpdir());
  const directory = await mkdtemp(join(root, 'homerelay-ui-test-'));
  const running = await startServer({ port: 0, dataFile: join(directory, 'household.json'), clock: () => new Date('2026-10-09T12:00:00Z') });
  t.after(async () => {
    await running.close();
    if (dirname(resolve(directory)) !== root || !basename(directory).startsWith('homerelay-ui-test-')) throw new Error('Refusing to remove an unexpected test directory.');
    await rm(directory, { recursive: true, force: true });
  });
  return async (path, body) => {
    const response = await fetch(`${running.url}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(5000)
    });
    return { status: response.status, body: await response.json() };
  };
}

const handoff = { title: 'Pack the swimming kit', assigneeId: 'sam', dueDate: '2026-10-10', dueTime: '09:30', priority: 'normal', dependsOn: [] };

test('handoff form uses real MCP preview and explicit confirmation', { timeout: 15000 }, async t => {
  const request = await fixture(t);
  const original = (await request('/api/board')).body;
  const preview = await request('/api/handoff', handoff);
  assert.equal(preview.status, 200);
  assert.equal(preview.body.proposal.items[0].title, handoff.title);
  assert.deepEqual(preview.body.trace.map(step => step.tool), ['get_household_board', 'preview_handoff']);
  assert.deepEqual((await request('/api/board')).body.tasks, original.tasks);
  const confirmed = await request('/api/confirm', { conversationId: preview.body.conversationId, proposalId: preview.body.proposal.id });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.board.tasks.length, original.tasks.length + 1);
  assert.ok(confirmed.body.board.tasks.some(task => task.title === handoff.title && task.assigneeId === 'sam' && task.dueTime === '09:30'));
});

test('a form preview replaces an older conversational preview', { timeout: 15000 }, async t => {
  const request = await fixture(t);
  const first = (await request('/api/chat', { message: 'Ask Dad to bring the school form tomorrow at 8 am' })).body;
  const replacement = await request('/api/handoff', { ...handoff, conversationId: first.conversationId });
  assert.equal(replacement.status, 200);
  assert.equal(replacement.body.conversationId, first.conversationId);
  assert.notEqual(replacement.body.proposal.id, first.proposal.id);
  const old = await request('/api/confirm', { conversationId: first.conversationId, proposalId: first.proposal.id });
  assert.equal(old.status, 400);
  const confirmed = await request('/api/confirm', { conversationId: first.conversationId, proposalId: replacement.body.proposal.id });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.board.tasks.length, 5);
  assert.equal(confirmed.body.board.tasks.at(-1).title, handoff.title);
});

test('invalid form dates, times and prerequisites leave the plan unchanged', { timeout: 15000 }, async t => {
  const request = await fixture(t);
  const original = (await request('/api/board')).body;
  for (const draft of [
    { ...handoff, dueDate: '2026-02-30' },
    { ...handoff, dueTime: '25:30' },
    { ...handoff, dependsOn: ['missing-task'] },
    { ...handoff, assigneeId: 'unknown' },
    { ...handoff, title: 'x' }
  ]) assert.equal((await request('/api/handoff', draft)).status, 400);
  assert.deepEqual((await request('/api/board')).body.tasks, original.tasks);
});

test('provider status describes configuration without claiming a live connection', { timeout: 15000 }, async t => {
  const request = await fixture(t);
  const status = await request('/api/status');
  assert.equal(status.status, 200);
  assert.equal(status.body.provider, 'offline');
  assert.equal(status.body.configured, false);
  assert.match(status.body.detail, /No AI provider connected/);
  assert.deepEqual(readConfiguration({}), { provider: 'offline' });
  assert.throws(() => readConfiguration({ ASSISTANT_PROVIDER: 'unknown' }));
  assert.throws(() => readConfiguration({ ASSISTANT_PROVIDER: 'bedrock' }), /BEDROCK_MODEL_ID/);
  assert.throws(() => readConfiguration({ ASSISTANT_PROVIDER: 'bedrock', BEDROCK_MODEL_ID: 'test-model' }), /AWS_REGION/);
  assert.throws(() => readConfiguration({ ASSISTANT_PROVIDER: 'bedrock', BEDROCK_MODEL_ID: 'test-model', AWS_REGION: 'us-east-1', BEDROCK_MAX_TURNS: '99' }), /BEDROCK_MAX_TURNS/);
  const configured = readConfiguration({ ASSISTANT_PROVIDER: 'bedrock', BEDROCK_MODEL_ID: 'test-model', AWS_REGION: 'us-east-1' });
  const display = providerStatus(configured);
  assert.equal(display.label, 'Bedrock configured');
  assert.match(display.detail, /access is checked when/);
});
