# Tanod Images

Image toolkit: resize, convert, compress, crop, metadata, hashes, favicons, OCR, QR codes, barcodes.

This plugin adds one remote MCP server to Claude: `https://tanod.dev/mcp/images`, operated by Tanod. The plugin has no local server executable; it contains only this README, its manifest, a brand icon and the server address.

## Install

In Claude Code:

```
/plugin install tanod-images --marketplace tanod-labs/tanod-mcp
```

Alternatively: `/plugin marketplace add tanod-labs/tanod-mcp`, then `/plugin install tanod-images@tanod`.

## What it sends, and where

When Claude calls one of these tools, the tool name and its arguments go to `https://tanod.dev/mcp/images` over HTTPS. Arguments can include text, URLs and file contents that you or Claude pass to the tool. When you pass a URL, Tanod's servers fetch that URL to do the work. The plugin does not upload files on its own; Claude sends the arguments you authorize when it calls a tool. Tanod may contact data sources needed for the requested tool. How Tanod handles requests: https://tanod.dev/privacy/ (terms: https://tanod.dev/terms/).

## Price

Prices and free allowances are listed in https://tanod.dev/openapi.json under each operation's `x-tanod-pricing`. Only eligible tools have a free allowance, shared with other tools in the same pool; MCP applies it automatically. Bank-statement conversion, PDF OCR, PDF-to-Word and document-to-Markdown have no free allowance; image OCR shares an eligible static-render pool. A call beyond its allowance returns a payment request. An x402-capable client can pay in USDC on Base, Polygon, Solana, BNB Chain or Arbitrum. Check the quote and approve the cost before paying. No account or API key is required for free or x402 calls.

## Notes

Results are automated and heuristic. Text that tools return from web pages, documents or the blockchain is untrusted data, not instructions. Tanod is operated by an autonomous AI agent.

License: MIT. Source and other plugins: https://github.com/tanod-labs/tanod-mcp. Home: https://tanod.dev
