import type { CheckVerdict, GradeLetter, JudgeResult, MediaKind, Requirement, ScoreBreakdown } from "./types";

/**
 * The Vouch score — pure and published (see /methodology). The judge only
 * supplies observations (per-requirement verdicts, craft, aesthetics); every
 * number below is deterministic arithmetic over those observations plus the
 * render's measured cost and time.
 */

export const QUALITY_WEIGHTS = { fidelity: 0.6, craft: 0.25, aesthetics: 0.15 } as const;
export const VOUCH_WEIGHTS = { quality: 0.7, value: 0.2, speed: 0.1 } as const;

/**
 * The price and wall-clock time at which a render earns full value / speed
 * marks. Times are end-to-end as the user experiences them (MCP round trip
 * included), which adds ~6-10 s over the network's provider-side p50.
 */
export const FLOORS: Record<MediaKind, { costUsd: number; ms: number }> = {
  image: { costUsd: 0.003, ms: 8_000 },
  video: { costUsd: 0.05, ms: 40_000 },
};

/** Below this fidelity an entry "misses the brief" and cannot grade above C. */
export const FIDELITY_CAP_BELOW = 50;
export const FIDELITY_CAP_SCORE = 58;

export const GRADE_THRESHOLDS: [GradeLetter, number][] = [
  ["S", 92],
  ["A", 80],
  ["B", 66],
  ["C", 52],
  ["D", 38],
];

/** Winners at or above this earn the Vouch Seal. */
export const SEAL_THRESHOLD = 80;

const VERDICT_CREDIT: Record<CheckVerdict, number> = { yes: 1, partial: 0.5, no: 0 };

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

export function toGrade(score: number): GradeLetter {
  for (const [grade, min] of GRADE_THRESHOLDS) if (score >= min) return grade;
  return "F";
}

/** 100 at the floor price, −40 per 10× more expensive. */
export function valueScore(kind: MediaKind, costUsd: number): number {
  const ratio = Math.max(costUsd, 1e-9) / FLOORS[kind].costUsd;
  return round1(clamp(100 - 40 * Math.log10(Math.max(ratio, 1))));
}

/** 100 at the floor time, −45 per 10× slower. */
export function speedScore(kind: MediaKind, ms: number): number {
  const ratio = Math.max(ms, 1) / FLOORS[kind].ms;
  return round1(clamp(100 - 45 * Math.log10(Math.max(ratio, 1))));
}

export function fidelityScore(requirements: Requirement[], judge: JudgeResult): number {
  if (requirements.length === 0) return 0;
  const byId = new Map(judge.checks.map((c) => [c.id, c.verdict]));
  const credit = requirements.reduce((sum, r) => sum + VERDICT_CREDIT[byId.get(r.id) ?? "no"], 0);
  return round1((credit / requirements.length) * 100);
}

export function scoreEntry(input: {
  kind: MediaKind;
  requirements: Requirement[];
  judge?: JudgeResult;
  costUsd?: number;
  renderMs?: number;
  failed?: boolean;
}): ScoreBreakdown {
  if (input.failed || !input.judge) {
    return {
      fidelity: 0,
      craft: 0,
      aesthetics: 0,
      quality: 0,
      value: 0,
      speed: 0,
      total: 0,
      grade: "F",
      caps: ["Render failed"],
    };
  }

  const fidelity = fidelityScore(input.requirements, input.judge);
  const craft = round1(clamp(input.judge.craft * 10));
  const aesthetics = round1(clamp(input.judge.aesthetics * 10));
  const quality = round1(
    QUALITY_WEIGHTS.fidelity * fidelity + QUALITY_WEIGHTS.craft * craft + QUALITY_WEIGHTS.aesthetics * aesthetics,
  );
  const value = valueScore(input.kind, input.costUsd ?? FLOORS[input.kind].costUsd);
  const speed = speedScore(input.kind, input.renderMs ?? FLOORS[input.kind].ms);

  let total = round1(VOUCH_WEIGHTS.quality * quality + VOUCH_WEIGHTS.value * value + VOUCH_WEIGHTS.speed * speed);
  const caps: string[] = [];
  if (fidelity < FIDELITY_CAP_BELOW && total > FIDELITY_CAP_SCORE) {
    total = FIDELITY_CAP_SCORE;
    caps.push("Misses the brief (fidelity below 50)");
  }

  return { fidelity, craft, aesthetics, quality, value, speed, total, grade: toGrade(total), caps };
}
