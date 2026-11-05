# Hedera Verify MCP Server

[![npm version](https://img.shields.io/npm/v/@yoseph-ai/hedera-verify-mcp.svg)](https://www.npmjs.com/package/@yoseph-ai/hedera-verify-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-blue.svg)](https://modelcontextprotocol.io)

A **Model Context Protocol (MCP) server** that lets AI agents verify and timestamp document hashes on **Hedera mainnet** using the Hedera Consensus Service (HCS). Works with Claude Desktop, Cursor, Windsurf, and any MCP-compatible client.

Once a document hash is anchored, anyone can independently verify it via the public Hedera Mirror Node — no central authority required.

---

## Tools

### `verify_document_hash`
Checks whether a SHA-256 document hash has been anchored on Hedera. Returns the original timestamp, sequence number, and certificate ID if found.

**Input:**

| Parameter | Type   | Required | Description                              |
|-----------|--------|----------|------------------------------------------|
| `hash`    | string | ✅        | SHA-256 hash of the document (64 hex chars) |

**Example prompt:**
> "Verify the document hash `a1b2c3d4e5f6...`"

**Response — found:**
```json
{
  "exists": true,
  "timestamp": "2025-06-01T10:23:45.000000000Z",
  "sequenceNumber": 42,
  "certificateId": "0.0.12345@42",
  "network": "mainnet",
  "mirrorNodeUrl": "https://mainnet.mirrornode.hedera.com"
}
```

**Response — not found:**
```json
{
  "exists": false,
  "timestamp": null,
  "sequenceNumber": null
}
```

---

### `timestamp_document_hash`
Submits a new SHA-256 document hash to Hedera HCS, creating an immutable timestamp anchor. Returns a signed certificate JWT and full consensus details.

**Input:**

| Parameter | Type   | Required | Description                              |
|-----------|--------|----------|------------------------------------------|
| `hash`    | string | ✅        | SHA-256 hash of the document (64 hex chars) |

**Example prompt:**
> "Timestamp the document hash `a1b2c3d4e5f6...`"

**Response — success:**
```json
{
  "success": true,
  "sequenceNumber": 43,
  "consensusTimestamp": "1717235025.000180000",
  "certificateId": "0.0.12345@43",
  "receipt": "<signed-jwt-certificate>"
}
```

**Response — duplicate (already anchored):**
```json
{
  "error": "Document already timestamped at 2025-06-01T10:23:45.000000000Z (sequence #42).",
  "originalTimestamp": "1717235025.000180000",
  "originalSequence": 42
}
```

---

## Prerequisites

- Node.js 18+
- An API key for the TrustAnchor backend

No Hedera account needed — the backend handles all on-chain transactions.

---

## Installation

### Recommended: use via `npx` (no install needed)

The Claude Desktop and Cursor configs below use `npx` to pull and run the latest published version automatically. Nothing to install manually.

### Install globally

```bash
npm install -g @yoseph-ai/hedera-verify-mcp
```

### Clone and run locally

```bash
git clone https://github.com/Yoseph-ai/hedera-verify-mcp.git
cd hedera-verify-mcp
npm install
cp .env.example .env
# Edit .env with your credentials
npm run dev
```

---

## Environment Variables

| Variable              | Required | Description                                                      |
|-----------------------|----------|------------------------------------------------------------------|
| `TRUSTANCHOR_API_URL` | ✅        | Backend API URL (default: `https://hedera-document-auth.vercel.app`) |
| `TRUSTANCHOR_API_KEY` | ✅        | Your API key for the TrustAnchor backend                         |
| `MCP_AUTH_TOKEN`      | HTTP, private | Bearer token clients must send to `/mcp`. Ignored when `ZANORA_API_KEY` is set |
| `ZANORA_API_KEY`      | HTTP, selling | Zanora provider key. Makes `/mcp` public and charges for every tool call |
| `ZANORA_PUBLIC_URL`   | HTTP, selling | The public `https://.../mcp` URL buyers call                     |
| `ZANORA_PRICE_VERIFY` | HTTP, selling | Price per `verify_document_hash` call, like `$0.01`              |
| `ZANORA_PRICE_TIMESTAMP` | HTTP, selling | Price per `timestamp_document_hash` call, like `$0.25`        |
| `PORT`                | ❌        | HTTP server port (default: `3000`). Most hosts set this for you  |

---

## Claude Desktop Setup

Find your config file:

| Platform    | Path                                                                 |
|-------------|----------------------------------------------------------------------|
| **Windows** | `%APPDATA%\Claude\claude_desktop_config.json`                        |
| **macOS**   | `~/Library/Application Support/Claude/claude_desktop_config.json`   |
| **Linux**   | `~/.config/claude/claude_desktop_config.json`                        |

Add the following block to your config:

```json
{
  "mcpServers": {
    "hedera-verify": {
      "command": "npx",
      "args": ["-y", "@yoseph-ai/hedera-verify-mcp"],
      "env": {
        "TRUSTANCHOR_API_URL": "https://hedera-document-auth.vercel.app",
        "TRUSTANCHOR_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Restart Claude Desktop after saving. The `verify_document_hash` and
`timestamp_document_hash` tools will appear automatically.
---

## Cursor Setup

Add to your Cursor MCP config (`%APPDATA%\Cursor\User\globalStorage\mcp.json` on Windows, or the equivalent on macOS/Linux):

```json
{
  "mcpServers": {
    "hedera-verify": {
      "command": "npx",
      "args": ["-y", "@yoseph-ai/hedera-verify-mcp"],
      "env": {
        "TRUSTANCHOR_API_URL": "https://hedera-document-auth.vercel.app",
        "TRUSTANCHOR_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

---

## Windsurf / Other MCP Clients

Any MCP-compatible client that supports stdio transport can use this server with the same config pattern above. Point `command` at `npx` and pass `["-y", "@yoseph-ai/hedera-verify-mcp"]` as args.

---

## Self-Hosting over HTTP

You can also host the server so clients connect to `https://your-host/mcp` instead of running it locally. It uses the MCP Streamable HTTP transport in stateless mode.

> ⚠️ `timestamp_document_hash` writes to Hedera mainnet using your TrustAnchor API key, so the HTTP server won't start unless it can gate calls. Set `MCP_AUTH_TOKEN` for private access, or `ZANORA_API_KEY` to [sell the tools](#selling-on-zanora). Everyone with the token shares that key, so only give it to clients you trust.

### Run locally

```bash
npm install
cp .env.example .env
# Set TRUSTANCHOR_API_KEY and MCP_AUTH_TOKEN in .env
npm run build
node dist/http.js
```

The server listens on `http://localhost:3000/mcp`.

### Run with Docker

```bash
docker build -t hedera-verify-mcp .
docker run -p 3000:3000 \
  -e TRUSTANCHOR_API_URL=https://hedera-document-auth.vercel.app \
  -e TRUSTANCHOR_API_KEY=your-api-key-here \
  -e MCP_AUTH_TOKEN=your-random-token-here \
  hedera-verify-mcp
```

### Deploy

Deploy the `Dockerfile` to any container host, such as Render, Fly.io, Railway or Cloud Run:

1. Generate a token with `openssl rand -hex 32`.
2. Set `TRUSTANCHOR_API_URL`, `TRUSTANCHOR_API_KEY` and `MCP_AUTH_TOKEN` in the host's environment settings.
3. Set the host's health check path to `/health`.
4. Serve it over HTTPS, so the token isn't sent in plain text.

### Test the endpoint

```bash
curl -X POST https://your-host/mcp \
  -H "Authorization: Bearer $MCP_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

This should list both tools. Without the `Authorization` header, it returns `401`.

### Connect a client

Clients must be able to send a custom `Authorization` header. For Claude Code:

```bash
claude mcp add --transport http hedera-verify https://your-host/mcp \
  --header "Authorization: Bearer your-random-token-here"
```

---

## Selling on Zanora

You can sell both tools per call on [Zanora](https://docs.zanora.dev/sellers/mcp). Buyers' agents call your URL directly and pay through Zanora, which takes a 5% platform fee. Selling needs Node.js 20+ and the hosted HTTP server, since stdio servers can't be paid for.

When `ZANORA_API_KEY` is set:

- `/mcp` is public, with no bearer token, because payment is the gate. `MCP_AUTH_TOKEN` is ignored and doesn't bypass payment.
- A tool call without valid payment is refused with a signed price quote, before any request reaches TrustAnchor.
- If TrustAnchor returns an error, the call fails and the buyer is refunded.
- A malformed hash is rejected before any charge.
- `verify_document_hash` still charges when a hash isn't found, because that's a valid answer.

### Set up

1. Create a seller account at [console.zanora.dev](https://console.zanora.dev) and save the provider key.
2. Add these to your host's environment, and redeploy:

   ```
   ZANORA_API_KEY=your-provider-key-here
   ZANORA_PUBLIC_URL=https://your-host/mcp
   ZANORA_PRICE_VERIFY=$0.01
   ZANORA_PRICE_TIMESTAMP=$0.25
   ```

   Prices must be above zero, written like `$0.01` or `0.01`. If you set them from a shell, use `0.01` or single quotes, because the shell expands `$0`. Set them above what each call costs you, including the platform fee. The prices shown here are only examples.

3. Check the logs for a `Selling cap_...` line for each tool. Both tools are published on startup and updated to match on each restart. If publishing fails, the server won't start.
4. Request verification under **Seller → Publish** in the console. Buyers can't find your tools until you're approved.
5. Add a USDC on Base payout address under **Seller → Settings**.

### Test the payment gate

Call a tool with no payment:

```bash
curl -X POST https://your-host/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"timestamp_document_hash","arguments":{"hash":"0000000000000000000000000000000000000000000000000000000000000000"}}}'
```

The response should contain `PAYMENT_REQUIRED` and a price quote, and nothing should be anchored.

---

## Testing with MCP Inspector

```bash
npx @modelcontextprotocol/inspector npx @yoseph-ai/hedera-verify-mcp
```

Set `TRUSTANCHOR_API_URL` and `TRUSTANCHOR_API_KEY` in the Inspector UI, then call `verify_document_hash` or `timestamp_document_hash` directly from the browser.

---

## How It Works

```
Your Document
     │
     ▼
SHA-256 Hash ──▶ MCP Server ──▶ TrustAnchor API ──▶ Hedera HCS (mainnet)
                                                            │
                                           Consensus Timestamp + Sequence Number
                                                            │
                                           ◀── Signed Certificate (JWT)
```

1. You provide a SHA-256 hash of your document
2. The MCP server forwards it to the TrustAnchor API with your API key
3. The API submits the hash to a Hedera HCS topic
4. Hedera consensus nodes reach agreement on an immutable timestamp
5. A signed JWT certificate is returned — independently verifiable via the Mirror Node

---

## Independent Verification

Hashes anchored on Hedera can be verified directly via the public Mirror Node with no dependency on this server:

```
https://mainnet.mirrornode.hedera.com/api/v1/topics/{topicId}/messages
```

Browse the live topic on HashScan: [View on HashScan](https://hashscan.io/mainnet/topic/0.0.10496228)

---

## Deploy Your Own Backend

The backend source is available at [hedera-document-auth](https://github.com/Yoseph-ai/hedera-document-auth). Deploy your own instance to Vercel and point the MCP server at it.

Required environment variables for your Vercel deployment:

```
HEDERA_ACCOUNT_ID
HEDERA_PRIVATE_KEY
HEDERA_NETWORK
HEDERA_TOPIC_ID
AGENT_API_KEY
JWT_SECRET
```

Then update your MCP server config:

```json
"TRUSTANCHOR_API_URL": "https://your-deployment.vercel.app"
```

---

## License

MIT © [Yoseph-ai](https://github.com/Yoseph-ai)

---

## Links

- [NPM Package](https://www.npmjs.com/package/@yoseph-ai/hedera-verify-mcp)
- [Backend Source](https://github.com/Yoseph-ai/hedera-document-auth)
- [Hedera Documentation](https://docs.hedera.com)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [Live Topic on HashScan](https://hashscan.io/mainnet/topic/0.0.10496228)