import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** USDC has 6 decimals. All internal amounts are atomic units (bigint). */
export const USDC_DECIMALS = 6;

export function usdToAtomic(usd: number): bigint {
  return BigInt(Math.round(usd * 10 ** USDC_DECIMALS));
}

export function atomicToUsd(a: bigint): number {
  return Number(a) / 10 ** USDC_DECIMALS;
}

export function parseUsdEnv(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${name} must be a non-negative number of US dollars, got "${raw}"`);
  }
  return n;
}

export interface CapsOptions {
  maxPerCallUsd: number;
  maxPerDayUsd: number;
  /** Optional JSON state file so the daily total survives restarts. */
  stateFile?: string;
  now?: () => Date;
}

export type CapDecision = { ok: true } | { ok: false; reason: string };

/** Tracks spend against a per-call cap and a per-UTC-day cap. */
export class SpendCaps {
  private spent = 0n;
  private day: string;
  readonly maxPerCallUsd: number;
  private readonly perCall: bigint;
  private readonly perDay: bigint;
  private readonly now: () => Date;

  constructor(private readonly opts: CapsOptions) {
    this.now = opts.now ?? (() => new Date());
    this.maxPerCallUsd = opts.maxPerCallUsd;
    this.perCall = usdToAtomic(opts.maxPerCallUsd);
    this.perDay = usdToAtomic(opts.maxPerDayUsd);
    this.day = this.today();
    this.load();
  }

  private today(): string {
    return this.now().toISOString().slice(0, 10);
  }

  private load(): void {
    const f = this.opts.stateFile;
    if (!f || !existsSync(f)) return;
    try {
      const s = JSON.parse(readFileSync(f, "utf8"));
      if (s && s.day === this.day && typeof s.spentAtomic === "string") this.spent = BigInt(s.spentAtomic);
    } catch {
      /* ignore a corrupt state file; start from zero */
    }
  }

  private save(): void {
    const f = this.opts.stateFile;
    if (!f) return;
    try {
      mkdirSync(dirname(f), { recursive: true });
      writeFileSync(f, JSON.stringify({ day: this.day, spentAtomic: this.spent.toString() }), { mode: 0o600 });
    } catch {
      /* state file is best effort */
    }
  }

  private rollDay(): void {
    const t = this.today();
    if (t !== this.day) {
      this.day = t;
      this.spent = 0n;
    }
  }

  get spentTodayUsd(): number {
    this.rollDay();
    return atomicToUsd(this.spent);
  }

  /** Check without recording. */
  check(amount: bigint): CapDecision {
    this.rollDay();
    if (amount > this.perCall) {
      return {
        ok: false,
        reason: `price USD ${atomicToUsd(amount)} exceeds TANOD_MAX_USD_PER_CALL (USD ${this.opts.maxPerCallUsd})`,
      };
    }
    if (this.spent + amount > this.perDay) {
      return {
        ok: false,
        reason: `paying USD ${atomicToUsd(amount)} would exceed TANOD_MAX_USD_PER_DAY (USD ${this.opts.maxPerDayUsd}; already spent USD ${atomicToUsd(this.spent)} today, UTC)`,
      };
    }
    return { ok: true };
  }

  /** Check and, if allowed, record the spend. */
  reserve(amount: bigint): CapDecision {
    const d = this.check(amount);
    if (d.ok) {
      this.spent += amount;
      this.save();
    }
    return d;
  }

  /** Give back a reservation when signing or the call failed before payment. */
  release(amount: bigint): void {
    this.rollDay();
    this.spent = this.spent >= amount ? this.spent - amount : 0n;
    this.save();
  }
}
