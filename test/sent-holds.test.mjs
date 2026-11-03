// B16-5 regressions: a hold whose signed authorization was sent is never released on the server's word.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { createProxy, checkEndpointUrl, MAX_TIMEOUT_SECONDS } from "../dist/proxy.js";
import { SpendCaps } from "../dist/caps.js";
import { startMock, TEST_KEY, TEST_ADDRESS, TEST_KEEP_ALIVE_MS, paymentRequired } from "./helpers.mjs";

const SIGNER = TEST_ADDRESS;
let signed = 0;
/** Optional mutation of the SDK's signed payload (simulates SDK misbehaviour); reset after each test. */
let tamper;
/** What the proxy built the scheme with (risk 5: options or a readContract signer would arm gas-sponsoring extensions). */
let schemeSeen;
const originalCreation = ExactEvmScheme.prototype.createPaymentPayload;
ExactEvmScheme.prototype.createPaymentPayload = async function (...args) {
  schemeSeen = { options: this.options, readContract: typeof this.signer?.readContract };
  const result = await originalCreation.apply({ ...this, signer: { address: SIGNER,
    signTypedData: async () => { signed++; return "0x" + "11".repeat(65); } } }, args);
  if (tamper) tamper(result);
  return result;
};
test.afterEach(() => { tamper = undefined; });
test.after(() => { ExactEvmScheme.prototype.createPaymentPayload = originalCreation; });

const UNPAID = { success: false, network: "eip155:8453", transaction: "", errorReason: "invalid_exact_evm_scheme" };
function unpaidResponse(pr = paymentRequired(10000)) {
  return { isError: true, content: [{ type: "text", text: JSON.stringify(pr) }], structuredContent: pr,
    _meta: { "x402/payment-response": UNPAID } };
}
function temp(t) {
  const d = mkdtempSync(join(process.env.CLIENT_CAPS_TMP || tmpdir(), "sent-holds-"));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return join(d, "spend.json");
}
async function setup(t, { perCall = 0.05, perDay = 1, stateFile, rpcUrl, logs, reconcileDeadlineMs, ...mockOptions } = {}) {
  const mock = await startMock(mockOptions);
  const caps = new SpendCaps({ maxPerCallUsd: perCall, maxPerDayUsd: perDay, stateFile });
  const proxy = await createProxy({ url: mock.url, privateKey: TEST_KEY, caps, rpcUrl, reconcileDeadlineMs, log: logs ? (m) => logs.push(m) : undefined });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await proxy.server.connect(a);
  const client = new Client({ name: "t", version: "1" }, { capabilities: {} });
  await client.connect(b);
  t.after(async () => { await client.close(); await proxy.close(); await mock.close(); });
  return { mock, caps, client };
}

/** Minimal Base JSON-RPC: chain id, a finalized block and USDC authorizationState(from, nonce) by nonce. */
async function startRpc(t, { chainId = 8453, finalizedTimestamp = () => Math.floor(Date.now() / 1000) + 3600, used = () => false, delayMs = 0 } = {}) {
  const state = { calls: [], authChecks: [] };
  const srv = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    const answer = (m) => {
      state.calls.push(m.method);
      if (m.method === "eth_chainId") return "0x" + chainId.toString(16);
      if (m.method === "eth_getBlockByNumber") {
        assert.equal(m.params[0], "finalized");
        return { number: "0x10", hash: "0x" + "ab".repeat(32), parentHash: "0x" + "cd".repeat(32), timestamp: "0x" + finalizedTimestamp().toString(16),
          nonce: "0x0000000000000000", difficulty: "0x0", gasLimit: "0x1", gasUsed: "0x0", miner: "0x" + "00".repeat(20),
          extraData: "0x", size: "0x1", totalDifficulty: "0x0", transactions: [], uncles: [], logsBloom: "0x" + "00".repeat(256),
          transactionsRoot: "0x" + "00".repeat(32), stateRoot: "0x" + "00".repeat(32), receiptsRoot: "0x" + "00".repeat(32),
          sha3Uncles: "0x" + "00".repeat(32), mixHash: "0x" + "00".repeat(32), baseFeePerGas: "0x1" };
      }
      if (m.method === "eth_call") {
        const [call, block] = m.params;
        assert.equal(call.to.toLowerCase(), "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
        assert.equal(block, "0x10"); // read AT the finalized block, never "latest"
        const data = call.data ?? call.input;
        assert.equal(data.slice(0, 10), "0xe94a0102"); // authorizationState(address,bytes32)
        const from = "0x" + data.slice(10 + 24, 10 + 64), nonce = "0x" + data.slice(10 + 64, 10 + 128);
        state.authChecks.push({ from, nonce });
        return "0x" + (used(nonce) ? "1" : "0").padStart(64, "0");
      }
      throw new Error(`unexpected ${m.method}`);
    };
    const one = (m) => { try { return { jsonrpc: "2.0", id: m.id, result: answer(m) }; } catch (e) { return { jsonrpc: "2.0", id: m.id, error: { code: -32000, message: String(e.message) } }; } };
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(Array.isArray(body) ? body.map(one) : one(body)));
  });
  srv.keepAliveTimeout = TEST_KEEP_ALIVE_MS;
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => srv.close(r)));
  return { url: `http://127.0.0.1:${srv.address().port}/`, state };
}
const ledger = (stateFile) => JSON.parse(readFileSync(stateFile, "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** An offer whose authorization expires in 1 s, so the reconcile path can be exercised without a fake clock. */
function shortOffer() { return [{ ...paymentRequired(10000).accepts[0], maxTimeoutSeconds: 1 }]; }

test("exploit sketch: a server that settles and answers 'unpaid' cannot exceed TANOD_MAX_USD_PER_DAY", async (t) => {
  // 0.01 per call, day cap 0.03: the old client released each hold and kept paying without limit.
  const s = await setup(t, { perDay: 0.03, paidResponse: unpaidResponse() });
  for (let i = 0; i < 6; i++) await s.client.callTool({ name: "paid_thing" });
  assert.equal(s.mock.state.sawPayment, 3);
  assert.equal(s.caps.spentTodayUsd, 0.03);
  const r = await s.client.callTool({ name: "paid_thing" });
  assert.match(r.content[0].text, /TANOD_MAX_USD_PER_DAY/);
});

test("unpaid receipt keeps the hold, records the sent authorization durably and says why", async (t) => {
  const stateFile = temp(t);
  const s = await setup(t, { stateFile, paidResponse: unpaidResponse() });
  const before = Math.floor(Date.now() / 1000);
  const r = await s.client.callTool({ name: "paid_thing" });
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /stays held against TANOD_MAX_USD_PER_DAY/);
  assert.match(r.content[0].text, /TANOD_BASE_RPC_URL/);
  const sent = s.mock.state.payloads[0].payload.authorization;
  const entries = Object.values(ledger(stateFile).reservations);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].status, "held");
  assert.deepEqual(entries[0].auth, { from: SIGNER, nonce: sent.nonce, validBefore: sent.validBefore });
  const after = Math.floor(Date.now() / 1000);
  assert.ok(Number(sent.validBefore) >= before + 60 && Number(sent.validBefore) <= after + 60, `${sent.validBefore} vs ${before}..${after}`);
  // A restarted client sees the same sent hold.
  const restarted = new SpendCaps({ maxPerCallUsd: 0.05, maxPerDayUsd: 1, stateFile });
  assert.equal(restarted.spentTodayUsd, 0.01);
  assert.equal(restarted.sentHolds()[0].authorization.nonce, sent.nonce);
});

test("maxTimeoutSeconds above the local bound never reaches the signer; the bound itself is accepted", async (t) => {
  assert.equal(MAX_TIMEOUT_SECONDS, 300);
  signed = 0;
  const offer = paymentRequired(10000).accepts[0];
  const s = await setup(t, { offers: [{ ...offer, maxTimeoutSeconds: 301 }] });
  assert.equal((await s.client.callTool({ name: "paid_thing" })).isError, true);
  assert.equal(signed, 0);
  assert.equal(s.mock.state.sawPayment, 0);
  assert.equal(s.caps.spentTodayUsd, 0);
  const ok = await setup(t, { offers: [{ ...offer, maxTimeoutSeconds: 300 }] });
  assert.notEqual((await ok.client.callTool({ name: "paid_thing" })).isError, true);
  assert.ok(Number(ok.mock.state.payloads[0].payload.authorization.validBefore) <= Math.floor(Date.now() / 1000) + 300);
});

test("TANOD_MCP_URL and TANOD_BASE_RPC_URL require https except loopback", async () => {
  for (const ok of ["https://tanod.dev/mcp", "https://tanod.dev/mcp/pdf", "http://127.0.0.1:8080/mcp", "http://127.9.0.1/", "http://localhost:3000/mcp", "http://[::1]:9/", "http://127.1/"]) {
    assert.doesNotThrow(() => checkEndpointUrl(ok, "TANOD_MCP_URL"), ok);
  }
  for (const bad of ["http://tanod.dev/mcp", "http://10.0.0.1/mcp", "http://127.0.0.1.evil.example/", "http://localhost.evil.example/",
    "ws://127.0.0.1/", "ftp://tanod.dev/", "file:///etc/passwd", "tanod.dev/mcp", ""]) {
    assert.throws(() => checkEndpointUrl(bad, "TANOD_MCP_URL"), /TANOD_MCP_URL/, bad);
  }
  const caps = new SpendCaps({ maxPerCallUsd: 0.05, maxPerDayUsd: 1 });
  await assert.rejects(createProxy({ url: "http://tanod.dev/mcp", caps }), /TANOD_MCP_URL must be an https/);
  await assert.rejects(createProxy({ url: "https://127.0.0.1:1/mcp", caps, rpcUrl: "http://rpc.example/" }), /TANOD_BASE_RPC_URL must be an https/);
});

test("RPC: an expired authorization that the finalized chain shows unused is released, then payment continues", async (t) => {
  const stateFile = temp(t);
  const rpc = await startRpc(t, { used: () => false });
  let unpaid = true;
  const logs = [];
  const s = await setup(t, { stateFile, perDay: 0.01, rpcUrl: rpc.url, logs, offers: shortOffer(),
    onPaid: () => { if (unpaid) { unpaid = false; throw new Error("simulated lost response"); } } });
  // First call: lost response after sending; hold stays (0.01 = whole day budget).
  assert.match((await s.client.callTool({ name: "paid_thing" })).content[0].text, /Remote outcome may be unknown/);
  assert.equal(s.caps.spentTodayUsd, 0.01);
  const nonce = s.mock.state.payloads[0].payload.authorization.nonce;
  await sleep(2100); // validBefore (now + 1 s) has passed
  const r = await s.client.callTool({ name: "paid_thing" });
  assert.notEqual(r.isError, true, r.content?.[0]?.text);
  assert.deepEqual(rpc.state.authChecks, [{ from: SIGNER.toLowerCase(), nonce }]);
  assert.equal(s.mock.state.paidCalls, 1);
  assert.equal(s.caps.spentTodayUsd, 0.01); // only the second, confirmed payment
  const statuses = Object.values(ledger(stateFile).reservations).map(e => e.status).sort();
  assert.deepEqual(statuses, ["committed", "released"]);
  assert.ok(logs.some(m => /expired unused; released/.test(m)));
  assert.ok(logs.every(m => !m.includes(rpc.url)));
});

test("RPC: an authorization the chain shows used is committed, never released", async (t) => {
  const stateFile = temp(t);
  const rpc = await startRpc(t, { used: () => true });
  const pr = paymentRequired(10000); pr.accepts = shortOffer();
  const s = await setup(t, { stateFile, perDay: 0.01, rpcUrl: rpc.url, offers: shortOffer(), paidResponse: unpaidResponse(pr) });
  await s.client.callTool({ name: "paid_thing" });
  await sleep(2100);
  const r = await s.client.callTool({ name: "paid_thing" });
  assert.match(r.content[0].text, /TANOD_MAX_USD_PER_DAY/);
  assert.equal(rpc.state.authChecks.length, 1);
  const l = ledger(stateFile);
  assert.equal(l.spentAtomic, "10000");
  assert.deepEqual(Object.values(l.reservations).map(e => e.status), ["committed"]);
  assert.equal(s.mock.state.sawPayment, 1);
});

for (const [label, rpcOptions, unexpired] of [
  ["wrong chain id", { chainId: 1 }, false],
  ["finalized block not yet past validBefore", { finalizedTimestamp: () => 1 }, false],
  ["authorization not yet expired locally", {}, true],
]) test(`RPC: ${label} leaves the sent hold in place`, async (t) => {
  const stateFile = temp(t);
  const rpc = await startRpc(t, { ...rpcOptions, used: () => false });
  const pr = paymentRequired(10000); pr.accepts = unexpired ? paymentRequired(10000).accepts : shortOffer();
  const s = await setup(t, { stateFile, perDay: 0.01, rpcUrl: rpc.url, offers: pr.accepts, paidResponse: unpaidResponse(pr) });
  await s.client.callTool({ name: "paid_thing" });
  if (!unexpired) await sleep(2100);
  const r = await s.client.callTool({ name: "paid_thing" });
  assert.match(r.content[0].text, /TANOD_MAX_USD_PER_DAY/);
  assert.equal(rpc.state.authChecks.length, 0);
  if (unexpired) assert.deepEqual(rpc.state.calls, []);
  assert.deepEqual(Object.values(ledger(stateFile).reservations).map(e => e.status), ["held"]);
  assert.equal(s.mock.state.sawPayment, 1);
});

test("RPC down: holds stay and the paid path still answers with the cap refusal", async (t) => {
  const pr = paymentRequired(10000); pr.accepts = shortOffer();
  const logs = [];
  const rpcUrl = "http://127.0.0.1:1/v2/provider-api-key-123";
  const s = await setup(t, { perDay: 0.01, rpcUrl, logs, offers: shortOffer(), paidResponse: unpaidResponse(pr) });
  await s.client.callTool({ name: "paid_thing" });
  await sleep(2100);
  assert.match((await s.client.callTool({ name: "paid_thing" })).content[0].text, /TANOD_MAX_USD_PER_DAY/);
  assert.equal(s.caps.spentTodayUsd, 0.01);
  assert.ok(logs.some(m => /on-chain hold check skipped/.test(m)), logs.join("\n"));
  assert.ok(logs.every(m => !m.includes("provider-api-key-123") && !m.includes("127.0.0.1:1")), logs.join("\n"));
});

test("ledger: markSent validates, is one-shot, survives restart; malformed sent authorizations fail closed", async (t) => {
  const { writeFileSync } = await import("node:fs");
  const stateFile = temp(t);
  const caps = new SpendCaps({ maxPerCallUsd: 0.05, maxPerDayUsd: 1, stateFile });
  const auth = { from: SIGNER, nonce: "0x" + "ab".repeat(32), validBefore: "1800000000" };
  const d = caps.reserve(10000n); assert.ok(d.ok);
  for (const bad of [{ ...auth, from: "0x1" }, { ...auth, nonce: "0x12" }, { ...auth, validBefore: "-1" }, { ...auth, validBefore: "9".repeat(17) }, undefined]) {
    assert.throws(() => caps.markSent(d.reservation, bad), /invalid sent authorization/);
  }
  caps.markSent(d.reservation, { ...auth, extra: "ignored" });
  assert.throws(() => caps.markSent(d.reservation, auth), /not an unsent hold/);
  const restarted = new SpendCaps({ maxPerCallUsd: 0.05, maxPerDayUsd: 1, stateFile });
  assert.deepEqual(restarted.sentHolds(), [{ reservation: d.reservation, authorization: auth }]);
  restarted.release(d.reservation);
  assert.deepEqual(caps.sentHolds(), []);
  assert.throws(() => caps.markSent(d.reservation, auth), /not an unsent hold/);
  const unsent = caps.reserve(1n); assert.ok(unsent.ok);
  assert.deepEqual(caps.sentHolds(), []); // unsent holds are never chain-reconciled
  const l = ledger(stateFile);
  l.reservations[unsent.reservation.id].auth = { ...auth, nonce: "0xzz" };
  writeFileSync(stateFile, JSON.stringify(l), { mode: 0o600 });
  assert.throws(() => caps.spentTodayUsd, /invalid reservation/);
});

for (const [label, edit] of [
  ["from is not the local account", (a) => { a.from = "0x0000000000000000000000000000000000000001"; }],
  ["value differs from the reserved amount", (a) => { a.value = "9999"; }],
  ["to differs from the selected payTo", (a) => { a.to = "0x000000000000000000000000000000000000bEEF"; }],
]) test(`S1: a signed EIP-3009 authorization whose ${label} is never sent and its hold is released`, async (t) => {
  const stateFile = temp(t);
  const s = await setup(t, { stateFile });
  tamper = (r) => edit(r.payload.authorization);
  const r = await s.client.callTool({ name: "paid_thing" });
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /does not match[\s\S]*Nothing was sent/);
  assert.equal(s.mock.state.sawPayment, 0);
  assert.equal(s.caps.spentTodayUsd, 0);
  assert.deepEqual(Object.values(ledger(stateFile).reservations).map(e => e.status), ["released"]);
});

const permit2Offer = () => [{ ...paymentRequired(10000).accepts[0], extra: { assetTransferMethod: "permit2" } }];
test("S1: a signed Permit2 authorization is checked the same way (from, amount, token, witness.to); a matching one is sent", async (t) => {
  const ok = await setup(t, { offers: permit2Offer() });
  assert.notEqual((await ok.client.callTool({ name: "paid_thing" })).isError, true);
  assert.equal(ok.mock.state.payloads[0].payload.permit2Authorization.from, SIGNER);
  for (const edit of [(p) => { p.from = "0x0000000000000000000000000000000000000001"; }, (p) => { p.permitted.amount = "1"; },
    (p) => { p.permitted.token = "0x000000000000000000000000000000000000bEEF"; }, (p) => { p.witness.to = "0x000000000000000000000000000000000000bEEF"; }]) {
    const s = await setup(t, { offers: permit2Offer() });
    tamper = (r) => edit(r.payload.permit2Authorization);
    const r = await s.client.callTool({ name: "paid_thing" });
    assert.match(r.content[0].text, /does not match[\s\S]*Nothing was sent/);
    assert.equal(s.mock.state.sawPayment, 0);
    assert.equal(s.caps.spentTodayUsd, 0);
  }
});

test("S2: a signed Permit2 deadline beyond now + 300 s is never sent; the bound itself is", async (t) => {
  const s = await setup(t, { offers: permit2Offer() });
  tamper = (r) => { r.payload.permit2Authorization.deadline = String(Math.floor(Date.now() / 1000) + MAX_TIMEOUT_SECONDS + 60); };
  const r = await s.client.callTool({ name: "paid_thing" });
  assert.match(r.content[0].text, /lifetime exceeds[\s\S]*Nothing was sent/);
  assert.equal(s.mock.state.sawPayment, 0);
  assert.equal(s.caps.spentTodayUsd, 0);
  for (const bad of ["", "0x10", "-1", "1e9"]) {
    const b = await setup(t, { offers: permit2Offer() });
    tamper = (x) => { x.payload.permit2Authorization.deadline = bad; };
    assert.match((await b.client.callTool({ name: "paid_thing" })).content[0].text, /Nothing was sent/, bad);
    assert.equal(b.mock.state.sawPayment, 0, bad);
  }
  tamper = undefined;
  const ok = await setup(t, { offers: [{ ...permit2Offer()[0], maxTimeoutSeconds: 300 }] });
  assert.notEqual((await ok.client.callTool({ name: "paid_thing" })).isError, true);
  assert.ok(Number(ok.mock.state.payloads[0].payload.permit2Authorization.deadline) <= Math.floor(Date.now() / 1000) + 300);
});

test("S3: the unpaid-reply text matches the authorization kind (Permit2 holds are never released automatically)", async (t) => {
  const rpc = await startRpc(t);
  const p2 = paymentRequired(10000); p2.accepts = permit2Offer();
  const permit2 = await setup(t, { rpcUrl: rpc.url, offers: p2.accepts, paidResponse: unpaidResponse(p2) });
  const text = (await permit2.client.callTool({ name: "paid_thing" })).content[0].text;
  assert.match(text, /stays held against TANOD_MAX_USD_PER_DAY/);
  assert.doesNotMatch(text, /released automatically/);
  assert.match(text, /Permit2[\s\S]*not checked on-chain[\s\S]*manually/);
  const eip3009 = await setup(t, { rpcUrl: rpc.url, paidResponse: unpaidResponse() });
  assert.match((await eip3009.client.callTool({ name: "paid_thing" })).content[0].text, /released automatically once a finalized Base block/);
  const noRpc = await setup(t, { offers: p2.accepts, paidResponse: unpaidResponse(p2) });
  const noRpcText = (await noRpc.client.callTool({ name: "paid_thing" })).content[0].text;
  assert.doesNotMatch(noRpcText, /Set TANOD_BASE_RPC_URL/); // an RPC would not help a Permit2 hold
  assert.match(noRpcText, /Permit2[\s\S]*manually/);
});

test("S4: a zero-amount offer never reaches the signer (sent zero holds could fill the ledger)", async (t) => {
  signed = 0;
  for (const method of ["eip3009", "permit2"]) {
    const offer = method === "permit2" ? permit2Offer()[0] : paymentRequired(10000).accepts[0];
    const s = await setup(t, { offers: [{ ...offer, amount: "0" }] });
    assert.equal((await s.client.callTool({ name: "paid_thing" })).isError, true);
    assert.equal(s.mock.state.sawPayment, 0, method);
    assert.equal(s.caps.spentTodayUsd, 0);
  }
  assert.equal(signed, 0);
  const one = await setup(t, { offers: [{ ...paymentRequired(10000).accepts[0], amount: "1" }] });
  assert.notEqual((await one.client.callTool({ name: "paid_thing" })).isError, true);
});

test("S5: a slow RPC gets one overall deadline; the hold stays and nothing acts on late answers", async (t) => {
  const stateFile = temp(t);
  const rpc = await startRpc(t, { delayMs: 800, used: () => false }); // 3 sequential calls: ~2.4 s without a deadline
  const pr = paymentRequired(10000); pr.accepts = shortOffer();
  const logs = [];
  const s = await setup(t, { stateFile, perDay: 0.01, rpcUrl: rpc.url, logs, reconcileDeadlineMs: 1000, offers: shortOffer(), paidResponse: unpaidResponse(pr) });
  await s.client.callTool({ name: "paid_thing" });
  await sleep(2100);
  // Without the deadline the check finishes (~2.4 s) and releases the hold; with it the hold is still counted.
  assert.match((await s.client.callTool({ name: "paid_thing" })).content[0].text, /TANOD_MAX_USD_PER_DAY/);
  assert.ok(logs.some(m => /on-chain hold check skipped: .*deadline/.test(m)), logs.join("\n"));
  await sleep(2500); // the abandoned RPC requests finish; nothing may act on them late
  assert.deepEqual(Object.values(ledger(stateFile).reservations).map(e => e.status), ["held"]);
  assert.equal(s.mock.state.sawPayment, 1);
});

test("S6: the MCP endpoint's redirects are not followed, even within its origin", async () => {
  const mock = await startMock({ redirectPath: "/old" });
  try {
    const caps = new SpendCaps({ maxPerCallUsd: 0.05, maxPerDayUsd: 1 });
    await assert.rejects(createProxy({ url: mock.url.replace(/\/mcp$/, "/old"), privateKey: TEST_KEY, caps }));
    assert.equal(mock.state.redirects, 1);
    const direct = await createProxy({ url: mock.url, privateKey: TEST_KEY, caps });
    await direct.close();
  } finally { await mock.close(); }
});

test("S6: TANOD_BASE_RPC_URL redirects are not followed; the sent hold stays", async (t) => {
  const stateFile = temp(t);
  const rpc = await startRpc(t, { used: () => false });
  let redirected = 0;
  const hop = http.createServer((req, res) => { redirected++; req.resume(); res.writeHead(307, { location: rpc.url }).end(); });
  await new Promise((r) => hop.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => hop.close(r)));
  const pr = paymentRequired(10000); pr.accepts = shortOffer();
  const logs = [];
  const s = await setup(t, { stateFile, perDay: 0.01, rpcUrl: `http://127.0.0.1:${hop.address().port}/`, logs, offers: shortOffer(), paidResponse: unpaidResponse(pr) });
  await s.client.callTool({ name: "paid_thing" });
  await sleep(2100);
  assert.match((await s.client.callTool({ name: "paid_thing" })).content[0].text, /TANOD_MAX_USD_PER_DAY/);
  assert.ok(redirected >= 1);
  assert.deepEqual(rpc.state.calls, []); // the redirect target was never asked
  assert.ok(logs.some(m => /on-chain hold check skipped/.test(m)), logs.join("\n"));
  assert.deepEqual(Object.values(ledger(stateFile).reservations).map(e => e.status), ["held"]);
});

test("risk 5: ExactEvmScheme is built without options and with a signer that cannot read contracts", async (t) => {
  schemeSeen = undefined;
  const p2 = await setup(t, { offers: permit2Offer() });
  assert.notEqual((await p2.client.callTool({ name: "paid_thing" })).isError, true);
  assert.ok(schemeSeen, "scheme was used");
  assert.equal(schemeSeen.options, undefined, "pass no options (rpcUrl etc.) to new ExactEvmScheme(account)");
  assert.equal(schemeSeen.readContract, "undefined", "the signer must not gain readContract");
  assert.equal(p2.mock.state.payloads[0].extensions, undefined);
});
