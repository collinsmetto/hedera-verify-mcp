import dotenv from 'dotenv';
dotenv.config({ quiet: true });

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { SoldCatalogue } from '@zanora/middleware-mcp';
import { z } from 'zod';

const API_BASE = process.env.TRUSTANCHOR_API_URL;
const API_KEY = process.env.TRUSTANCHOR_API_KEY;

if (!API_BASE || !API_KEY) {
  console.error('Missing TRUSTANCHOR_API_URL or TRUSTANCHOR_API_KEY');
  process.exit(1);
}

const hash = z
  .string()
  .regex(/^[a-fA-F0-9]{64}$/, 'Expected a SHA-256 hash (64 hex characters)')
  .describe('SHA-256 hash of the document (64 hex characters)');

export const TOOLS = {
  verify_document_hash: {
    description: 'Verify a document hash on Hedera mainnet',
    inputSchema: { hash },
  },
  timestamp_document_hash: {
    description:
      'Record a document hash on Hedera mainnet (anchor it). If the hash is already anchored, returns the existing certificate unless force is true.',
    inputSchema: {
      hash,
      force: z.boolean().optional().describe('Anchor again even if the hash already exists. Default: false'),
    },
  },
};

type ToolName = keyof typeof TOOLS;
type Handler = (args: Record<string, unknown>) => Promise<CallToolResult>;

/** Pass `sold` to charge for every tool. Without it, the tools are free. */
export const createServer = (sold?: SoldCatalogue) => {
  const definition = (tool: ToolName) => {
    const { description, inputSchema } = TOOLS[tool];
    return { inputSchema, ...(sold ? sold.describe(tool, { description }) : { description }) };
  };
  const charged = (tool: ToolName, handler: Handler) => (sold ? sold.paid(tool)(handler) : handler);

  const server = new McpServer({
    name: 'hedera-verify-mcp',
    version: '1.0.5',
  });

  server.registerTool(
    'verify_document_hash',
    definition('verify_document_hash'),
    charged('verify_document_hash', async (args) => {
      const { hash } = args as { hash: string };
      try {
        const res = await fetch(`${API_BASE}/api/agent/verify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY,
          },
          body: JSON.stringify({ hash }),
        });
        const text = await res.text();
        if (!res.ok) {
          return { content: [{ type: 'text', text: `API error (${res.status}): ${text}` }], isError: true };
        }
        const data = JSON.parse(text);
        if (data.valid) {
          return {
            content: [{
              type: 'text',
              text: `✅ Verified.\nTimestamp: ${data.timestamp}\nCertificate ID: ${data.certificateId}`,
            }],
          };
        } else {
          return { content: [{ type: 'text', text: '❌ Hash not found on ledger.' }] };
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `Fetch failed: ${errorMessage}` }], isError: true };
      }
    })
  );

  server.registerTool(
    'timestamp_document_hash',
    definition('timestamp_document_hash'),
    charged('timestamp_document_hash', async (args) => {
      const { hash, force } = args as { hash: string; force?: boolean };
      try {
        const res = await fetch(`${API_BASE}/api/agent/anchor`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY,
          },
          body: JSON.stringify({ hash, force: force ?? false }),
        });
        const text = await res.text();
        if (!res.ok) {
          return { content: [{ type: 'text', text: `Anchor error (${res.status}): ${text}` }], isError: true };
        }
        const data = JSON.parse(text);
        const seqNum = typeof data.sequenceNumber === 'object' ? data.sequenceNumber.low : data.sequenceNumber;

        if (data.duplicate) {
          return {
            content: [{
              type: 'text',
              text: `ℹ️ Already anchored — returning existing certificate.\nSequence number: ${seqNum}\nTimestamp: ${data.consensusTimestamp}\nCertificate ID: ${data.certificateId}`,
            }],
          };
        }

        return {
          content: [{
            type: 'text',
            text: `✅ Hash anchored.\nSequence number: ${seqNum}\nTimestamp: ${data.consensusTimestamp}\nCertificate ID: ${data.certificateId}`,
          }],
        };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `Fetch failed: ${errorMessage}` }], isError: true };
      }
    })
  );

  return server;
};
