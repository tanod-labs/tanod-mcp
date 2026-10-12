---
name: pdf-to-word
description: Converts a PDF to a Word (.docx) file with Tanod Documents. Use when an agent must turn a PDF into a .docx for editing.
license: MIT
metadata:
  author: tanod
  version: '1.0.0'
---

# PDF to Word (Tanod Documents)

`POST /v1/pdf/to-docx` converts a PDF to .docx with LibreOffice. Price: USD 0.01 per call. Free allowance: none (PDF to Word is never free).

## Use when

- a PDF must be delivered as an editable Word file
- the file will be opened in Word or LibreOffice

## Use instead

- text for a model to read: `document-to-markdown`
- scanned PDF (no text to convert): run the `ocr` skill first
- tables only: `pdf-tables`

## Request

JSON body on `POST https://tanod.dev/v1/pdf/to-docx`. Files are sent as a URL or base64 in JSON; these routes do not take multipart/form-data.

- `url`: public http(s) URL of the PDF, at most 20 MB; or `pdf_base64`: the PDF as base64, at most 10 MB decoded.
- `pages` (optional): `N`, `N-M`, `N-`, `-M`, `last`; at most 50 pages per call.
- `output`: `base64` (default) or `url` (24-hour download link).

Example body: `{"url": "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"}`

```http
POST /v1/pdf/to-docx HTTP/1.1
Host: tanod.dev
content-type: application/json

{"url": "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"}
```

MCP alternative: connect to `https://tanod.dev/mcp` and call the tool `convert_pdf_to_word`. No free allowance on this tool.

## Payment

An unpaid request returns HTTP 402 with an x402 v2 challenge (USDC on Base, Polygon or Solana) and an MPP/Tempo `WWW-Authenticate: Payment` challenge. Pay it and repeat the request with the payment attached. No account or API key. Input errors (413, 415, 422) and worker failures (429, 502, 503, 504) are not charged.

## Response

`file` (`name`, `content_type`, `bytes`, `data_base64`), `input_pages`, `converted_pages`, `pages_without_text`, `warnings`, `fidelity_note`, `output_bytes`.

## Limits

- At most 50 pages per call (use `pages` for a long PDF), from a PDF of up to 500 pages.
- Layout fidelity varies: each text line is a positioned text box, tables are not rebuilt as Word tables, links are not kept.
- Output above 15 MB is a 413 output_too_large. A call that cannot finish in about 78 s is a 503.
- Encrypted input is a 422 pdf_encrypted.
