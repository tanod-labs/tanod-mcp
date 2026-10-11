import http from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

export const TEST_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // public Hardhat test key, holds nothing

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

/** Mock upstream. `price` is atomic USDC for paid_thing. Records paid calls. */
export async function startMock({ price = 10000 } = {}) {
  const state = { paidCalls: 0, sawPayment: 0 };
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const build = () => {
    const s = new Server({ name: "mock", version: "1" }, { capabilities: { tools: {} } });
    s.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
    s.setRequestHandler(CallToolRequestSchema, async (req) => {
      const { name, arguments: a, _meta } = req.params;
      if (name === "echo") return { content: [{ type: "text", text: JSON.stringify({ echoed: a.text }) }], structuredContent: { echoed: a.text } };
      if (name === "paid_thing") {
        if (_meta && _meta["x402/payment"]) { await delay(50); state.sawPayment++; state.paidCalls++; return { content: [{ type: "text", text: "paid ok" }], structuredContent: { ok: true }, _meta: { "x402/payment-response": { success: true, transaction: "0xabc", network: "eip155:8453" } } }; }
        const pr = paymentRequired(price);
        return { isError: true, content: [{ type: "text", text: JSON.stringify(pr) }], structuredContent: pr };
      }
      return { isError: true, content: [{ type: "text", text: "unknown tool" }] };
    });
    return s;
  };
  const srv = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
    const s = build();
    const t = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => { t.close(); s.close(); });
    await s.connect(t);
    await t.handleRequest(req, res, body);
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${srv.address().port}/mcp`;
  return { url, state, close: () => new Promise((r) => srv.close(r)) };
}
