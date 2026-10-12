---
name: pdf-tables
description: Extracts the tables of a text PDF as JSON, CSV or XLSX with Tanod Documents. Use when an agent must pull tables out of a PDF for analysis.
license: MIT
metadata:
  author: tanod
  version: '1.0.0'
---

# PDF tables (Tanod Documents)

`POST /v1/pdf/tables` returns every table of the selected pages (ruled tables and tables found from text alignment). Price: USD 0.01 per call. Free allowance: none (PDF tables are never free).

## Use when

- a PDF holds tables that must become JSON, CSV or a spreadsheet
- rows and columns must be kept, not flattened to text

## Use instead

- whole document as Markdown: `document-to-markdown`
- scanned PDF (422 no_text_layer): run the `ocr` skill first
- a bank statement with reconciliation to OFX/QIF: `bank-statement`

## Request

JSON body on `POST https://tanod.dev/v1/pdf/tables`. Files are sent as a URL or base64 in JSON; these routes do not take multipart/form-data.

- `url`: public http(s) URL of the PDF, at most 20 MB; or `file_base64`: the PDF as base64, at most 10 MB decoded.
- `pages` (optional): `N`, `N-M`, `N-`, `-M`, `last`, comma separated, e.g. `1-5,9`; at most 200 pages per call; default all.
- `format`: `json` (default), `csv` (one file per table) or `xlsx` (one workbook, a sheet per table).
- `output`: `base64` (default, file inline) or `url` (24-hour download link).

Example body: `{"url": "https://tanod.dev/samples/tables-sample.pdf"}`

```http
POST /v1/pdf/tables HTTP/1.1
Host: tanod.dev
content-type: application/json

{"url": "https://tanod.dev/samples/tables-sample.pdf"}
```

MCP alternative: connect to `https://tanod.dev/mcp` and call the tool `extract_pdf_tables`. No free allowance on this tool.

## Payment

An unpaid request returns HTTP 402 with an x402 v2 challenge (USDC on Base, Polygon or Solana) and an MPP/Tempo `WWW-Authenticate: Payment` challenge. Pay it and repeat the request with the payment attached. No account or API key. Input errors (413, 415, 422) and worker failures (429, 502, 503, 504) are not charged.

## Response

`tables` (each with `name`, `page`, `bbox`, `method` lines|text, `header`, `rows` of strings), `table_count`, `pages_without_text`, `pages_processed`, `warnings`; for csv/xlsx the file comes back in `file` or `files`.

## Limits

- PDF up to 500 pages, 10 MB as base64 (20 MB via `url`), at most 200 selected pages per call (422 too_many_pages).
- Text PDFs only; pages with no table give 422 no_tables_found.
- More than 5 MB of JSON (15 MB of CSV/XLSX) is a 413 output_too_large.
- Encrypted input is a 422 pdf_encrypted.
