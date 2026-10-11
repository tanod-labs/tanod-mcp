import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createProxy } from "../dist/proxy.js";
import { SpendCaps } from "../dist/caps.js";
import { startMock, TOOLS, TEST_KEY } from "./helpers.mjs";

async function setup({ price, key, perCall = 0.05, perDay = 1 } = {}) {
  const mock = await startMock({ price });
  const caps = new SpendCaps({ maxPerCallUsd: perCall, maxPerDayUsd: perDay });
  const proxy = await createProxy({ url: mock.url, privateKey: key, caps });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await proxy.server.connect(a);
  const client = new Client({ name: "t", version: "1" }, { capabilities: {} });
  await client.connect(b);
  return { mock, caps, proxy, client, done: async () => { await client.close(); await proxy.close(); await mock.close(); } };
}

test("re-exposes upstream tools 1:1 (names, descriptions, schemas)", async () => {
  const s = await setup();
  const { tools } = await s.client.listTools();
  assert.deepEqual(tools.map((t) => t.name), TOOLS.map((t) => t.name));
  for (const t of TOOLS) {
    const got = tools.find((x) => x.name === t.name);
    assert.equal(got.description, t.description);
    assert.deepEqual(got.inputSchema, t.inputSchema);
    if (t.outputSchema) assert.deepEqual(got.outputSchema, t.outputSchema);
  }
  await s.done();
});

test("proxies a free call including structuredContent", async () => {
  const s = await setup();
  const r = await s.client.callTool({ name: "echo", arguments: { text: "hi" } });
  assert.deepEqual(r.structuredContent, { echoed: "hi" });
  assert.equal(r.isError, undefined);
  await s.done();
});

test("no key: payment-required result passes through with a hint", async () => {
  const s = await setup();
  const r = await s.client.callTool({ name: "paid_thing", arguments: {} });
  assert.equal(r.isError, true);
  assert.equal(r.structuredContent.x402Version, 2);
  assert.match(r.content[0].text, /TANOD_PRIVATE_KEY/);
  assert.equal(s.mock.state.paidCalls, 0);
  await s.done();
});

test("key + price above per-call cap: refused, nothing signed", async () => {
  const s = await setup({ key: TEST_KEY, price: 60000 }); // $0.06 > $0.05
  const r = await s.client.callTool({ name: "paid_thing", arguments: {} });
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /TANOD_MAX_USD_PER_CALL/);
  assert.equal(s.mock.state.sawPayment, 0);
  assert.equal(s.caps.spentTodayUsd, 0);
  await s.done();
});

test("key + within caps: pays, records spend; daily cap then refuses", async () => {
  const s = await setup({ key: TEST_KEY, price: 10000, perDay: 0.015 }); // $0.01 each, day cap $0.015
  const r1 = await s.client.callTool({ name: "paid_thing", arguments: {} });
  assert.notEqual(r1.isError, true);
  assert.equal(r1.content[0].text, "paid ok");
  assert.equal(s.mock.state.paidCalls, 1);
  assert.equal(s.caps.spentTodayUsd, 0.01);
  const r2 = await s.client.callTool({ name: "paid_thing", arguments: {} });
  assert.equal(r2.isError, true);
  assert.match(r2.content[0].text, /TANOD_MAX_USD_PER_DAY/);
  assert.equal(s.mock.state.paidCalls, 1);
  await s.done();
});

test("paid result keeps structuredContent and _meta (settlement receipt)", async () => {
  const s = await setup({ key: TEST_KEY, price: 10000 });
  const r = await s.client.callTool({ name: "paid_thing", arguments: {} });
  assert.deepEqual(r.structuredContent, { ok: true });
  assert.equal(r._meta["x402/payment-response"].transaction, "0xabc");
  await s.done();
});

test("concurrent paid calls: exact cap accounting, correct denial", async () => {
  // $0.01 each, day cap $0.025: of 4 parallel calls exactly 2 pay, 2 are refused.
  const s = await setup({ key: TEST_KEY, price: 10000, perDay: 0.025 });
  const rs = await Promise.all([1, 2, 3, 4].map(() => s.client.callTool({ name: "paid_thing", arguments: {} })));
  const ok = rs.filter((r) => !r.isError);
  const bad = rs.filter((r) => r.isError);
  assert.equal(ok.length, 2);
  assert.equal(bad.length, 2);
  for (const b of bad) assert.match(b.content[0].text, /TANOD_MAX_USD_PER_DAY/);
  assert.equal(s.mock.state.paidCalls, 2);
  assert.equal(s.caps.spentTodayUsd, 0.02);
  await s.done();
});
