import dotenv from 'dotenv';
dotenv.config({ quiet: true });

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const API_BASE = process.env.TRUSTANCHOR_API_URL;
const API_KEY = process.env.TRUSTANCHOR_API_KEY;

if (!API_BASE || !API_KEY) {
  console.error('Missing TRUSTANCHOR_API_URL or TRUSTANCHOR_API_KEY');
  process.exit(1);
}

export const createServer = () => {
  const server = new McpServer({
    name: 'hedera-verify-mcp',
    version: '1.0.5',
  });

  server.tool(
    'verify_document_hash',
    'Verify a document hash on Hedera mainnet',
    { hash: z.string().describe('SHA-256 hash of the document (64 hex characters)') },
    async ({ hash }) => {
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
    }
  );

  server.tool(
    'timestamp_document_hash',
    'Record a document hash on Hedera mainnet (anchor it). If the hash is already anchored, returns the existing certificate unless force is true.',
    {
      hash: z.string().describe('SHA-256 hash of the document (64 hex characters)'),
      force: z.boolean().optional().describe('Anchor again even if the hash already exists. Default: false'),
    },
    async ({ hash, force }) => {
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
    }
  );

  return server;
};
