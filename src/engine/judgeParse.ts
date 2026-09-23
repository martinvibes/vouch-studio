import type { Check, CheckVerdict } from "./types";

/**
 * Reading a small vision model's answer. It is asked for strict JSON but may
 * fence it, wrap it in prose, number the checks, or say "Partially". Parse
 * leniently, normalise hard, and never invent a pass: a requirement the judge
 * did not assess counts as "no".
 */

export type ParsedJudge = {
  checks: Check[];
  craft: number;
  aesthetics: number;
  defects: string[];
  verdict: string;
};

/** First balanced top-level JSON object in `text`, string-aware. */
export function extractJsonObject(text: string): Record<string, unknown> | null {
  for (let start = text.indexOf("{"); start !== -1; start = text.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) {
        try {
          const parsed = JSON.parse(text.slice(start, i + 1));
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
        } catch {
          /* try the next opening brace */
        }
        break;
      }
    }
  }
  return null;
}

function normalizeId(raw: unknown): string | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) return `r${raw}`;
  if (typeof raw !== "string") return undefined;
  const m = raw.trim().match(/^r?(\d+)$/i);
  return m ? `r${Number(m[1])}` : undefined;
}

export function normalizeVerdict(raw: unknown): CheckVerdict | undefined {
  if (typeof raw === "boolean") return raw ? "yes" : "no";
  if (typeof raw === "number") return raw >= 0.75 ? "yes" : raw >= 0.25 ? "partial" : "no";
  if (typeof raw !== "string") return undefined;
  const v = raw.trim().toLowerCase();
  if (/^(partial|partially|somewhat|mostly|some)/.test(v)) return "partial";
  if (/^(no|not|fail|false|absent|missing|n$)/.test(v)) return "no";
  if (/^(yes|pass|true|met|present|y$|correct)/.test(v)) return "yes";
  return undefined;
}

function toScore(raw: unknown): number | undefined {
  const n = typeof raw === "string" ? Number.parseFloat(raw) : typeof raw === "number" ? raw : Number.NaN;
  if (!Number.isFinite(n)) return undefined;
  const scaled = n > 10 ? n / 10 : n; // answered on a 0-100 scale
  return Math.round(Math.max(0, Math.min(10, scaled)) * 10) / 10;
}

const NONE_DEFECT = /^(none|n\/a|no defects?|none visible|nothing)\.?$/i;

export function parseJudgeJson(text: string, requirementIds: string[]): ParsedJudge | null {
  const obj = extractJsonObject(text);
  if (!obj) return null;

  const found = new Map<string, { verdict: CheckVerdict; note: string }>();
  const record = (idRaw: unknown, verdictRaw: unknown, noteRaw: unknown) => {
    const id = normalizeId(idRaw);
    const verdict = normalizeVerdict(verdictRaw);
    if (!id || !verdict || !requirementIds.includes(id) || found.has(id)) return;
    found.set(id, { verdict, note: typeof noteRaw === "string" ? noteRaw.trim().slice(0, 200) : "" });
  };

  const rawChecks = obj.checks ?? obj.requirements ?? obj.results;
  if (Array.isArray(rawChecks)) {
    rawChecks.forEach((c, i) => {
      if (c && typeof c === "object") {
        const o = c as Record<string, unknown>;
        record(o.id ?? o.requirement ?? o.n ?? i + 1, o.verdict ?? o.met ?? o.pass ?? o.answer ?? o.result, o.note ?? o.reason ?? o.evidence);
      }
    });
  } else if (rawChecks && typeof rawChecks === "object") {
    for (const [k, v] of Object.entries(rawChecks as Record<string, unknown>)) {
      if (v && typeof v === "object") {
        const o = v as Record<string, unknown>;
        record(k, o.verdict ?? o.met ?? o.pass ?? o.answer, o.note ?? o.reason);
      } else record(k, v, "");
    }
  }

  const craft = toScore(obj.craft ?? obj.technical_quality ?? obj.technical);
  const aesthetics = toScore(obj.aesthetics ?? obj.aesthetic ?? obj.composition);
  if (found.size === 0 && craft === undefined && aesthetics === undefined) return null;

  const checks: Check[] = requirementIds.map((id) => {
    const hit = found.get(id);
    return hit ? { id, ...hit } : { id, verdict: "no", note: "Not assessed by the judge." };
  });

  const defects = (Array.isArray(obj.defects) ? obj.defects : [])
    .filter((d): d is string => typeof d === "string")
    .map((d) => d.trim())
    .filter((d) => d && !NONE_DEFECT.test(d))
    .slice(0, 6);

  return {
    checks,
    craft: craft ?? 5,
    aesthetics: aesthetics ?? 5,
    defects,
    verdict: typeof obj.verdict === "string" ? obj.verdict.trim().slice(0, 280) : "",
  };
}

const CREDIT: Record<CheckVerdict, number> = { yes: 1, partial: 0.5, no: 0 };

/**
 * Merge independent blind passes into one verdict. Per requirement the credit
 * is averaged (yes/no split → partial); a dissenting note wins because it
 * explains the doubt. Scores average; defects union, case-insensitively.
 */
export function mergeVotes(votes: ParsedJudge[]): ParsedJudge {
  if (votes.length === 1) return votes[0];
  const checks: Check[] = votes[0].checks.map((first, i) => {
    const all = votes.map((v) => v.checks[i]).filter(Boolean);
    const avg = all.reduce((s, c) => s + CREDIT[c.verdict], 0) / all.length;
    const verdict: CheckVerdict = avg >= 0.75 ? "yes" : avg >= 0.25 ? "partial" : "no";
    const dissent = all.find((c) => c.verdict !== "yes" && c.note);
    return { id: first.id, verdict, note: (dissent ?? all.find((c) => c.note) ?? first).note };
  });
  const mean = (xs: number[]) => Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
  const seen = new Set<string>();
  const defects = votes
    .flatMap((v) => v.defects)
    .filter((d) => (seen.has(d.toLowerCase()) ? false : (seen.add(d.toLowerCase()), true)))
    .slice(0, 6);
  return {
    checks,
    craft: mean(votes.map((v) => v.craft)),
    aesthetics: mean(votes.map((v) => v.aesthetics)),
    defects,
    verdict: votes.find((v) => v.verdict)?.verdict ?? "",
  };
}
