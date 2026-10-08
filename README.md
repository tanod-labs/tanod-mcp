# Tanod MCP server

One remote MCP server with **119 tools** for AI agents: `https://tanod.dev/mcp`.

- **Connection:** streamable HTTP and stateless, with no API key, no account and no OAuth.
- **Price:** free daily allowance per IP on every tool (applied automatically over MCP). Past that, pay per call in USDC on Base or Polygon with [x402](https://tanod.dev/learn/pay-per-call-api-x402.html) from an x402-capable client (the [Tanod SDKs](https://github.com/tanod-labs/integrations) or any x402 library).
- **Setup for 20 clients:** <https://tanod.dev/connect/>. Docs for agents: <https://tanod.dev/llms.txt>. OpenAPI: <https://tanod.dev/openapi.json>.

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
| utilpeek | FX, QR/barcodes, geocoding, holidays, phone/IBAN/VAT checks, text and data tools |
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
