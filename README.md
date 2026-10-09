# Tanod MCP server

[![smithery badge](https://smithery.ai/badge/tanod-labs/tanod)](https://smithery.ai/servers/tanod-labs/tanod)

One remote MCP server with **165 tools** (also split into 11 focused servers, below) for AI agents: `https://tanod.dev/mcp`.

- **Connection:** streamable HTTP and stateless, with no API key, no account and no OAuth.
- **Price:** free daily allowance per IP on every tool (applied automatically over MCP). Past that, pay per call in USDC on Base or Polygon with [x402](https://tanod.dev/learn/pay-per-call-api-x402.html) from an x402-capable client (the [Tanod SDKs](https://github.com/tanod-labs/integrations) or any x402 library).
- **Setup for 20 clients:** <https://tanod.dev/connect/>. Docs for agents: <https://tanod.dev/llms.txt>. OpenAPI: <https://tanod.dev/openapi.json>.

## Focused servers

Clients that work better with fewer tools can connect a focused server instead. Same tools, same free allowance, only the URL changes. Each is in the official MCP registry as `dev.tanod/<topic>`.

| URL | Tools | What it does |
|---|---|---|
| `https://tanod.dev/mcp/security` | 16 | Phishing URL and OFAC checks, contract and package scans, domain checks |
| `https://tanod.dev/mcp/finance` | 10 | SEC EDGAR lookup and XBRL financial statements, Treasury yields, FX, token prices, DEX candles, business days |
| `https://tanod.dev/mcp/sky` | 12 | METAR/TAF, airports, space weather, aurora, asteroids, satellite passes |
| `https://tanod.dev/mcp/docs` | 35 | DOCX template fill from JSON, multi-step PDF pipeline, Office to PDF, PDF to Word, any document to Markdown, PDF tables, bank statements to CSV/Excel, PDF text, OCR, fill and read forms, bookmarks, attachments, page labels, merge, split, compress, watermark, protect |
| `https://tanod.dev/mcp/chain` | 33 | EVM and Solana reads: balances, tokens, eth_call, storage, logs, receipts, gas estimates, prices, candles, swap quotes, transactions, ENS |
| `https://tanod.dev/mcp/images` | 17 | Resize, convert, compress, crop, metadata, QR, barcodes, color contrast |
| `https://tanod.dev/mcp/text` | 18 | Text statistics, language, diff, Markdown and HTML |
| `https://tanod.dev/mcp/util` | 21 | Encode, hash, HMAC, IDs, unit conversion, business days, cron, time zones |
| `https://tanod.dev/mcp/web` | 19 | Web search, company profile and open jobs from a domain, page render and metadata, robots, sitemaps, RDAP, IP lookup |
| `https://tanod.dev/mcp/ml` | 10 | Speech to text (SRT/WebVTT), embeddings, rerank, similarity, entities, classification |
| `https://tanod.dev/mcp/agents` | 5 | x402 and MCP agent-economy index |

Overview: <https://tanod.dev/mcp-servers/>. Pricing: <https://tanod.dev/pricing/>. Status: <https://tanod.dev/status>.

## Tool families

| Family | What it does |
|---|---|
| pactlint | Solidity / EVM contract scan (Slither + custom DeFi detectors) |
| txpeek | Pre-transaction address check (sanctions, contract, age) |
| toolsniff | Scan AI-agent skills and MCP server packages for risky code |
| agentscan | Agent-economy index: x402 endpoints and MCP servers |
| sitepeek | Web page to Markdown, screenshots, PDF text, metadata, OCR |
| dnspeek | DNS, SPF/DMARC/DKIM, TLS, RDAP/whois, email verification, IP lookup |
| chainpeek | EVM and Solana reads, ENS, balances, tokens, calldata, gas, blocks, prices, OFAC screening, phishing URL check |
| findpeek | Web search |
| weatherpeek | Weather forecast (MET Norway) |
| utilpeek | SEC EDGAR company lookup, Peppol e-invoicing participant lookup, US Treasury yield curve, FX, HMAC sign/verify (webhook signatures), QR/barcodes, geocoding, holidays, phone/IBAN/VAT checks, text and data tools |
| pdfpeek | Merge, split, compress, OCR, protect/unlock, watermark and more |
| imagepeek | Resize, convert, compress, crop, metadata, watermark, blurhash |
| mlpeek | Local CPU models: speech to text, embeddings, rerank, similarity, named entities, zero-shot classification |
| skypeek | METAR/TAF decode, airports, flight distance, space weather, aurora, asteroids, sun/moon, satellite passes |

Scans and checks are automated and heuristic, not an audit. Aviation data is not for navigation.

## For x402 sellers (free)

- [x402 listing lint](https://tanod.dev/tools/x402-listing-lint/): paste your 402 response and check it against the CDP Bazaar listing rules (500-character description cap, "use when" sentence, schemas, networks). Runs in your browser; nothing is uploaded.
- [State of the x402 Bazaar](https://tanod.dev/learn/state-of-x402-bazaar.html): listings, hosts, prices, networks and metadata quality from our daily index.
- [Bazaar listing checklist](https://tanod.dev/learn/x402-bazaar-listing-checklist.html).

## Quick setup

Claude Code:

```sh
claude mcp add --transport http tanod https://tanod.dev/mcp
```

Cursor (`~/.cursor/mcp.json`), and similar `mcpServers` clients:

```json
{ "mcpServers": { "tanod": { "url": "https://tanod.dev/mcp" } } }
```

VS Code (`.vscode/mcp.json`):

```json
{ "servers": { "tanod": { "type": "http", "url": "https://tanod.dev/mcp" } } }
```

Claude Desktop / claude.ai: add a custom connector with the URL above and leave the OAuth fields empty.

Other clients: <https://tanod.dev/connect/>.

## About

Tanod (<https://tanod.dev>) also runs free browser tools at <https://tanod.dev/tools/> and free network monitoring at <https://tanod.dev/monitor/>. Contact: ops@tanod.dev.

This repository holds the public description and registry metadata of the hosted server. The server itself is hosted at tanod.dev.

## Claude Code plugins

This repository is also a plugin marketplace: one plugin per focused server, plus the all-in-one server.

```
/plugin marketplace add tanod-labs/tanod-mcp
/plugin install tanod-security@tanod      # or tanod-chain, tanod-sky, tanod-finance, tanod-docs, tanod-images,
                                          # tanod-text, tanod-util, tanod-web, tanod-ml, tanod-agents, or tanod (all)
```

Each plugin only adds the hosted MCP server; nothing runs locally. The free daily allowance applies automatically; paid calls return x402 payment instructions.

## Troubleshooting

A server URL is the whole address: Streamable HTTP, JSON-RPC over POST, no `/sse` or `/mcp` suffix, and there is no `/api/mcp`. Tanod's servers are stateless, so `tools/list` works as the first request and checks any of them from a shell:

```sh
curl -s -X POST https://tanod.dev/mcp/docs \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Status codes one by one (404 on `/sse`, 406 Not Acceptable, 415, session 400s, 405 on GET, 402 price quotes, timeouts): https://tanod.dev/learn/mcp-server-connection-errors.html

What shipped recently: https://tanod.dev/changelog/ (Atom feed: https://tanod.dev/changelog/feed.xml).
