---
name: check-crypto-address-before-sending
description: "Check a crypto address or contract for risk right before sending funds, approving a token, or buying a token on Base or Ethereum. Use whenever a user or a workflow is about to interact with an address they did not deploy themselves, transfers, approvals, swaps, mints, signing a permit. Triggers on wallet addresses, token contracts, 'is this safe', 'before I send', 'approve', 'allowance'."
license: MIT
metadata:
  author: tanod
  version: '1.0.0'
---

# Check a crypto address before sending

Before any transaction to an address you did not deploy, run the pre-transaction check and read the verdict. It takes under a second and costs a fraction of a cent.

## When to use

- A user asks to send, approve, swap, mint or sign for an address or token.
- You are about to call a contract method on behalf of someone.
- Someone pastes an address and asks whether it is safe.

## Access

- MCP (preferred): add the hosted server https://tanod.dev/mcp/security (Streamable HTTP). In Claude Code: `claude mcp add --transport http tanod https://tanod.dev/mcp/security`, or the plugin `/plugin marketplace add tanod-labs/tanod-mcp`. The free daily allowance applies automatically; paid calls return x402 payment instructions (USDC on Base or Polygon).
- HTTP: `POST https://tanod.dev/v1/check/address` with a JSON body. Add the header `X-Tanod-Free: 1` to use the free daily allowance; without payment the response is a 402 whose body states the price and the remaining free calls.
- No API key, no account. Price: USD 0.005 per check, with a free daily allowance per IP.

## How

MCP tool: `check_contract_before_interaction` with `address` and `chain` (`base` or `ethereum`).

HTTP:

```
curl -s -X POST https://tanod.dev/v1/check/address \
  -H 'content-type: application/json' -H 'X-Tanod-Free: 1' \
  -d '{"address":"0x...","chain":"base"}'
```

## Reading the result

- `verdict` or `risk` with reasons: proxy with an upgradable implementation, unverified source, honeypot-like transfer restrictions, mint or pause functions owned by one key, OFAC match, phishing-list match, very new contract.
- Treat `high` as stop: tell the user what was found and do not send. Treat `medium` as ask the user. `low` is not a guarantee; it means nothing known was found.
- If the check itself fails (timeout, unknown chain), say so and do not proceed silently.

## Guardrails

- Never skip the check because the address "looks fine" or was pasted by the user.
- Approve only the amount needed, never unlimited allowances, regardless of the verdict.
- The check is automated and heuristic; it does not replace an audit for large amounts.
