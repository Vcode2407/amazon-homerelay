import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { OfflineAssistant, confirmationIntent, isConfirmationIntent } from '../src/assistant.js';
import { HouseholdStore } from '../src/store.js';

const clock = () => new Date('2026-10-09T12:00:00Z');

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'homerelay-language-test-'));
  t.after(async () => {
    const target = resolve(directory);
    assert.equal(dirname(target), resolve(tmpdir()), 'Only remove this test directory inside the system temporary directory');
    assert.ok(basename(target).startsWith('homerelay-language-test-'), 'Refuse to remove an unexpected temporary directory');
    await rm(target, { recursive: true, force: true });
  });
  const dataFile = join(directory, 'household.json');
  const store = new HouseholdStore(dataFile, clock);
  const assistant = new OfflineAssistant();
  const actions = {
    get_household_board: () => store.board(),
    get_household_brief: args => store.brief(args.dueDate),
    preview_handoff: args => store.previewHandoff(args),
    preview_rebalance: args => store.previewRebalance(args),
    confirm_proposal: args => store.confirm(args.proposalId),
    cancel_proposal: args => store.cancel(args.proposalId),
  };
  const client = {
    async callTool({ name, arguments: args }) {
      assert.ok(actions[name], `Unexpected tool: ${name}`);
      try {
        const result = actions[name](args);
        return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: error.message }], structuredContent: { error: error.message, status: error.status || 400 } };
      }
    }
  };
  let conversationId;
  return {
    assistant, client, store,
    reload: () => new HouseholdStore(dataFile, clock),
    async chat(message) {
      const result = await assistant.chat(client, message, conversationId);
      conversationId = result.conversationId;
      return result;
    },
  };
}

test('a handoff draft carries missing details across turns and saves only after confirmation', async t => {
  const f = await fixture(t);
  const before = f.store.board();
  const draft = await f.chat('Ask Dad to buy milk');
  assert.equal(draft.proposal, undefined);
  assert.equal(draft.draft.title, 'Buy milk');
  assert.equal(draft.draft.assigneeId, 'alex');
  assert.match(draft.reply, /which date/i);
  assert.match(draft.reply, /what time/i);
  assert.deepEqual(f.store.board(), before);
  assert.match((await f.chat('confirm')).reply, /finish the draft/i);
  assert.deepEqual(f.reload().board(), before);

  await f.chat('What needs attention tomorrow?');
  const preview = await f.chat('tomorrow at 6 pm');
  assert.equal(preview.proposal.items[0].dueDate, '2026-10-10');
  assert.equal(preview.proposal.items[0].dueTime, '18:00');
  assert.equal(preview.proposal.items[0].title, 'Buy milk');
  assert.deepEqual(f.reload().board(), before);
  const saved = await f.chat('confirm');
  assert.equal(saved.board.tasks.length, before.tasks.length + 1);
  assert.equal(saved.board.tasks.at(-1).title, 'Buy milk');
  assert.deepEqual(f.reload().board(), saved.board);
});

test('ambiguous owners, dates and times require a single answer before a preview exists', async t => {
  const cases = [
    { request: 'Ask Dad or Mum to buy milk tomorrow at 6 pm', reply: /choose one owner/i, answer: 'Mum', expected: ['maya', '2026-10-10', '18:00'] },
    { request: 'Ask Dad to buy milk tomorrow or day after tomorrow at 6 pm', reply: /choose one date/i, answer: 'day after tomorrow', expected: ['alex', '2026-10-11', '18:00'] },
    { request: 'Ask Dad to buy milk on 2026-10-10 or 2026-10-11 at 6 pm', reply: /choose one date/i, answer: '2026-10-11', expected: ['alex', '2026-10-11', '18:00'] },
    { request: 'Ask Dad to buy milk tomorrow at 6 pm or 7 pm', reply: /choose one time/i, answer: 'at 7 pm', expected: ['alex', '2026-10-10', '19:00'] },
    { request: 'Ask Dad to buy milk tomorrow at 8 or 9', reply: /choose one time/i, answer: 'at 9 am', expected: ['alex', '2026-10-10', '09:00'] },
    { request: 'Ask Dad to buy milk tomorrow at 6', reply: /am or pm/i, answer: 'at 6 pm', expected: ['alex', '2026-10-10', '18:00'] },
  ];
  for (const scenario of cases) await t.test(scenario.request, async child => {
    const f = await fixture(child);
    const before = f.store.board();
    const question = await f.chat(scenario.request);
    assert.equal(question.proposal, undefined);
    assert.match(question.reply, scenario.reply);
    assert.deepEqual(f.store.board(), before);
    const preview = await f.chat(scenario.answer);
    const item = preview.proposal.items[0];
    assert.deepEqual([item.assigneeId, item.dueDate, item.dueTime], scenario.expected);
    assert.equal(item.title, 'Buy milk');
    assert.deepEqual(f.reload().board(), before);
  });
});

test('invalid calendar dates and malformed times produce helpful drafts without changing the plan', async t => {
  for (const [request, answer, expectedTime] of [
    ['Ask Dad to buy milk on 2026-02-30 at 6 pm', '2026-10-11', '18:00'],
    ['Ask Dad to buy milk tomorrow at 8:3 am', 'at 8:30 am', '08:30'],
  ]) await t.test(request, async child => {
    const f = await fixture(child);
    const before = f.store.board();
    const invalid = await f.chat(request);
    assert.equal(invalid.proposal, undefined);
    assert.match(invalid.reply, /real calendar date|valid time/i);
    assert.deepEqual(f.store.board(), before);
    assert.deepEqual(f.reload().board(), before);
    const preview = await f.chat(answer);
    assert.equal(preview.proposal.items[0].dueTime, expectedTime);
    assert.deepEqual(f.store.board(), before);
  });
});

test('date and time corrections replace the preview and make the old proposal unusable', async t => {
  const f = await fixture(t);
  const original = await f.chat('Ask Dad to buy milk tomorrow at 6 pm');
  const corrected = await f.chat('make it day after tomorrow at 9 am');
  assert.notEqual(corrected.proposal.id, original.proposal.id);
  assert.equal(corrected.proposal.items[0].dueDate, '2026-10-11');
  assert.equal(corrected.proposal.items[0].dueTime, '09:00');
  assert.throws(() => f.store.getProposal(original.proposal.id), /cancelled/);
  const timeOnly = await f.chat('at 10 am instead');
  assert.equal(timeOnly.proposal.items[0].dueDate, '2026-10-11');
  assert.equal(timeOnly.proposal.items[0].dueTime, '10:00');
  assert.throws(() => f.store.getProposal(corrected.proposal.id), /cancelled/);
  assert.equal(f.reload().board().tasks.length, 4);
  const saved = await f.chat('confirm');
  assert.equal(saved.board.tasks.at(-1).dueDate, '2026-10-11');
  assert.equal(saved.board.tasks.at(-1).dueTime, '10:00');
});

test('an ambiguous correction clears the old preview until its replacement is reviewed', async t => {
  const f = await fixture(t);
  const before = f.store.board();
  const original = await f.chat('Ask Dad to buy milk tomorrow at 6 pm');
  const ambiguous = await f.chat('at 8 am or 9 am instead');
  assert.equal(ambiguous.proposal, undefined);
  assert.match(ambiguous.reply, /choose one time/i);
  assert.throws(() => f.store.getProposal(original.proposal.id), /cancelled/);
  assert.match((await f.chat('confirm')).reply, /finish the draft/i);
  assert.deepEqual(f.store.board(), before);
  const corrected = await f.chat('at 9 am');
  assert.equal(corrected.proposal.items[0].dueTime, '09:00');
  assert.notEqual(corrected.proposal.id, original.proposal.id);
});

test('a brief preserves a preview but a new incomplete task cancels it before accepting details', async t => {
  const f = await fixture(t);
  const before = f.store.board();
  const original = await f.chat('Ask Dad to bring the school form tomorrow at 8 am');
  const brief = await f.chat('What needs attention tomorrow?');
  assert.equal(brief.proposal.id, original.proposal.id);
  assert.ok(!brief.trace.some(entry => entry.tool === 'cancel_proposal'));
  const replacement = await f.chat('Ask Mum to buy milk');
  assert.equal(replacement.proposal, undefined);
  assert.throws(() => f.store.getProposal(original.proposal.id), /cancelled/);
  await f.chat('confirm');
  assert.deepEqual(f.store.board(), before);
  await f.chat('tomorrow at 6 pm');
  const saved = await f.chat('confirm');
  assert.equal(saved.board.tasks.at(-1).title, 'Buy milk');
  assert.equal(saved.board.tasks.at(-1).assigneeId, 'maya');
  assert.equal(saved.board.tasks.length, 5);
});

test('time parsing preserves quantities and relative date parsing does not shorten day after tomorrow', async t => {
  const f = await fixture(t);
  const preview = await f.chat('Ask Dad to buy 2 or 3 cartons of milk day after tomorrow at 6 pm');
  assert.equal(preview.proposal.items[0].title, 'Buy 2 or 3 cartons of milk');
  assert.equal(preview.proposal.items[0].dueDate, '2026-10-11');
  assert.equal(preview.proposal.items[0].dueTime, '18:00');
  const read = await f.chat('What needs attention day after tomorrow?');
  assert.equal(read.trace.find(entry => entry.tool === 'get_household_brief').arguments.dueDate, '2026-10-11');
  assert.equal(read.proposal.id, preview.proposal.id);
  const quantities = await f.chat('Ask Dad to buy 2 bottles of milk and 3 apples tomorrow at 6 pm');
  assert.equal(quantities.proposal.items[0].title, 'Buy 2 bottles of milk and 3 apples');
  assert.equal(quantities.proposal.items[0].dueTime, '18:00');
  const forDate = await f.chat('Ask Dad to buy milk for tomorrow at 6 pm');
  assert.equal(forDate.proposal.items[0].title, 'Buy milk');
  const byDate = await f.chat('Ask Dad to buy milk by 2026-10-12 at 6 pm');
  assert.equal(byDate.proposal.items[0].title, 'Buy milk');
  assert.equal(byDate.proposal.items[0].dueDate, '2026-10-12');
});

test('multiple household members in an unavailability message require clarification without a rebalance', async t => {
  const f = await fixture(t);
  const before = f.store.board();
  const answer = await f.chat('Dad cannot do his tasks tomorrow but Mum is unavailable too');
  assert.equal(answer.proposal, undefined);
  assert.match(answer.reply, /more than one household member/i);
  assert.ok(!answer.trace.some(entry => entry.tool === 'preview_rebalance'));
  await f.chat('confirm');
  assert.deepEqual(f.store.board(), before);
  assert.deepEqual(f.reload().board(), before);
});

test('only explicit confirmation persists and a question about unavailability never rebalances', async t => {
  for (const phrase of ['do not confirm', 'should I confirm?', 'confirm?', 'confirm the other one', 'yes, but change the time']) assert.equal(isConfirmationIntent(phrase), false, phrase);
  for (const phrase of ['confirm', 'yes', 'please confirm', 'go ahead!', 'save it please']) assert.equal(isConfirmationIntent(phrase), true, phrase);
  assert.equal(confirmationIntent('cancel'), 'cancel');
  const f = await fixture(t);
  const before = f.store.board();
  const preview = await f.chat('Ask Dad to buy milk tomorrow at 6 pm');
  for (const phrase of ['should I confirm?', 'Is Dad unavailable tomorrow?']) {
    const answer = await f.chat(phrase);
    assert.equal(answer.proposal.id, preview.proposal.id);
    assert.ok(!answer.trace.some(entry => ['confirm_proposal', 'preview_rebalance'].includes(entry.tool)));
    assert.deepEqual(f.store.board(), before);
  }
  await assert.rejects(() => f.assistant.decide(f.client, f.assistant.conversation(preview.conversationId), 'save', preview.proposal.id), /explicit confirm or cancel/i);
  assert.deepEqual(f.store.board(), before);
  const cancelled = await f.chat('cancel');
  assert.equal(cancelled.proposal, undefined);
  assert.deepEqual(f.reload().board(), before);
});
