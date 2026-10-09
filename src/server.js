import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod/v4';
import { DomainError, HouseholdStore } from './store.js';
import { installMcpRoutes } from './mcp.js';
import { createAssistant, providerStatus, readConfiguration } from './config.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const chatSchema = z.object({ message: z.string().trim().min(1).max(500), conversationId: z.string().uuid().optional() });
const decisionSchema = z.object({ conversationId: z.string().uuid(), proposalId: z.string().uuid() });
const handoffSchema = z.object({
  title: z.string().trim().min(3).max(160), assigneeId: z.string().min(1).max(100),
  dueDate: z.string(), dueTime: z.string(), priority: z.enum(['high', 'normal']).default('normal'),
  dependsOn: z.array(z.string().min(1).max(100)).max(20).default([]), conversationId: z.string().uuid().optional()
});

export async function startServer({ port = 4173, dataFile = resolve(root, 'data/household.json'), clock, configuration = { provider: 'offline' }, assistant: suppliedAssistant } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer from 0 to 65535.');
  const store = new HouseholdStore(dataFile, clock);
  const assistant = suppliedAssistant || createAssistant(configuration);
  const status = providerStatus(configuration);
  const app = createMcpExpressApp({ host: '127.0.0.1' });
  let url;
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const origin = req.get('origin');
    if (origin) {
      let parsed;
      try { parsed = new URL(origin); } catch { return res.status(403).json({ error: 'Invalid origin.' }); }
      if (!['http:', 'https:'].includes(parsed.protocol) || !['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.port !== new URL(url).port) return res.status(403).json({ error: 'Only the local HomeRelay origin is allowed.' });
    }
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  installMcpRoutes(app, store);
  const withClient = async action => {
    const client = new Client({ name: 'homerelay-web-simulator', version: '0.1.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`${url}/mcp`));
    try { await client.connect(transport, { timeout: 10000 }); return await action(client); }
    finally { await client.close(); }
  };
  const call = async (client, name, args = {}) => {
    const response = await client.callTool({ name, arguments: args });
    const result = response.structuredContent || JSON.parse(response.content.find(item => item.type === 'text').text);
    if (response.isError) throw new DomainError(result.error, result.status || 400);
    return result;
  };
  app.get('/health', (_req, res) => res.json({ ok: true, protocol: LATEST_PROTOCOL_VERSION, mode: status.provider }));
  app.get('/api/status', (_req, res) => res.json(status));
  app.get('/api/board', async (_req, res, next) => {
    try { res.json(await withClient(client => call(client, 'get_household_board'))); } catch (error) { next(error); }
  });
  app.post('/api/chat', async (req, res, next) => {
    try {
      const body = chatSchema.parse(req.body);
      res.json(await withClient(client => assistant.chat(client, body.message, body.conversationId)));
    } catch (error) { next(error); }
  });
  app.post('/api/handoff', async (req, res, next) => {
    try {
      const { conversationId, ...draft } = handoffSchema.parse(req.body);
      const context = assistant.conversation(conversationId);
      res.json(await withClient(client => assistant.run(client, context, async ({ call }) => {
        const proposal = await assistant.replacePreview(call, context, 'preview_handoff', draft);
        context.draft = null;
        context.providerMessages = [];
        return { reply: `${proposal.summary} Review this preview, then confirm to save.` };
      })));
    } catch (error) { next(error); }
  });
  for (const operation of ['confirm', 'cancel']) {
    app.post(`/api/${operation}`, async (req, res, next) => {
      try {
        const body = decisionSchema.parse(req.body);
        const context = assistant.conversation(body.conversationId);
        res.json(await withClient(client => assistant.decide(client, context, operation, body.proposalId)));
      } catch (error) { next(error); }
    });
  }
  app.post('/api/complete', async (req, res, next) => {
    try {
      const { taskId } = z.object({ taskId: z.string().min(1).max(100) }).parse(req.body);
      res.json(await withClient(async client => {
        const result = await call(client, 'complete_handoff', { taskId });
        return { board: result.board, reply: `Completed: ${result.task.title}.`, trace: [{ tool: 'complete_handoff', arguments: { taskId }, result }] };
      }));
    } catch (error) { next(error); }
  });
  app.use(express.static(resolve(root, 'public')));
  app.use((error, _req, res, _next) => {
    if (res.headersSent) return;
    const invalidInput = error instanceof z.ZodError || error.type === 'entity.parse.failed';
    res.status(invalidInput ? 400 : error.status || 500).json({
      error: invalidInput ? 'Check the request fields and try again.' : error.status ? error.message : 'Could not finish this action. Please try again.',
      board: store.board(),
      ...(error.conversationId ? { conversationId: error.conversationId } : {}),
      ...(error.proposal ? { proposal: error.proposal } : {}),
      ...(error.trace ? { trace: error.trace } : {})
    });
    if (!invalidInput && !error.status) console.error(error);
  });
  const httpServer = await new Promise((resolveStarted, reject) => {
    const listeningServer = app.listen(port, '127.0.0.1', () => resolveStarted(listeningServer));
    listeningServer.on('error', reject);
  });
  url = `http://127.0.0.1:${httpServer.address().port}`;
  const close = () => new Promise((resolveClosed, reject) => {
    httpServer.close(error => {
      assistant.dispose?.();
      if (error) reject(error); else resolveClosed();
    });
    httpServer.closeIdleConnections();
  });
  return { app, httpServer, url, store, close };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { loadEnvFile(resolve(root, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const configuration = readConfiguration(process.env);
  const running = await startServer({ port: Number(process.env.PORT || 4173), configuration });
  console.log(`HomeRelay local demo: ${running.url}`);
  console.log(`MCP ${LATEST_PROTOCOL_VERSION} via Streamable HTTP: ${running.url}/mcp`);
  console.log(configuration.provider === 'bedrock' ? 'Bedrock configured. Model access is checked on chat; AWS charges apply.' : 'Offline demo router. No AI provider connected.');
  console.log('HomeRelay uses its own Alexa+ concept simulator.');
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await running.close(); process.exit(0); });
}
