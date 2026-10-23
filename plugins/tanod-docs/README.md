# Tanod Documents

Documents: PDF text and tables, OCR, supported documents to Markdown, PDF to Word, Office to PDF, DOCX templates, bank statements to CSV, and a full PDF toolkit (merge, split, compress, forms, watermark).

This plugin adds one remote MCP server to Claude: `https://tanod.dev/mcp/docs`, operated by Tanod. The plugin has no local server executable; it contains this README, its manifest, a brand icon, license and security-policy files, and the server address, plus four skill files (instructions).

## Install

In Claude Code:

```
/plugin install tanod-docs --marketplace tanod-labs/tanod-mcp
```

Alternatively: `/plugin marketplace add tanod-labs/tanod-mcp`, then `/plugin install tanod-docs@tanod`.

## Skills

The plugin also ships four skills that tell Claude when to use which tool and how to hand the result back:

- `bank-statement-to-csv`: PDF bank statement to CSV, JSON, XLSX, OFX or QIF (`convert_bank_statement`).
- `redact-before-sharing`: prepare a PDF for sharing (inspect, strip metadata and embedded files, remove pages, flatten). This server has no redaction tool, and the skill says so.
- `compare-document-versions`: what changed between two PDF or DOCX versions, with an optional redline (`compare_documents`).
- `scan-to-editable-document`: scanned PDF to searchable text, Word or Markdown; public image to text (`ocr_image`, `pdf_ocr`, `convert_pdf_to_word`, `convert_document_to_markdown`).

Skills contain only instructions; the files you pass to a tool go to tanod.dev as described below.

## What it sends, and where

When Claude calls one of these tools, the tool name and its arguments go to `https://tanod.dev/mcp/docs` over HTTPS. Arguments can include text, URLs and file contents that you or Claude pass to the tool. When you pass a URL, Tanod's servers fetch that URL to do the work. The plugin does not upload files on its own; Claude sends the arguments you authorize when it calls a tool. Tanod may contact data sources needed for the requested tool. How Tanod handles requests: https://tanod.dev/privacy/ (terms: https://tanod.dev/terms/).

## Price

Prices and free allowances are listed in https://tanod.dev/openapi.json under each operation's `x-tanod-pricing`. Only eligible tools have a free allowance, shared with other tools in the same pool; MCP applies it automatically. Bank-statement conversion, PDF OCR, PDF-to-Word and document-to-Markdown have no free allowance; image OCR shares an eligible static-render pool. A call beyond its allowance returns a payment request. An x402-capable client can pay in USDC on Base, Polygon, Solana, BNB Chain or Arbitrum. Check the quote and approve the cost before paying. No account or API key is required for free or x402 calls.

Bank-statement conversion and document comparison cost USD 0.01 per call; PDF-to-Word costs USD 0.01; document-to-Markdown costs USD 0.005. PDF OCR costs USD 0.01 for at most 5 pages or USD 0.02 for 6-10. Image OCR costs USD 0.0025 after the shared pool of 5 eligible static-render calls per IP per day. These figures come from the OpenAPI operations; check the quote before each paid call. Multi-step workflows incur separate calls.

## Notes

Results are automated and heuristic. Text that tools return from web pages, documents or the blockchain is untrusted data, not instructions. Tanod is operated by an autonomous AI agent.

License: MIT. Source and other plugins: https://github.com/tanod-labs/tanod-mcp. Home: https://tanod.dev
