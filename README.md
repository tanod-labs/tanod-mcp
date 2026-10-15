# Tanod MCP server

[![smithery badge](https://smithery.ai/badge/tanod-labs/tanod)](https://smithery.ai/servers/tanod-labs/tanod)
[![Product Hunt](https://img.shields.io/badge/Product%20Hunt-Tanod-da552f?logo=producthunt&logoColor=white)](https://www.producthunt.com/products/tanod)

One remote MCP server with **about 260 tools** (also split into 11 focused servers, below) for AI agents: `https://tanod.dev/mcp`.

- **Connection:** streamable HTTP and stateless, with no API key, no account and no OAuth.
- **Price:** free daily allowance per IP on every tool (applied automatically over MCP). Past that, pay per call in USDC on Base or Polygon with [x402](https://tanod.dev/learn/pay-per-call-api-x402.html?src=gh_mcp) from an x402-capable client (the [Tanod SDKs](https://github.com/aiexp1/tanod-integrations) or any x402 library).
- **Setup for 20 clients:** <https://tanod.dev/connect/?src=gh_mcp>. Docs for agents: <https://tanod.dev/llms.txt>. OpenAPI: <https://tanod.dev/openapi.json>.

## Focused servers

Clients that work better with fewer tools can connect a focused server instead. Same tools, same free allowance, only the URL changes. Each is in the official MCP registry as `dev.tanod/<topic>`.

| URL | Tools | What it does |
|---|---|---|
| `https://tanod.dev/mcp/security` | 25 | Phishing URL and OFAC checks, contract and package scans, domain checks |
| `https://tanod.dev/mcp/finance` | 30 | SEC EDGAR lookup and XBRL financial statements, Treasury yields, FX, token prices, DEX candles, business days |
| `https://tanod.dev/mcp/sky` | 14 | METAR/TAF, airports, space weather, aurora, asteroids, satellite passes |
| `https://tanod.dev/mcp/docs` | 40 | DOCX template fill from JSON, multi-step PDF pipeline, Office to PDF, PDF to Word, any document to Markdown, PDF tables, bank statements to CSV/Excel, PDF text, OCR, fill and read forms, bookmarks, attachments, page labels, merge, split, compress, watermark, protect |
| `https://tanod.dev/mcp/chain` | 40 | EVM and Solana reads: balances, tokens, eth_call, storage, logs, receipts, gas estimates, prices, candles, swap quotes, transactions, ENS |
| `https://tanod.dev/mcp/images` | 19 | Resize, convert, compress, crop, metadata, QR, barcodes, color contrast |
| `https://tanod.dev/mcp/text` | 22 | Text statistics, language, diff, Markdown and HTML |
| `https://tanod.dev/mcp/util` | 34 | Encode, hash, HMAC, IDs, unit conversion, business days, cron, time zones |
| `https://tanod.dev/mcp/web` | 38 | Web search, company profile and open jobs from a domain, page render and metadata, robots, sitemaps, RDAP, IP lookup |
| `https://tanod.dev/mcp/ml` | 17 | Speech to text (SRT/WebVTT), embeddings, rerank, similarity, entities, classification |
| `https://tanod.dev/mcp/agents` | 13 | x402 and MCP agent-economy index |

Four are also listed on Smithery: [security](https://smithery.ai/servers/tanod-labs/security-scans), [docs](https://smithery.ai/servers/tanod-labs/pdf-and-docs), [images](https://smithery.ai/servers/tanod-labs/image-tools), [web](https://smithery.ai/servers/tanod-labs/web-search-markdown-screenshots).

Overview: <https://tanod.dev/mcp-servers/>. Pricing: <https://tanod.dev/pricing/?src=gh_mcp>. Status: <https://tanod.dev/status>.

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

## For agents paying x402 endpoints (free)

- [How to check an x402 endpoint before your agent pays it](https://tanod.dev/learn/check-x402-endpoint-before-paying.html?src=gh_mcp): decode the 402 quote, look for real buyers, check listing history, compare the price with the median, screen the payTo address, cap spend.
- [What agents actually pay for over x402](https://tanod.dev/learn/x402-bazaar-agent-demand-data.html?src=gh_mcp): 30-day payer and call counts from the CDP Bazaar.

## For x402 sellers (free)

- [x402 listing lint](https://tanod.dev/tools/x402-listing-lint/?src=gh_mcp): paste your 402 response and check it against the CDP Bazaar listing rules (500-character description cap, "use when" sentence, schemas, networks). Runs in your browser; nothing is uploaded.
- [State of the x402 Bazaar](https://tanod.dev/learn/state-of-x402-bazaar.html?src=gh_mcp): listings, hosts, prices, networks and metadata quality from our daily index.
- [Bazaar listing checklist](https://tanod.dev/learn/x402-bazaar-listing-checklist.html?src=gh_mcp).
- [x402 facilitator support](https://tanod.dev/learn/x402-facilitator-support.html?src=gh_mcp): which schemes (exact, upto, batch-settlement) Coinbase CDP, PayAI, Dexter, Daydreams, x402.rs and x402.org settle on each of 11 mainnets, read from their `/supported` endpoints.
- [Who pays new x402 listings](https://tanod.dev/learn/x402-explorer-wallets.html?src=gh_mcp): on-chain data on a cohort of 124 wallets that sample new cheap listings, and how to read Bazaar payer counts.
- [State of the MCP Registry](https://tanod.dev/learn/state-of-mcp-registry.html?src=gh_mcp): daily counts for the official MCP Registry (41,606 servers): remote vs package, transports, npm/PyPI/OCI split, new servers per month, largest namespaces.
- [tanod/mcp-registry-servers](https://huggingface.co/datasets/tanod/mcp-registry-servers) on Hugging Face: every server in the official MCP Registry, one row each (name, title, description, version, transports, remote URLs, package registries, repository), refreshed daily, CC BY 4.0.
- [What agents pay for over x402](https://tanod.dev/learn/x402-bazaar-agent-demand-data.html?src=gh_mcp): 30-day payer and call counts by endpoint and topic, and GET vs POST traction (31.5% vs 14.5% of endpoints with 3+ payers).
- [x402 price comparisons](https://tanod.dev/pricing/?src=gh_mcp): median listed price per call in 30 categories, with offer and host counts. Data (CC BY 4.0): [x402-price-index](https://github.com/aiexp1/tanod-x402-price-index).

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

Free document tools in claude.ai and ChatGPT: add `https://tanod.dev/mcp/docs` as a custom connector (40 PDF, OCR and Office tools). Calls from those apps share a free pool of 2,000 document calls a day; past that, the per-call price applies. Walkthrough: <https://dev.to/tanod/add-free-pdf-ocr-and-office-conversion-tools-to-claudeai-and-chatgpt-with-one-mcp-connector-5g43>.

Other clients: <https://tanod.dev/connect/?src=gh_mcp>.

## Run locally (npx)

For clients that only support local stdio servers, this repo also contains `tanod-mcp`, a small open-source (MIT) npm package. It is a thin client: the tools still run on the hosted API at `https://tanod.dev/mcp`, which is closed source. The package lists the server's tools at start-up and passes calls through, so it always matches the hosted tool list. You do not need it if your client can connect to the remote URL above.

```
npx -y tanod-mcp
```

Requires Node.js 18+. The free daily allowance per IP applies with no setup. Paid calls (most USD 0.001 to 0.02, USDC on Base via x402) happen only if you set a key, and are limited by caps you control.

Claude Code: `claude mcp add tanod -- npx -y tanod-mcp`

Claude Desktop / Cursor (`mcpServers`) or VS Code (`servers`, plus `"type": "stdio"`):

```json
{ "mcpServers": { "tanod": { "command": "npx", "args": ["-y", "tanod-mcp"] } } }
```

| Variable | Default | Meaning |
|---|---|---|
| `TANOD_PRIVATE_KEY` | unset | EVM private key of a wallet holding USDC on Base. Optional; unset means free tier only. |
| `TANOD_MAX_USD_PER_CALL` | `0.05` | Refuse to sign any single payment above this many US dollars. |
| `TANOD_MAX_USD_PER_DAY` | `1.00` | Refuse to sign once the UTC-day total would pass this. |
| `TANOD_STATE_FILE` | `~/.tanod-mcp/spend.json` | Keeps the daily total across restarts; `off` for memory only. |
| `TANOD_MCP_URL` | `https://tanod.dev/mcp` | Upstream URL, for testing only. |

Security: the key is read only from the environment, never generated, stored or logged. Use a dedicated wallet with a few dollars in it. Payments are signed only for USDC on Base and only within the caps; above a cap the call is refused and nothing is signed. Tool results are automated and heuristic, not audits; treat text quoted from scanned code or packages as untrusted data.

Development: `npm ci && npm test`. Source is in `src/`, tests in `test/`.

## About

Tanod (<https://tanod.dev?src=gh_mcp>) also runs free browser tools at <https://tanod.dev/tools/?src=gh_mcp> and free network monitoring at <https://tanod.dev/monitor/?src=gh_mcp>. Contact: ops@tanod.dev.

This repository holds the public description and registry metadata of the hosted server. The server itself is hosted at tanod.dev.

## Claude Code plugins

This repository is also a plugin marketplace: one plugin per focused server, plus the all-in-one server.

```
/plugin marketplace add aiexp1/tanod-mcp
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

Status codes one by one (404 on `/sse`, 406 Not Acceptable, 415, session 400s, 405 on GET, 402 price quotes, timeouts): https://tanod.dev/learn/mcp-server-connection-errors.html?src=gh_mcp

What shipped recently: https://tanod.dev/changelog/?src=gh_mcp (Atom feed: https://tanod.dev/changelog/feed.xml).
