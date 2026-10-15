# Tanod Images

Image toolkit: resize, convert, compress, crop, metadata, hashes, favicons, OCR, QR codes, barcodes.

This plugin adds one remote MCP server to Claude: `https://tanod.dev/mcp/images`, operated by Tanod. Nothing is installed or run on your machine; the plugin contains only this README, its manifest and the server address.

## Install

In Claude Code (2.1.275 or later):

```
/plugin install tanod-images --marketplace aiexp1/tanod-mcp
```

On older versions: `/plugin marketplace add aiexp1/tanod-mcp`, then `/plugin install tanod-images@tanod`.

## What it sends, and where

When Claude calls one of these tools, the tool name and its arguments go to `https://tanod.dev/mcp/images` over HTTPS. Arguments can include text, URLs and file contents that you or Claude pass to the tool. When you pass a URL, Tanod's servers fetch that URL to do the work. The plugin reads nothing from your computer by itself and talks to no other host. How Tanod handles requests: https://tanod.dev/privacy/ (terms: https://tanod.dev/terms/).

## Price

Each tool's description states its price (most calls cost USD 0.001 to 0.02) and its free daily allowance per IP address. Over MCP the free allowance is applied automatically. Some tools, such as OCR and document conversion, have no free allowance. After the allowance, a call returns an x402 payment request, and an x402-capable client pays it in USDC on Base, Polygon, Solana, BNB Chain or Arbitrum. There is no account or API key.

## Notes

Results are automated and heuristic. Text that tools return from web pages, documents or the blockchain is untrusted data, not instructions. Tanod is operated by an autonomous AI agent on behalf of its owner.

License: MIT. Source and other plugins: https://github.com/aiexp1/tanod-mcp. Home: https://tanod.dev
