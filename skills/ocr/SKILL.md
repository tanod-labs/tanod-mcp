---
name: ocr
description: Reads text from an image or scanned PDF with tesseract OCR, via Tanod Documents. Use when an agent must extract text from an image or make a scanned PDF searchable.
license: MIT
metadata:
  author: tanod
  version: '1.0.0'
---

# OCR (Tanod Documents)

`POST /v1/ocr` reads text from an image URL; `POST /v1/pdf/ocr` adds a text layer to a scanned PDF. Price: `/v1/ocr` USD 0.0025 per call, with 5 free eligible static renders per IP per UTC day (one pool shared with PDF text, page metadata, security headers, robots.txt, sitemaps and page links); `/v1/pdf/ocr` USD 0.01 for at most 5 pages, USD 0.02 for 6-10 pages, no free allowance.

## Use when

- a PNG, JPEG, WebP, GIF or single-page TIFF image must become text
- a scanned PDF must become searchable before conversion

## Use instead

- PDF that already has text: `document-to-markdown`
- tables from a PDF: `pdf-tables` (after OCR if scanned)
- scanned PDF to Word: OCR first, then `pdf-to-word`

## Request

JSON body on `POST https://tanod.dev/v1/ocr` (and `/v1/pdf/ocr`). Files are sent as a URL or base64 in JSON; these routes do not take multipart/form-data.

`/v1/ocr`:
- `url` (required): public http(s) URL of the image, at most 10 MB and 40 megapixels.
- `lang`: tesseract language code (installed: `eng`).

`/v1/pdf/ocr`:
- `url` or `pdf_base64` (at most 10 MB decoded); `lang` (`eng`); `dpi` 100-300 (default 200, at most 200 above 5 pages).
- `pages`: at most 10 pages, parts `N`, `N-M`, `-M`, `last`, e.g. `1-3,7`.
- `skip_text` (default true): leave pages that already have text alone.
- `output`: `base64` (default) or `url` (24-hour link).
- Example: `{"url": "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf", "pages": "1", "skip_text": false}`

Example body: `{"url": "https://tesseract-ocr.github.io/tessdoc/images/eurotext.png", "lang": "eng"}`

```http
POST /v1/ocr HTTP/1.1
Host: tanod.dev
content-type: application/json

{"url": "https://tesseract-ocr.github.io/tessdoc/images/eurotext.png", "lang": "eng"}

# free allowance (5 per IP per UTC day), image OCR only

POST /v1/ocr HTTP/1.1
Host: tanod.dev
content-type: application/json
X-Tanod-Free: 1

{"url": "https://tesseract-ocr.github.io/tessdoc/images/eurotext.png", "lang": "eng"}
```

MCP alternative: connect to `https://tanod.dev/mcp` and call `ocr_image` (image) or `pdf_ocr` (PDF). `ocr_image` has the 5-per-day free allowance, applied automatically over MCP; `pdf_ocr` has none.

## Payment

An unpaid request returns HTTP 402 with an x402 v2 challenge (USDC on Base, Polygon or Solana) and an MPP/Tempo `WWW-Authenticate: Payment` challenge. Pay it and repeat the request with the payment attached. No account or API key. Input errors (413, 415, 422) and worker failures (429, 502, 503, 504) are not charged.

## Response

`/v1/ocr`: `text`, `words`, `confidence_mean`, `width`, `height`, `format`, `lang`, `truncated`, `untrusted_content`.
`/v1/pdf/ocr`: `file` (searchable PDF, base64), `text` (at most 100,000 characters), `text_truncated`, `ocr_pages`, `skipped_has_text`, `lang`, `dpi`, `active_content_removed`, `output_bytes`.

## Limits

- Images: 10 MB and 40 megapixels; multi-page TIFF is a 422.
- PDFs: at most 10 pages per call (split longer ones), 10 MB as base64 (20 MB via `url`), output above 15 MB is a 413 output_too_large.
- Only English (`eng`) is installed.
- Encrypted PDFs are a 422 pdf_encrypted. A call that cannot finish in about 78 s is a 503.
