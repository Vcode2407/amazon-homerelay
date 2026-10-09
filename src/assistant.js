import { randomUUID } from 'node:crypto';
import { DomainError } from './store.js';
import { confirmationIntent, handoffTitle, isDetailReply, normalizeMessage, parseDate, parseDetails, parseOwner, parseTime, removeSpans } from './language.js';

export { confirmationIntent, isConfirmationIntent, isCancellationIntent } from './language.js';

// Intentionally a bounded, deterministic demo router. Replace this layer with a
// model's tool-calling loop when a provider is configured; keep MCP tools intact.
export class OfflineAssistant {
  constructor() { this.conversations = new Map(); }

  conversation(id) {
    const now = Date.now();
    for (const [key, value] of this.conversations) if (now - value.updatedAt > 60 * 60 * 1000) this.conversations.delete(key);
    if (id && !this.conversations.has(id)) throw new DomainError('This conversation expired. Reload to start a new one.');
    const conversation = id ? this.conversations.get(id) : { id: randomUUID(), pending: null, draft: null, updatedAt: now };
    conversation.updatedAt = now;
    this.conversations.set(conversation.id, conversation);
    return conversation;
  }

  async run(client, context, action) {
    const trace = [];
    const call = async (tool, args = {}) => {
      const response = await client.callTool({ name: tool, arguments: args });
      const result = response.structuredContent || JSON.parse(response.content.find(item => item.type === 'text').text);
      trace.push({ tool, arguments: args, result });
      if (response.isError) throw new DomainError(result.error || 'The tool could not finish this action.', result.status || 400);
      return result;
    };
    const board = await call('get_household_board');
    const result = await action({ call, board, trace });
    return { conversationId: context.id, trace, board: result.board || board, ...result, ...(context.pending ? { proposal: context.pending } : {}), ...(context.draft ? { draft: structuredClone(context.draft) } : {}) };
  }

  async replacePreview(call, context, name, args) {
    const proposal = await call(name, args);
    if (context.pending) {
      // An old/expired preview should not prevent a fresh one from being shown.
      try { await call('cancel_proposal', { proposalId: context.pending.id }); } catch { /* already expired */ }
    }
    context.pending = proposal;
    context.draft = null;
    return proposal;
  }

  async decide(client, context, operation, proposalId) {
    if (!['confirm', 'cancel'].includes(operation)) throw new DomainError('Use an explicit confirm or cancel action for a reviewed proposal.');
    if (!context.pending || context.pending.id !== proposalId) throw new DomainError('Review the current preview before confirming or cancelling it.');
    return this.run(client, context, async ({ call }) => {
      try {
        const result = await call(operation === 'confirm' ? 'confirm_proposal' : 'cancel_proposal', { proposalId });
        context.pending = null;
        context.draft = null;
        return { board: result.board, reply: operation === 'confirm' ? `Saved. ${result.kind === 'rebalance' ? 'The handoffs now have their new owners.' : 'The handoff is now on your household board.'}` : 'Preview cancelled. Your board has not changed.' };
      } catch (error) {
        if (error.status === 409) context.pending = null;
        throw error;
      }
    });
  }

  async discardPreview(call, context) {
    if (context.pending) {
      try { await call('cancel_proposal', { proposalId: context.pending.id }); }
      catch (error) { if (!(error instanceof DomainError)) throw error; }
      context.pending = null;
    }
  }

  updateDraft(draft, details, replaceMissing = false) {
    draft.problems ||= {};
    for (const [field, key] of [['owner', 'assigneeId'], ['date', 'dueDate'], ['time', 'dueTime']]) {
      const parsed = details[field];
      if (parsed.status === 'missing' && !replaceMissing) continue;
      delete draft.problems[key];
      if (parsed.status === 'valid') draft[key] = parsed.value;
      else {
        delete draft[key];
        if (parsed.message) draft.problems[key] = parsed.message;
      }
    }
  }

  async prepareDraft(call, context, board) {
    const draft = context.draft;
    if (!draft || draft.title.length < 3 || draft.title.length > 160) return { reply: 'Tell me the task in a new request, such as “Ask Dad to buy milk”. Give it a title between 3 and 160 characters.' };
    const questions = Object.values(draft.problems || {});
    if (!draft.assigneeId && !draft.problems?.assigneeId) questions.push('Who should own it: Alex (Dad), Maya (Mum), or Sam?');
    if (!draft.dueDate && !draft.problems?.dueDate) questions.push('Which date: today, tomorrow, day after tomorrow, or YYYY-MM-DD?');
    if (!draft.dueTime && !draft.problems?.dueTime) questions.push('At what time? Say 8 am, 6:30 pm, or a 24-hour time such as 18:30.');
    if (questions.length) return { reply: `I have “${draft.title}” as an unsaved draft. ${questions.join(' ')} You can give the missing details in your next message.` };
    const prerequisite = /\bschool form\b/i.test(draft.title) && /\b(bring|take|deliver)\b/i.test(draft.title)
      ? board.tasks.find(task => /\bprint\b.*\bschool form\b/i.test(task.title) && task.dueDate === draft.dueDate) : null;
    try {
      const proposal = await this.replacePreview(call, context, 'preview_handoff', {
        title: draft.title, assigneeId: draft.assigneeId, dueDate: draft.dueDate, dueTime: draft.dueTime,
        priority: draft.priority || 'normal', dependsOn: prerequisite ? [prerequisite.id] : []
      });
      context.draft = null;
      return { reply: `${proposal.summary} Review the preview and confirm to save.${prerequisite ? ` This depends on “${prerequisite.title}”.` : ''}` };
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      return { reply: `${error.message} Nothing has been saved. Change the draft's details or cancel it.` };
    }
  }

  async chat(client, message, conversationId) {
    const context = this.conversation(conversationId);
    const trimmed = normalizeMessage(message);
    const decision = confirmationIntent(message);
    if (decision === 'confirm') {
      if (!context.pending) return this.run(client, context, async () => ({ reply: context.draft ? 'Finish the draft details first. I will show a preview for you to review before confirming.' : 'There is no pending preview. Ask me to prepare a handoff first.' }));
      return this.decide(client, context, 'confirm', context.pending.id);
    }
    if (decision === 'cancel') {
      if (!context.pending) return this.run(client, context, async () => {
        const hadDraft = Boolean(context.draft);
        context.draft = null;
        return { reply: hadDraft ? 'Draft cancelled. Your board has not changed.' : 'There is no pending preview to cancel.' };
      });
      return this.decide(client, context, 'cancel', context.pending.id);
    }
    return this.run(client, context, async ({ call, board }) => {
      // A new handoff replaces an older preview immediately, even when its
      // details are incomplete. "Confirm" must never save that older task.
      const request = trimmed.match(/^(?:ask|remind|tell)\s+(.+?)\s+to\s+(.+)$/i);
      if (request) {
        await this.discardPreview(call, context);
        const date = parseDate(request[2], board.today);
        const time = parseTime(request[2]);
        const title = handoffTitle(request[2], date, time);
        context.draft = { title: title.charAt(0).toUpperCase() + title.slice(1), priority: /\b(?:urgent|high priority)\b/i.test(request[2]) ? 'high' : 'normal', problems: {} };
        this.updateDraft(context.draft, { owner: parseOwner(request[1], board.members), date, time }, true);
        return this.prepareDraft(call, context, board);
      }

      const details = parseDetails(trimmed, board);
      const replacement = trimmed.match(/^(?:give|assign|switch|move)\s+(?:it|that|this)\s+to\s+(.+?)(?:\s+instead)?$/i);
      if (replacement && details.date.status === 'missing' && details.time.status === 'missing') {
        if (!context.draft && context.pending?.kind !== 'handoff') return { reply: 'First ask me to prepare a handoff. Then you can change its owner before confirming.' };
        if (!context.draft) context.draft = { ...context.pending.items[0], problems: {} };
        await this.discardPreview(call, context);
        this.updateDraft(context.draft, { owner: parseOwner(replacement[1], board.members), date: { status: 'missing' }, time: { status: 'missing' } });
        // An unknown new owner must also clear the old one rather than leaving
        // a confirmable preview for someone the user just tried to replace.
        if (parseOwner(replacement[1], board.members).status === 'missing') delete context.draft.assigneeId;
        return this.prepareDraft(call, context, board);
      }

      const unavailable = trimmed.match(/^(.+?)\s+(?:cannot|can't|can not|(?:is\s+)?unavailable|(?:is\s+)?running late)\b/i);
      if (unavailable) {
        const owner = parseOwner(unavailable[1], board.members);
        const personRemainder = removeSpans(unavailable[1], owner.spans).replace(/\b(?:and|or|both|the|my|our)\b/gi, '').trim();
        if (!personRemainder) {
          await this.discardPreview(call, context);
          context.draft = null;
          if (details.owner.status === 'ambiguous') return { reply: 'More than one household member was mentioned. Tell me one unavailable person and their date so I do not guess who can take over.' };
          if (owner.status !== 'valid' || details.date.status !== 'valid') return { reply: owner.message || details.date.message || 'Tell me who is unavailable and which date: “Dad cannot do his handoffs tomorrow”.' };
          try {
            const proposal = await this.replacePreview(call, context, 'preview_rebalance', { assigneeId: owner.value, dueDate: details.date.value });
            return { reply: `${proposal.summary} Nothing has changed yet.` };
          } catch (error) {
            if (!(error instanceof DomainError)) throw error;
            return { reply: `${error.message} Nothing has changed.` };
          }
        }
      }

      // Read requests are handled before draft details, preserving the preview
      // while someone checks the rest of the household's schedule.
      if (/^(?:what|who|show|list|brief|give me|how many)\b/i.test(trimmed)) {
        if (!['valid', 'missing'].includes(details.date.status)) return { reply: details.date.message };
        const brief = await call('get_household_brief', { dueDate: details.date.value || board.today });
        const description = brief.tasks.map(task => `${task.dueTime} — ${task.assigneeName}: ${task.title}${task.blockedBy.length ? ` (waiting for ${task.blockedBy.map(item => item.title).join(', ')})` : ''}`).join('\n');
        return { reply: brief.openCount ? `${brief.openCount} unfinished handoff(s) on ${brief.dueDate}.${brief.blockedCount ? ` ${brief.blockedCount} waiting on prerequisites.` : ''}\n\n${description}` : `All clear: no unfinished handoffs on ${brief.dueDate}.` };
      }

      if (isDetailReply(trimmed, details)) {
        if (!context.draft && context.pending?.kind !== 'handoff') return { reply: 'First tell me the handoff, such as “Ask Dad to buy milk”. Then give its date, time, or owner.' };
        if (!context.draft) context.draft = { ...context.pending.items[0], problems: {} };
        await this.discardPreview(call, context);
        this.updateDraft(context.draft, details);
        return this.prepareDraft(call, context, board);
      }
      return { reply: 'This offline assistant supports handoffs, daily briefs, and reassignment. Try “Ask Dad to buy milk”, then “tomorrow at 6 pm”; “What needs attention tomorrow?”; or “Dad cannot do his handoffs tomorrow”.' };
    });
  }
}
