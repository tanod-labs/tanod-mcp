import {
  closeSync, constants, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync,
  readFileSync, renameSync, rmdirSync, unlinkSync, writeFileSync, type Stats,
} from "node:fs";
import { dirname, isAbsolute, join, parse, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { performance } from "node:perf_hooks";

/** USDC has 6 decimals. No floating point multiplication/rounding for authorization. */
export const USDC_DECIMALS = 6;
const MAX_ATOMIC = BigInt(Number.MAX_SAFE_INTEGER);
const MAX_BYTES = 1024 * 1024;
const MAX_ENTRIES = 4096;
const LOCK_WAIT_MS = 1000;
const sleepCell = new Int32Array(new SharedArrayBuffer(4));

export function usdToAtomic(usd: number): bigint {
  if (!Number.isFinite(usd) || usd < 0) throw new Error("USD limit must be a finite non-negative number");
  const [mantissa, exponent = "0"] = usd.toString().toLowerCase().split("e");
  const [whole, fraction = ""] = mantissa.split(".");
  const digits = BigInt(whole + fraction);
  const shift = USDC_DECIMALS + Number(exponent) - fraction.length;
  const divisor = shift < 0 ? 10n ** BigInt(-shift) : 1n;
  if (digits % divisor !== 0n) throw new Error("USD limit must use at most 6 decimal places (USDC)");
  const amount = shift >= 0 ? digits * 10n ** BigInt(shift) : digits / divisor;
  if (amount > MAX_ATOMIC) throw new Error("USD limit exceeds the safe accounting range");
  return amount;
}

export function atomicToUsd(a: bigint): number { return Number(a) / 10 ** USDC_DECIMALS; }

export function parseUsdEnv(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  try {
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw.trim())) throw new Error();
    if (raw.trim().length > 64) throw new Error();
    const [mantissa, exponent = "0"] = raw.trim().toLowerCase().split("e");
    const [whole, fraction = ""] = mantissa.split(".");
    const exp = Number(exponent);
    if (!Number.isSafeInteger(exp) || Math.abs(exp) > 308) throw new Error();
    const digits = BigInt((whole || "0") + fraction);
    const shift = USDC_DECIMALS + exp - fraction.length;
    const divisor = shift < 0 ? 10n ** BigInt(-shift) : 1n;
    if (digits % divisor !== 0n) throw new Error();
    const exact = shift >= 0 ? digits * 10n ** BigInt(shift) : digits / divisor;
    if (usdToAtomic(n) !== exact) throw new Error();
  } catch { throw new Error(`${name} must be a non-negative number of US dollars with at most 6 decimals in the safe accounting range`); }
  return n;
}

export interface CapsOptions {
  maxPerCallUsd: number;
  maxPerDayUsd: number;
  /** Shared local-filesystem ledger. Undefined intentionally opts into process-local accounting only. */
  stateFile?: string;
  now?: () => Date;
}
export type CapDecision = { ok: true } | { ok: false; reason: string };
export interface Reservation { readonly id: string; readonly amountAtomic: string }
export type ReserveDecision = { ok: true; reservation: Reservation } | { ok: false; reason: string };
/** The EIP-3009 authorization that was handed to the server for a held reservation (all public data). */
export interface SentAuthorization { readonly from: string; readonly nonce: string; readonly validBefore: string }
export interface SentHold { readonly reservation: Reservation; readonly authorization: SentAuthorization }
type Entry = { amountAtomic: string; day: string; status: "held" | "committed" | "released"; finalizedDay?: string; auth?: SentAuthorization };
type Ledger = { version: 2; day: string; spentAtomic: string; reservations: Record<string, Entry> };
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class SpendAccountingError extends Error {
  constructor(detail: string) { super(`Spending ledger accounting unavailable: ${detail}. Paid operations are blocked; preserve the ledger and unresolved reservations.`); }
}
const fail = (detail: string): never => { throw new SpendAccountingError(detail); };
function missing(e: unknown): boolean { return (e as NodeJS.ErrnoException)?.code === "ENOENT"; }
function same(a: Stats, b: Stats): boolean { return a.dev === b.dev && a.ino === b.ino; }
function validDay(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d\d-\d\d$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
}
function atomic(s: unknown): bigint {
  if (typeof s !== "string" || !/^(0|[1-9][0-9]{0,15})$/.test(s) || BigInt(s) > MAX_ATOMIC) return fail("invalid atomic amount");
  return BigInt(s);
}
function validAuth(a: unknown): a is SentAuthorization {
  return plain(a) && keys(a, ["from", "nonce", "validBefore"]) && Object.keys(a).length === 3 &&
    typeof a.from === "string" && /^0x[0-9a-fA-F]{40}$/.test(a.from) &&
    typeof a.nonce === "string" && /^0x[0-9a-fA-F]{64}$/.test(a.nonce) &&
    typeof a.validBefore === "string" && /^(0|[1-9][0-9]{0,15})$/.test(a.validBefore) && BigInt(a.validBefore) <= MAX_ATOMIC;
}
function plain(o: unknown): o is Record<string, any> { return !!o && typeof o === "object" && !Array.isArray(o); }
function keys(o: Record<string, any>, names: string[]): boolean { return Object.keys(o).every(k => names.includes(k)); }
function privateStat(s: Stats, directory = false): void {
  if ((directory ? !s.isDirectory() : !s.isFile()) || (process.getuid && s.uid !== process.getuid()) ||
      (s.mode & 0o077) !== 0 || (s.mode & (directory ? 0o700 : 0o600)) !== (directory ? 0o700 : 0o600) || (!directory && s.nlink !== 1)) {
    fail("ledger/lock must be owner-only, accessible, regular files/directories (no symlinks or hard links)");
  }
}

/**
 * Short mkdir-locked fresh-read/check/write transactions; never holds a lock during signing/network I/O.
 * Requires a trusted, private parent on a local POSIX filesystem with atomic rename + file/directory fsync.
 * Locks are NEVER reclaimed by age/PID: crash locks require quiesced, owner-verified manual recovery.
 */
export class SpendCaps {
  readonly maxPerCallUsd: number;
  private readonly perCall: bigint;
  private readonly perDay: bigint;
  private readonly now: () => Date;
  private readonly file?: string;
  private memory: Ledger;

  constructor(private readonly opts: CapsOptions) {
    this.now = opts.now ?? (() => new Date());
    this.maxPerCallUsd = opts.maxPerCallUsd;
    this.perCall = usdToAtomic(opts.maxPerCallUsd);
    this.perDay = usdToAtomic(opts.maxPerDayUsd);
    if (opts.stateFile !== undefined) {
      if (!opts.stateFile || opts.stateFile.includes("\0")) fail("invalid ledger path");
      this.file = resolve(opts.stateFile);
      if (this.file.length > 3800 || parse(this.file).base.length > 120) fail("ledger path is too long");
    }
    this.memory = this.empty(this.today()); // Lazy I/O: broken paid accounting does not disable free tools.
  }

  private today(): string {
    const day = this.now().toISOString().slice(0, 10);
    if (!validDay(day)) return fail("invalid accounting date");
    return day;
  }
  private empty(day: string): Ledger { return { version: 2, day, spentAtomic: "0", reservations: {} }; }

  private prepareParent(file: string): void {
    const parent = dirname(file);
    if (!isAbsolute(file)) fail("ledger path must be absolute");
    let cursor = parse(parent).root;
    for (const part of parent.slice(cursor.length).split(sep).filter(Boolean)) {
      cursor = join(cursor, part);
      let s: Stats;
      try { s = lstatSync(cursor); }
      catch (e) {
        if (!missing(e)) throw e;
        try { mkdirSync(cursor, { mode: 0o700 }); }
        catch (createError) { if ((createError as NodeJS.ErrnoException).code !== "EEXIST") throw createError; }
        this.syncDir(dirname(cursor));
        s = lstatSync(cursor);
      }
      // Trusted ancestors, with sticky shared temp roots allowed only above our private parent.
      if (!s.isDirectory() || ((s.mode & 0o022) && !(s.mode & 0o1000))) fail("unsafe/symlink ledger ancestor");
    }
    privateStat(lstatSync(parent), true);
  }
  private syncDir(path: string): void {
    const fd = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try { fsyncSync(fd); } finally { closeSync(fd); }
  }
  private readPrivate(path: string): string | undefined {
    let fd: number;
    try { fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
    catch (e) { if (missing(e)) return; throw e; }
    try {
      const s = fstatSync(fd);
      privateStat(s);
      if (s.size > MAX_BYTES) fail("ledger/lock exceeds size bound");
      const text = readFileSync(fd, "utf8");
      if (Buffer.byteLength(text) > MAX_BYTES) fail("ledger/lock exceeds size bound");
      return text;
    } finally { closeSync(fd); }
  }

  private load(file: string, day: string): { ledger: Ledger; dirty: boolean } {
    const marker = this.readPrivate(`${file}.initialized`);
    if (marker !== undefined && marker !== "tanod-spend-v2\n") fail("invalid initialization marker");
    const text = this.readPrivate(file);
    if (text === undefined) {
      if (marker !== undefined) fail("initialized ledger is missing");
      return { ledger: this.empty(day), dirty: true }; // Persist initialization and its deletion guard once.
    }
    let v: any;
    try { v = JSON.parse(text); } catch { return fail("corrupt JSON ledger"); }
    if (!plain(v) || !validDay(v.day) || v.day > day) return fail("invalid ledger date/schema or clock moved backwards");
    atomic(v.spentAtomic);
    if (v.version === undefined && keys(v, ["day", "spentAtomic"]) && Object.keys(v).length === 2) {
      // Legacy totals did not distinguish settled/uncertain payments. Never reset them on rollover.
      const migrated = this.empty(day);
      if (v.spentAtomic !== "0") migrated.reservations[randomUUID()] = { amountAtomic: v.spentAtomic, day: v.day, status: "held" };
      return { ledger: migrated, dirty: true };
    }
    if (v.version !== 2 || !keys(v, ["version", "day", "spentAtomic", "reservations"]) || !plain(v.reservations) || Object.keys(v.reservations).length > MAX_ENTRIES) return fail("invalid ledger schema");
    for (const [id, entry] of Object.entries(v.reservations)) {
      const e = entry as any;
      if (!ID.test(id) || !plain(e) || !keys(e, ["amountAtomic", "day", "status", "finalizedDay", "auth"]) || (e.auth !== undefined && !validAuth(e.auth)) || !validDay(e.day) || e.day > v.day || !["held", "committed", "released"].includes(e.status)) return fail("invalid reservation");
      atomic(e.amountAtomic);
      if (e.status === "held" ? e.finalizedDay !== undefined : (!validDay(e.finalizedDay) || e.finalizedDay < e.day || e.finalizedDay > v.day)) return fail("invalid reservation transition");
    }
    const committed = Object.values(v.reservations as Record<string, Entry>).reduce((sum, e) => sum + (e.status === "committed" ? atomic(e.amountAtomic) : 0n), 0n);
    if (committed !== atomic(v.spentAtomic)) return fail("committed total does not match reservation journal");
    return { ledger: v as Ledger, dirty: marker === undefined }; // Recover an interrupted marker write durably.
  }

  private save(file: string, ledger: Ledger, token: string): void {
    const text = JSON.stringify(ledger);
    if (Buffer.byteLength(text) > MAX_BYTES) fail("ledger is full; reconcile reservations");
    const tmp = `${file}.${token}.tmp`;
    let created = false;
    try {
      const fd = openSync(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      created = true;
      try { writeFileSync(fd, text); fsyncSync(fd); } finally { closeSync(fd); }
      // All contenders use the same lock; parent is trusted and private.
      renameSync(tmp, file);
      created = false;
      this.syncDir(dirname(file));
      if (this.readPrivate(`${file}.initialized`) === undefined) {
        const marker = openSync(`${file}.initialized`, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        try { writeFileSync(marker, "tanod-spend-v2\n"); fsyncSync(marker); } finally { closeSync(marker); }
        this.syncDir(dirname(file));
      }
    } finally {
      if (created) unlinkSync(tmp); // Only our exclusive temporary file, never somebody else's artifact.
    }
  }

  private transaction<T>(fn: (ledger: Ledger, day: string, changed: () => void) => T): T {
    if (!this.file) {
      const day = this.today();
      this.roll(this.memory, day);
      return fn(this.memory, day, () => {});
    }
    if (typeof constants.O_NOFOLLOW !== "number" || typeof constants.O_DIRECTORY !== "number") fail("local POSIX no-follow/directory operations are required");
    const file = this.file, lock = `${file}.lock`, token = randomUUID();
    let owned: Stats | undefined;
    let ownerWritten = false;
    try {
      this.prepareParent(file);
      const deadline = performance.now() + LOCK_WAIT_MS;
      while (!owned) {
        try { mkdirSync(lock, { mode: 0o700 }); owned = lstatSync(lock); }
        catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
          try { privateStat(lstatSync(lock), true); }
          catch (statError) { if (!missing(statError)) throw statError; } // owner may just have released it
          if (performance.now() >= deadline) fail("transaction lock busy or orphaned (bounded wait expired)");
          Atomics.wait(sleepCell, 0, 0, 20);
        }
      }
      privateStat(owned, true);
      const fd = openSync(join(lock, "owner.json"), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try { writeFileSync(fd, JSON.stringify({ token, pid: process.pid, host: hostname() })); fsyncSync(fd); ownerWritten = true; }
      finally { closeSync(fd); }
      this.syncDir(lock);
      this.syncDir(dirname(file));
      const day = this.today(); // Sample UTC day AFTER acquiring the transaction lock (midnight contention).
      const loaded = this.load(file, day), ledger = loaded.ledger;
      let dirty = this.roll(ledger, day) || loaded.dirty;
      const result = fn(ledger, day, () => { dirty = true; });
      // Unchanged reads still lock and validate fresh state, but never rewrite the journal.
      if (dirty) this.save(file, ledger, token); // Mutations must be durable before authorization is returned.
      return result;
    } catch (e) {
      if (e instanceof SpendAccountingError) throw e;
      throw new SpendAccountingError(`filesystem transaction failed (${(e as NodeJS.ErrnoException)?.code ?? "invalid state"})`);
    } finally {
      if (owned && ownerWritten) {
        // A failed process must never unlink a replacement lock. No TTL/PID-based deletion.
        try {
          if (!same(owned, lstatSync(lock))) fail("transaction lock ownership changed");
          const owner = this.readPrivate(join(lock, "owner.json"));
          if (!owner || JSON.parse(owner).token !== token) fail("transaction lock token changed");
          unlinkSync(join(lock, "owner.json"));
          if (!same(owned, lstatSync(lock))) fail("transaction lock ownership changed");
          rmdirSync(lock);
          this.syncDir(dirname(file));
        } catch (e) {
          if (e instanceof SpendAccountingError) throw e;
          throw new SpendAccountingError("transaction lock cleanup failed");
        }
      }
    }
  }

  private roll(ledger: Ledger, day: string): boolean {
    if (ledger.day > day) fail("accounting clock moved backwards");
    let dirty = false;
    if (ledger.day !== day) { ledger.day = day; ledger.spentAtomic = "0"; dirty = true; }
    for (const [id, e] of Object.entries(ledger.reservations)) {
      if (e.status !== "held" && e.finalizedDay! < day) { delete ledger.reservations[id]; dirty = true; }
    }
    return dirty;
  }
  private total(ledger: Ledger): bigint {
    return atomic(ledger.spentAtomic) + Object.values(ledger.reservations).reduce((sum, e) => sum + (e.status === "held" ? atomic(e.amountAtomic) : 0n), 0n);
  }
  get spentTodayUsd(): number { return this.transaction(ledger => atomicToUsd(this.total(ledger))); }

  private decision(ledger: Ledger, amount: bigint): CapDecision {
    if (typeof amount !== "bigint" || amount < 0n) throw new Error("Reservation amount must be a non-negative atomic bigint");
    if (amount > this.perCall) return { ok: false, reason: `price USD ${atomicToUsd(amount)} exceeds TANOD_MAX_USD_PER_CALL (USD ${this.opts.maxPerCallUsd})` };
    if (this.total(ledger) + amount > MAX_ATOMIC) return { ok: false, reason: "held/committed total would exceed safe accounting range" };
    if (this.total(ledger) + amount > this.perDay) return { ok: false, reason: `paying USD ${atomicToUsd(amount)} would exceed TANOD_MAX_USD_PER_DAY (USD ${this.opts.maxPerDayUsd}; held/committed USD ${atomicToUsd(this.total(ledger))}, UTC)` };
    return { ok: true };
  }
  /** Advisory only. reserve() repeats the check with a fresh locked ledger. */
  check(amount: bigint): CapDecision { return this.transaction(ledger => this.decision(ledger, amount)); }
  reserve(amount: bigint): ReserveDecision {
    return this.transaction((ledger, day, changed) => {
      const d = this.decision(ledger, amount);
      if (!d.ok) return d;
      if (Object.keys(ledger.reservations).length >= MAX_ENTRIES) return fail("reservation limit reached; reconcile outstanding holds");
      const reservation = Object.freeze({ id: randomUUID(), amountAtomic: amount.toString() });
      ledger.reservations[reservation.id] = { amountAtomic: reservation.amountAtomic, day, status: "held" };
      changed();
      return { ok: true, reservation };
    });
  }
  private finalize(reservation: Reservation, status: "released" | "committed"): void {
    this.transaction((ledger, day, changed) => {
      const e = this.entry(ledger, reservation);
      if (e.status === status) return; // Idempotent persisted transition.
      if (e.status !== "held") fail("reservation already finalized with a different outcome");
      if (status === "committed") ledger.spentAtomic = (atomic(ledger.spentAtomic) + atomic(e.amountAtomic)).toString();
      e.status = status;
      e.finalizedDay = day;
      changed();
    });
  }
  /**
   * Durably attach the authorization about to be sent to its held reservation, BEFORE it leaves the process.
   * From then on only chain evidence about that exact authorization may finalize it; the server's word never does.
   */
  markSent(reservation: Reservation, authorization: SentAuthorization): void {
    const auth = { from: authorization?.from, nonce: authorization?.nonce, validBefore: authorization?.validBefore };
    if (!validAuth(auth)) fail("invalid sent authorization");
    this.transaction((ledger, _day, changed) => {
      const e = this.entry(ledger, reservation);
      if (e.status !== "held" || e.auth !== undefined) fail("reservation is not an unsent hold");
      e.auth = auth;
      changed();
    });
  }
  /** Held reservations whose authorization was sent (any process sharing this ledger), oldest expiry first. */
  sentHolds(): SentHold[] {
    return this.transaction(ledger => Object.entries(ledger.reservations)
      .filter(([, e]) => e.status === "held" && e.auth !== undefined)
      .map(([id, e]) => ({ reservation: Object.freeze({ id, amountAtomic: e.amountAtomic }), authorization: Object.freeze({ ...e.auth! }) }))
      .sort((a, b) => Number(BigInt(a.authorization.validBefore) - BigInt(b.authorization.validBefore))));
  }
  private entry(ledger: Ledger, reservation: Reservation): Entry {
    if (!reservation || !ID.test(reservation.id)) fail("invalid reservation token");
    const e = ledger.reservations[reservation.id];
    if (!e || e.amountAtomic !== reservation.amountAtomic) fail("unknown/mismatched reservation (do not reset accounting)");
    return e;
  }
  /**
   * Only after positive evidence no authorization escaped / no payment was settled: a local failure before
   * sending, or (for a sent authorization) a finalized on-chain read after its validBefore showing it unused.
   */
  release(reservation: Reservation): void { this.finalize(reservation, "released"); }
  /** Confirmation is charged to its local UTC confirmation day; unresolved holds count on every day. */
  commit(reservation: Reservation): void { this.finalize(reservation, "committed"); }
}
