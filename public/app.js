"use strict";

const ui = {
  roster: document.querySelector("#family-roster"),
  list: document.querySelector("#task-list"),
  boardError: document.querySelector("#board-error"),
  count: document.querySelector("#board-count"),
  conversation: document.querySelector("#conversation"),
  form: document.querySelector("#chat-form"),
  input: document.querySelector("#message-input"),
  send: document.querySelector("#send-button"),
  status: document.querySelector("#reply-status"),
  providerStatus: document.querySelector("#provider-status"),
  providerExplainer: document.querySelector("#provider-explainer"),
  providerBadge: document.querySelector("#environment-badge"),
  providerRetry: document.querySelector("#provider-retry"),
  newHandoff: document.querySelector("#new-handoff"),
  handoffDialog: document.querySelector("#handoff-dialog"),
  handoffForm: document.querySelector("#handoff-form"),
  handoffFields: document.querySelector("#handoff-fields"),
  handoffTitle: document.querySelector("#handoff-title"),
  handoffOwner: document.querySelector("#handoff-owner"),
  handoffDate: document.querySelector("#handoff-date"),
  handoffTime: document.querySelector("#handoff-time"),
  handoffPriority: document.querySelector("#handoff-priority"),
  handoffPrerequisite: document.querySelector("#handoff-prerequisite"),
  handoffSubmit: document.querySelector("#handoff-submit"),
  handoffClose: document.querySelector("#handoff-close"),
  handoffCancel: document.querySelector("#handoff-cancel"),
  handoffError: document.querySelector("#handoff-error"),
  handoffStatus: document.querySelector("#handoff-form-status"),
};
let board = null;
let filter = "all";
let conversationId;
let busy = false;
const proposals = new Map();
let boardLoadGeneration = 0;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}

function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  const paths = {
    check: "m6 12 4 4 8-8",
    clock: "M12 6v6l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
    lock: "M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5V10Z",
  };
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", paths[name]);
  svg.append(path);
  return svg;
}

function tomorrowDate() {
  if (!board?.today) return "";
  const date = new Date(board.today + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function dateLabel(value) {
  if (!value) return "No date set";
  if (value === board?.today) return "Today";
  if (value === tomorrowDate()) return "Tomorrow";
  const date = new Date(value + "T12:00:00Z");
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { month: "short", day: "numeric", timeZone: "UTC" });
}

function timeLabel(value) {
  if (!value) return "";
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return value;
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? "AM" : "PM"}`;
}

function person(id) {
  return board?.members?.find(member => member.id === id) || { id, name: "Unassigned", role: "", aliases: [] };
}

function avatar(member, small = false) {
  const index = board?.members?.findIndex(item => item.id === member.id) ?? 0;
  const colors = ["", "peach", "lavender"];
  return el("span", `avatar ${small ? "small " : ""}${colors[Math.max(index, 0) % colors.length]}`, (member.name || "?").slice(0, 1).toUpperCase());
}

function blockedBy(task) {
  return (task.dependsOn || []).map(id => board.tasks.find(item => item.id === id)).filter(item => item && item.status !== "done");
}

function updateBoard(nextBoard) {
  if (!nextBoard || !Array.isArray(nextBoard.tasks) || !Array.isArray(nextBoard.members)) return;
  board = nextBoard;
  ui.boardError.hidden = true;
  ui.list.setAttribute("aria-busy", "false");
  const date = new Date(board.today + "T12:00:00Z");
  document.querySelector("#today-date").textContent = Number.isNaN(date.getTime()) ? "YOUR DAY, A LITTLE LIGHTER" : date.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const zone = board.timeZone || "Asia/Kolkata";
  document.querySelector("#household-zone").textContent = `Household time · ${zone}${zone === "Asia/Kolkata" ? " (IST)" : ""}`;
  document.querySelector("#handoff-time-zone").textContent = `All dates and times use ${zone === "Asia/Kolkata" ? "India Standard Time (IST), Asia/Kolkata" : zone}.`;
  const open = board.tasks.filter(task => task.status !== "done");
  document.querySelector("#stat-open").textContent = open.length;
  document.querySelector("#stat-tomorrow").textContent = open.filter(task => task.dueDate === tomorrowDate()).length;
  document.querySelector("#stat-blocked").textContent = open.filter(task => blockedBy(task).length > 0).length;
  ui.roster.replaceChildren();
  for (const member of board.members) {
    const row = el("div", "roster-member");
    const detail = el("div");
    detail.append(el("div", "member-name", member.name), el("div", "member-role", member.role || (member.aliases || []).join(" · ")));
    row.append(avatar(member), detail);
    row.title = [member.name, member.role].filter(Boolean).join(" · ");
    ui.roster.append(row);
  }
  updateHandoffOptions();
  syncControls();
  renderTasks();
}

function updateHandoffOptions() {
  if (!board) return;
  const owner = ui.handoffOwner.value;
  const prerequisite = ui.handoffPrerequisite.value;
  ui.handoffOwner.replaceChildren();
  for (const member of board.members) {
    const option = el("option", "", `${member.name}${member.role ? ` (${member.role})` : ""}`);
    option.value = member.id;
    ui.handoffOwner.append(option);
  }
  if (board.members.some(member => member.id === owner)) ui.handoffOwner.value = owner;
  ui.handoffPrerequisite.replaceChildren(el("option", "", "No prerequisite"));
  ui.handoffPrerequisite.firstElementChild.value = "";
  for (const task of board.tasks.filter(item => item.status !== "done")) {
    const option = el("option", "", `${task.title} · ${dateLabel(task.dueDate)} ${timeLabel(task.dueTime)}`);
    option.value = task.id;
    ui.handoffPrerequisite.append(option);
  }
  if (board.tasks.some(task => task.id === prerequisite && task.status !== "done")) ui.handoffPrerequisite.value = prerequisite;
  ui.handoffDate.min = board.today;
  if (!ui.handoffDate.value || ui.handoffDate.value < board.today) ui.handoffDate.value = tomorrowDate();
}

function renderTasks() {
  if (!board) return;
  let tasks = board.tasks.filter(task => {
    if (filter === "completed") return task.status === "done";
    if (filter === "today") return task.status !== "done" && task.dueDate === board.today;
    if (filter === "tomorrow") return task.status !== "done" && task.dueDate === tomorrowDate();
    return true;
  });
  tasks.sort((a, b) => {
    if ((a.status === "done") !== (b.status === "done")) return a.status === "done" ? 1 : -1;
    const due = `${a.dueDate || "9999"} ${a.dueTime || "23:59"}`.localeCompare(`${b.dueDate || "9999"} ${b.dueTime || "23:59"}`);
    return due || ((a.priority === "high" ? 0 : 1) - (b.priority === "high" ? 0 : 1)) || (a.title || "").localeCompare(b.title || "");
  });
  ui.count.textContent = `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`;
  ui.list.replaceChildren();
  if (!tasks.length) {
    const state = el("div", "empty-state");
    state.append(el("div", "empty-state-icon", "✓"), el("strong", "", filter === "completed" ? "A fresh start." : "A little breathing room."), el("span", "", filter === "completed" ? "Completed tasks will appear here." : "No tasks in this view. Ask for a handoff to add one."));
    ui.list.append(state);
    return;
  }
  for (const task of tasks) {
    const done = task.status === "done";
    const dependencies = blockedBy(task);
    const card = el("article", `task-card ${task.priority === "high" ? "high " : ""}${done ? "done" : ""}`);
    const top = el("div", "task-top");
    top.append(el("h3", "task-title", task.title));
    if (done) {
      const check = el("span", "done-check", "✓");
      check.setAttribute("aria-label", "Completed");
      top.append(check);
    } else {
      const complete = el("button", "complete-button");
      complete.type = "button";
      complete.append(icon("check"));
      complete.disabled = busy || dependencies.length > 0;
      complete.setAttribute("aria-label", `Mark ${task.title} complete`);
      complete.title = dependencies.length ? "Complete the prerequisite task first" : "Mark complete";
      complete.addEventListener("click", () => completeTask(task.id));
      top.append(complete);
    }
    const due = el("div", `task-date ${!done && task.dueDate < board.today ? "overdue" : ""}`);
    due.append(icon("clock"), el("span", "", [dateLabel(task.dueDate), timeLabel(task.dueTime)].filter(Boolean).join(" · ")));
    const bottom = el("div", "task-bottom");
    const member = person(task.assigneeId);
    const who = el("div", "task-person");
    who.append(avatar(member, true), el("span", "", member.name));
    bottom.append(who);
    if (task.priority === "high" && !done) bottom.append(el("span", "priority-label", "HIGH PRIORITY"));
    card.append(top, due, bottom);
    if (dependencies.length && !done) {
      const note = el("div", "blocked-note");
      note.append(icon("lock"), el("span", "", `Waiting for: ${dependencies.map(item => item.title).join(", ")}`));
      card.append(note);
    }
    ui.list.append(card);
  }
}

function setBusy(value, status) {
  busy = value;
  syncControls();
  ui.status.textContent = status || (value ? "Working on your request…" : "Ready when you are.");
  for (const record of proposals.values()) {
    record.confirm.disabled = value || Boolean(record.state);
    record.cancel.disabled = value || Boolean(record.state);
  }
  renderTasks();
}

function syncControls() {
  const unavailable = busy || !board;
  ui.send.disabled = unavailable;
  ui.newHandoff.disabled = unavailable;
  ui.handoffSubmit.disabled = unavailable;
  ui.handoffFields.disabled = busy;
  ui.handoffClose.disabled = busy;
  ui.handoffCancel.disabled = busy;
  ui.input.disabled = !board;
  document.querySelectorAll("[data-prompt]").forEach(button => { button.disabled = unavailable; });
}

function scrollConversation() {
  requestAnimationFrame(() => { ui.conversation.scrollTop = ui.conversation.scrollHeight; });
}

function addMessage(role, text) {
  const node = el("div", `message ${role}-message`);
  node.append(el("span", "message-label", role === "user" ? "YOU" : "HOMERELAY"), el("p", "", text));
  ui.conversation.append(node);
  scrollConversation();
  return node;
}

function addTrace(parent, trace) {
  if (!Array.isArray(trace) || !trace.length) return;
  const details = el("details", "tool-activity");
  details.append(el("summary", "", `Tool activity · ${trace.length} ${trace.length === 1 ? "step" : "steps"}`));
  const list = el("ol");
  for (const step of trace) {
    const item = el("li");
    item.append(el("strong", "", step.tool || "Tool call"), el("span", "trace-label", "ARGUMENTS"), el("pre", "", JSON.stringify(step.arguments ?? {}, null, 2)), el("span", "trace-label", "RESULT"), el("pre", "", JSON.stringify(step.result ?? {}, null, 2)));
    list.append(item);
  }
  details.append(list);
  parent.append(details);
}

function addProposal(parent, proposal) {
  if (!proposal?.id || proposals.has(proposal.id)) return;
  const card = el("div", "proposal-card");
  card.append(el("div", "proposal-label", proposal.kind === "rebalance" ? "REVIEW THE NEW PLAN" : "REVIEW THIS HANDOFF"), el("p", "proposal-summary", proposal.summary));
  const items = el("ul", "proposal-items");
  for (const item of proposal.items || []) {
    const row = el("li", "proposal-item");
    const from = item.fromAssigneeId ? `${person(item.fromAssigneeId).name} → ` : "";
    row.append(el("strong", "", item.title), el("span", "", `${from}${person(item.assigneeId).name} · ${[dateLabel(item.dueDate), timeLabel(item.dueTime)].filter(Boolean).join(" · ")}`));
    if (item.reason) row.append(el("span", "proposal-reason", item.reason));
    items.append(row);
  }
  card.append(items);
  for (const warning of proposal.warnings || []) card.append(el("p", "proposal-warning", typeof warning === "string" ? warning : JSON.stringify(warning)));
  const actions = el("div", "proposal-actions");
  const confirm = el("button", "primary-button", "Confirm plan");
  const cancel = el("button", "secondary-button", "Cancel");
  confirm.type = cancel.type = "button";
  const stateLabel = el("div", "proposal-state", "Awaiting your confirmation. Your board has not changed.");
  const record = { confirm, cancel, stateLabel, state: null, conversationId };
  proposals.set(proposal.id, record);
  confirm.addEventListener("click", () => actOnProposal("confirm", proposal.id));
  cancel.addEventListener("click", () => actOnProposal("cancel", proposal.id));
  actions.append(confirm, cancel);
  card.append(actions, stateLabel);
  parent.append(card);
}

function handleResponse(result) {
  if (result.conversationId) conversationId = result.conversationId;
  updateBoard(result.board);
  if (result.conversationId) {
    for (const [id, record] of proposals) {
      if (!record.state && record.conversationId === result.conversationId && result.proposal?.id !== id) {
        record.state = "closed";
        record.stateLabel.textContent = result.proposal ? "Replaced by a newer preview. Review the latest plan below." : "Preview closed. See the latest response below.";
      }
    }
  }
  const message = addMessage("assistant", result.reply || "The board is up to date.");
  addProposal(message, result.proposal);
  addTrace(message, result.trace);
  scrollConversation();
}

function retainErrorResult(result) {
  if (result.conversationId) conversationId = result.conversationId;
  if (!result.proposal && !result.trace?.length) return;
  if (result.proposal) {
    for (const [id, record] of proposals) {
      if (!record.state && record.conversationId === conversationId && result.proposal.id !== id) {
        record.state = "closed";
        record.stateLabel.textContent = "Replaced by a newer preview. Review the latest plan below.";
      }
    }
  }
  const message = el("div", "message assistant-message");
  message.append(el("span", "message-label", "TOOL RESULT"));
  addProposal(message, result.proposal);
  addTrace(message, result.trace);
  ui.conversation.append(message);
  scrollConversation();
}

async function request(path, payload) {
  const response = await fetch(path, payload === undefined ? { headers: { Accept: "application/json" } } : { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) });
  let result;
  try { result = await response.json(); } catch { throw new Error("The local server returned an unreadable response. Check that it is running, then try again."); }
  if (!response.ok) {
    updateBoard(result.board);
    retainErrorResult(result);
    if (response.status === 409) {
      for (const record of proposals.values()) {
        if (!record.state) {
          record.state = "stale";
          record.stateLabel.textContent = "This preview needs refreshing. Ask for a new plan.";
        }
      }
    }
    const error = new Error(result.error || result.message || "That request did not go through. Please try again.");
    error.status = response.status;
    error.reviewableProposalId = result.proposal?.id;
    throw error;
  }
  return result;
}

function showError(error, retry) {
  const message = el("div", "message error-message");
  message.setAttribute("role", "alert");
  message.append(el("p", "", error.message || "Unable to reach the local server. Please try again."));
  if (retry && error.status !== 409) {
    const button = el("button", "retry-button", "Try again");
    button.type = "button";
    button.addEventListener("click", () => { if (!busy) { message.remove(); retry(); } });
    message.append(button);
  }
  ui.conversation.append(message);
  scrollConversation();
}

async function sendMessage(message, isRetry = false) {
  const text = message.trim();
  if (!text || busy || !board) return;
  if (!isRetry) addMessage("user", text);
  ui.input.value = "";
  setBusy(true, "Planning your next step…");
  try {
    handleResponse(await request("/api/chat", { message: text, ...(conversationId ? { conversationId } : {}) }));
  } catch (error) {
    showError(error, () => sendMessage(text, true));
  } finally {
    setBusy(false);
    ui.input.focus({ preventScroll: true });
  }
}

async function actOnProposal(action, proposalId) {
  if (busy) return;
  const record = proposals.get(proposalId);
  if (!record || record.state) return;
  setBusy(true, action === "confirm" ? "Confirming your plan…" : "Cancelling this plan…");
  try {
    const response = await request(`/api/${action}`, { conversationId: record.conversationId, proposalId });
    record.state = action;
    record.stateLabel.textContent = action === "confirm" ? "✓ Plan confirmed. The family board is up to date." : "Plan cancelled.";
    handleResponse(response);
  } catch (error) {
    showError(error, () => actOnProposal(action, proposalId));
  } finally { setBusy(false); }
}

async function completeTask(taskId) {
  const task = board?.tasks.find(item => item.id === taskId);
  if (busy || !task || task.status === "done" || blockedBy(task).length) return;
  setBusy(true, "Updating the family board…");
  try { handleResponse(await request("/api/complete", { taskId })); }
  catch (error) { showError(error, () => completeTask(taskId)); }
  finally { setBusy(false); }
}

async function loadBoard() {
  const generation = ++boardLoadGeneration;
  ui.list.setAttribute("aria-busy", "true");
  ui.boardError.hidden = true;
  try {
    const result = await request("/api/board");
    if (generation !== boardLoadGeneration) return;
    // Action responses may be newer than an in-flight board read.
    if (board && Number.isFinite(result.revision) && Number.isFinite(board.revision) && result.revision < board.revision) return;
    updateBoard(result);
    if (!busy) ui.status.textContent = "Ready when you are.";
  }
  catch (error) {
    if (generation !== boardLoadGeneration || board) return;
    ui.list.setAttribute("aria-busy", "false");
    ui.list.replaceChildren();
    ui.count.textContent = "Unavailable";
    ui.roster.replaceChildren(el("p", "muted", "Household unavailable"));
    ui.boardError.replaceChildren(el("p", "", error.message || "Could not connect to the local server."));
    const retry = el("button", "retry-button", "Reload family board");
    retry.type = "button";
    retry.addEventListener("click", loadBoard);
    ui.boardError.append(retry);
    ui.boardError.hidden = false;
    ui.status.textContent = "Reload the board to get started.";
    syncControls();
  }
}

async function loadProviderStatus() {
  ui.providerRetry.disabled = true;
  try {
    const response = await fetch("/api/status", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Provider status is unavailable.");
    const status = await response.json();
    if (!["offline", "bedrock"].includes(status.provider)) throw new Error("Unknown provider configuration.");
    const usesBedrock = status.provider === "bedrock" && status.configured === true;
    if (status.provider === "bedrock" && !usesBedrock) throw new Error("Bedrock configuration is incomplete.");
    ui.providerBadge.dataset.provider = status.provider;
    ui.providerStatus.textContent = usesBedrock ? (status.label || "Amazon Bedrock configured") : "Offline demo · no AI provider connected";
    ui.providerBadge.title = [status.detail, usesBedrock && status.modelId ? `Model: ${status.modelId}` : ""].filter(Boolean).join("\n");
    ui.providerStatus.setAttribute("aria-label", [ui.providerStatus.textContent, ui.providerBadge.title].filter(Boolean).join(". "));
    ui.providerExplainer.textContent = usesBedrock ? "Describe a handoff in your own words. Amazon Bedrock prepares a preview; review it before confirming." : "This local, rule-based assistant supports a small set of requests. Try a prompt below, or use New handoff for any task.";
    ui.providerRetry.hidden = true;
  } catch {
    ui.providerBadge.dataset.provider = "unknown";
    ui.providerStatus.textContent = "Provider status unavailable · connection unverified";
    ui.providerStatus.removeAttribute("aria-label");
    ui.providerBadge.title = "The server's provider configuration could not be verified. No live AI connection is claimed.";
    ui.providerExplainer.textContent = "Provider status is unavailable. Use New handoff or try a sample prompt; provider connectivity is unverified.";
    ui.providerRetry.hidden = false;
  } finally { ui.providerRetry.disabled = false; }
}

function openHandoff() {
  if (!board || busy) return;
  ui.handoffForm.reset();
  updateHandoffOptions();
  ui.handoffDate.value = tomorrowDate();
  ui.handoffError.hidden = true;
  ui.handoffStatus.textContent = "Nothing is saved until you confirm the preview.";
  ui.handoffDialog.showModal();
  ui.handoffTitle.focus();
}

async function previewHandoff(event) {
  event.preventDefault();
  if (busy || !board || !ui.handoffForm.reportValidity()) return;
  const title = ui.handoffTitle.value.trim();
  if (title.length < 3 || title.length > 160) {
    ui.handoffError.textContent = "Give the handoff a title between 3 and 160 characters.";
    ui.handoffError.hidden = false;
    ui.handoffTitle.focus();
    return;
  }
  const payload = {
    title,
    assigneeId: ui.handoffOwner.value,
    dueDate: ui.handoffDate.value,
    dueTime: ui.handoffTime.value,
    priority: ui.handoffPriority.value,
    dependsOn: ui.handoffPrerequisite.value ? [ui.handoffPrerequisite.value] : [],
    ...(conversationId ? { conversationId } : {}),
  };
  ui.handoffError.hidden = true;
  ui.handoffStatus.textContent = "Preparing your preview…";
  setBusy(true, "Preparing your handoff preview…");
  let proposalId;
  try {
    const result = await request("/api/handoff", payload);
    ui.handoffDialog.close();
    addMessage("user", `Prepare a handoff: ${title}\n${person(payload.assigneeId).name} · ${dateLabel(payload.dueDate)} · ${timeLabel(payload.dueTime)}`);
    handleResponse(result);
    proposalId = result.proposal?.id;
    document.querySelector(".assistant-panel").scrollIntoView({ block: "nearest" });
  } catch (error) {
    if (error.reviewableProposalId) {
      ui.handoffDialog.close();
      showError(error);
      proposalId = error.reviewableProposalId;
      document.querySelector(".assistant-panel").scrollIntoView({ block: "nearest" });
      return;
    }
    ui.handoffError.textContent = error.message || "The preview could not be prepared. Check the details, then try again.";
    ui.handoffError.hidden = false;
    ui.handoffStatus.textContent = "Nothing was saved. Review the details and try again.";
  } finally {
    setBusy(false);
    if (proposalId) proposals.get(proposalId)?.confirm.focus({ preventScroll: true });
  }
}

document.querySelectorAll("[data-filter]").forEach(button => {
  button.addEventListener("click", () => {
    filter = button.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach(item => {
      const active = item === button;
      item.classList.toggle("active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    renderTasks();
  });
});
document.querySelectorAll("[data-prompt]").forEach(button => button.addEventListener("click", () => sendMessage(button.dataset.prompt)));
ui.form.addEventListener("submit", event => { event.preventDefault(); sendMessage(ui.input.value); });
ui.input.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    sendMessage(ui.input.value);
  }
});
ui.newHandoff.addEventListener("click", openHandoff);
ui.handoffClose.addEventListener("click", () => ui.handoffDialog.close());
ui.handoffCancel.addEventListener("click", () => ui.handoffDialog.close());
ui.handoffDialog.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
ui.handoffForm.addEventListener("submit", previewHandoff);
ui.providerRetry.addEventListener("click", loadProviderStatus);
setBusy(false, "Loading your household…");
loadBoard();
loadProviderStatus();
