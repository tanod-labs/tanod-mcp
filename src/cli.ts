#!/usr/bin/env node
import { homedir } from "node:os";
import { join } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SpendCaps, parseUsdEnv } from "./caps.js";
import { createProxy, DEFAULT_URL } from "./proxy.js";

async function main(): Promise<void> {
  const env = process.env;
  const key = env.TANOD_PRIVATE_KEY?.trim() || undefined;
  if (key && !/^(0x)?[0-9a-fA-F]{64}$/.test(key)) {
    console.error("tanod-mcp: TANOD_PRIVATE_KEY is set but is not a 32-byte hex EVM private key. Ignoring is unsafe, so exiting.");
    process.exit(1);
  }
  const privateKey = key ? (key.startsWith("0x") ? key : `0x${key}`) : undefined;
  const caps = new SpendCaps({
    maxPerCallUsd: parseUsdEnv(env.TANOD_MAX_USD_PER_CALL, 0.05, "TANOD_MAX_USD_PER_CALL"),
    maxPerDayUsd: parseUsdEnv(env.TANOD_MAX_USD_PER_DAY, 1.0, "TANOD_MAX_USD_PER_DAY"),
    stateFile: env.TANOD_STATE_FILE === "off" ? undefined : env.TANOD_STATE_FILE || join(homedir(), ".tanod-mcp", "spend.json"),
  });
  const url = env.TANOD_MCP_URL || DEFAULT_URL;
  const proxy = await createProxy({ url, privateKey, caps, log: (m) => console.error(`tanod-mcp: ${m}`) });
  await proxy.server.connect(new StdioServerTransport());
  console.error(`tanod-mcp: connected to ${url}; ${privateKey ? "payments enabled (capped)" : "free tier only (no TANOD_PRIVATE_KEY)"}`);
  const stop = () => proxy.close().finally(() => process.exit(0));
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((e) => {
  console.error(`tanod-mcp: failed to start: ${String(e?.message ?? e).replace(/0x[0-9a-fA-F]{64}/g, "0x[redacted]")}`);
  process.exit(1);
});
