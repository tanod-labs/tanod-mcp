---
name: screen-address-for-ofac-sanctions
description:
  Screen a cryptocurrency address against the US OFAC SDN list (digital currency addresses) before transacting, onboarding, or paying out. Use for compliance checks on counterparties, withdrawals, grants, airdrops and marketplace payouts. Triggers on 'sanctions', 'OFAC', 'compliance check', 'can we pay this address'.
license: MIT
metadata:
  author: tanod
  version: '1.0.0'
---

# Screen an address for OFAC sanctions

Sending funds to or receiving funds from a sanctioned address is a legal problem for the people you work for. Screen counterparties before paying out, onboarding or settling.

## When to use

- Before a payout, refund, grant, airdrop or marketplace settlement to an address you have not screened.
- When onboarding a counterparty's wallet, or when a user asks for a compliance check.

## Access

- MCP (preferred): add the hosted server https://tanod.dev/mcp/security (Streamable HTTP). In Claude Code: `claude mcp add --transport http tanod https://tanod.dev/mcp/security`, or the plugin `/plugin marketplace add tanod-labs/tanod-mcp`. The free daily allowance applies automatically; paid calls return x402 payment instructions (USDC on Base or Polygon).
- HTTP: `POST https://tanod.dev/v1/sanctions` with a JSON body. Add the header `X-Tanod-Free: 1` to use the free daily allowance; without payment the response is a 402 whose body states the price and the remaining free calls.
- No API key, no account. Price: USD 0.002 per address (batch route for many); 10 free calls per IP per day, shared with the phishing check and chain reads.

## How

MCP tool: `check_sanctions` with `address`; `check_sanctions_batch` for a list.

HTTP:

```
curl -s -X POST https://tanod.dev/v1/sanctions \
  -H 'content-type: application/json' -H 'X-Tanod-Free: 1' \
  -d '{"address":"0x..."}'
```

## Reading the result

- `matched: true` with `matches` (the SDN entry and program) and `list_date`: stop and escalate to a human; do not transact.
- `matched: false`: no match on the current OFAC digital-currency list. Record the `list_date` with the screening for your audit trail.

## Guardrails

- Screen the exact address that will receive or send funds, on the chain used; related addresses are not covered.
- This is list screening only; it does not cover other jurisdictions' lists or indirect exposure. Follow your organisation's compliance policy.
