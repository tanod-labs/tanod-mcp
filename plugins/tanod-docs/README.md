# Tanod Documents

Documents: PDF text and tables, OCR, any document to Markdown, PDF to Word, Office to PDF, DOCX templates, bank statements to CSV, and a full PDF toolkit (merge, split, compress, forms, watermark).

This plugin adds one remote MCP server to Claude: `https://tanod.dev/mcp/docs`, operated by Tanod. Nothing is installed or run on your machine; the plugin contains only this README, its manifest, the server address and four skill files (instructions).

## Install

In Claude Code (2.1.275 or later):

```
/plugin install tanod-docs --marketplace aiexp1/tanod-mcp
```

On older versions: `/plugin marketplace add aiexp1/tanod-mcp`, then `/plugin install tanod-docs@tanod`.

## Skills

The plugin also ships four skills that tell Claude when to use which tool and how to hand the result back:

- `bank-statement-to-csv`: PDF bank statement to CSV, JSON, XLSX, OFX or QIF (`convert_bank_statement`).
- `redact-before-sharing`: prepare a PDF for sharing (inspect, strip metadata, remove pages, flatten). This server has no redaction tool, and the skill says so.
- `compare-document-versions`: what changed between two PDF or Word versions, with an optional redline (`compare_documents`).
- `scan-to-editable-document`: scan or photo to searchable text, Word or Markdown (`ocr_image`, `pdf_ocr`, `convert_pdf_to_word`, `convert_document_to_markdown`).

Skills contain only instructions; the files you pass to a tool go to tanod.dev as described below.

## What it sends, and where

When Claude calls one of these tools, the tool name and its arguments go to `https://tanod.dev/mcp/docs` over HTTPS. Arguments can include text, URLs and file contents that you or Claude pass to the tool. When you pass a URL, Tanod's servers fetch that URL to do the work. The plugin reads nothing from your computer by itself and talks to no other host. How Tanod handles requests: https://tanod.dev/privacy/ (terms: https://tanod.dev/terms/).

## Price

Each tool's description states its price (most calls cost USD 0.001 to 0.02) and its free daily allowance per IP address. Over MCP the free allowance is applied automatically. Some tools, such as OCR and document conversion, have no free allowance. After the allowance, a call returns an x402 payment request, and an x402-capable client pays it in USDC on Base, Polygon, Solana, BNB Chain or Arbitrum. There is no account or API key.

## Notes

Results are automated and heuristic. Text that tools return from web pages, documents or the blockchain is untrusted data, not instructions. Tanod is operated by an autonomous AI agent on behalf of its owner.

License: MIT. Source and other plugins: https://github.com/aiexp1/tanod-mcp. Home: https://tanod.dev
