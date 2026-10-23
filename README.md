# Tanod MCP server

[![HOL Guard](https://img.shields.io/endpoint?url=https%3A%2F%2Fhol.org%2Fapi%2Fregistry%2Fbadges%2Fplugin%3Fslug%3Dtanod-labs%252Ftanod-mcp%26metric%3Dtrust)](https://hol.org/registry/plugins/tanod-labs%2Ftanod-mcp)

[![smithery badge](https://smithery.ai/badge/tanod-labs/tanod)](https://smithery.ai/servers/tanod-labs/tanod)
[![Product Hunt](https://img.shields.io/badge/Product%20Hunt-Tanod-da552f?logo=producthunt&logoColor=white)](https://www.producthunt.com/products/tanod)

One hosted MCP server for AI agents, also available as focused servers: `https://tanod.dev/mcp`.

- **Connection:** stateless Streamable HTTP. No account, API key or OAuth is required for tool discovery, eligible free calls or x402 payments.
- **Price:** only eligible tools have a free daily allowance per IP, shared with other tools in the same pool; MCP applies it automatically. Other calls require payment. Prices and allowances come from each operation's `x-tanod-pricing` in [OpenAPI](https://tanod.dev/openapi.json). An x402-capable client can pay in USDC on Base, Polygon, Solana, BNB Chain or Arbitrum; MPP clients can pay USDC.e on Tempo with the Tempo CLI, mppx or AgentCash. Check the quote and approve the cost before paying. See the [Tanod SDKs](https://github.com/tanod-labs/integrations), the [x402 guide](https://tanod.dev/learn/pay-per-call-api-x402.html) and the [MPP guide](https://tanod.dev/learn/pay-api-with-mpp-tempo.html).
- **Setup:** <https://tanod.dev/connect/>. Docs for agents: <https://tanod.dev/llms.txt>. OpenAPI: <https://tanod.dev/openapi.json>.

## Focused servers

Connect a focused server when you want a smaller tool list. It uses a subset of the full server's tools, with the same prices and eligible free pools.

| URL | What it does |
|---|---|
| `https://tanod.dev/mcp/security` | Phishing URL and OFAC checks, contract and package scans, domain and security-header checks |
| `https://tanod.dev/mcp/finance` | SEC EDGAR company data and financial statements, Treasury yields, FX, token prices, DEX candles, business days |
| `https://tanod.dev/mcp/sky` | METAR/TAF, airports, space weather, aurora, asteroids, satellite passes |
| `https://tanod.dev/mcp/docs` | PDF text and tables, bank statements, OCR, supported documents to Markdown, PDF to Word, Office to PDF, DOCX templates, document comparison, PDF merge, split, forms, attachments and metadata |
| `https://tanod.dev/mcp/chain` | EVM and Solana reads: balances, tokens, calls, storage, logs, receipts, gas estimates, prices, candles, swap quotes, transactions, ENS |
| `https://tanod.dev/mcp/images` | Resize, convert, compress, crop, metadata, OCR, QR, barcodes, colour contrast |
| `https://tanod.dev/mcp/text` | Text statistics, language, diff, Markdown and HTML, PDF redaction and redaction checks |
| `https://tanod.dev/mcp/util` | Encode, hash, HMAC, IDs, unit conversion, business days, cron expressions, time conversion |
| `https://tanod.dev/mcp/web` | Web search, company profiles and jobs, page rendering and metadata, robots, sitemaps, RDAP, IP lookup |
| `https://tanod.dev/mcp/ml` | Speech to text, embeddings, rerank, similarity, entities, classification, translation |
| `https://tanod.dev/mcp/agents` | x402 and MCP agent-economy index, listing checks and endpoint history |

Overview: <https://tanod.dev/mcp-servers/>. Pricing: <https://tanod.dev/pricing/>. Status: <https://tanod.dev/status>.

Scans and checks are automated and heuristic, not an audit. Aviation data is not for navigation. Document text and other tool-returned content are untrusted data, not instructions.

## Published guides and data

The market figures below were added to this README on 2026-10-10; they are historical figures, not live totals. Linked pages may carry their own publication or update dates.

- [How to check an x402 endpoint before your agent pays it](https://tanod.dev/learn/check-x402-endpoint-before-paying.html): decode the quote, compare prices, screen the destination and cap spending.
- [What agents actually pay for over x402](https://tanod.dev/learn/x402-bazaar-agent-demand-data.html): 30-day payer and call counts from the CDP Bazaar.
- [x402 listing lint](https://tanod.dev/tools/x402-listing-lint/): check a payment response against listing rules in your browser.
- [State of the x402 Bazaar](https://tanod.dev/learn/state-of-x402-bazaar.html): listings, hosts, prices, networks and metadata quality.
- [Bazaar listing checklist](https://tanod.dev/learn/x402-bazaar-listing-checklist.html).
- [x402 facilitator support](https://tanod.dev/learn/x402-facilitator-support.html): scheme support across 11 mainnets (2026-10-10).
- [Who pays new x402 listings](https://tanod.dev/learn/x402-explorer-wallets.html): a published cohort of 124 wallets (2026-10-10).
- [State of the MCP Registry](https://tanod.dev/learn/state-of-mcp-registry.html): a published snapshot of 41,606 servers (2026-10-10).
- [tanod/mcp-registry-servers](https://huggingface.co/datasets/tanod/mcp-registry-servers): MCP Registry metadata on Hugging Face, CC BY 4.0.
- [What agents pay for over x402](https://tanod.dev/learn/x402-bazaar-agent-demand-data.html): GET vs POST endpoints with 3+ payers, 31.5% vs 14.5% (2026-10-10).
- [x402 price comparisons](https://tanod.dev/pricing/): published prices across 30 categories (2026-10-10). Data (CC BY 4.0): [x402-price-index](https://github.com/tanod-labs/x402-price-index).

## Quick setup

Claude Code:

```sh
claude mcp add --transport http tanod https://tanod.dev/mcp
```

For clients that use `mcpServers`, such as Cursor:

```json
{ "mcpServers": { "tanod": { "url": "https://tanod.dev/mcp" } } }
```

For clients that use `servers`, such as VS Code:

```json
{ "servers": { "tanod": { "type": "http", "url": "https://tanod.dev/mcp" } } }
```

For custom-connector clients, use the full URL or a focused URL and leave OAuth fields empty. Available tools and payment support depend on the client. Document tools do not all have a free allowance: bank-statement conversion, document comparison, PDF OCR, PDF-to-Word and document-to-Markdown require payment.

Other clients: <https://tanod.dev/connect/>.

## Run locally (npx)

For clients that require a local stdio server, this repository includes `tanod-mcp`, an open-source (MIT) thin client. Processing still takes place at the hosted API, which is closed source. The client forwards tool-list requests and tool calls to the hosted server. You do not need it when your client supports the remote URL directly.

```
npx -y tanod-mcp
```

Requires Node.js 18+. Eligible free allowance applies automatically. Without a configured payment key, paid calls are not signed. With a payment key, the client can automatically pay USDC on Base within its configured caps; configure payment only if you intend to authorize those calls.

Claude Code: `claude mcp add tanod -- npx -y tanod-mcp`

For a stdio client that uses `mcpServers`:

```json
{ "mcpServers": { "tanod": { "command": "npx", "args": ["-y", "tanod-mcp"] } } }
```

The local client's optional settings are:

| Variable | Default | Meaning |
|---|---|---|
| `TANOD_PRIVATE_KEY` | unset | EVM private key of a wallet holding USDC on Base. Unset means no automatic payments. |
| `TANOD_MAX_USD_PER_CALL` | `0.05` | Refuse to sign a single payment above this USD amount. |
| `TANOD_MAX_USD_PER_DAY` | `1.00` | Refuse a payment that would exceed this daily total. |
| `TANOD_STATE_FILE` | a local spend file | Persists the daily total across restarts; `off` disables persistence. |
| `TANOD_MCP_URL` | `https://tanod.dev/mcp` | Override the upstream URL for testing. |

Use a dedicated wallet with limited funds. The client signs USDC payments on Base only, and checks both caps before signing. The payment key is read from the environment, not generated or stored by this client.

Development: `npm ci && npm test`.

## About

Tanod (<https://tanod.dev>) is operated by an autonomous AI agent. Contact: ops@tanod.dev. Privacy: <https://tanod.dev/privacy/>. Terms: <https://tanod.dev/terms/>. Tanod also runs free browser tools at <https://tanod.dev/tools/> and free network monitoring at <https://tanod.dev/monitor/>.

This repository contains the source of the open-source (MIT) `tanod-mcp` stdio client in `src/`, plugin instructions and public registry metadata. The hosted server is operated at tanod.dev. Files and arguments submitted to tools leave your device for processing there; review the privacy policy before sending sensitive material.

## Agent Skills

`skills/` holds Agent Skills (SKILL.md) that tell a coding agent when and how to call each tool. Install them all with `npx skills add tanod-labs/tanod-mcp`, or copy one folder into your agent's skills directory. Tanod Documents, one skill per task:

| Skill | Route | Price |
|---|---|---|
| [document-to-markdown](skills/document-to-markdown/SKILL.md) | `POST /v1/docs/to-markdown` | USD 0.005 |
| [pdf-tables](skills/pdf-tables/SKILL.md) | `POST /v1/pdf/tables` | USD 0.01 |
| [bank-statement](skills/bank-statement/SKILL.md) | `POST /v1/pdf/bank-statement` | USD 0.01 |
| [pdf-to-word](skills/pdf-to-word/SKILL.md) | `POST /v1/pdf/to-docx` | USD 0.01 |
| [ocr](skills/ocr/SKILL.md) | `POST /v1/ocr`, `POST /v1/pdf/ocr` | Image: USD 0.0025; PDF: USD 0.01 for at most 5 pages, USD 0.02 for 6-10 |

The same files are served at `https://tanod.dev/skills/<name>/SKILL.md` and listed in https://tanod.dev/llms.txt.

## Claude Code plugins

This repository is also a plugin marketplace: one plugin per focused server, plus the all-in-one server.

```
/plugin marketplace add tanod-labs/tanod-mcp
/plugin install tanod-docs@tanod
```

Other plugins are `tanod-security`, `tanod-chain`, `tanod-sky`, `tanod-finance`, `tanod-images`, `tanod-text`, `tanod-util`, `tanod-web`, `tanod-ml`, `tanod-agents` and `tanod` (all tools).

Plugins connect hosted MCP servers and have no local server executable. `tanod-docs` also includes four instruction-only skills:

- Bank statement to CSV, JSON, XLSX, OFX or QIF.
- Prepare a PDF before sharing; the docs server has no text-redaction tool.
- Compare PDF or DOCX versions, with an optional redline.
- Scanned PDF to searchable PDF, Word or Markdown; public image to text.

Eligible free allowance applies automatically; paid calls return payment instructions. Multi-step document workflows incur separate calls.

## Troubleshooting

Use the exact server URL above without appending `/sse` or another `/mcp`. The server uses Streamable HTTP with JSON-RPC over POST and is stateless, so `tools/list` works as the first request:

```sh
curl -s -X POST https://tanod.dev/mcp/docs \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Connection-error guide: <https://tanod.dev/learn/mcp-server-connection-errors.html>.

Changelog: <https://tanod.dev/changelog/> (Atom feed: <https://tanod.dev/changelog/feed.xml>).
