import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { HouseholdStore } from '../src/store.js';

const clock = () => new Date('2026-10-09T12:00:00Z');

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'homerelay-store-test-'));
  t.after(async () => {
    const resolvedDirectory = resolve(directory);
    assert.equal(dirname(resolvedDirectory), resolve(tmpdir()), 'Only remove this test directory inside the system temporary directory');
    assert.ok(basename(resolvedDirectory).startsWith('homerelay-store-test-'), 'Refuse to remove an unexpected temporary directory');
    await rm(resolvedDirectory, { recursive: true, force: true });
  });
  const dataFile = join(directory, 'household.json');
  return { store: new HouseholdStore(dataFile, clock), reload: () => new HouseholdStore(dataFile, clock) };
}

function rejectWrite(store, action) {
  const save = store.save;
  store.save = () => { throw new Error('Simulated storage write failure'); };
  try {
    assert.throws(action, /Simulated storage write failure/);
  } finally {
    store.save = save;
  }
}

const confirmationCases = [
  {
    name: 'creating a handoff',
    preview: store => store.previewHandoff({
      title: 'Bring the school form', assigneeId: 'alex', dueDate: '2026-10-10', dueTime: '08:00', dependsOn: ['seed-print-form'],
    }),
    verify: (before, result) => {
      assert.equal(result.board.tasks.length, before.tasks.length + 1);
      assert.equal(result.saved.length, 1);
      assert.equal(result.saved[0].assigneeId, 'alex');
    },
  },
  {
    name: 'reassigning a handoff',
    preview: store => store.previewRebalance({ assigneeId: 'alex', dueDate: '2026-10-10' }),
    verify: (before, result) => {
      assert.equal(result.board.tasks.length, before.tasks.length);
      assert.notEqual(result.board.tasks.find(task => task.id === 'seed-groceries').assigneeId, 'alex');
      assert.deepEqual(result.board.tasks.find(task => task.id === 'seed-library'), before.tasks.find(task => task.id === 'seed-library'));
    },
  },
];

for (const scenario of confirmationCases) {
  test(`failed persistence while ${scenario.name} leaves the plan intact and permits retry`, { timeout: 5000 }, async t => {
    const { store, reload } = await fixture(t);
    const before = store.board();
    const proposal = scenario.preview(store);

    rejectWrite(store, () => store.confirm(proposal.id));
    assert.deepEqual(store.board(), before, 'A failed save must preserve tasks and revision in memory');
    assert.deepEqual(reload().board(), before, 'A failed save must preserve the previously persisted plan');
    assert.deepEqual(store.getProposal(proposal.id), proposal, 'The pending proposal must remain available for retry');

    const result = store.confirm(proposal.id);
    assert.equal(result.board.revision, before.revision + 1);
    scenario.verify(before, result);
    assert.deepEqual(reload().board(), result.board, 'A successful retry must persist the confirmed changes');
    assert.throws(() => store.getProposal(proposal.id), /already used or cancelled/);
  });
}

test('failed persistence during completion preserves the unfinished task and permits retry', { timeout: 5000 }, async t => {
  const { store, reload } = await fixture(t);
  const before = store.board();

  rejectWrite(store, () => store.complete('seed-print-form'));
  assert.deepEqual(store.board(), before, 'A failed save must preserve the unfinished task and revision in memory');
  assert.deepEqual(reload().board(), before, 'A failed save must preserve the unfinished task on disk');

  const result = store.complete('seed-print-form');
  assert.equal(result.task.status, 'done');
  assert.equal(result.board.revision, before.revision + 1);
  assert.deepEqual(reload().board(), result.board, 'A successful retry must persist completion');
});
