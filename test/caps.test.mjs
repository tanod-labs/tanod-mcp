import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SpendCaps, parseUsdEnv, usdToAtomic } from "../dist/caps.js";

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
  c.reserve(usdToAtomic(0.05));
  c.release(usdToAtomic(0.05));
  assert.equal(c.reserve(usdToAtomic(0.05)).ok, true);
});

test("day rollover resets the total", () => {
  let now = new Date("2026-01-01T10:00:00Z");
  const c = new SpendCaps({ maxPerCallUsd: 1, maxPerDayUsd: 1, now: () => now });
  c.reserve(usdToAtomic(1));
  assert.equal(c.reserve(usdToAtomic(0.01)).ok, false);
  now = new Date("2026-01-02T00:00:01Z");
  assert.equal(c.reserve(usdToAtomic(0.01)).ok, true);
});

test("state file persists the daily total", () => {
  const f = join(mkdtempSync(join(tmpdir(), "tanod-")), "s", "spend.json");
  const now = () => new Date("2026-03-03T00:00:00Z");
  new SpendCaps({ maxPerCallUsd: 1, maxPerDayUsd: 1, stateFile: f, now }).reserve(usdToAtomic(0.9));
  const c2 = new SpendCaps({ maxPerCallUsd: 1, maxPerDayUsd: 1, stateFile: f, now });
  assert.equal(c2.check(usdToAtomic(0.2)).ok, false);
  assert.equal(c2.check(usdToAtomic(0.1)).ok, true);
});

test("env parsing: defaults, valid, invalid", () => {
  assert.equal(parseUsdEnv(undefined, 0.05, "X"), 0.05);
  assert.equal(parseUsdEnv("0.2", 0.05, "X"), 0.2);
  assert.throws(() => parseUsdEnv("abc", 0.05, "X"), /X must be/);
  assert.throws(() => parseUsdEnv("-1", 0.05, "X"), /X must be/);
});
