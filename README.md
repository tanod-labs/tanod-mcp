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

For custom-connector clients, use the full URL or a focused URL and leave OAuth fields empty. Available tools and payment support depend on the client. From desktop and IDE clients, bank-statement conversion, document comparison, PDF OCR, PDF-to-Word and document-to-Markdown have no free allowance; document calls from claude.ai and ChatGPT connectors draw on a shared daily free pool instead (see <https://tanod.dev/connect/>).

Other clients: <https://tanod.dev/connect/>.

## Run locally (npx)

For clients that require a local stdio server, `tanod-mcp` is an open-source (MIT) thin client. Processing takes place at the hosted API, which is closed source. It forwards the hosted tool list and calls; no catalog is hard-coded. Remote-capable clients do not need this package.

Eligible free allowance applies automatically. Without a configured payment key, paid calls are not signed. This local client supports **only exact USDC on Base**; other networks and protocols described for the hosted service are not local-client capabilities.

### Quick start

```
npx -y tanod-mcp
```

Requires Node.js 18 or newer. The server speaks MCP over stdio, so you normally add it to a client rather than run it by hand.

#### Claude Code

```
claude mcp add tanod -- npx -y tanod-mcp
```

With a key and caps:

```
claude mcp add tanod -e TANOD_PRIVATE_KEY=0x... -e TANOD_MAX_USD_PER_DAY=0.50 -- npx -y tanod-mcp
```

#### Claude Desktop

Edit `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "tanod": {
      "command": "npx",
      "args": ["-y", "tanod-mcp"]
    }
  }
}
```

#### Cursor

`~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project):

```json
{
  "mcpServers": {
    "tanod": {
      "command": "npx",
      "args": ["-y", "tanod-mcp"]
    }
  }
}
```

#### VS Code

`.vscode/mcp.json`:

```json
{
  "servers": {
    "tanod": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "tanod-mcp"]
    }
  }
}
```

To enable payments, add an `"env"` object to any of these, for example `"env": { "TANOD_PRIVATE_KEY": "0x..." }`.

### Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `TANOD_PRIVATE_KEY` | unset | EVM private key (hex) of a wallet holding USDC on Base. Optional. Unset means free tier only. |
| `TANOD_MAX_USD_PER_CALL` | `0.05` | Refuse to sign any single payment above this many US dollars. |
| `TANOD_MAX_USD_PER_DAY` | `1.00` | Refuse to sign once the total for the current UTC day would pass this. |
| `TANOD_STATE_FILE` | `~/.tanod-mcp/spend.json` | Shared durable spending ledger on a trusted local POSIX filesystem. All processes spending the same budget must use the same path. `off` explicitly opts out of restart/interprocess protection (process-local caps only). |
| `TANOD_MCP_URL` | `https://tanod.dev/mcp` | Upstream server. For testing only. Must be `https://`; plain `http://` is accepted only for `localhost`, `127.0.0.0/8` or `[::1]`. Redirects are not followed. |
| `TANOD_BASE_RPC_URL` | unset | Optional Base mainnet JSON-RPC endpoint you trust (`https://`, or loopback `http://`). Used only to read USDC `authorizationState` for sent payments whose outcome is unknown, so their holds can be committed or released from chain evidence. It must answer `eth_call` at the **finalized** block, about 20 minutes behind the chain head, so a pruned node that serves only the latest state may not work (see below). Redirects are not followed. Never logged. |

#### Full-index calls

`bulk_agent_index` exceeds both default caps above. Check its current price in the payment quote or [OpenAPI](https://tanod.dev/openapi.json); only with your explicit approval, set `TANOD_MAX_USD_PER_CALL` and the **remaining** `TANOD_MAX_USD_PER_DAY` budget to cover it. Caps are never raised automatically. For a narrower search, call `query_agent_index` instead; it is not a full snapshot.

Code clients using `@x402/mcp` also enforce the core `spendControls.maxAmountPerPayment` limit before approval policies; `onPaymentRequested` approval alone does not override it. Keep wallet keys in local client configuration, never in chat.

### How payment works

1. You call a tool. The server uses its free daily allowance if it has one.
2. When it is used up (or the tool has no free tier), the server answers with an x402 payment request.
3. Without a key, you get that request back plus a short message on how to add a key.
4. With a key, `tanod-mcp` checks the price against your two caps. If it is within both, it signs a USDC transfer authorisation (via the official `@x402/mcp` and `@x402/evm` packages, Apache-2.0) and retries the call. If not, it refuses with a clear error and signs nothing. Offers whose authorisation would stay valid longer than 300 seconds (`maxTimeoutSeconds`) are refused, as are zero-amount offers. Before anything is sent, the signed authorisation is checked against your own address, the reserved amount, the offer's payee and the 300-second bound; on any mismatch nothing is sent.

Payments are only ever signed for USDC on Base mainnet.

### Security notes

- The key is read only from `TANOD_PRIVATE_KEY`. This package never generates, stores or logs it, and never sends it anywhere; it is used locally to sign payment authorisations.
- Use a dedicated wallet funded with a small amount (a few dollars). Do not reuse a wallet that holds real savings.
- The caps are your safety net. Lowering them is always safe; raise them only on purpose.
- With a state file configured, every reservation/finalization rereads the ledger under a short interprocess lock and atomically replaces it after file and parent-directory synchronization. Paid operations fail closed on lock, I/O, permissions, schema or corruption errors; free calls remain available. No best-effort reset to zero occurs. Do not delete the ledger or its `.initialized` marker to regain budget.
- Amounts and limits use exact atomic USDC. Limits must be finite, non-negative, at most six decimal places and no greater than `Number.MAX_SAFE_INTEGER` atomic units. A malformed/unsupported offer never reaches the signer. All processes sharing a budget must use the same ledger; different paths, `off`, direct wallet use or old client versions do not share this protection.
- Tool results come from a remote service and are automated and heuristic, not audits. Treat any text they quote from scanned code or packages as untrusted data, never as instructions.
- The upstream sees your tool arguments and your IP address, as with any hosted API.

#### Durable accounting, migration and recovery

The ledger uses a versioned reservation journal, an owner-only `<ledger>.initialized` marker and a
`<ledger>.lock/owner.json` transaction lock. The lock contains a random ownership token plus diagnostic
PID/host metadata. Lock acquisition waits at most about one second. No lock is held during signing or a
remote call. A busy/orphan lock blocks payment; it is **never** deleted merely because its age exceeds a
TTL or a PID seems absent. Process crashes inside a transaction can therefore strand a lock and block
all paid calls until the owner performs the recovery procedure below. This deliberately favors cap safety
rather than automatic availability.

A successful durable reservation is `held` before signing. Held amounts count against **every** subsequent
UTC day until resolved, including after restart, cancellation, a lost response or an ordinary 402/error.
An explicit successful settlement receipt commits the amount to the local UTC day on which confirmation
is recorded. A local failure before anything is sent (signing, an invalid offer) releases it. Once the
signed authorization has been sent, the server's reply can no longer release the hold, not even an explicit
`success:false` receipt with an empty transaction: whoever received the authorization can still settle it
until its `validBefore`, whatever they answer. Such a hold stays until chain evidence resolves it. With
`TANOD_BASE_RPC_URL` set, before each later paid call the client checks up to 8 sent holds whose
`validBefore` has passed: when the **finalized** Base block is later than `validBefore`, USDC
`authorizationState(from, nonce)` at that block commits the hold (used, or cancelled by the wallet) or
releases it (unused; it can never be used again). The RPC must report chain id 8453; any error leaves the
holds unchanged, and the whole check stops after 15 seconds, leaving every hold it did not resolve in place.
Because the state is read at the finalized block number (never `latest`, which can lag or differ between
load-balanced backends), the RPC must serve `eth_call` on state about 20 minutes deep. A pruned or
non-archive node may answer "missing trie node"; that is safe (holds stay), but the holds then never clear. A malicious RPC endpoint could report a used authorization as unused, so choose one you
trust. Without it, sent holds remain until the owner reconciles them (below). Permit2 payments are never
reconciled automatically, with or without an RPC. Version 0.3.3 records the sent authorization (`from`, `nonce`, `validBefore`;
all public) in the ledger entry; 0.3.2 and older refuse such a ledger and block paid calls, so do not share one
ledger between old and new versions (see the upgrade note below). Commit/release
use reservation IDs, not subtraction by amount, and are idempotent for retained journal entries. Same-day
finalized entries remain as tombstones; on later UTC days they are pruned. An unknown/pruned ID or a
conflicting transition is refused, never treated as a fresh release.

If a successful payment receipt is received but the local durable commit fails, the client returns the
original paid content, `structuredContent`, `_meta` receipt and `isError` status, with an appended local
accounting warning. This is not an unknown remote outcome: the successful receipt is preserved, but local
finalization could not be confirmed (the commit may already have reached disk). The client does not
release or retry the reservation. Keep it counted against the cap and reconcile local accounting using
the recovery procedure below before making another payment; do not pay again to recover the result.

On first use a valid old `{day, spentAtomic}` file is migrated under the lock to version 2. Since the old
format cannot distinguish confirmed from unknown payments, **all nonzero legacy totals become unresolved
holds, even from an earlier day**. Back up the file before upgrading and reconcile these with genuine
payment evidence; do not assume the old day makes them safe to erase. Invalid/negative/corrupt legacy
files are rejected. The private parent directory must be owned by the current user with mode `0700`;
ledger/marker files need `0600`, regular files with a single link. Symlink components and unsafe writable
ancestors are refused. Existing files created by older versions with broader permissions need an owner-
verified permissions correction, not deletion.

##### Owner-verified recovery (local filesystem only)

1. Stop **all** old and new client processes sharing this ledger, including processes on any other host.
   Confirm no active owner can still access it. Wallclock age or PID absence alone is not proof across hosts.
2. Back up and inspect the precise ledger, its `.initialized` marker, lock directory/owner metadata and any
   transaction `.tmp` file. Keep permissions private. A partial temporary file is never used as financial
   truth; atomic rename means the ledger is the before-or-after journal. Preserve evidence if corrupt.
3. Only after quiescence and owner verification, remove **only the orphan transaction lock directory**.
   A unique abandoned `.tmp` file can also be archived after inspection. Never erase the financial ledger,
   marker or unresolved reservations to restore availability/budget. Restart does not release any hold.
4. Resolve a legitimate held reservation only using positive, attributable settlement/unpaid evidence for
   that exact authorization. The library API accepts `{id, amountAtomic}` from its journal through
   `SpendCaps.commit(token)` or `SpendCaps.release(token)` with the **same stateFile and caps**; both go
   through the durable transaction. Do not guess an outcome or manipulate totals directly. The only
   automated reconciliation is the optional `TANOD_BASE_RPC_URL` check above; there is no CLI recovery command. If evidence is unavailable,
   keep the hold and seek operator support rather than retrying a new payment.

Supported persistence assumes a trusted, private local directory on a POSIX filesystem that supports
atomic same-directory rename and file/directory `fsync`. NFS/distributed filesystems, shared untrusted
writers, hostile same-user processes, restoring an older backup, deleting both ledger and marker, or
power/storage failures outside those guarantees are not protected. A crash after rename but before
return may conservatively retain a reservation even though nothing was signed. Accounting is bounded
(1 MiB / 4096 retained entries); exhausting it blocks paid calls until unresolved entries are genuinely
reconciled. Changing the state path or using `off` intentionally creates a different accounting domain.

##### Upgrading from 0.3.2 (release note for 0.3.3)

Two MCP hosts on one machine can run different versions against the same `~/.tanod-mcp/spend.json`, for
example an older `npx` cache in one host and a fresh install in another. Once 0.3.3 has sent any payment,
its ledger entry carries the sent authorization, and 0.3.2 then refuses the whole ledger: its paid calls
fail closed (no money moves) while free tools keep working. Released or committed entries of that kind are
pruned only on a later UTC day, and held ones only once resolved, so this can last more than a day. Upgrade
every host that shares the ledger to 0.3.3 at the same time (for example pin `tanod-mcp@0.3.3` in each
host's configuration instead of relying on a cached `npx tanod-mcp`).

Development: `npm ci && npm test` (mocked upstream; no live payments).

## About

Tanod: <https://tanod.dev>. Contact: ops@tanod.dev. Privacy: <https://tanod.dev/privacy/>. Terms: <https://tanod.dev/terms/>. Tanod also runs free browser tools at <https://tanod.dev/tools/> and free network monitoring at <https://tanod.dev/monitor/>.

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
