---
name: scan-mcp-server-or-skill-before-installing
description: "Scan an MCP server, agent skill or plugin package for prompt injection, credential exfiltration, hidden instructions and dangerous code before installing or running it. Use when asked to install an MCP server, add a skill, run `npx`/`pip install` for an agent tool, or evaluate a package from npm, PyPI, GitHub or ClawHub. Triggers on 'install this MCP', 'add this skill', 'is this package safe'."
license: MIT
metadata:
  author: tanod
  version: '1.0.0'
---

# Scan an MCP server or skill before installing

Agent packages run with your tools and your credentials. Scan them first: the scanner reads every file as text in a sandbox and reports hidden instructions, injection attempts, secret exfiltration and dangerous commands.

## When to use

- Before installing any MCP server, skill, plugin or agent package from npm, PyPI, GitHub, ClawHub, skills.sh or a URL.
- When a user asks whether a package is safe, or asks you to run an unfamiliar tool.

## Access

- MCP (preferred): add the hosted server https://tanod.dev/mcp/security (Streamable HTTP). In Claude Code: `claude mcp add --transport http tanod https://tanod.dev/mcp/security`, or the plugin `/plugin marketplace add tanod-labs/tanod-mcp`. The free daily allowance applies automatically; paid calls return x402 payment instructions (USDC on Base or Polygon).
- HTTP: `POST https://tanod.dev/v1/scan/package` with a JSON body. Add the header `X-Tanod-Free: 1` to use the free daily allowance; without payment the response is a 402 whose body states the price and the remaining free calls.
- No API key, no account. Price: USD 0.02 per package (USD 0.05 for a whole repository or a large upload); 3 free scans per IP per day, shared with the other scanners.

## How

MCP tool: `scan_agent_package` with `source` (an npm or PyPI package name, a GitHub repository URL, a ClawHub slug or a direct URL) or `content_base64` for a local archive.

HTTP:

```
curl -s -X POST https://tanod.dev/v1/scan/package \
  -H 'content-type: application/json' -H 'X-Tanod-Free: 1' \
  -d '{"source":"npm:some-mcp-server"}'
```

## Reading the result

- `findings` with severity and the file and line: hidden prompt text, instructions to exfiltrate env vars or files, obfuscated code, network calls to unexpected hosts, shell execution, install-time scripts.
- Any `high` finding: do not install; show the user the finding with the file name.
- `medium`: show the user and ask. No findings: say the scan found nothing, not that the package is safe.

## Guardrails

- Scan the exact version you will install; a different version is a different package.
- Never paste your own secrets into a scan request.
- The scanner is static and heuristic; combine it with reading the package's README and permissions.
