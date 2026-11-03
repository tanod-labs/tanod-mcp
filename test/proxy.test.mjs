import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createProxy, VERSION, DEFAULT_URL } from "../dist/proxy.js";
import { SpendCaps } from "../dist/caps.js";
import { startMock, TOOLS, TEST_KEY, TEST_ADDRESS, paymentRequired } from "./helpers.mjs";
import { ExactEvmScheme } from '@x402/evm/exact/client';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Exercise the real pinned scheme up to its signer with synthetic signatures only.
let signed = 0, signingFailure;
const originalCreation = ExactEvmScheme.prototype.createPaymentPayload;
ExactEvmScheme.prototype.createPaymentPayload = function (...args) {
  return originalCreation.apply({ ...this, signer: { address: TEST_ADDRESS,
    signTypedData: async () => { if (signingFailure) throw signingFailure; signed++; return '0x' + '11'.repeat(65); } } }, args);
};
test.after(() => { ExactEvmScheme.prototype.createPaymentPayload = originalCreation; });

async function setup({ price, key, perCall = 0.05, perDay = 1, stateFile, ...mockOptions } = {}) {
  const mock = await startMock({ price, ...mockOptions });
  const caps = new SpendCaps({ maxPerCallUsd: perCall, maxPerDayUsd: perDay, stateFile });
  const proxy = await createProxy({ url: mock.url, privateKey: key, caps });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await proxy.server.connect(a);
  const client = new Client({ name: "t", version: "1" }, { capabilities: {} });
  await client.connect(b);
  return { mock, caps, proxy, client, done: async () => { await client.close(); await proxy.close(); await mock.close(); } };
}

test('release package, runtime and registry metadata retain one published identity', async (t) => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const metadata = JSON.parse(readFileSync(new URL('../server.json', import.meta.url), 'utf8'));
  assert.equal(VERSION, pkg.version);
  assert.equal(metadata.version, pkg.version);
  assert.equal(metadata.name, 'dev.tanod/tanod');
  assert.equal(pkg.mcpName, metadata.name);
  const entry = metadata.packages.find(p => p.registryType === 'npm' && p.identifier === pkg.name);
  assert.ok(entry);
  assert.equal(entry.version, pkg.version);
  assert.equal(entry.transport.type, 'stdio');
  assert.ok(metadata.remotes.some(r => r.type === 'streamable-http' && r.url === DEFAULT_URL));
  for (const name of ['@x402/core', '@x402/evm', '@x402/mcp']) assert.equal(pkg.dependencies[name], '2.28.0');
  // Installers resolve these ranges; every runtime dependency that sees the private key is pinned exactly.
  for (const [name, range] of Object.entries(pkg.dependencies)) assert.match(range, /^\d+\.\d+\.\d+$/, name);
  const s = await setup();
  t.after(s.done);
  assert.deepEqual(s.client.getServerVersion(), { name: pkg.name, version: pkg.version });
});

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
  signed = 0;
  const s = await setup({ key: TEST_KEY, price: 60000 }); // $0.06 > $0.05
  const r = await s.client.callTool({ name: "paid_thing", arguments: {} });
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /TANOD_MAX_USD_PER_CALL/);
  assert.equal(s.mock.state.sawPayment, 0);
  assert.equal(signed, 0);
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

test('actual selected affordable offer determines durable reservation', async (t) => {
  const offer = paymentRequired(10000).accepts[0];
  const s = await setup({ key: TEST_KEY, offers: [{ ...offer, amount: '100000' }, offer], perDay: 0.01 });
  t.after(s.done);
  assert.notEqual((await s.client.callTool({ name: 'paid_thing' })).isError, true);
  assert.equal(s.caps.spentTodayUsd, 0.01);
  assert.equal(s.mock.state.payloads[0].accepted.amount, '10000');
});

for (const [label, change] of [['negative', { amount: '-1' }], ['number', { amount: 1 }], ['huge', { amount: '9'.repeat(80) }],
  ['missing', { amount: undefined }], ['asset', { asset: '0x' + '1'.repeat(40) }], ['network', { network: 'eip155:1' }],
  ['payee', { payTo: 'bad' }], ['decimals', { extra: { name: 'USD Coin', version: '2', decimals: 18 } }]]) {
  test(`invalid ${label} never reaches SDK signer`, async (t) => {
    signed = 0;
    const s = await setup({ key: TEST_KEY, offers: [{ ...paymentRequired(10000).accepts[0], ...change }] });
    t.after(s.done);
    assert.equal((await s.client.callTool({ name: 'paid_thing' })).isError, true);
    assert.equal(signed, 0);
    assert.equal(s.mock.state.sawPayment, 0);
    assert.equal(s.caps.spentTodayUsd, 0);
  });
}

test('signing failure positively releases exactly once without sending', async (t) => {
  const s = await setup({ key: TEST_KEY, perDay: 0.01 });
  t.after(s.done);
  signingFailure = new Error('fake signer refused');
  try {
    const r = await s.client.callTool({ name: 'paid_thing' });
    assert.equal(r.isError, true);
    assert.match(r.content[0].text, /Nothing was sent/);
    assert.equal(s.mock.state.sawPayment, 0);
    assert.equal(s.caps.spentTodayUsd, 0);
  } finally { signingFailure = undefined; }
  assert.notEqual((await s.client.callTool({ name: 'paid_thing' })).isError, true);
});

for (const [label, meta, expected] of [
  ['plain 402', undefined, 0.01],
  // B16-5: an "unpaid" receipt is the server's unauthenticated word after the authorization was sent; it never releases.
  ['explicit unpaid receipt (parse signature) after sending', { success: false, network: 'eip155:8453', transaction: '', errorReason: 'invalid_exact_evm_failed_to_parse_signature' }, 0.01],
  ['explicit unpaid receipt (scheme) after sending', { success: false, network: 'eip155:8453', transaction: '', errorReason: 'invalid_exact_evm_scheme' }, 0.01],
  ['RPC timeout failure is not unpaid evidence', { success: false, network: 'eip155:8453', transaction: '', errorReason: 'rpc_error' }, 0.01],
]) test(`${label}: correct held vs released accounting`, async (t) => {
  const pr = paymentRequired(10000);
  const paidResponse = { isError: true, content: [{ type: 'text', text: JSON.stringify(pr) }], structuredContent: pr,
    ...(meta ? { _meta: { 'x402/payment-response': meta } } : {}) };
  const s = await setup({ key: TEST_KEY, paidResponse, perDay: 0.01 });
  t.after(s.done);
  const r = await s.client.callTool({ name: 'paid_thing' });
  assert.equal(r.isError, true);
  assert.equal(s.caps.spentTodayUsd, expected);
  assert.doesNotMatch(r.content[0].text, /Nothing was charged/);
});

test('remote transport failure after submission holds rather than permitting a retry', async (t) => {
  const s = await setup({ key: TEST_KEY, perDay: 0.01, onPaid: () => { throw new Error('simulated lost response'); } });
  t.after(s.done);
  const r = await s.client.callTool({ name: 'paid_thing' });
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /Remote outcome may be unknown/);
  assert.equal(s.caps.spentTodayUsd, 0.01);
  assert.equal((await s.client.callTool({ name: 'paid_thing' })).isError, true);
  assert.equal(s.mock.state.sawPayment, 1);
});

test('cancellation after submission retains the shared hold across restart', async (t) => {
  const d = mkdtempSync(join(process.env.CLIENT_CAPS_TMP || tmpdir(), 'proxy-cancel-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  const stateFile = join(d, 'spend.json');
  let enter, finish;
  const submitted = new Promise(r => { enter = r; });
  const pending = new Promise(r => { finish = r; });
  const s = await setup({ key: TEST_KEY, stateFile, perDay: 0.01, onPaid: async () => { enter(); await pending; } });
  t.after(s.done);
  const controller = new AbortController();
  const call = s.client.callTool({ name: 'paid_thing' }, undefined, { signal: controller.signal });
  const rejected = assert.rejects(call);
  await submitted; controller.abort(); await rejected;
  const restarted = new SpendCaps({ maxPerCallUsd: 1, maxPerDayUsd: 0.01, stateFile });
  assert.equal(restarted.reserve(1n).ok, false);
  finish();
  assert.equal(restarted.spentTodayUsd, 0.01);
});

test('failed durable commit preserves the paid result and receipt while retaining the shared hold', async (t) => {
  const d = mkdtempSync(join(process.env.CLIENT_CAPS_TMP || tmpdir(), 'proxy-commit-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  const stateFile = join(d, 'spend.json');
  const paidResponse = {
    content: [{ type: 'text', text: 'paid ok' }, { type: 'image', data: 'cGFpZA==', mimeType: 'image/png' }],
    structuredContent: { ok: true, result: { value: 'paid content' } },
    _meta: { 'x402/payment-response': { success: true, transaction: '0xabc', network: 'eip155:8453' }, trace: 'paid-call' },
  };
  const s = await setup({ key: TEST_KEY, stateFile, perDay: 0.01, paidResponse }); t.after(s.done);
  let token, releases = 0;
  s.caps.commit = (reservation) => { token = reservation; throw new Error('synthetic durable commit error'); };
  const release = s.caps.release.bind(s.caps);
  s.caps.release = (reservation) => { releases++; release(reservation); };
  const r = await s.client.callTool({ name: 'paid_thing' });
  assert.equal(r.isError, paidResponse.isError);
  assert.deepEqual(r.content.slice(0, -1), paidResponse.content);
  assert.deepEqual(r.structuredContent, paidResponse.structuredContent);
  assert.deepEqual(r._meta, paidResponse._meta);
  assert.equal(r.content.at(-1).type, 'text');
  assert.match(r.content.at(-1).text, /local spend accounting/i);
  assert.match(r.content.at(-1).text, /successful payment receipt/);
  assert.match(r.content.at(-1).text, /durable commit could not be confirmed/);
  assert.match(r.content.at(-1).text, /reservation has not been released/);
  assert.match(r.content.at(-1).text, /Do not make another payment until local accounting is reconciled/);
  assert.doesNotMatch(r.content.at(-1).text, /Payment failed|Remote outcome may be unknown|Nothing was sent|Nothing was charged/);
  assert.equal(releases, 0);
  assert.ok(token);
  const ledger = JSON.parse(readFileSync(stateFile, 'utf8'));
  assert.equal(ledger.spentAtomic, '0');
  assert.deepEqual(Object.keys(ledger.reservations), [token.id]);
  assert.equal(ledger.reservations[token.id].amountAtomic, '10000');
  assert.equal(ledger.reservations[token.id].status, 'held');
  assert.equal(s.caps.spentTodayUsd, 0.01);
  const restarted = new SpendCaps({ maxPerCallUsd: 0.05, maxPerDayUsd: 0.01, stateFile });
  assert.equal(restarted.spentTodayUsd, 0.01);
  assert.equal(restarted.reserve(1n).ok, false);
  const retry = await s.client.callTool({ name: 'paid_thing' });
  assert.equal(retry.isError, true);
  assert.match(retry.content[0].text, /TANOD_MAX_USD_PER_DAY/);
  assert.equal(s.mock.state.sawPayment, 1);
  assert.equal(s.mock.state.payloads.length, 1);
  assert.equal(releases, 0);
});

test('broken accounting blocks paid signing but leaves ordinary free calls working', async (t) => {
  const d = mkdtempSync(join(process.env.CLIENT_CAPS_TMP || tmpdir(), 'proxy-caps-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  const stateFile = join(d, 'spend.json'); writeFileSync(stateFile, '{', { mode: 0o600 });
  signed = 0;
  const s = await setup({ key: TEST_KEY, stateFile });
  t.after(s.done);
  assert.equal((await s.client.callTool({ name: 'echo', arguments: { text: 'free' } })).isError, undefined);
  const r = await s.client.callTool({ name: 'paid_thing' });
  assert.equal(r.isError, true); assert.match(r.content[0].text, /accounting unavailable/);
  assert.equal(signed, 0); assert.equal(s.mock.state.sawPayment, 0);
  assert.equal(readFileSync(stateFile, 'utf8'), '{');
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
