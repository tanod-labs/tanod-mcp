import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { SpendCaps } from "./caps.js";

export const VERSION = "0.1.0";
export const DEFAULT_URL = "https://tanod.dev/mcp";
/** Base mainnet (CAIP-2). Payments are only ever signed for USDC on this network. */
const PAYMENT_META_KEY = "x402/payment";
export const BASE_NETWORK = "eip155:8453";

export interface ProxyOptions {
  url: string;
  /** EVM private key (0x...), or undefined for free-tier only. Never logged. */
  privateKey?: string;
  caps: SpendCaps;
  log?: (msg: string) => void;
}

interface Accept {
  network?: string;
  amount?: string;
  maxAmountRequired?: string;
  [k: string]: unknown;
}

function pickAccept(accepts: Accept[]): Accept | undefined {
  return accepts.find((a) => a.network === BASE_NETWORK);
}

function acceptAmount(a: Accept): bigint {
  return BigInt(a.amount ?? a.maxAmountRequired ?? "0");
}

/** Return the PaymentRequired object if a tool result is an x402 payment request. */
export function extractPaymentRequired(res: any): { accepts: Accept[] } | null {
  if (!res || !res.isError) return null;
  const looks = (o: any) => o && typeof o === "object" && Array.isArray(o.accepts) && o.accepts.length > 0;
  if (looks(res.structuredContent)) return res.structuredContent;
  const t = res.content?.[0];
  if (t && t.type === "text") {
    try {
      const o = JSON.parse(t.text);
      if (looks(o)) return o;
    } catch {
      /* not JSON */
    }
  }
  return null;
}

const NO_KEY_HINT =
  "This call needs payment (free daily allowance used up). To pay, set the environment variable TANOD_PRIVATE_KEY to an EVM private key holding USDC on Base; " +
  "spending is limited by TANOD_MAX_USD_PER_CALL (default 0.05) and TANOD_MAX_USD_PER_DAY (default 1.00). The raw x402 payment request is in structuredContent.";

function errResult(text: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text }] };
}

export interface Proxy {
  server: Server;
  upstream: Client;
  close(): Promise<void>;
}

export async function createProxy(opts: ProxyOptions): Promise<Proxy> {
  const log = opts.log ?? (() => {});
  const upstream = new Client({ name: "tanod-mcp", version: VERSION }, { capabilities: {} });
  await upstream.connect(new StreamableHTTPClientTransport(new URL(opts.url)));

  // Payment side: only built when a key is present. We sign ourselves (so the raw upstream
  // result, including structuredContent and _meta, is returned) after our own cap check.
  let paymentClient: x402Client | undefined;
  if (opts.privateKey) {
    const account = privateKeyToAccount(opts.privateKey as `0x${string}`);
    paymentClient = x402Client.fromConfig({
      schemes: [{ network: BASE_NETWORK, client: new ExactEvmScheme(account) }],
      // Library-level guard in addition to ours: default assets only, per-call cap.
      spendControls: { maxAmountPerPayment: `$${opts.caps.maxPerCallUsd}` as any },
      paymentRequirementsSelector: (_v: number, accepts: any[]) => pickAccept(accepts) ?? accepts[0],
    } as any);
  }

  const initInfo = upstream.getServerVersion();
  const server = new Server(
    { name: "tanod-mcp", version: VERSION },
    {
      capabilities: { tools: { listChanged: false } },
      instructions:
        upstream.getInstructions() ??
        "Tanod tools (hosted API). Free daily allowance per IP; paid calls via x402 if TANOD_PRIVATE_KEY is set.",
    },
  );
  void initInfo;

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools: any[] = [];
    let cursor: string | undefined;
    do {
      const page = await upstream.listTools(cursor ? { cursor } : undefined);
      tools.push(...page.tools);
      cursor = page.nextCursor;
    } while (cursor);
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const first = (await upstream.callTool({ name, arguments: args ?? {} })) as CallToolResult;
    const pr = extractPaymentRequired(first);
    if (!pr) return first;

    if (!paymentClient) {
      return {
        ...first,
        content: [{ type: "text", text: NO_KEY_HINT }, ...(first.content ?? [])],
      } as CallToolResult;
    }

    // All state below is local to this call, so concurrent paid calls cannot interfere.
    const accept = pickAccept(pr.accepts);
    if (!accept) {
      return errResult("Payment not attempted: the server offered no USDC-on-Base payment option. Nothing was signed or charged.");
    }
    const amount = acceptAmount(accept);
    const decision = opts.caps.reserve(amount); // synchronous check-and-record: atomic per process
    if (!decision.ok) {
      return errResult(
        `Payment refused by local spending cap: ${decision.reason}. Raise the cap via env vars if you intend to pay. Nothing was signed or charged.`,
      );
    }
    let sent = false;
    try {
      const payload = await paymentClient.createPaymentPayload(pr as any);
      sent = true;
      const timeoutMs = Math.max(60, Number((payload as any).accepted?.maxTimeoutSeconds ?? 60)) * 1000;
      const paid = (await upstream.callTool(
        { name, arguments: args ?? {}, _meta: { [PAYMENT_META_KEY]: payload } },
        undefined,
        { timeout: timeoutMs },
      )) as CallToolResult;
      if (paid.isError && extractPaymentRequired(paid)) {
        // Server rejected the payment: nothing was settled by this call.
        opts.caps.release(amount);
        return errResult(`Payment was not accepted by the server. Nothing was charged. ${JSON.stringify(paid.content ?? []).slice(0, 500)}`);
      }
      log(`paid call: ${name}; spent today USD ${opts.caps.spentTodayUsd}`);
      return paid; // raw result: content, structuredContent, _meta (incl. x402/payment-response)
    } catch (e: any) {
      // If the request failed after the signed payment was sent, it may still have settled, so the
      // reservation is kept (conservative). It is released only if signing itself failed.
      if (!sent) opts.caps.release(amount);
      const msg = String(e?.message ?? e).replace(/0x[0-9a-fA-F]{64}/g, "0x[redacted]");
      return errResult(`Payment failed: ${msg}`);
    }
  });

  return {
    server,
    upstream,
    close: async () => {
      await server.close();
      await upstream.close();
    },
  };
}
