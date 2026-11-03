import http from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

export const TEST_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // public Hardhat test key, holds nothing
export const TEST_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"; // TEST_KEY's address; signed payloads must name it (S1)

export const TOOLS = [
  { name: "echo", description: "Echo text. Free.", inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
    outputSchema: { type: "object", properties: { echoed: { type: "string" } } } },
  { name: "paid_thing", description: "Costs money.", inputSchema: { type: "object", properties: {} } },
];

export function paymentRequired(amount) {
  return {
    x402Version: 2,
    error: "payment required",
    resource: { url: "mcp://tool/paid_thing", description: "paid", mimeType: "application/json" },
    accepts: [{
      scheme: "exact", network: "eip155:8453", amount: String(amount),
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      payTo: "0x000000000000000000000000000000000000dEaD", maxTimeoutSeconds: 60,
      extra: { name: "USD Coin", version: "2" },
    }],
  };
}

/**
 * Keep-alive for the loopback test servers. Node's default (5 s) races the client's socket reuse when a loaded
 * host stalls the shared event loop for seconds: the paid POST then fails with ECONNRESET and never arrives.
 */
export const TEST_KEEP_ALIVE_MS = 120_000;

/** Mock upstream. `price` is atomic USDC for paid_thing. Records paid calls. `redirectPath` answers 307 -> /mcp. */
export async function startMock({ price = 10000, offers, paidResponse, onPaid, redirectPath, keepAliveTimeout = TEST_KEEP_ALIVE_MS } = {}) {
  const state = { paidCalls: 0, sawPayment: 0, payloads: [] };
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const build = () => {
    const s = new Server({ name: "mock", version: "1" }, { capabilities: { tools: {} } });
    s.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
    s.setRequestHandler(CallToolRequestSchema, async (req) => {
      const { name, arguments: a, _meta } = req.params;
      if (name === "echo") return { content: [{ type: "text", text: JSON.stringify({ echoed: a.text }) }], structuredContent: { echoed: a.text } };
      if (name === "paid_thing") {
        if (_meta && _meta["x402/payment"]) {
          await delay(10); state.sawPayment++; state.payloads.push(_meta["x402/payment"]);
          if (onPaid) await onPaid();
          if (paidResponse) return paidResponse;
          state.paidCalls++;
          return { content: [{ type: "text", text: "paid ok" }], structuredContent: { ok: true }, _meta: { "x402/payment-response": { success: true, transaction: "0xabc", network: "eip155:8453" } } };
        }
        const pr = paymentRequired(price);
        if (offers) pr.accepts = offers;
        return { isError: true, content: [{ type: "text", text: JSON.stringify(pr) }], structuredContent: pr };
      }
      return { isError: true, content: [{ type: "text", text: "unknown tool" }] };
    });
    return s;
  };
  const srv = http.createServer(async (req, res) => {
    if (redirectPath && req.url === redirectPath) { state.redirects = (state.redirects ?? 0) + 1; res.writeHead(307, { location: "/mcp" }).end(); return; }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
    const s = build();
    const t = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => { t.close(); s.close(); });
    await s.connect(t);
    await t.handleRequest(req, res, body);
  });
  srv.keepAliveTimeout = keepAliveTimeout;
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${srv.address().port}/mcp`;
  return { url, state, close: () => new Promise((r) => srv.close(r)) };
}
