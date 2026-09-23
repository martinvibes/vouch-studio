import type { GradeLetter } from "@/engine/types";

export const gradeClass = (g?: GradeLetter | string) => `grade-${(g ?? "f").toLowerCase()}`;
export const gradeColor = (g?: GradeLetter | string) => `var(--grade-${(g ?? "f").toLowerCase()})`;

export function money(n?: number): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  if (n === 0) return "$0";
  return n < 0.01 ? `$${n.toFixed(4)}` : n < 1 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`;
}

export function secs(ms?: number): string {
  if (ms === undefined || !Number.isFinite(ms)) return "—";
  return ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

export const pct = (n?: number) => (n === undefined ? "—" : `${Math.round(n * 100)}%`);

export function ago(ts: number, now = Date.now()): string {
  const s = Math.max(1, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86_400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86_400)}d ago`;
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
