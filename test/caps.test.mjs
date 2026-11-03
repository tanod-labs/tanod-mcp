import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { fork } from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { once } from 'node:events';
const scratch = process.env.CLIENT_CAPS_TMP;
function temp(t) { const d = mkdtempSync(join(scratch || tmpdir(), 'mcp-caps-')); t.after(() => rmSync(d, { recursive: true, force: true })); return d; }
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { SpendCaps, parseUsdEnv, usdToAtomic } from "../dist/caps.js";

// Count durable journal work separately from the lock I/O that every fresh read must retain.
function withLedgerIO(stateFile, action) {
  const originals = Object.fromEntries(['openSync', 'closeSync', 'readFileSync', 'writeFileSync', 'fsyncSync', 'renameSync'].map(k => [k, fs[k]]));
  const paths = new Map();
  const io = { reads: 0, writes: 0, fsyncs: 0, renames: 0, markerWrites: 0, markerFsyncs: 0, lockWrites: 0, lockFsyncs: 0, dirFsyncs: 0 };
  const temporary = path => path?.startsWith(`${stateFile}.`) && path.endsWith('.tmp');
  fs.openSync = (...args) => { const fd = originals.openSync(...args); paths.set(fd, String(args[0])); return fd; };
  fs.closeSync = fd => { try { return originals.closeSync(fd); } finally { paths.delete(fd); } };
  fs.readFileSync = (...args) => { if (paths.get(args[0]) === stateFile) io.reads++; return originals.readFileSync(...args); };
  fs.writeFileSync = (...args) => {
    const path = paths.get(args[0]);
    if (temporary(path)) io.writes++;
    if (path === `${stateFile}.initialized`) io.markerWrites++;
    if (path === join(`${stateFile}.lock`, 'owner.json')) io.lockWrites++;
    return originals.writeFileSync(...args);
  };
  fs.fsyncSync = (...args) => {
    const path = paths.get(args[0]);
    if (temporary(path)) io.fsyncs++;
    if (path === `${stateFile}.initialized`) io.markerFsyncs++;
    if (path === join(`${stateFile}.lock`, 'owner.json')) io.lockFsyncs++;
    if (path === dirname(stateFile)) io.dirFsyncs++;
    return originals.fsyncSync(...args);
  };
  fs.renameSync = (...args) => { if (args[1] === stateFile) io.renames++; return originals.renameSync(...args); };
  syncBuiltinESMExports();
  try { action(io); }
  finally { Object.assign(fs, originals); syncBuiltinESMExports(); }
}

test("per-call cap refuses above, allows at the cap", () => {
  const c = new SpendCaps({ maxPerCallUsd: 0.05, maxPerDayUsd: 1 });
  assert.equal(c.check(usdToAtomic(0.05)).ok, true);
  const d = c.check(usdToAtomic(0.06));
  assert.equal(d.ok, false);
  assert.match(d.reason, /TANOD_MAX_USD_PER_CALL/);
});

test("daily cap accumulates and refuses", () => {
  const c = new SpendCaps({ maxPerCallUsd: 0.05, maxPerDayUsd: 0.1 });
  assert.equal(c.reserve(usdToAtomic(0.05)).ok, true);
  assert.equal(c.reserve(usdToAtomic(0.05)).ok, true);
  const d = c.reserve(usdToAtomic(0.001));
  assert.equal(d.ok, false);
  assert.match(d.reason, /TANOD_MAX_USD_PER_DAY/);
});

test("release gives the reservation back", () => {
  const c = new SpendCaps({ maxPerCallUsd: 0.05, maxPerDayUsd: 0.05 });
  const d = c.reserve(usdToAtomic(0.05));
  c.release(d.reservation);
  assert.equal(c.reserve(usdToAtomic(0.05)).ok, true);
});

test("day rollover resets the total", () => {
  let now = new Date("2026-01-01T10:00:00Z");
  const c = new SpendCaps({ maxPerCallUsd: 1, maxPerDayUsd: 1, now: () => now });
  const d = c.reserve(usdToAtomic(1));
  c.commit(d.reservation);
  assert.equal(c.reserve(usdToAtomic(0.01)).ok, false);
  now = new Date("2026-01-02T00:00:01Z");
  assert.equal(c.reserve(usdToAtomic(0.01)).ok, true);
});

test("state file persists the daily total", (t) => {
  const f = join(temp(t), "s", "spend.json");
  const now = () => new Date("2026-03-03T00:00:00Z");
  new SpendCaps({ maxPerCallUsd: 1, maxPerDayUsd: 1, stateFile: f, now }).reserve(usdToAtomic(0.9));
  const c2 = new SpendCaps({ maxPerCallUsd: 1, maxPerDayUsd: 1, stateFile: f, now });
  assert.equal(c2.check(usdToAtomic(0.2)).ok, false);
  assert.equal(c2.check(usdToAtomic(0.1)).ok, true);
});

test('unchanged reads and denied reservations never rewrite a populated journal', (t) => {
  const stateFile = join(temp(t), 'spend.json'), day = '2026-10-18';
  const reservations = Object.fromEntries(Array.from({ length: 256 }, (_, i) => [
    `11111111-1111-1111-1111-${i.toString(16).padStart(12, '0')}`,
    { amountAtomic: '1000', day, status: 'held' },
  ]));
  const text = JSON.stringify({ version: 2, day, spentAtomic: '0', reservations });
  writeFileSync(stateFile, text, { mode: 0o600 });
  writeFileSync(`${stateFile}.initialized`, 'tanod-spend-v2\n', { mode: 0o600 });
  const inode = fs.statSync(stateFile).ino;
  const c = new SpendCaps({ maxPerCallUsd: 1, maxPerDayUsd: 1, stateFile, now: () => new Date(day) });
  withLedgerIO(stateFile, io => {
    for (let i = 0; i < 12; i++) {
      assert.equal(c.check(1n).ok, true);
      assert.equal(c.check(1000001n).ok, false);
      assert.equal(c.spentTodayUsd, 0.256);
      assert.equal(c.reserve(800000n).ok, false);
    }
    assert.equal(io.reads, 48, 'every operation must validate a fresh ledger');
    assert.equal(io.lockWrites, 48);
    assert.equal(io.lockFsyncs, 48);
    assert.equal(io.dirFsyncs, 96, 'lock acquisition/release retain parent durability');
    assert.equal(io.writes, 0);
    assert.equal(io.fsyncs, 0);
    assert.equal(io.renames, 0);
    assert.equal(io.markerWrites, 0);
    assert.equal(io.markerFsyncs, 0);
  });
  assert.equal(readFileSync(stateFile, 'utf8'), text);
  assert.equal(fs.statSync(stateFile).ino, inode);
});

test('initialization and real transitions save once; repeated finalization only reads', (t) => {
  const stateFile = join(temp(t), 'spend.json');
  const c = new SpendCaps({ maxPerCallUsd: 1, maxPerDayUsd: 1, stateFile });
  withLedgerIO(stateFile, io => {
    const saved = count => {
      assert.equal(io.writes, count);
      assert.equal(io.fsyncs, count);
      assert.equal(io.renames, count);
    };
    assert.equal(c.check(0n).ok, true); saved(1); // first-use initialization is durable
    assert.equal(io.markerWrites, 1);
    assert.equal(io.markerFsyncs, 1);
    assert.equal(c.spentTodayUsd, 0); saved(1);
    const a = c.reserve(400000n).reservation; saved(2);
    c.commit(a); saved(3);
    c.commit(a); saved(3);
    const b = c.reserve(400000n).reservation; saved(4);
    c.release(b); saved(5);
    c.release(b); saved(5);
    assert.equal(c.spentTodayUsd, 0.4); saved(5);
    assert.equal(c.reserve(700000n).ok, false); saved(5);
    assert.equal(io.markerWrites, 1);
    assert.equal(io.markerFsyncs, 1);
  });
});

test('independent processes freshly reserve under one shared daily cap', async (t) => {
  const stateFile = join(temp(t), 'spend.json');
  const options = { maxPerCallUsd: 1, maxPerDayUsd: 1, stateFile,
    now: () => new Date('2026-10-18T12:00:00Z') };
  const observer = new SpendCaps(options);
  assert.equal(observer.spentTodayUsd, 0);
  assert.equal(observer.check(800000n).ok, true);
  const children = [1, 2].map(() => fork(new URL('./caps-process.mjs', import.meta.url), [], {
    env: { ...process.env, CAPS_FILE: stateFile }, stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  }));
  t.after(() => children.forEach(c => c.kill()));
  await Promise.all(children.map(c => once(c, 'message'))); // both constructed before either reserve
  const replies = children.map(c => once(c, 'message'));
  children.forEach(c => c.send('reserve'));
  const decisions = (await Promise.all(replies)).map(([m]) => m.decision);
  assert.equal(decisions.filter(d => d?.ok).length, 1, 'two $0.80 authorizations must not fit a $1 ledger');
  assert.equal(observer.spentTodayUsd, 0.8, 'already-used reader must observe another process reservation');
  assert.equal(observer.check(300000n).ok, false);
  assert.equal(observer.reserve(300000n).ok, false);
  const winner = decisions.find(d => d.ok).reservation;
  new SpendCaps(options).release(winner);
  assert.equal(observer.spentTodayUsd, 0, 'already-used reader must also observe a released reservation');
  assert.equal(observer.check(1000000n).ok, true);
});

test('corruption and inaccessible ledger fail closed instead of resetting', (t) => {
  const stateFile = join(temp(t), 'spend.json');
  for (const content of ['{', '{"day":"2026-10-18","spentAtomic":"-10"}', '{"day":"old","spentAtomic":"NaN"}']) {
    writeFileSync(stateFile, content);
    assert.throws(() => new SpendCaps({ maxPerCallUsd: 1, maxPerDayUsd: 1, stateFile }).reserve(800000n), /ledger|accounting/i);
    assert.equal(readFileSync(stateFile, 'utf8'), content);
  }
  rmSync(stateFile); mkdirSync(stateFile);
  assert.throws(() => new SpendCaps({ maxPerCallUsd: 1, maxPerDayUsd: 1, stateFile }).reserve(800000n), /ledger|accounting/i);
});

test('invalid and unsafe money values cannot create budget', () => {
  for (const usd of [-1, NaN, Infinity, 1e30, 0.0000001, 0.0050009]) assert.throws(() => usdToAtomic(usd));
  assert.equal(usdToAtomic(0.000001), 1n);
  const c = new SpendCaps({ maxPerCallUsd: 1, maxPerDayUsd: 1 });
  assert.throws(() => c.reserve(-1n));
  assert.equal(c.reserve(10n ** 100n).ok, false);
  assert.equal(c.spentTodayUsd, 0);
});

test('held reservations survive restart and UTC rollover; confirmed spend uses confirmation day', (t) => {
  const stateFile = join(temp(t), 'spend.json');
  let now = new Date('2026-10-18T23:59:59Z');
  const options = { maxPerCallUsd: 1, maxPerDayUsd: 1, stateFile, now: () => now };
  const c = new SpendCaps(options);
  const held = c.reserve(800000n).reservation;
  now = new Date('2026-10-19T00:00:01Z');
  const restarted = new SpendCaps(options);
  assert.equal(restarted.spentTodayUsd, 0.8);
  assert.equal(restarted.reserve(300000n).ok, false);
  restarted.commit(held); restarted.commit(held);
  assert.equal(restarted.spentTodayUsd, 0.8);
  assert.throws(() => restarted.release(held), /different outcome/);
  now = new Date('2026-10-20T00:00:00Z');
  assert.equal(restarted.spentTodayUsd, 0);
  assert.equal(restarted.reserve(1000000n).ok, true);
});

test('read-only UTC rollover saves once, prunes settled tokens and preserves unresolved holds', (t) => {
  const stateFile = join(temp(t), 'spend.json');
  let now = new Date('2026-10-18T23:59:59Z');
  const options = { maxPerCallUsd: 1, maxPerDayUsd: 1, stateFile, now: () => now };
  const c = new SpendCaps(options);
  const settled = c.reserve(400000n).reservation; c.commit(settled);
  const released = c.reserve(100000n).reservation; c.release(released);
  const held = c.reserve(300000n).reservation;
  now = new Date('2026-10-19T00:00:01Z');
  withLedgerIO(stateFile, io => {
    assert.equal(c.check(700000n).ok, true);
    assert.equal(io.writes, 1);
    assert.equal(io.fsyncs, 1);
    assert.equal(io.renames, 1);
    const ledger = JSON.parse(readFileSync(stateFile, 'utf8'));
    assert.equal(ledger.day, '2026-10-19');
    assert.equal(ledger.spentAtomic, '0');
    assert.deepEqual(Object.keys(ledger.reservations), [held.id]);
    assert.equal(new SpendCaps(options).spentTodayUsd, 0.3);
    assert.equal(c.reserve(800000n).ok, false);
    assert.equal(io.writes, 1);
    assert.equal(io.fsyncs, 1);
    assert.equal(io.renames, 1);
  });
  now = new Date('2026-10-20T00:00:01Z');
  withLedgerIO(stateFile, io => {
    assert.equal(c.spentTodayUsd, 0.3, 'held reservations count on every day');
    assert.equal(io.writes, 1);
    assert.equal(io.fsyncs, 1);
    assert.equal(io.renames, 1);
    assert.equal(new SpendCaps(options).check(700001n).ok, false);
    assert.equal(io.writes, 1);
  });
  c.commit(held); c.commit(held);
  assert.equal(new SpendCaps(options).spentTodayUsd, 0.3);
});

test('release/commit tokens are idempotent, not amount subtraction across reservations', (t) => {
  const stateFile = join(temp(t), 'spend.json');
  const c = new SpendCaps({ maxPerCallUsd: 1, maxPerDayUsd: 1, stateFile });
  const a = c.reserve(400000n).reservation, b = c.reserve(400000n).reservation;
  c.release(a); c.release(a);
  assert.equal(c.spentTodayUsd, 0.4);
  assert.throws(() => c.release({ ...b, amountAtomic: '1' }), /mismatched/);
  assert.throws(() => c.release(400000n), /invalid reservation/);
  c.commit(b); c.commit(b);
  assert.equal(c.spentTodayUsd, 0.4);
});

test('legacy totals migrate as unresolved holds, including a previous UTC day', (t) => {
  const stateFile = join(temp(t), 'spend.json');
  writeFileSync(stateFile, JSON.stringify({ day: '2026-10-17', spentAtomic: '800000' }), { mode: 0o600 });
  const c = new SpendCaps({ maxPerCallUsd: 1, maxPerDayUsd: 1, stateFile, now: () => new Date('2026-10-18') });
  assert.equal(c.reserve(300000n).ok, false);
  const ledger = JSON.parse(readFileSync(stateFile, 'utf8'));
  assert.equal(ledger.version, 2);
  assert.equal(Object.values(ledger.reservations)[0].status, 'held');
});

for (const amount of ['0', '800000']) test(`read-only legacy migration (${amount} atomic) saves exactly once`, (t) => {
  const stateFile = join(temp(t), 'spend.json');
  writeFileSync(stateFile, JSON.stringify({ day: '2026-10-17', spentAtomic: amount }), { mode: 0o600 });
  const options = { maxPerCallUsd: 1, maxPerDayUsd: 1, stateFile, now: () => new Date('2026-10-18') };
  const c = new SpendCaps(options);
  withLedgerIO(stateFile, io => {
    assert.equal(c.check(300000n).ok, amount === '0');
    const ledger = JSON.parse(readFileSync(stateFile, 'utf8'));
    assert.equal(ledger.version, 2);
    assert.equal(ledger.day, '2026-10-18');
    assert.equal(ledger.spentAtomic, '0');
    const entries = Object.values(ledger.reservations);
    assert.equal(entries.length, amount === '0' ? 0 : 1);
    if (entries.length) assert.deepEqual(entries[0], { amountAtomic: amount, day: '2026-10-17', status: 'held' });
    assert.equal(c.spentTodayUsd, Number(amount) / 1000000);
    assert.equal(new SpendCaps(options).spentTodayUsd, Number(amount) / 1000000);
    assert.equal(io.writes, 1);
    assert.equal(io.fsyncs, 1);
    assert.equal(io.renames, 1);
    assert.equal(io.markerWrites, 1);
    assert.equal(io.markerFsyncs, 1);
  });
});

test('read-only access restores a missing initialization marker without losing held budget', (t) => {
  const stateFile = join(temp(t), 'spend.json');
  const c = new SpendCaps({ maxPerCallUsd: 1, maxPerDayUsd: 1, stateFile });
  c.reserve(800000n);
  rmSync(`${stateFile}.initialized`); // synthetic interrupted initial save
  withLedgerIO(stateFile, io => {
    assert.equal(c.spentTodayUsd, 0.8);
    assert.equal(c.check(300000n).ok, false);
    assert.equal(io.writes, 1);
    assert.equal(io.fsyncs, 1);
    assert.equal(io.renames, 1);
    assert.equal(io.markerWrites, 1);
    assert.equal(io.markerFsyncs, 1);
  });
  rmSync(stateFile);
  assert.throws(() => c.check(1n), /initialized ledger is missing/);
  assert.throws(() => c.spentTodayUsd, /initialized ledger is missing/);
});

test('ledger deletion after initialization is fail closed, not a new budget', (t) => {
  const stateFile = join(temp(t), 'spend.json');
  const c = new SpendCaps({ maxPerCallUsd: 1, maxPerDayUsd: 1, stateFile });
  c.reserve(800000n); rmSync(stateFile);
  assert.throws(() => c.reserve(800000n), /initialized ledger is missing/);
});

for (const kind of ['ledger', 'parent', 'lock']) test(`symlink ${kind} is refused without modifying target`, (t) => {
  const d = temp(t), actual = join(d, 'actual'); mkdirSync(actual, { mode: 0o700 });
  const target = join(actual, 'data'); writeFileSync(target, 'untouched', { mode: 0o600 });
  const stateFile = join(d, 'spend.json');
  if (kind === 'ledger') fs.symlinkSync(target, stateFile);
  if (kind === 'lock') fs.symlinkSync(actual, `${stateFile}.lock`);
  if (kind === 'parent') fs.symlinkSync(actual, join(d, 'linked'));
  const c = new SpendCaps({ maxPerCallUsd: 1, maxPerDayUsd: 1, stateFile: kind === 'parent' ? join(d, 'linked', 'spend.json') : stateFile });
  assert.throws(() => c.reserve(1n), /ledger|accounting/);
  assert.equal(readFileSync(target, 'utf8'), 'untouched');
});

test('unsafe file permissions and hard links fail closed', (t) => {
  const d = temp(t), f = join(d, 'spend.json');
  writeFileSync(f, '{"day":"2026-10-18","spentAtomic":"0"}', { mode: 0o644 });
  const opts = { maxPerCallUsd: 1, maxPerDayUsd: 1, stateFile: f };
  assert.throws(() => new SpendCaps(opts).reserve(1n), /owner-only/);
  fs.chmodSync(f, 0o600); fs.linkSync(f, join(d, 'alias'));
  assert.throws(() => new SpendCaps(opts).reserve(1n), /hard links/);
});

test('already-used read-only caps fail closed on corruption and unsafe permissions', (t) => {
  const stateFile = join(temp(t), 'spend.json');
  const c = new SpendCaps({ maxPerCallUsd: 1, maxPerDayUsd: 1, stateFile });
  c.reserve(800000n);
  const text = readFileSync(stateFile, 'utf8');
  withLedgerIO(stateFile, io => {
    for (const content of ['{', text.replace('"spentAtomic":"0"', '"spentAtomic":"1"')]) {
      writeFileSync(stateFile, content);
      assert.throws(() => c.check(1n), /accounting unavailable/);
      assert.throws(() => c.spentTodayUsd, /accounting unavailable/);
      assert.equal(readFileSync(stateFile, 'utf8'), content);
    }
    writeFileSync(stateFile, text);
    fs.chmodSync(stateFile, 0o644);
    assert.throws(() => c.check(1n), /owner-only/);
    assert.throws(() => c.spentTodayUsd, /owner-only/);
    fs.chmodSync(stateFile, 0o600);
    writeFileSync(`${stateFile}.initialized`, 'invalid\n');
    assert.throws(() => c.check(1n), /initialization marker/);
    assert.throws(() => c.spentTodayUsd, /initialization marker/);
    assert.equal(io.writes, 0);
    assert.equal(io.fsyncs, 0);
    assert.equal(io.renames, 0);
  });
});

for (const access of ['check', 'spentTodayUsd']) {
  for (const operation of ['open', 'read', 'lock-write', 'lock-fsync', 'dir-fsync', 'cleanup']) test(`read-only ${access} fails closed on injected ${operation} failure`, (t) => {
    const stateFile = join(temp(t), 'spend.json');
    const c = new SpendCaps({ maxPerCallUsd: 1, maxPerDayUsd: 1, stateFile });
    c.reserve(800000n);
    const text = readFileSync(stateFile, 'utf8');
    const originals = Object.fromEntries(['openSync', 'readFileSync', 'writeFileSync', 'fsyncSync', 'unlinkSync'].map(k => [k, fs[k]]));
    const paths = new Map(); let triggered = false;
    const error = () => { triggered = true; throw Object.assign(new Error('synthetic EIO'), { code: 'EIO' }); };
    fs.openSync = (...args) => {
      if (operation === 'open' && args[0] === stateFile) error();
      const fd = originals.openSync(...args); paths.set(fd, String(args[0])); return fd;
    };
    fs.readFileSync = (...args) => { if (operation === 'read' && paths.get(args[0]) === stateFile) error(); return originals.readFileSync(...args); };
    fs.writeFileSync = (...args) => { if (operation === 'lock-write' && paths.get(args[0]) === join(`${stateFile}.lock`, 'owner.json')) error(); return originals.writeFileSync(...args); };
    fs.fsyncSync = (...args) => {
      const path = paths.get(args[0]);
      if ((operation === 'lock-fsync' && path === join(`${stateFile}.lock`, 'owner.json')) ||
          (operation === 'dir-fsync' && path === dirname(stateFile))) error();
      return originals.fsyncSync(...args);
    };
    fs.unlinkSync = (...args) => { if (operation === 'cleanup' && args[0] === join(`${stateFile}.lock`, 'owner.json')) error(); return originals.unlinkSync(...args); };
    syncBuiltinESMExports();
    try {
      assert.throws(() => access === 'check' ? c.check(1n) : c.spentTodayUsd, /accounting unavailable/);
      assert.equal(triggered, true);
    } finally { Object.assign(fs, originals); syncBuiltinESMExports(); }
    assert.equal(readFileSync(stateFile, 'utf8'), text);
    rmSync(`${stateFile}.lock`, { recursive: true, force: true }); // synthetic owner is quiesced
    assert.equal(c.spentTodayUsd, 0.8);
  });
}

for (const operation of ['read', 'write', 'fsync', 'dir-fsync', 'rename', 'cleanup']) test(`injected ${operation} failure never authorizes a paid operation`, (t) => {
  const stateFile = join(temp(t), 'spend.json');
  const c = new SpendCaps({ maxPerCallUsd: 1, maxPerDayUsd: 1, stateFile });
  c.check(0n);
  const originals = { openSync: fs.openSync, readFileSync: fs.readFileSync, writeFileSync: fs.writeFileSync,
    fsyncSync: fs.fsyncSync, renameSync: fs.renameSync, unlinkSync: fs.unlinkSync };
  const paths = new Map(); let triggered = false;
  const error = () => { triggered = true; throw Object.assign(new Error('synthetic EACCES'), { code: 'EACCES' }); };
  fs.openSync = (...args) => { const fd = originals.openSync(...args); paths.set(fd, String(args[0])); return fd; };
  fs.readFileSync = (...args) => { if (operation === 'read' && paths.get(args[0]) === stateFile) error(); return originals.readFileSync(...args); };
  fs.writeFileSync = (...args) => { if (operation === 'write' && paths.get(args[0])?.endsWith('.tmp')) error(); return originals.writeFileSync(...args); };
  fs.fsyncSync = (...args) => {
    if ((operation === 'fsync' && paths.get(args[0])?.endsWith('.tmp')) ||
        (operation === 'dir-fsync' && paths.get(args[0]) === fs.realpathSync(join(stateFile, '..')))) error();
    return originals.fsyncSync(...args);
  };
  fs.renameSync = (...args) => { if (operation === 'rename') error(); return originals.renameSync(...args); };
  fs.unlinkSync = (...args) => { if (operation === 'cleanup' && args[0].endsWith('owner.json')) error(); return originals.unlinkSync(...args); };
  syncBuiltinESMExports();
  try { assert.throws(() => c.reserve(800000n), /accounting unavailable/); assert.equal(triggered, true); }
  finally { Object.assign(fs, originals); syncBuiltinESMExports(); }
  if (['dir-fsync', 'cleanup'].includes(operation)) rmSync(`${stateFile}.lock`, { recursive: true, force: true }); // test-only quiesced owner recovery
  assert.doesNotThrow(() => JSON.parse(readFileSync(stateFile, 'utf8')));
  const next = c.reserve(800000n);
  assert.equal(next.ok, operation !== 'cleanup'); // cleanup failed after durable reservation: count it
});

for (const phase of ['acquired', 'read', 'write', 'before-rename', 'after-rename']) test(`SIGKILL at transaction ${phase}: bounded fail-closed restart and intact accounting`, { timeout: 10000 }, async (t) => {
  const stateFile = join(temp(t), 'spend.json');
  const opts = { maxPerCallUsd: 1, maxPerDayUsd: 1, stateFile, now: () => new Date('2026-10-18T12:00:00Z') };
  const c = new SpendCaps(opts); c.check(0n);
  const child = fork(new URL('./caps-fault-process.mjs', import.meta.url), [], {
    env: { ...process.env, CAPS_FILE: stateFile, CAPS_PHASE: phase }, stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  });
  t.after(() => child.kill());
  const [message] = await once(child, 'message'); assert.equal(message.boundary, phase);
  const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
  const started = Date.now();
  assert.throws(() => new SpendCaps(opts).reserve(800000n), /lock busy or orphaned/);
  assert.ok(Date.now() - started < 2500, 'bounded lock wait');
  assert.doesNotThrow(() => JSON.parse(readFileSync(stateFile, 'utf8')));
  rmSync(`${stateFile}.lock`, { recursive: true }); // Only after our sole child is confirmed dead: runbook simulation.
  const recovered = new SpendCaps(opts);
  assert.equal(recovered.spentTodayUsd, phase === 'after-rename' ? 0.8 : 0);
  if (phase === 'after-rename') assert.equal(recovered.reserve(800000n).ok, false);
});

test('live transaction lock is never evicted by age; replacement lock is never removed', (t) => {
  const stateFile = join(temp(t), 'spend.json');
  const c = new SpendCaps({ maxPerCallUsd: 1, maxPerDayUsd: 1, stateFile });
  c.check(0n);
  const lock = `${stateFile}.lock`;
  mkdirSync(lock, { mode: 0o700 }); writeFileSync(join(lock, 'owner.json'), '{"token":"live"}', { mode: 0o600 });
  fs.utimesSync(lock, new Date('2000-01-01'), new Date('2000-01-01'));
  assert.throws(() => c.reserve(1n), /lock busy or orphaned/);
  assert.equal(readFileSync(join(lock, 'owner.json'), 'utf8'), '{"token":"live"}');
  rmSync(lock, { recursive: true }); // sole test fixture, no actual owner
  const original = fs.renameSync; let replaced = false;
  fs.renameSync = (...args) => {
    original(...args);
    if (args[1] === stateFile) {
      original(lock, `${lock}.old`); mkdirSync(lock, { mode: 0o700 });
      writeFileSync(join(lock, 'owner.json'), '{"token":"replacement"}', { mode: 0o600 }); replaced = true;
    }
  };
  syncBuiltinESMExports();
  try { assert.throws(() => c.reserve(1n), /ownership changed/); }
  finally { fs.renameSync = original; syncBuiltinESMExports(); }
  assert.equal(replaced, true);
  assert.equal(readFileSync(join(lock, 'owner.json'), 'utf8'), '{"token":"replacement"}');
});

test('UTC day is sampled inside the lock, not before contended midnight acquisition', (t) => {
  const stateFile = join(temp(t), 'spend.json');
  let now = new Date('2026-10-18T23:59:59Z');
  const c = new SpendCaps({ maxPerCallUsd: 1, maxPerDayUsd: 1, stateFile, now: () => now });
  c.check(0n);
  const original = fs.mkdirSync;
  fs.mkdirSync = (...args) => {
    const result = original(...args);
    if (args[0] === `${stateFile}.lock`) now = new Date('2026-10-19T00:00:01Z');
    return result;
  };
  syncBuiltinESMExports();
  try { c.reserve(800000n); }
  finally { fs.mkdirSync = original; syncBuiltinESMExports(); }
  assert.equal(JSON.parse(readFileSync(stateFile, 'utf8')).day, '2026-10-19');
});

test('malformed current ledger schema, dates, totals and reservation entries fail closed', (t) => {
  const stateFile = join(temp(t), 'spend.json');
  const d = '2026-10-18', id = '11111111-1111-1111-1111-111111111111';
  const base = { version: 2, day: d, spentAtomic: '0', reservations: {} };
  const malformed = [null, [], { ...base, day: '2026-02-30' }, { ...base, day: '2027-01-01' },
    { ...base, spentAtomic: '1' }, { ...base, spentAtomic: '0x1' }, { ...base, more: true },
    { ...base, reservations: { bad: {} } },
    { ...base, reservations: { [id]: { amountAtomic: '-1', day: d, status: 'held' } } },
    { ...base, reservations: { [id]: { amountAtomic: '1', day: d, status: 'released' } } },
  ];
  for (const ledger of malformed) {
    writeFileSync(stateFile, JSON.stringify(ledger), { mode: 0o600 });
    assert.throws(() => new SpendCaps({ maxPerCallUsd: 1, maxPerDayUsd: 1, stateFile, now: () => new Date(d) }).reserve(1n), /accounting unavailable/);
  }
});

test("env parsing: defaults, valid, invalid", () => {
  assert.equal(parseUsdEnv(undefined, 0.05, "X"), 0.05);
  assert.equal(parseUsdEnv("0.2", 0.05, "X"), 0.2);
  assert.throws(() => parseUsdEnv("abc", 0.05, "X"), /X must be/);
  assert.throws(() => parseUsdEnv("-1", 0.05, "X"), /X must be/);
  for (const raw of ['NaN', 'Infinity', '0x10', '1e30', '1e-999', '0.0050000000000000001', '9007199254.740992']) {
    assert.throws(() => parseUsdEnv(raw, 1, 'X'), /X must be/);
  }
  assert.equal(parseUsdEnv('1e-6', 1, 'X'), 0.000001);
});
