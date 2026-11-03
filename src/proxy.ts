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
import { createPublicClient, getAddress, http, type PublicClient } from "viem";
import { SpendCaps, usdToAtomic, type Reservation, type SentAuthorization } from "./caps.js";

export const VERSION = "0.3.3";
export const DEFAULT_URL = "https://tanod.dev/mcp";
/** Base mainnet (CAIP-2). Payments are only ever signed for USDC on this network. */
const PAYMENT_META_KEY = "x402/payment";
export const BASE_NETWORK = "eip155:8453";
const BASE_CHAIN_ID = 8453;
/**
 * Longest authorization lifetime (EIP-3009 validBefore - now) this client signs. tanod.dev offers 300 s; longer
 * offers are refused so a sent authorization cannot stay redeemable for hours, and the paid call waits no longer.
 */
export const MAX_TIMEOUT_SECONDS = 300;
/** Sent holds checked on-chain per paid call (bounded RPC work before a new payment). */
const RECONCILE_BATCH = 8;
/** One overall bound on the on-chain check before a paid call (each RPC request also has its own 10 s timeout). */
export const RECONCILE_DEADLINE_MS = 15_000;

function loopback(host: string): boolean {
  return host === "localhost" || host === "[::1]" || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}
/** https:// only; plain http:// is accepted for loopback hosts (local testing) and nothing else. */
export function checkEndpointUrl(raw: string, name: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error(`${name} is not a valid URL`); }
  if (u.protocol === "https:" || (u.protocol === "http:" && loopback(u.hostname))) return u;
  throw new Error(`${name} must be an https:// URL (plain http:// is allowed only for localhost, 127.0.0.0/8 or [::1])`);
}

export interface ProxyOptions {
  url: string;
  /** EVM private key (0x...), or undefined for free-tier only. Never logged. */
  privateKey?: string;
  caps: SpendCaps;
  /**
   * Optional Base mainnet JSON-RPC URL chosen by the user (https, or loopback http). When set, held reservations
   * whose authorization was sent are settled against the chain: after a finalized block is past validBefore,
   * USDC authorizationState(from, nonce) decides commit (used) or release (never usable again). Never logged.
   */
  rpcUrl?: string;
  /** Overall deadline for the on-chain hold check before each paid call (default RECONCILE_DEADLINE_MS). For tests. */
  reconcileDeadlineMs?: number;
  log?: (msg: string) => void;
}

interface Accept {
  network?: string;
  amount?: string;
  maxAmountRequired?: string;
  [k: string]: unknown;
}

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
function validAccept(a: any): boolean {
  try {
    if (a?.scheme !== "exact" || a.network !== BASE_NETWORK || getAddress(a.asset) !== USDC ||
        // Zero is refused: a sent hold of any size may never clear, so free "payments" could fill the ledger.
        typeof a.amount !== "string" || !/^[1-9][0-9]{0,15}$/.test(a.amount) ||
        BigInt(a.amount) > BigInt(Number.MAX_SAFE_INTEGER) ||
        getAddress(a.payTo) === "0x0000000000000000000000000000000000000000" ||
        !Number.isSafeInteger(a.maxTimeoutSeconds) || a.maxTimeoutSeconds <= 0 || a.maxTimeoutSeconds > MAX_TIMEOUT_SECONDS ||
        (a.decimals !== undefined && a.decimals !== 6) ||
        (a.extra?.decimals !== undefined && a.extra.decimals !== 6)) return false;
    const method = a.extra?.assetTransferMethod ?? "eip3009";
    return ["eip3009", "permit2"].includes(method) &&
      (method !== "eip3009" || (a.extra?.name === "USD Coin" && a.extra?.version === "2"));
  } catch { return false; }
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

/** What the local side agreed to sign: our own account, the reserved amount and the selected offer's payTo. */
interface Expected { from: string; amountAtomic: string; payTo: string }
function sameAddress(x: unknown, y: string): boolean {
  try { return typeof x === "string" && getAddress(x) === getAddress(y); } catch { return false; }
}
const MISMATCH = "signed payment does not match the local account, reserved amount or selected payTo";
const LIFETIME = "signed authorization lifetime exceeds the local maxTimeoutSeconds bound";
/** EIP-3009 validBefore or Permit2 deadline: a positive decimal unix time no later than `max` (now + 300 s). */
function lifetimeWithin(t: unknown, max: number): boolean {
  return typeof t === "string" && /^[1-9][0-9]{0,15}$/.test(t) && Number(t) <= max;
}

/**
 * Check the signed payload against local truth before it leaves the process (a throw here releases the unsent
 * hold), and return the public parts of an EIP-3009 authorization for chain reconciliation. Permit2 payloads
 * return undefined: they are never reconciled on-chain and stay held.
 */
function sentAuthorization(payload: any, expected: Expected, maxValidBefore: number): SentAuthorization | undefined {
  const p = payload?.payload?.permit2Authorization;
  if (p && typeof p === "object") {
    if (!sameAddress(p.from, expected.from) || p.permitted?.amount !== expected.amountAtomic ||
        !sameAddress(p.permitted?.token, USDC) || !sameAddress(p.witness?.to, expected.payTo)) throw new Error(MISMATCH);
    if (!lifetimeWithin(p.deadline, maxValidBefore)) throw new Error(LIFETIME);
    return undefined;
  }
  const a = payload?.payload?.authorization;
  if (!a || typeof a !== "object") throw new Error("signed payment has an unknown payload shape");
  // `from` is the one reconciliation input not derived locally: a wrong one would query an unused (from, nonce).
  if (!sameAddress(a.from, expected.from) || a.value !== expected.amountAtomic || !sameAddress(a.to, expected.payTo)) throw new Error(MISMATCH);
  const auth = { from: a.from, nonce: a.nonce, validBefore: a.validBefore };
  if (!lifetimeWithin(auth.validBefore, maxValidBefore)) throw new Error(LIFETIME);
  return auth;
}

const AUTHORIZATION_STATE_ABI = [{
  type: "function", name: "authorizationState", stateMutability: "view",
  inputs: [{ name: "authorizer", type: "address" }, { name: "nonce", type: "bytes32" }],
  outputs: [{ name: "", type: "bool" }],
}] as const;

/**
 * Resolve sent holds from chain truth only. A hold is finalized only when the FINALIZED Base block's timestamp is
 * past the authorization's validBefore (no later block can include it) and USDC's authorizationState for that
 * exact (from, nonce) at that block says used (commit: paid, or cancelled by the wallet) or unused (release).
 * Any error, a wrong chain id, a not-yet-final expiry or the overall deadline leaves every unresolved hold in place.
 */
async function reconcileSentHolds(caps: SpendCaps, rpc: PublicClient, log: (m: string) => void, deadlineMs: number): Promise<void> {
  const nowS = Math.floor(Date.now() / 1000);
  const due = caps.sentHolds().filter(h => Number(h.authorization.validBefore) < nowS).slice(0, RECONCILE_BATCH);
  if (due.length === 0) return;
  // One deadline for the whole check: every RPC step races it, and once it fires no later answer is acted on.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`on-chain check exceeded its ${deadlineMs / 1000} s deadline`)), deadlineMs);
    timer.unref?.();
  });
  deadline.catch(() => { /* surfaced through step() */ });
  const step = <T>(p: Promise<T>): Promise<T> => Promise.race([p, deadline]);
  try {
    if (await step(rpc.getChainId()) !== BASE_CHAIN_ID) throw new Error("TANOD_BASE_RPC_URL is not Base mainnet (chain id 8453)");
    const block = await step(rpc.getBlock({ blockTag: "finalized" }));
    for (const h of due) {
      if (block.timestamp <= BigInt(h.authorization.validBefore)) continue;
      const used = await step(rpc.readContract({
        address: USDC, abi: AUTHORIZATION_STATE_ABI, functionName: "authorizationState",
        args: [getAddress(h.authorization.from), h.authorization.nonce as `0x${string}`], blockNumber: block.number,
      }));
      if (typeof used !== "boolean") throw new Error("unexpected authorizationState result");
      if (used) caps.commit(h.reservation); else caps.release(h.reservation);
      try { log(`on-chain check: held USD ${Number(h.reservation.amountAtomic) / 1e6} authorization ${used ? "was used; committed" : "expired unused; released"}`); } catch { /* observational */ }
    }
  } finally {
    clearTimeout(timer);
  }
}

export interface Proxy {
  server: Server;
  upstream: Client;
  close(): Promise<void>;
}

export async function createProxy(opts: ProxyOptions): Promise<Proxy> {
  const log = opts.log ?? (() => {});
  const upstreamUrl = checkEndpointUrl(opts.url, "TANOD_MCP_URL");
  const rpcUrl = opts.rpcUrl === undefined ? undefined : checkEndpointUrl(opts.rpcUrl, "TANOD_BASE_RPC_URL");
  const rpc = rpcUrl === undefined ? undefined : createPublicClient({
    // No redirects: a 30x could lead to plain http:// or another host, outside the https-only rule above.
    transport: http(rpcUrl.href, { timeout: 10_000, retryCount: 0, fetchOptions: { redirect: "error" } }),
  }) as PublicClient;
  // The RPC URL may carry a provider API key; library errors can quote it.
  const hideRpc = (text: string) => rpcUrl === undefined ? text :
    [opts.rpcUrl!, rpcUrl.href, rpcUrl.host].filter(Boolean).reduce((t, secret) => t.split(secret).join("[rpc]"), text);
  const upstream = new Client({ name: "tanod-mcp", version: VERSION }, { capabilities: {} });
  // No redirects on the POSTs that carry payments (the SDK spreads requestInit into each POST). Its optional GET
  // stream ignores requestInit but follows only same-origin redirects, which never downgrade https to http.
  await upstream.connect(new StreamableHTTPClientTransport(upstreamUrl, { requestInit: { redirect: "error" } }));

  // Payment side: only built when a key is present. We sign ourselves (so the raw upstream
  // result, including structuredContent and _meta, is returned) after our own cap check.
  let account: ReturnType<typeof privateKeyToAccount> | undefined;
  if (opts.privateKey) account = privateKeyToAccount(opts.privateKey as `0x${string}`);

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

    if (!account) {
      return {
        ...first,
        content: [{ type: "text", text: NO_KEY_HINT }, ...(first.content ?? [])],
      } as CallToolResult;
    }

    // A client/hook per invocation binds the durable reservation to the ACTUAL SDK-selected offer.
    // No transaction lock survives reserve/commit/release; signing/network waits are outside the lock.
    if (rpc) {
      // Before a new hold: try to settle earlier sent holds from chain truth. Failure only keeps them held.
      try { await reconcileSentHolds(opts.caps, rpc, log, opts.reconcileDeadlineMs ?? RECONCILE_DEADLINE_MS); }
      catch (e: any) { try { log(`on-chain hold check skipped: ${hideRpc(String(e?.shortMessage ?? e?.message ?? e)).replace(/0x[0-9a-fA-F]{64}/g, "0x[redacted]").slice(0, 200)}`); } catch { /* observational */ } }
    }
    let reservation: Reservation | undefined;
    let payTo: string | undefined;
    let sent = false;
    try {
      const paymentClient = x402Client.fromConfig({
        schemes: [{ network: BASE_NETWORK, client: new ExactEvmScheme(account) }],
        spendControls: { allowedAssets: [{ network: BASE_NETWORK, asset: USDC,
          maxAmountPerPayment: usdToAtomic(opts.caps.maxPerCallUsd).toString() }] },
        policies: [(version, accepts) => version === 2 ? accepts.filter(validAccept) : []],
      });
      paymentClient.onBeforePaymentCreation(async ({ selectedRequirements }) => {
        if (!validAccept(selectedRequirements) || reservation) return { abort: true, reason: "Invalid or repeated payment selection" };
        const decision = opts.caps.reserve(BigInt(selectedRequirements.amount));
        if (!decision.ok) return { abort: true, reason: decision.reason };
        reservation = decision.reservation;
        payTo = selectedRequirements.payTo;
      });
      const payload = await paymentClient.createPaymentPayload(pr as any);
      if (!reservation || payTo === undefined) throw new Error("Payment had no durable reservation");
      // The pinned SDK sets validBefore = its clock + maxTimeoutSeconds (<= MAX_TIMEOUT_SECONDS by validAccept).
      const auth = sentAuthorization(payload, { from: account.address, amountAtomic: reservation.amountAtomic, payTo },
        Math.floor(Date.now() / 1000) + MAX_TIMEOUT_SECONDS);
      if (auth) opts.caps.markSent(reservation, auth); // Durable before the authorization leaves the process.
      sent = true; // From here the authorization may be redeemed by whoever receives it, whatever they reply.
      const timeoutMs = Math.min(MAX_TIMEOUT_SECONDS, Math.max(60, Number(payload.accepted?.maxTimeoutSeconds ?? 60))) * 1000;
      const paid = (await upstream.callTool(
        { name, arguments: args ?? {}, _meta: { [PAYMENT_META_KEY]: payload } },
        undefined,
        { timeout: timeoutMs },
      )) as CallToolResult;
      const receipt = (paid._meta as any)?.["x402/payment-response"];
      // An error/402 alone is NOT evidence of no settlement. Only explicit protocol outcome counts.
      if (receipt?.success === true && receipt.network === BASE_NETWORK && typeof receipt.transaction === "string" && receipt.transaction.length > 0) {
        try {
          opts.caps.commit(reservation);
        } catch {
          // Settlement is known; only local finalization is uncertain (it may have reached disk).
          // Preserve the paid response and never release its reservation on a commit failure.
          return {
            ...paid,
            content: [...(paid.content ?? []), { type: "text", text:
              "Warning: local spend accounting failed after receiving a successful payment receipt; durable commit could not be confirmed. " +
              "The paid result and receipt are preserved. The reservation has not been released; keep it counted against the spending cap. " +
              "Do not make another payment until local accounting is reconciled." }],
          } as CallToolResult;
        }
      }
      // Anything else, including an explicit "unpaid" receipt (success:false, empty transaction), is only the
      // server's unauthenticated word: whoever holds the signed authorization can still settle it until
      // validBefore (B16-5). The hold stays until chain evidence resolves it (TANOD_BASE_RPC_URL) or the owner does.
      if (paid.isError && extractPaymentRequired(paid)) {
        return errResult("Payment was not accepted by the server, but the signed authorization was sent and could still be settled until it expires, so its amount stays held against TANOD_MAX_USD_PER_DAY. " +
          (auth === undefined
            ? "It was a Permit2 authorization, which tanod-mcp has not checked on-chain, so it stays held until you reconcile it manually."
            : rpc ? "It is released automatically once a finalized Base block shows it expired unused (checked before later paid calls)."
            : "Set TANOD_BASE_RPC_URL to let tanod-mcp release it after an on-chain check, or reconcile it manually.") +
          " Do not retry with a new payment unless you accept a second hold.");
      }
      // Logging is observational: it must not turn an already paid result into a retriable failure.
      try { log(`paid call: ${name}; held/committed today USD ${opts.caps.spentTodayUsd}`); } catch { /* preserve raw result */ }
      return paid; // raw result: content, structuredContent and settlement receipt
    } catch (e: any) {
      let cleanup = "";
      if (!sent && reservation) {
        try { opts.caps.release(reservation); } catch { cleanup = " Accounting release failed; reservation remains conservatively held."; }
      }
      const raw = String(e?.message ?? e);
      const msg = (raw.includes("spendControls") ? "TANOD_MAX_USD_PER_CALL or supported payment terms refused this quote" : raw)
        .replace(/0x[0-9a-fA-F]{64}/g, "0x[redacted]");
      return errResult(`Payment failed: ${msg}.${sent ? " Remote outcome may be unknown; the reservation remains counted. Do not make another payment until reconciled." : " Nothing was sent."}${cleanup}`);
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
