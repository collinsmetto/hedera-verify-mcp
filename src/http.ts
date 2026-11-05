import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';

const PORT = Number(process.env.PORT ?? 3000);
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;
const MAX_BODY_BYTES = 1_000_000;

if (!AUTH_TOKEN) {
  console.error('Missing MCP_AUTH_TOKEN');
  process.exit(1);
}

const sha256 = (value: string) => createHash('sha256').update(value).digest();

function isAuthorized(req: IncomingMessage) {
  return timingSafeEqual(sha256(req.headers.authorization ?? ''), sha256(`Bearer ${AUTH_TOKEN}`));
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('Body too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const httpServer = createHttpServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');

  if (pathname === '/health') return sendJson(res, 200, { ok: true });
  if (pathname !== '/mcp') return sendJson(res, 404, { error: 'Not found' });
  if (!isAuthorized(req)) return sendJson(res, 401, { error: 'Unauthorized' });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  let body: unknown;
  try {
    body = await readJson(req);
  } catch {
    return sendJson(res, 400, { error: 'Invalid request body' });
  }

  // Stateless: a fresh server and transport for every request.
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (err) {
    console.error('MCP request failed:', err);
    if (!res.headersSent) sendJson(res, 500, { error: 'Internal server error' });
  }
});

httpServer.listen(PORT, () => {
  console.error(`Hedera Verify MCP listening on :${PORT}/mcp`);
});
