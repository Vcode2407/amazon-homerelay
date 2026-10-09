import { addDays } from './store.js';

export function normalizeMessage(message) {
  return String(message).trim().replace(/[.!?]+$/, '').trim();
}

// Exact user intent is shared with provider adapters. A question, negation, or
// request containing the word "confirm" is not permission to persist a proposal.
export function confirmationIntent(message) {
  if (/\?\s*$/.test(String(message))) return null;
  const text = normalizeMessage(message);
  if (/^(?:please\s+)?(?:yes|confirm|go ahead|save it|do it)(?:,?\s+please)?$/i.test(text)) return 'confirm';
  if (/^(?:please\s+)?(?:cancel|no|discard|never mind)(?:,?\s+please)?$/i.test(text)) return 'cancel';
  return null;
}

export const isConfirmationIntent = message => confirmationIntent(message) === 'confirm';
export const isCancellationIntent = message => confirmationIntent(message) === 'cancel';

function escaped(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
const missing = () => ({ status: 'missing', spans: [] });
const issue = (status, message, spans) => ({ status, message, spans });

export function parseOwner(text, members) {
  const found = members.map(member => {
    const aliases = [...new Set([member.name, ...(member.aliases || [])])].sort((a, b) => b.length - a.length);
    const matches = [...text.matchAll(new RegExp(`\\b(?:${aliases.map(escaped).join('|')})\\b`, 'gi'))];
    return { member, spans: matches.map(match => ({ start: match.index, end: match.index + match[0].length })) };
  }).filter(item => item.spans.length);
  const spans = found.flatMap(item => item.spans);
  if (!found.length) return missing();
  if (found.length > 1) return issue('ambiguous', 'Choose one owner for this handoff: Alex (Dad), Maya (Mum), or Sam.', spans);
  return { status: 'valid', value: found[0].member.id, member: found[0].member, spans };
}

export function parseDate(text, today) {
  // Longest relative phrase comes first so "day after tomorrow" is one date.
  const matches = [...text.matchAll(/\bday after tomorrow\b|\btomorrow\b|\btoday\b|\b\d{4}-\d{1,2}-\d{1,2}\b/gi)];
  const spans = matches.map(match => ({ start: match.index, end: match.index + match[0].length }));
  if (!matches.length) return missing();
  if (matches.length > 1) return issue('ambiguous', 'Choose one date: today, tomorrow, day after tomorrow, or one YYYY-MM-DD date.', spans);
  const token = matches[0][0].toLowerCase();
  const relative = { today: 0, tomorrow: 1, 'day after tomorrow': 2 };
  if (Object.hasOwn(relative, token)) return { status: 'valid', value: addDays(today, relative[token]), spans };
  const date = new Date(`${token}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(token) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== token) {
    return issue('invalid', 'Use a real calendar date in YYYY-MM-DD format, such as 2026-10-15.', spans);
  }
  return { status: 'valid', value: token, spans };
}

export function parseTime(text) {
  // Times need "at", a meridiem, or HH:MM. Quantities in task titles are not times.
  const expression = /\bat\s+(\d{1,2})(?::(\d+))?\s*(am|pm)?\b|\b(\d{1,2})(?::(\d+))?\s*(am|pm)\b|\b(\d{1,2}):(\d+)\b|\b(?:or|and)\s+(\d{1,2})(?::(\d+))?\s*(am|pm)?\b/gi;
  const rawMatches = [...text.matchAll(expression)];
  const matches = [];
  for (const match of rawMatches) {
    if (match[9] === undefined) { matches.push(match); continue; }
    // "Buy 2 or 3 cartons" is a quantity, whereas "at 8 or 9" is
    // an ambiguous schedule. A bare alternative must be directly adjacent to
    // an already recognized clock, rather than any earlier number in a task.
    const previous = matches.at(-1);
    const adjacent = previous && /^[\s,]*$/.test(text.slice(previous.index + previous[0].length, match.index));
    const endsSchedule = /^(?:\s*$|\s*(?:[,.!?]|(?:today|tomorrow|day after tomorrow|on|instead|or|and)\b|\d{4}-))/i.test(text.slice(match.index + match[0].length));
    if (adjacent && endsSchedule) matches.push(match);
  }
  const spans = matches.map(match => ({ start: match.index, end: match.index + match[0].length }));
  if (!matches.length) return missing();
  if (matches.length > 1) return issue('ambiguous', 'Choose one time, such as 8 am, 6:30 pm, or 18:30.', spans);
  const match = matches[0];
  const hourText = match[1] ?? match[4] ?? match[7] ?? match[9];
  const minuteText = match[2] ?? match[5] ?? match[8] ?? match[10];
  const meridiem = (match[3] ?? match[6] ?? match[11])?.toLowerCase();
  let hour = Number(hourText);
  const minute = Number(minuteText || 0);
  if ((minuteText !== undefined && minuteText.length !== 2) || minute > 59 || (meridiem ? hour < 1 || hour > 12 : hour > 23)) {
    return issue('invalid', 'Use a valid time, such as 8 am, 6:30 pm, or 18:30. Minutes need two digits.', spans);
  }
  if (!meridiem && hour >= 1 && hour <= 12 && (minuteText === undefined || hourText.length < 2)) {
    return issue('ambiguous', `Do you mean ${hour}${minuteText ? `:${minuteText}` : ''} am or pm? You can also use a 24-hour time such as 18:30.`, spans);
  }
  if (meridiem) hour = hour % 12 + (meridiem === 'pm' ? 12 : 0);
  return { status: 'valid', value: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`, spans };
}

export function removeSpans(text, spans) {
  let result = text;
  for (const span of [...spans].sort((a, b) => b.start - a.start)) result = result.slice(0, span.start) + ' ' + result.slice(span.end);
  return result.replace(/\s+/g, ' ').trim();
}

export function parseDetails(text, board) {
  return { owner: parseOwner(text, board.members), date: parseDate(text, board.today), time: parseTime(text) };
}

export function isDetailReply(text, details) {
  const spans = Object.values(details).flatMap(field => field.spans);
  if (!spans.length) return false;
  const remainder = removeSpans(text, spans)
    .replace(/^(?:make|change|set|move|reschedule)\s+(?:it|that|this)(?:\s+to)?\b/i, '')
    .replace(/^(?:give|assign|switch)\s+(?:it|that|this)\s+to\b/i, '')
    .replace(/\b(?:at|on|for|instead|please|then|and|or|to|the|owner|date|time|is)\b/gi, '')
    .replace(/[\s,;.!?]+/g, '');
  return remainder.length === 0;
}

export function handoffTitle(text, date, time) {
  return removeSpans(text, [...date.spans, ...time.spans])
    .replace(/\b(?:urgent|high priority)\b/gi, '')
    .replace(/\s+(?:(?:on|for|by|and|or)\s*)+$/i, '')
    .replace(/\s+/g, ' ').trim();
}
