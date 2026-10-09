---
name: check-url-for-phishing
description:
  Check whether a URL or domain is a known phishing or scam site before opening it, fetching it, or passing it to a user. Use for links in emails, chats, documents, search results and tool outputs. Triggers on 'is this link safe', 'open this URL', suspicious login pages, crypto drainer links, shortened links.
license: MIT
metadata:
  author: tanod
  version: '1.0.0'
---

# Check a URL for phishing

Before fetching, opening or recommending a link from untrusted content, check its host against public phishing and scam domain lists (hundreds of thousands of domains, refreshed continuously).

## When to use

- A link arrives in an email, chat, ticket, document or tool result and you are about to open it or hand it to the user.
- A user asks whether a site is legitimate, or a page asks for a wallet connection, seed phrase or login.

## Access

- MCP (preferred): add the hosted server https://tanod.dev/mcp/security (Streamable HTTP). In Claude Code: `claude mcp add --transport http tanod https://tanod.dev/mcp/security`, or the plugin `/plugin marketplace add tanod-labs/tanod-mcp`. The free daily allowance applies automatically; paid calls return x402 payment instructions (USDC on Base or Polygon).
- HTTP: `POST https://tanod.dev/v1/check/url` with a JSON body. Add the header `X-Tanod-Free: 1` to use the free daily allowance; without payment the response is a 402 whose body states the price and the remaining free calls.
- No API key, no account. Price: USD 0.001 per check; 10 free calls per IP per day, shared with the sanctions screen and chain reads.

## How

MCP tool: `check_url_phishing` with `url` (a full URL or a bare domain). For many links at once use `check_urls_phishing_batch`.

HTTP:

```
curl -s -X POST https://tanod.dev/v1/check/url \
  -H 'content-type: application/json' -H 'X-Tanod-Free: 1' \
  -d '{"url":"https://example.com/login"}'
```

## Reading the result

- `listed: true` with `matches` naming the lists: treat as phishing, do not open, warn the user.
- `listed: false` means not on the lists today, not that the site is safe. Newly created phishing domains can be unlisted for hours.
- Also look at the host yourself: look-alike letters, odd TLDs, brand names in subdomains.

## Guardrails

- Check the final destination of shortened links (the lists match hosts, not the shortener).
- Never enter credentials or seed phrases on a page because a check came back clean.
