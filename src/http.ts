import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { zanoraSeller } from '@zanora/middleware-mcp';
import { z } from 'zod';
import { createServer, TOOLS } from './server.js';

const PORT = Number(process.env.PORT ?? 3000);
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;
const ZANORA_API_KEY = process.env.ZANORA_API_KEY;
const MAX_BODY_BYTES = 1_000_000;

// Never start open: every call is either paid through Zanora or needs the token.
if (!ZANORA_API_KEY && !AUTH_TOKEN) {
  console.error('Set ZANORA_API_KEY to sell the tools, or MCP_AUTH_TOKEN for private access');
  process.exit(1);
}

async function sellTools(apiKey: string) {
  const prices = {
    verify_document_hash: process.env.ZANORA_PRICE_VERIFY,
    timestamp_document_hash: process.env.ZANORA_PRICE_TIMESTAMP,
  };
  // Strict on purpose: the SDK reads a bare "100" as $100, and "$0" would open
  // the mainnet write to anyone.
  for (const price of Object.values(prices)) {
    if (!/^\$\d+(\.\d{1,6})?$/.test(price ?? '') || Number(price?.slice(1)) === 0) {
      throw new Error('ZANORA_PRICE_VERIFY and ZANORA_PRICE_TIMESTAMP must be above zero, like "$0.01"');
    }
  }

  const sold = await zanoraSeller({ apiKey }).sellAll({
    tools: Object.entries(TOOLS).map(([tool, { description, inputSchema }]) => ({
      tool,
      description,
      schema: z.toJSONSchema(z.object(inputSchema)) as Record<string, unknown>,
    })),
    prices: prices as Record<string, string>,
    category: 'Document Verification',
    tags: ['hedera', 'hcs', 'document-verification', 'timestamp', 'blockchain'],
  });

  for (const { capabilityId, priceMicros, changed } of sold.capabilities) {
    const updated = changed.length ? ` (updated: ${changed.join(', ')})` : '';
    console.error(`Selling ${capabilityId} at ${priceMicros} micro-USD${updated}`);
  }
  return sold;
}

// With Zanora, payment is the gate: buyers hold no token, and an unpaid tool
// call is refused before its handler runs. A failed publish stops startup.
const sold = ZANORA_API_KEY ? await sellTools(ZANORA_API_KEY) : undefined;

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
  if (!sold && !isAuthorized(req)) return sendJson(res, 401, { error: 'Unauthorized' });
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
  const server = createServer(sold);
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
