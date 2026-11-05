#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

async function main() {
  await createServer().connect(new StdioServerTransport());
  console.error('Hedera Verify MCP server running');
}

main().catch(console.error);
