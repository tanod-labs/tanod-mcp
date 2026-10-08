# Tanod MCP server

[![smithery badge](https://smithery.ai/badge/tanod-labs/tanod)](https://smithery.ai/servers/tanod-labs/tanod)

One remote MCP server with **120+ tools** (also split into 11 focused servers, below) for AI agents: `https://tanod.dev/mcp`.

- **Connection:** streamable HTTP and stateless, with no API key, no account and no OAuth.
- **Price:** free daily allowance per IP on every tool (applied automatically over MCP). Past that, pay per call in USDC on Base or Polygon with [x402](https://tanod.dev/learn/pay-per-call-api-x402.html) from an x402-capable client (the [Tanod SDKs](https://github.com/tanod-labs/integrations) or any x402 library).
- **Setup for 20 clients:** <https://tanod.dev/connect/>. Docs for agents: <https://tanod.dev/llms.txt>. OpenAPI: <https://tanod.dev/openapi.json>.

## Focused servers

Clients that work better with fewer tools can connect a focused server instead. Same tools, same free allowance, only the URL changes. Each is in the official MCP registry as `dev.tanod/<topic>`.

| URL | Tools | What it does |
|---|---|---|
| `https://tanod.dev/mcp/security` | 16 | Phishing URL and OFAC checks, contract and package scans, domain checks |
| `https://tanod.dev/mcp/finance` | 9 | SEC EDGAR lookup, Treasury yields, FX, token prices, DEX candles, business days |
| `https://tanod.dev/mcp/sky` | 12 | METAR/TAF, airports, space weather, aurora, asteroids, satellite passes |
| `https://tanod.dev/mcp/docs` | 17 | PDF text, OCR, merge, split, compress, watermark, protect |
| `https://tanod.dev/mcp/chain` | 19 | Balances, tokens, prices, candles, swap quotes, transactions, ENS |
| `https://tanod.dev/mcp/images` | 17 | Resize, convert, compress, crop, metadata, QR, barcodes, color contrast |
| `https://tanod.dev/mcp/text` | 18 | Text statistics, language, diff, Markdown and HTML |
| `https://tanod.dev/mcp/util` | 19 | Encode, hash, HMAC, IDs, unit conversion, business days, cron, time zones |
| `https://tanod.dev/mcp/web` | 16 | Web search, page render and metadata, robots, sitemaps, RDAP, IP lookup |
| `https://tanod.dev/mcp/ml` | 9 | Embeddings, rerank, similarity, entities, classification |
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
| chainpeek | ENS, balances, tokens, calldata, gas, blocks, prices, OFAC screening, phishing URL check |
| findpeek | Web search |
| weatherpeek | Weather forecast (MET Norway) |
| utilpeek | SEC EDGAR company lookup, US Treasury yield curve, FX, HMAC sign/verify (webhook signatures), QR/barcodes, geocoding, holidays, phone/IBAN/VAT checks, text and data tools |
| pdfpeek | Merge, split, compress, OCR, protect/unlock, watermark and more |
| imagepeek | Resize, convert, compress, crop, metadata, watermark, blurhash |
| mlpeek | Local CPU models: embeddings, rerank, similarity, named entities, zero-shot classification |
| skypeek | METAR/TAF decode, airports, flight distance, space weather, aurora, asteroids, sun/moon, satellite passes |

Scans and checks are automated and heuristic, not an audit. Aviation data is not for navigation.

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
