import type { Shootout } from "./types";

/**
 * Public-demo guards. The deployed Studio spends real Livepeer credit on every
 * click, so: a bounded number of shootouts run at once (the rest queue), each
 * IP gets a few per hour, and the whole server stops at a daily spend ceiling.
 */

export class GuardError extends Error {
  constructor(
    message: string,
    readonly status = 429,
  ) {
    super(message);
    this.name = "GuardError";
  }
}

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);

export const LIMITS = {
  concurrent: () => num(process.env.MAX_CONCURRENT_SHOOTOUTS, 2),
  perIpPerHour: () => num(process.env.SHOOTOUTS_PER_IP_PER_HOUR, 6),
  dailySpendUsd: () => num(process.env.DAILY_SPEND_USD, 8),
};

type GuardState = { hits: Map<string, number[]>; running: number; waiters: (() => void)[] };
const g = globalThis as unknown as { __vouchGuards?: GuardState };
const state = (): GuardState => (g.__vouchGuards ??= { hits: new Map(), running: 0, waiters: [] });

export function checkRate(ip: string | undefined, now = Date.now()): void {
  if (!ip) return;
  const s = state();
  const recent = (s.hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= LIMITS.perIpPerHour()) {
    throw new GuardError(`Rate limit: ${LIMITS.perIpPerHour()} shootouts per hour per visitor. Try again soon.`);
  }
  recent.push(now);
  s.hits.set(ip, recent);
}

/** Everything spent (renders + judging) by shootouts created since UTC midnight. */
export function spentToday(shootouts: Shootout[], now = Date.now()): number {
  const midnight = new Date(now);
  midnight.setUTCHours(0, 0, 0, 0);
  let sum = 0;
  for (const s of shootouts) {
    if (s.seed || s.createdAt < midnight.getTime()) continue;
    for (const e of s.entries) sum += (e.renderCostUsd ?? 0) + (e.judge?.costUsd ?? 0);
  }
  return sum;
}

export function checkBudget(shootouts: Shootout[], estimateUsd: number): void {
  const spent = spentToday(shootouts);
  if (spent + estimateUsd > LIMITS.dailySpendUsd()) {
    throw new GuardError(
      `Today's demo budget is used up ($${spent.toFixed(2)} of $${LIMITS.dailySpendUsd()}). Browse the Board, or come back tomorrow.`,
    );
  }
}

/** Run `fn` when a slot frees up; at most LIMITS.concurrent() at once. */
export async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  const s = state();
  while (s.running >= LIMITS.concurrent()) await new Promise<void>((r) => s.waiters.push(r));
  s.running++;
  try {
    return await fn();
  } finally {
    s.running--;
    s.waiters.shift()?.();
  }
}
