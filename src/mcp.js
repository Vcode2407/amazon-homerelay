import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import * as z from 'zod/v4';

export function createMcpServer(store) {
  const server = new McpServer({ name: 'homerelay', version: '0.1.0' });
  const register = (name, description, inputSchema, readOnly, action) => {
    server.registerTool(name, {
      description, inputSchema,
      annotations: { readOnlyHint: readOnly, destructiveHint: false, idempotentHint: readOnly || name === 'complete_handoff', openWorldHint: false }
    }, async args => {
      try {
        const result = action(args);
        return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: error.message }], structuredContent: { error: error.message, status: error.status || 400 } };
      }
    });
  };
  register('get_household_board', 'Read household members, schedules, task prerequisites and completion state.', {}, true, () => store.board());
  register('get_household_brief', 'Read unfinished handoffs for a date, ordered by time, including blocked prerequisites.', { dueDate: z.string() }, true, args => store.brief(args.dueDate));
  register('preview_handoff', 'Prepare a handoff proposal without saving it. Ask the user to review it before confirm_proposal.', {
    title: z.string().min(3).max(160), assigneeId: z.string(), dueDate: z.string(), dueTime: z.string(),
    priority: z.enum(['high', 'normal']).default('normal'), dependsOn: z.array(z.string()).default([])
  }, false, args => store.previewHandoff(args));
  register('preview_rebalance', 'Prepare replacements for one unavailable household member on a date. Uses travel capability and current workload. Confirm only after review.', {
    assigneeId: z.string(), dueDate: z.string()
  }, false, args => store.previewRebalance(args));
  register('confirm_proposal', 'Persist a reviewed handoff or rebalance proposal. Only call after explicit user confirmation. Refuses stale previews.', { proposalId: z.string() }, false, args => store.confirm(args.proposalId));
  register('cancel_proposal', 'Discard an unconfirmed preview without changing the household board.', { proposalId: z.string() }, false, args => store.cancel(args.proposalId));
  register('complete_handoff', 'Mark a task complete. Refuses while any prerequisite is unfinished.', { taskId: z.string() }, false, args => store.complete(args.taskId));
  return server;
}

export function installMcpRoutes(app, store) {
  app.post('/mcp', async (req, res, next) => {
    const server = createMcpServer(store);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void transport.close(); void server.close(); });
    try { await server.connect(transport); await transport.handleRequest(req, res, req.body); }
    catch (error) { next(error); }
  });
  // The protocol explicitly allows 405 when there is no standalone SSE stream/session.
  app.all('/mcp', (_req, res) => res.status(405).set('Allow', 'POST').json({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Use POST for this stateless Streamable HTTP endpoint.' } }));
}
