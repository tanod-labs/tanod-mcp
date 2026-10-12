---
name: bank-statement
description: Reads a PDF bank statement into dated transactions and JSON, CSV, XLSX, OFX or QIF with Tanod Documents. Use when an agent must turn a bank statement PDF into transactions for bookkeeping or import.
license: MIT
metadata:
  author: tanod
  version: '1.0.0'
---

# Bank statement PDF (Tanod Documents)

`POST /v1/pdf/bank-statement` parses a text bank statement PDF into transactions and checks every row against the running balance. Price: USD 0.02 per call. Free allowance: none (bank statements are never free).

## Use when

- a PDF bank statement must become rows for bookkeeping, a spreadsheet or an OFX/QIF import
- each row should be reconciled against the balance column

## Use instead

- any other table in a PDF: `pdf-tables`
- scanned statement (422 no_text_layer): run the `ocr` skill first
- plain text of the statement: `document-to-markdown`

## Request

JSON body on `POST https://tanod.dev/v1/pdf/bank-statement`. Files are sent as a URL or base64 in JSON; these routes do not take multipart/form-data.

- `url`: public http(s) URL of the PDF, at most 20 MB; or `file_base64`: the PDF as base64, at most 10 MB decoded.
- `pages` (optional): `N`, `N-M`, `N-`, `-M`, `last`; at most 200 pages per call.
- `format`: `json` (default), `csv`, `xlsx` (Transactions and Summary sheets), `ofx` (OFX 1.0.2) or `qif` (dates MM/DD/YYYY).
- `output`: `base64` (default) or `url` (24-hour download link).

Example body: `{"url": "https://tanod.dev/samples/statement-sample.pdf"}`

```http
POST /v1/pdf/bank-statement HTTP/1.1
Host: tanod.dev
content-type: application/json

{"url": "https://tanod.dev/samples/statement-sample.pdf"}
```

MCP alternative: connect to `https://tanod.dev/mcp` and call the tool `convert_bank_statement`. No free allowance on this tool.

## Payment

An unpaid request returns HTTP 402 with an x402 v2 challenge (USDC on Base, Polygon or Solana) and an MPP/Tempo `WWW-Authenticate: Payment` challenge. Pay it and repeat the request with the payment attached. No account or API key. Input errors (413, 415, 422) and worker failures (429, 502, 503, 504) are not charged.

## Response

`transactions` (each with `date` ISO, `description`, `amount` signed, `balance`, `row_ok`, `note`), `opening_balance`, `closing_balance`, `total_in`, `total_out`, `currency`, `confidence` (0 to 1, a heuristic), `reconciliation`, `flagged_rows`, `date_order`, `warnings`; for csv/xlsx/ofx/qif the file is in `file`.

## Limits

- PDF up to 500 pages, at most 200 pages per call, 10 MB as base64 (20 MB via `url`).
- Text PDFs only; no transaction table is a 422 no_transactions_found.
- OFX and QIF need a full date on every row (else 422 dates_incomplete).
- Header words are recognised in English, German, Spanish, French, Hindi, Indonesian, Italian, Polish, Portuguese, Russian, Turkish and Vietnamese.
- Tanod does not log or store the statement.
