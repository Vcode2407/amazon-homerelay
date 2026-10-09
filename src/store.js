import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export class DomainError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export function dateInZone(date, timeZone = 'Asia/Kolkata') {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
}

export function addDays(day, amount) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function validateSchedule(dueDate, dueTime) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(Date.parse(`${dueDate}T00:00:00Z`)) || new Date(`${dueDate}T00:00:00Z`).toISOString().slice(0, 10) !== dueDate) {
    throw new DomainError('Use a real calendar date in YYYY-MM-DD format.');
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime)) throw new DomainError('Use a valid time in HH:MM format.');
}

export class HouseholdStore {
  constructor(dataFile, clock = () => new Date()) {
    this.dataFile = dataFile;
    this.clock = clock;
    this.proposals = new Map();
    if (existsSync(dataFile)) {
      this.state = JSON.parse(readFileSync(dataFile, 'utf8'));
      if (this.state.version !== 1 || !Array.isArray(this.state.tasks) || !Array.isArray(this.state.members)) throw new Error('Unsupported household data file. Preserve it and restore a valid version.');
    } else {
      const today = dateInZone(clock());
      const tomorrow = addDays(today, 1);
      const createdAt = clock().toISOString();
      this.state = {
        version: 1, revision: 0, timeZone: 'Asia/Kolkata',
        members: [
          { id: 'alex', name: 'Alex', role: 'Dad', aliases: ['dad', 'father', 'alex'], color: '#cfe4f8', canTravel: true },
          { id: 'maya', name: 'Maya', role: 'Mum', aliases: ['mum', 'mom', 'mother', 'maya'], color: '#e6dcf5', canTravel: true },
          { id: 'sam', name: 'Sam', role: 'Teen', aliases: ['sam'], color: '#f8e0ba', canTravel: false }
        ],
        tasks: [
          { id: 'seed-print-form', title: 'Print the school form', assigneeId: 'maya', dueDate: tomorrow, dueTime: '07:00', priority: 'high', status: 'open', dependsOn: [], createdAt },
          { id: 'seed-pack-bag', title: 'Pack the school bag', assigneeId: 'sam', dueDate: tomorrow, dueTime: '07:30', priority: 'normal', status: 'open', dependsOn: [], createdAt },
          { id: 'seed-groceries', title: 'Collect the groceries', assigneeId: 'alex', dueDate: tomorrow, dueTime: '18:30', priority: 'normal', status: 'open', dependsOn: [], createdAt },
          { id: 'seed-library', title: 'Return the library books', assigneeId: 'alex', dueDate: today, dueTime: '17:00', priority: 'normal', status: 'open', dependsOn: [], createdAt }
        ]
      };
      this.save();
    }
  }

  save(state = this.state) {
    mkdirSync(dirname(this.dataFile), { recursive: true });
    const temporaryFile = `${this.dataFile}.tmp`;
    writeFileSync(temporaryFile, JSON.stringify(state, null, 2) + '\n', 'utf8');
    renameSync(temporaryFile, this.dataFile);
  }

  board() { return structuredClone({ ...this.state, today: dateInZone(this.clock(), this.state.timeZone) }); }

  member(id) {
    const member = this.state.members.find(item => item.id === id);
    if (!member) throw new DomainError('Choose a member of this household.');
    return member;
  }

  blockedBy(task) {
    return task.dependsOn.map(id => this.state.tasks.find(item => item.id === id)).filter(item => item && item.status !== 'done');
  }

  brief(dueDate) {
    validateSchedule(dueDate, '00:00');
    const tasks = this.state.tasks.filter(task => task.dueDate === dueDate && task.status === 'open')
      .sort((a, b) => a.dueTime.localeCompare(b.dueTime))
      .map(task => ({ ...task, assigneeName: this.member(task.assigneeId).name, blockedBy: this.blockedBy(task).map(item => ({ id: item.id, title: item.title })) }));
    return { dueDate, tasks, openCount: tasks.length, blockedCount: tasks.filter(task => task.blockedBy.length).length };
  }

  proposal(kind, items, summary, warnings = []) {
    for (const [id, proposal] of this.proposals) if (proposal.expiresAt <= this.clock().getTime()) this.proposals.delete(id);
    const proposal = { id: randomUUID(), kind, items, summary, warnings, revision: this.state.revision, expiresAt: this.clock().getTime() + 10 * 60 * 1000 };
    this.proposals.set(proposal.id, proposal);
    return structuredClone(proposal);
  }

  previewHandoff({ title, assigneeId, dueDate, dueTime, priority = 'normal', dependsOn = [] }) {
    const member = this.member(assigneeId);
    title = title.trim();
    if (title.length < 3 || title.length > 160) throw new DomainError('Give the handoff a title between 3 and 160 characters.');
    validateSchedule(dueDate, dueTime);
    if (dueDate < this.board().today) throw new DomainError('Choose today or a future date for a new handoff.');
    if (!['high', 'normal'].includes(priority)) throw new DomainError('Choose high or normal priority.');
    const dependencies = [...new Set(dependsOn)];
    for (const id of dependencies) {
      const task = this.state.tasks.find(item => item.id === id);
      if (!task) throw new DomainError('A prerequisite handoff no longer exists. Refresh the board.');
      if (`${task.dueDate}T${task.dueTime}` > `${dueDate}T${dueTime}`) throw new DomainError(`Schedule this after its prerequisite: ${task.title}.`);
    }
    const duplicate = this.state.tasks.some(task => task.status === 'open' && task.title.toLowerCase() === title.toLowerCase() && task.assigneeId === assigneeId && task.dueDate === dueDate);
    if (duplicate) throw new DomainError('That handoff is already on the board for this person and date.');
    const warnings = dependencies.map(id => this.state.tasks.find(item => item.id === id)).filter(task => task.status !== 'done').map(task => `Waiting for ${task.title} before this can be completed.`);
    return this.proposal('handoff', [{ title, assigneeId, dueDate, dueTime, priority, dependsOn: dependencies }], `${member.name} will ${title.charAt(0).toLowerCase() + title.slice(1)} on ${dueDate} at ${dueTime}.`, warnings);
  }

  previewRebalance({ assigneeId, dueDate }) {
    const source = this.member(assigneeId);
    validateSchedule(dueDate, '00:00');
    const tasks = this.state.tasks.filter(task => task.assigneeId === assigneeId && task.dueDate === dueDate && task.status === 'open');
    if (!tasks.length) throw new DomainError(`${source.name} has no unfinished handoffs on ${dueDate}.`);
    const workload = new Map(this.state.members.map(member => [member.id, this.state.tasks.filter(task => task.assigneeId === member.id && task.dueDate === dueDate && task.status === 'open').length]));
    const items = tasks.map(task => {
      const needsTravel = /\b(bring|take|collect|deliver|return|pick up|drop)\b/i.test(task.title);
      const candidates = this.state.members.filter(member => member.id !== assigneeId && (!needsTravel || member.canTravel))
        .sort((a, b) => workload.get(a.id) - workload.get(b.id) || a.name.localeCompare(b.name));
      if (!candidates.length) throw new DomainError(`No eligible replacement for ${task.title}.`);
      const replacement = candidates[0];
      const reason = needsTravel ? `${replacement.name} can handle travel and has ${workload.get(replacement.id)} existing handoff(s) that day.` : `${replacement.name} has the lightest eligible workload: ${workload.get(replacement.id)} handoff(s) that day.`;
      workload.set(replacement.id, workload.get(replacement.id) + 1);
      return { ...task, fromAssigneeId: assigneeId, assigneeId: replacement.id, reason };
    });
    const warnings = this.state.members.filter(member => member.id !== assigneeId && workload.get(member.id) > 3).map(member => `${member.name} would have ${workload.get(member.id)} handoffs that day. Check that this is manageable.`);
    return this.proposal('rebalance', items, `Move ${items.length} unfinished handoff(s) from ${source.name} on ${dueDate}. Review the new owners before confirming.`, warnings);
  }

  getProposal(id) {
    const proposal = this.proposals.get(id);
    if (!proposal) throw new DomainError('This proposal was already used or cancelled. Ask for a new preview.');
    if (proposal.expiresAt <= this.clock().getTime()) { this.proposals.delete(id); throw new DomainError('This preview expired. Ask for a new one.', 409); }
    return proposal;
  }

  confirm(id) {
    const proposal = this.getProposal(id);
    if (proposal.revision !== this.state.revision) throw new DomainError('The board changed since this preview. Ask again to review a fresh plan.', 409);
    const nextState = structuredClone(this.state);
    const saved = proposal.items.map(item => {
      if (proposal.kind === 'handoff') {
        const task = { ...item, id: randomUUID(), status: 'open', createdAt: this.clock().toISOString() };
        nextState.tasks.push(task);
        return task;
      }
      const task = nextState.tasks.find(task => task.id === item.id);
      task.assigneeId = item.assigneeId;
      return task;
    });
    nextState.revision++;
    this.save(nextState);
    this.state = nextState;
    this.proposals.delete(id);
    return { saved: structuredClone(saved), kind: proposal.kind, board: this.board() };
  }

  cancel(id) {
    this.getProposal(id);
    this.proposals.delete(id);
    return { cancelled: true, board: this.board() };
  }

  complete(id) {
    const task = this.state.tasks.find(task => task.id === id);
    if (!task) throw new DomainError('That handoff no longer exists.');
    const blockers = this.blockedBy(task);
    if (blockers.length) throw new DomainError(`Complete the prerequisite first: ${blockers.map(item => item.title).join(', ')}.`);
    if (task.status !== 'done') {
      const nextState = structuredClone(this.state);
      const completed = nextState.tasks.find(item => item.id === id);
      completed.status = 'done';
      completed.completedAt = this.clock().toISOString();
      nextState.revision++;
      this.save(nextState);
      this.state = nextState;
    }
    return { task: structuredClone(this.state.tasks.find(item => item.id === id)), board: this.board() };
  }
}
